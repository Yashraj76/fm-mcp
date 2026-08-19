import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from "@/lib/auth/api-guard";
import { apiNotFound, apiError, apiServerError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { executeToolWithParams } from '@/lib/tools/executor-service'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

export const POST = withAuth(async (req, { params, userId }) => {
  const startTime = Date.now()

  try {
    const { id: serverId } = params
    const rawBody = await req.text()
    const bodyObj = safeParseJSON<{ toolData: Record<string, unknown>; body: Record<string, unknown>; branchId?: string }>(rawBody, null)
    if (!bodyObj || typeof bodyObj !== 'object') {
      return apiError('Invalid JSON request body', 'VALIDATION_ERROR', 400)
    }
    const { toolData, body, branchId } = bodyObj

    const server = await db.mcpServer.findFirst({
      where: { id: serverId, userId },
      include: { connections: { include: { connection: true } } }
    })

    if (!server) return apiNotFound('Server not found')

    const handlerConfig = (toolData.handlerConfig as Record<string, any>) || {}

    // System tools are not supported in dry-run for now
    if (toolData.category === 'system') {
      return apiError('System tools cannot be dry-run.', 'VALIDATION_ERROR', 400)
    }

    // A branch's connectionOverride (e.g. a sandbox file for a test branch)
    // redirects every test execution on that branch, same as live MCP calls —
    // testing on that branch should never fall through to production data.
    let connection = branchId
      ? (await db.branch.findFirst({
          where: { id: branchId, serverId },
          include: { connectionOverride: true },
        }))?.connectionOverride ?? undefined
      : undefined

    const connectionId = handlerConfig.connectionId as string | undefined
    if (!connection && connectionId) {
      connection = server.connections.find((c: any) => c.connectionId === connectionId)?.connection
      if (!connection) {
        return apiError('The specified connection is not attached to this server', 'VALIDATION_ERROR', 400)
      }
    }

    if (!connection) {
      if (server.connections.length === 0) {
        return apiError('No FileMaker connection available for this server', 'VALIDATION_ERROR', 400)
      }
      if (server.connections.length > 1) {
        return apiError(
          'This tool has no connectionId. Specify a connectionId when the server has multiple connections.',
          'VALIDATION_ERROR', 400
        )
      }
      connection = server.connections[0].connection
    }

    const result = await executeToolWithParams(toolData, body, connection)

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      status: 200,
      duration,
      data: result
    })

  } catch (error: any) {
    const duration = Date.now() - startTime
    logger.error({ err: error }, '[Tool Dry-Run Failed]')

    return apiError('Execution failed', 'FM_EXECUTION_ERROR', 500, { duration });
  }
})
