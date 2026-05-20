import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withFMSession } from '@/lib/filemaker/session'

type Params = { params: Promise<{ id: string }> }

const BodySchema = z.object({
  layout: z.string().min(1),
})

/**
 * POST /api/connections/[id]/layout-fields
 * On-demand: fetch field + portal metadata for a single layout.
 * Called by Schema Browser when user clicks/expands a layout.
 * Also persists the fetched metadata into rawLayoutMeta so that
 * infer-relationships has field data to work with.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = BodySchema.parse(await req.json())
    const { layout } = body

    const connection = await db.fMConnection.findUnique({ where: { id } })
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

    // Persist into rawLayoutMeta (merge with existing entries) — fire-and-forget
    db.browsedSchema.findUnique({ where: { connectionId: id } }).then((bs) => {
      if (!bs) return
      const existing = JSON.parse(bs.rawLayoutMeta || '{}')
      existing[layout] = { fields: meta.fields, portals: meta.portals, portalDetails: meta.portalDetails }
      return db.browsedSchema.update({
        where: { connectionId: id },
        data: { rawLayoutMeta: JSON.stringify(existing) },
      })
    }).catch((err: Error) => console.error('[layout-fields] Failed to persist rawLayoutMeta:', err.message))

    return NextResponse.json({ success: true, data: meta })
  } catch (e: any) {
    console.error('[layout-fields POST]', e)
    return NextResponse.json(
      { success: false, error: e.message || 'Failed to fetch layout fields', code: 'SCHEMA_FETCH_ERROR' },
      { status: 500 }
    )
  }
}

