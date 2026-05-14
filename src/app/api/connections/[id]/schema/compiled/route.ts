import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const browsedSchema = await db.browsedSchema.findUnique({ where: { connectionId: id } })
    if (!browsedSchema) {
      return NextResponse.json({
        success: false,
        error: 'Schema not browsed. Go to Connection → Browse Schema and save selections first.',
        code: 'NOT_FOUND',
      }, { status: 404 })
    }

    const compiledSchema = JSON.parse(browsedSchema.compiledSchema || '{}')
    if (!compiledSchema?.layouts?.length && !compiledSchema?.tables?.length) {
      return NextResponse.json({
        success: false,
        error: 'No schema selections saved. Select layouts/tables and save first.',
        code: 'NOT_FOUND',
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        compiledSchema,
        selectedLayouts: JSON.parse(browsedSchema.selectedLayouts),
        selectedTables: JSON.parse(browsedSchema.selectedTables),
        selectedScripts: JSON.parse(browsedSchema.selectedScripts),
        fetchedAt: browsedSchema.fetchedAt,
        updatedAt: browsedSchema.updatedAt,
      },
    })
  } catch (e: any) {
    console.error('[schema/compiled GET]', e)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
