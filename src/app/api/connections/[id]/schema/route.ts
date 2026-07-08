import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from "@/lib/auth/api-guard"
import { buildBrowsedSchemaPayload, SchemaEndpointError } from '@/lib/schema/schema-endpoint-logic'
import { logger } from '@/lib/logger'

/**
 * GET /api/connections/[id]/schema
 *
 * Returns the raw result of the last browse for this connection — layouts,
 * scripts, OData tables, and per-layout field metadata — as persisted by
 * POST /api/connections/[id]/browse-schema.
 *
 * Responsibility: read-only snapshot of "what FileMaker has".
 *   - Never triggers a live FileMaker call.
 *   - Use this to display browse results without paying the live round-trip cost.
 *
 * Error codes:
 *   NOT_BROWSED_YET — POST /browse-schema has not been called for this connection.
 *   NOT_FOUND       — connection does not exist or belongs to another user.
 *   SERVER_ERROR    — unexpected internal error.
 *
 * See also:
 *   POST /browse-schema   — triggers a live fetch from FileMaker + OData.
 *   GET  /schema/compiled — returns the user's saved selections, not all discovered items.
 */
export const GET = withAuth(async (_req, { params, userId }) => {
  try {
    const { id } = params

    const conn = await db.fMConnection.findFirst({ where: { id, userId } })
    if (!conn) {
      return NextResponse.json(
        { success: false, error: 'Connection not found', code: 'NOT_FOUND' },
        { status: 404 },
      )
    }

    const bs = await db.browsedSchema.findUnique({ where: { connectionId: id } })

    const payload = buildBrowsedSchemaPayload(bs)
    return NextResponse.json({ success: true, data: payload })
  } catch (e: any) {
    if (e instanceof SchemaEndpointError) {
      return NextResponse.json(
        { success: false, error: e.message, code: e.code },
        { status: e.httpStatus },
      )
    }
    logger.error({ err: e }, '[schema GET]')
    return NextResponse.json(
      { success: false, error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 },
    )
  }
})
