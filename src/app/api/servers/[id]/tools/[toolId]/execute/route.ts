import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { log, LOG_ACTIONS } from '@/lib/logging/logger'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import { withAuth } from "@/lib/auth/api-guard"
import { executeToolWithParams } from '@/lib/tools/executor-service'

export const POST = withAuth(async (request, { params, userId }) => {
  const startTime = Date.now()
  let requestBody = ''

  try {
    const { toolId } = await params
    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId')
    const bodyText = await request.text()
    requestBody = bodyText
    const body = safeParseJSON(bodyText, {})

    // Fetch tool with server relation — ownership enforced via server.userId
    let tool = await db.tool.findFirst({
      where: { id: toolId, server: { userId } },
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
      return NextResponse.json({ success: false, error: 'Tool not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (branchId) {
      const branchObj = await db.branch.findFirst({ where: { id: branchId, serverId: tool.serverId } })
      if (!branchObj) {
        return NextResponse.json({ success: false, error: 'Branch not found', code: 'NOT_FOUND' }, { status: 404 })
      }

      const bt = await db.branchTool.findFirst({ where: { branchId, toolId } })
      if (bt && bt.action !== 'deleted' && bt.overrideData) {
        const override = safeParseJSON(bt.overrideData, {})
        const originalServer = tool.server
        tool = { ...tool, ...override } as typeof tool
        tool.server = originalServer
      }
    }

    if (!tool.isEnabled) {
      return NextResponse.json({ success: false, error: 'Tool is disabled', code: 'TOOL_DISABLED' }, { status: 400 })
    }

    const handlerConfig = safeParseJSON(tool.handlerConfig, {})

    // Choose connection
    const connectionId = handlerConfig.connectionId
    let connection = tool.server.connections.find((c: any) => c.connectionId === connectionId)?.connection

    // Fallback to the first connection linked to the server if the specified one isn't valid/found
    if (!connection) {
      connection = tool.server.connections[0]?.connection
    }

    const result = await executeToolWithParams(tool, body, connection)

    const duration = Date.now() - startTime

    // Save execution history
    await db.toolExecution.create({
      data: {
        toolId,
        requestBody,
        responseStatus: 200,
        responseBody: JSON.stringify(result),
        duration,
        status: 'success'
      }
    }).catch(e => console.error('[Execution History] Failed to save', e))

    log({
      action: LOG_ACTIONS.TOOL_EXECUTED,
      entityType: 'tool',
      entityId: tool.id,
      entityName: tool.name,
      serverId: tool.serverId,
      meta: { durationMs: duration, paramKeys: Object.keys(body) },
    })

    return NextResponse.json({
      success: true,
      status: 200,
      duration,
      data: result
    })

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error('[Tool Execution Failed]', error)

    try {
      const { toolId } = await params
      await db.toolExecution.create({
        data: {
          toolId,
          requestBody,
          responseStatus: 500,
          error: error.message,
          duration,
          status: 'error'
        }
      })
    } catch (e) {
      console.error('[Execution History] Failed to save error', e)
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
      })
    } catch (e) {}

    return NextResponse.json({ 
      success: false,
      status: 500,
      duration, 
      error: error.message || 'Execution failed',
      code: 'FM_EXECUTION_ERROR'
    }, { status: 500 })
  }
})
