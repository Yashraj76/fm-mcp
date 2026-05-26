import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withFMSession } from '@/lib/filemaker/session'
import { Agent } from 'undici'
import { decrypt } from '@/lib/crypto'
import { withAuth } from "@/lib/auth/api-guard";

type Params = { params: Promise<{ id: string }> }

/**
 * Fetch only the OData service document (entity names only — fast).
 * No $metadata XML (too slow / times out on large databases).
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
      signal: AbortSignal.timeout(10_000), // 10s timeout — service doc is fast
    } as any)

    if (!res.ok) {
      if (res.status === 501 || res.status === 404) {
        console.warn('[browse-schema] OData not available on this server (HTTP', res.status, ')')
      } else {
        console.warn('[browse-schema] OData service doc failed:', res.status)
      }
      return []
    }

    const json = await res.json()
    const entities: string[] = (json?.value || []).map((v: any) => v.name).filter(Boolean)
    return entities
  } catch (e: any) {
    console.warn('[browse-schema] OData fetch error (non-fatal):', e.message)
    return []
  }
}

export const POST = withAuth(async (_req, { params, userId }) => {
    try {
    const { id } = await params
    const connection = await db.fMConnection.findUnique({ where: {
        userId: userId,
        id } })
    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // --- Fetch FM Data API: layouts + scripts only ---
    const { layouts, scripts } = await withFMSession(connection, async (client) => {
      const layoutsRes = await client.getLayouts()
      const allLayouts: string[] = (layoutsRes?.response?.layouts || []).map((l: any) => l.name)

      let allScripts: string[] = []
      try {
        const scriptsRes = await client.getScripts()
        // Filter out folder entries and separators (name '-') — only keep runnable scripts
        allScripts = (scriptsRes?.response?.scripts || [])
          .filter((s: any) => !s.isFolder && s.name !== '-')
          .map((s: any) => s.name)
      } catch (scriptErr: any) {
        // FM servers that don't support /scripts — non-fatal
        console.warn('[browse-schema] Scripts endpoint not available:', scriptErr.message)
      }

      return { layouts: allLayouts, scripts: allScripts }
    })

    // --- Fetch OData entity names (service document only — fast) ---
    const odataTables = await fetchODataEntityNames(connection)

    // --- Persist raw lists (no layoutMeta yet) ---
    await db.browsedSchema.upsert({
      where: { connectionId: id },
      create: {
        connectionId: id,
        rawLayouts: JSON.stringify(layouts),
        rawScripts: JSON.stringify(scripts),
        rawLayoutMeta: JSON.stringify({}),
        rawODataTables: JSON.stringify(odataTables),
        rawODataMeta: JSON.stringify({}),
        fetchedAt: new Date(),
      },
      update: {
        rawLayouts: JSON.stringify(layouts),
        rawScripts: JSON.stringify(scripts),
        rawLayoutMeta: JSON.stringify({}),
        rawODataTables: JSON.stringify(odataTables),
        rawODataMeta: JSON.stringify({}),
        fetchedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        layouts,
        scripts,
        layoutMeta: {},   // empty — fields are fetched on-demand via /layout-fields
        odataTables,
        odataMeta: {},
      },
    })
    } catch (e: any) {
    console.error('[browse-schema POST]', e)
    return NextResponse.json(
      { success: false, error: e.message || 'Schema fetch failed', code: 'SCHEMA_FETCH_ERROR' },
      { status: 500 }
    )
    }
    });
