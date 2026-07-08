import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withFMSession } from '@/lib/filemaker/session'
import { Agent } from 'undici'
import { decrypt } from '@/lib/crypto'
import { withAuth } from "@/lib/auth/api-guard";
import { fetchODataMetadata } from '@/lib/filemaker/odata-metadata'
import { logger } from '@/lib/logger'

/**
 * Fetch the OData service document — entity names only, no field metadata.
 * Fast (~10 s timeout) and used as a fallback entity list when $metadata is unavailable.
 */
async function fetchODataEntityNames(connection: any): Promise<string[]> {
  try {
    const host = connection.host.startsWith('http') ? connection.host : `https://${connection.host}`
    const port = connection.port ? `:${connection.port}` : ''
    const dbName = encodeURIComponent(connection.database)
    const url = `${host}${port}/fmi/odata/v4/${dbName}/`
    const password = decrypt(connection.password)
    const credentials = Buffer.from(`${connection.username}:${password}`).toString('base64')

    const dispatcher = new Agent({ connect: { rejectUnauthorized: connection.sslVerify } })
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' },
      dispatcher,
      signal: AbortSignal.timeout(10_000),
    } as any)

    if (!res.ok) {
      if (res.status === 501 || res.status === 404) {
        logger.warn({ status: res.status }, '[browse-schema] OData not available on this server')
      } else {
        logger.warn({ detail: res.status }, '[browse-schema] OData service doc failed:')
      }
      return []
    }

    const json = await res.json()
    const entities: string[] = (json?.value || []).map((v: any) => v.name).filter(Boolean)
    return entities
  } catch (e: any) {
    logger.warn({ detail: e.message }, '[browse-schema] OData service doc fetch error (non-fatal):')
    return []
  }
}

export const POST = withAuth(async (_req, { params, userId }) => {
  try {
    const { id } = await params
    const connection = await db.fMConnection.findFirst({ where: { userId, id } })
    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // ── Run all three fetches in parallel ──────────────────────────────────
    // 1. Data API session: layouts + scripts
    // 2. OData service document: entity names (fast, ~10 s timeout)
    // 3. OData $metadata: full field definitions (slower, ~20 s timeout)
    const [
      { layouts, scripts },
      odataTablesFromServiceDoc,
      odataMetaResult,
    ] = await Promise.all([
      // 1. Data API
      withFMSession(connection, async (client) => {
        const layoutsRes = await client.getLayouts()
        const allLayouts: string[] = (layoutsRes?.response?.layouts || []).map((l: any) => l.name)

        let allScripts: string[] = []
        try {
          const scriptsRes = await client.getScripts()
          allScripts = (scriptsRes?.response?.scripts || [])
            .filter((s: any) => !s.isFolder && s.name !== '-')
            .map((s: any) => s.name)
        } catch (scriptErr: any) {
          logger.warn({ detail: scriptErr.message }, '[browse-schema] Scripts endpoint not available:')
        }

        return { layouts: allLayouts, scripts: allScripts }
      }),

      // 2. OData service document
      fetchODataEntityNames(connection),

      // 3. OData $metadata
      fetchODataMetadata(connection, 20_000),
    ])

    // Derive the canonical OData table list:
    // • If $metadata succeeded → use its entity names (more authoritative; includes all fields)
    // • Otherwise → fall back to service document names
    const odataTables =
      odataMetaResult.status === 'ok'
        ? Object.keys(odataMetaResult.meta)
        : odataTablesFromServiceDoc

    // ── Persist ────────────────────────────────────────────────────────────
    await db.browsedSchema.upsert({
      where: { connectionId: id },
      create: {
        connectionId: id,
        rawLayouts: JSON.stringify(layouts),
        rawScripts: JSON.stringify(scripts),
        rawLayoutMeta: JSON.stringify({}),
        rawODataTables: JSON.stringify(odataTables),
        rawODataMeta: JSON.stringify(odataMetaResult.meta),
        fetchedAt: new Date(),
      },
      update: {
        rawLayouts: JSON.stringify(layouts),
        rawScripts: JSON.stringify(scripts),
        rawLayoutMeta: JSON.stringify({}),
        rawODataTables: JSON.stringify(odataTables),
        rawODataMeta: JSON.stringify(odataMetaResult.meta),
        fetchedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        layouts,
        scripts,
        layoutMeta: {},   // fields fetched on-demand via /layout-fields
        odataTables,
        odataMeta: odataMetaResult.meta,
        // Let the UI show a warning banner when field metadata is unavailable
        odataMetaStatus: odataMetaResult.status,
        ...(odataMetaResult.message && odataMetaResult.status !== 'ok'
          ? { odataMetaMessage: odataMetaResult.message }
          : {}),
      },
    })
  } catch (e: any) {
    logger.error({ err: e }, '[browse-schema POST]')
    return NextResponse.json(
      { success: false, error: e.message || 'Schema fetch failed', code: 'SCHEMA_FETCH_ERROR' },
      { status: 500 },
    )
  }
})
