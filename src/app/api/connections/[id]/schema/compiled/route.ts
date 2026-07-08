import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from "@/lib/auth/api-guard"
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/utils/api-response'
import { buildCompiledSchemaPayload, SchemaEndpointError } from '@/lib/schema/schema-endpoint-logic'
import { logger } from '@/lib/logger'

/**
 * GET /api/connections/[id]/schema/compiled
 *
 * Returns the user's saved schema selections for this connection — the subset of
 * layouts/tables/scripts chosen in Schema Browser — plus the compiled schema object
 * used by tool generation and AI features.
 *
 * Responsibility: read-only view of "what the user chose to expose".
 *   - Never triggers a live FileMaker call.
 *   - Injects connectionId into layouts/tables so multi-connection tools know
 *     which FileMaker connection each layout belongs to.
 *
 * Error codes:
 *   NOT_BROWSED_YET  — POST /browse-schema has not been called; nothing to select from.
 *   SCHEMA_NOT_SAVED — Browse happened but no selections saved via PUT /schema/selections.
 *   NOT_FOUND        — connection does not exist or belongs to another user.
 *   SERVER_ERROR     — unexpected internal error.
 *
 * See also:
 *   POST /browse-schema       — triggers a live fetch from FileMaker + OData.
 *   GET  /schema              — returns all raw discovered resources, not just selections.
 *   PUT  /schema/selections   — saves schema selections and rebuilds compiledSchema.
 */
export const GET = withAuth(async (_req, { params, userId }) => {
  try {
    const { id } = params

    const conn = await db.fMConnection.findFirst({ where: { id, userId } })
    if (!conn) return apiNotFound('Connection not found')

    const bs = await db.browsedSchema.findUnique({ where: { connectionId: id } })

    const payload = buildCompiledSchemaPayload(bs, id)
    return apiSuccess(payload)
  } catch (e: any) {
    if (e instanceof SchemaEndpointError) {
      return NextResponse.json(
        { success: false, error: e.message, code: e.code },
        { status: e.httpStatus },
      )
    }
    logger.error({ err: e }, '[schema/compiled GET]')
    return apiServerError('Internal server error')
  }
})
