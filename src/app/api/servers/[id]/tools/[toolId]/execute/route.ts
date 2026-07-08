import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { log, LOG_ACTIONS } from '@/lib/logging/logger'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import { apiNotFound, apiError } from '@/lib/utils/api-response'
import { withAuth } from "@/lib/auth/api-guard"
import { executeToolWithParams } from '@/lib/tools/executor-service'
import { sanitizeObject } from '@/lib/utils/sanitizer'
import { resolveToolConnection } from '@/lib/filemaker/resolve-connection'
import { logger } from '@/lib/logger'

export const POST = withAuth(async (request, { params, userId }) => {
  const startTime = Date.now()
  let requestBody = ''

  try {
    const { toolId } = await params
    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId')
    const bodyText = await request.text()
    requestBody = bodyText
    const body = safeParseJSON<Record<string, unknown>>(bodyText, {})

    // Fetch tool with server relation — ownership enforced via server.userId
    let tool = await db.tool.findFirst({
      where: { id: toolId, deletedAt: null, server: { userId } },
      include: {
        server: {
          include: {
            connections: {
              include: { connection: true }
            }
          }
        }
      }
    })

    if (!tool) {
      return apiNotFound('Tool not found')
    }

    if (branchId) {
      const branchObj = await db.branch.findFirst({ where: { id: branchId, serverId: tool.serverId } })
      if (!branchObj) {
        return apiNotFound('Branch not found')
      }

      const bt = await db.branchTool.findFirst({ where: { branchId, toolId } })
      if (bt && bt.action !== 'deleted' && bt.overrideData) {
        const override = safeParseJSON<Record<string, unknown>>(bt.overrideData, {})
        const originalServer = tool.server
        tool = { ...tool, ...override } as typeof tool
        tool.server = originalServer
      }
    }

    if (!tool.isEnabled) {
      return apiError('Tool is disabled', 'TOOL_DISABLED', 400)
    }

    const handlerConfig = safeParseJSON<Record<string, unknown>>(tool.handlerConfig, {})

    // System tools don't need a FM connection. All others must resolve via resolveToolConnection,
    // which throws if connectionId is set but not linked to this server, or if >1 connections exist
    // without a connectionId — preventing silent execution against the wrong database.
    const connection = (tool as any).category !== 'system'
      ? resolveToolConnection(
          handlerConfig.connectionId as string | null | undefined,
          (tool as any).server.connections,
          (tool as any).name
        )
      : null

    const result = await executeToolWithParams(tool, body, connection)

    const duration = Date.now() - startTime

    // Save execution history
    await db.toolExecution.create({
      data: {
        toolId,
        requestBody: JSON.stringify(sanitizeObject(body)),
        responseStatus: 200,
        responseBody: JSON.stringify(sanitizeObject(result)),
        duration,
        status: 'success'
      }
    }).catch(e => logger.error({ err: e }, '[Execution History] Failed to save'))

    log({
      action: LOG_ACTIONS.TOOL_EXECUTED,
      entityType: 'tool',
      entityId: tool.id,
      entityName: tool.name,
      serverId: tool.serverId,
      meta: { durationMs: duration, paramKeys: Object.keys(body) },
      actorUserId: userId,
    })

    return NextResponse.json({
      success: true,
      status: 200,
      duration,
      data: result
    })

  } catch (error: any) {
    const duration = Date.now() - startTime
    logger.error({ err: error }, '[Tool Execution Failed]')

    try {
      const { toolId } = await params
      await db.toolExecution.create({
        data: {
          toolId,
          requestBody: JSON.stringify(sanitizeObject(safeParseJSON(requestBody, {}))),
          responseStatus: 500,
          error: error.message,
          duration,
          status: 'error'
        }
      })
    } catch (e) {
      logger.error({ err: e }, '[Execution History] Failed to save error')
    }

    try {
      const { toolId } = await params
      log({
        action: LOG_ACTIONS.TOOL_EXECUTION_FAILED,
        entityType: 'tool',
        entityId: toolId,
        entityName: toolId,
        serverId: undefined,
        meta: { durationMs: duration, error: error.message },
        actorUserId: userId,
      })
    } catch (e) {}

    return apiError('Execution failed', 'FM_EXECUTION_ERROR', 500, { duration })
  }
})
