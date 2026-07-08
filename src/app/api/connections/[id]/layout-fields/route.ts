import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withFMSession } from '@/lib/filemaker/session'
import { withAuth } from "@/lib/auth/api-guard";
import { persistLayoutMeta } from '@/lib/db/layout-meta'
import { logger } from '@/lib/logger'

const BodySchema = z.object({
  layout: z.string().min(1),
})

export const POST = withAuth(async (req, { params, userId }) => {
  try {
    const { id } = await params
    const body = BodySchema.parse(await req.json())
    const { layout } = body

    const connection = await db.fMConnection.findFirst({
      where: { id, userId }
    })
    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const meta = await withFMSession(connection, async (client) => {
      const res = await client.getLayoutMetadata(layout)
      const fieldMetaArr = res?.response?.fieldMetaData || []
      const portalMeta = res?.response?.portalMetaData || {}
      return {
        fields: fieldMetaArr.map((f: any) => f.name as string),
        portals: Object.keys(portalMeta),
        portalDetails: Object.entries(portalMeta).map(([table, flds]: [string, any]) => ({
          table,
          fields: (flds || []).map((f: any) => ({ name: f.name, type: f.result || 'text' })),
        })),
        valueLists: res?.response?.valueLists || [],
      }
    })

    // Persist into rawLayoutMeta — awaited so the 200 is only returned once
    // the write is committed. Errors here are non-fatal: the caller already
    // has the layout data in the response body.
    let persisted = false
    try {
      persisted = await persistLayoutMeta(id, layout, {
        fields: meta.fields,
        portals: meta.portals,
        portalDetails: meta.portalDetails,
      })
    } catch (persistErr: any) {
      logger.error({ errMsg: persistErr.message }, '[layout-fields] Failed to persist rawLayoutMeta:')
    }

    return NextResponse.json({ success: true, data: { ...meta, persisted } })
  } catch (e: any) {
    logger.error({ err: e }, '[layout-fields POST]')
    return NextResponse.json(
      { success: false, error: e.message || 'Failed to fetch layout fields', code: 'SCHEMA_FETCH_ERROR' },
      { status: 500 }
    )
  }
})
