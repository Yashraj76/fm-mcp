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
        valueLists: res?.response?.valueLists || [],
      }
    })

    return NextResponse.json({ success: true, data: meta })
  } catch (e: any) {
    console.error('[layout-fields POST]', e)
    return NextResponse.json(
      { success: false, error: e.message || 'Failed to fetch layout fields', code: 'SCHEMA_FETCH_ERROR' },
      { status: 500 }
    )
  }
}
