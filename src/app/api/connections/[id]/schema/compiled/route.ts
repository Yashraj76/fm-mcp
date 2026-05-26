import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';

type Params = { params: Promise<{ id: string }> }
export const GET = withAuth(async (_req, { params, userId }) => {
    try {
    const { id } = params

    // Verify connection ownership
    const conn = await db.fMConnection.findFirst({
      where: { id, userId }
    });
    if (!conn) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const browsedSchema = await db.browsedSchema.findUnique({
      where: { connectionId: id }
    })
    if (!browsedSchema) {
      return NextResponse.json({
        success: false,
        error: 'Schema not browsed. Go to Connection → Browse Schema and save selections first.',
        code: 'NOT_FOUND',
      }, { status: 404 })
    }

    const compiledSchema = safeParseJSON(browsedSchema.compiledSchema, {})
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
        selectedLayouts: safeParseJSON(browsedSchema.selectedLayouts, []),
        selectedTables: safeParseJSON(browsedSchema.selectedTables, []),
        selectedScripts: safeParseJSON(browsedSchema.selectedScripts, []),
        fetchedAt: browsedSchema.fetchedAt,
        updatedAt: browsedSchema.updatedAt,
      },
    })
    } catch (e: any) {
    console.error('[schema/compiled GET]', e)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
    }
    });
