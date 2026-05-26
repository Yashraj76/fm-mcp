import { NextResponse } from 'next/server'
import { prisma as db } from '@/lib/prisma'
import { withAuth } from "@/lib/auth/api-guard";
import { apiNotFound, apiError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { executeToolWithParams } from '@/lib/tools/executor-service'

export const runtime = 'nodejs'
export const maxDuration = 60

export const POST = withAuth(async (req, { params, userId }) => {
  const startTime = Date.now()

  try {
    const { id: serverId } = params
    const rawBody = await req.text()
    const bodyObj = safeParseJSON(rawBody, null)
    if (!bodyObj || typeof bodyObj !== 'object') {
      return apiError('Invalid JSON request body', 'VALIDATION_ERROR', 400)
    }
    const { toolData, body } = bodyObj

    const server = await db.mcpServer.findFirst({
      where: { id: serverId, userId },
      include: { connections: { include: { connection: true } } }
    })

    if (!server) return apiNotFound('Server not found')

    const handlerConfig = toolData.handlerConfig || {}

    // System tools are not supported in dry-run for now
    if (toolData.category === 'system') {
      return apiError('System tools cannot be dry-run.', 'VALIDATION_ERROR', 400)
    }

    let connectionId = handlerConfig.connectionId
    let connection = server.connections.find((c: any) => c.connectionId === connectionId)?.connection

    if (connectionId && !connection) {
      return apiError('The specified connection is not attached to this server', 'VALIDATION_ERROR', 400)
    }

    if (!connection && server.connections.length > 0) {
      connection = server.connections[0].connection
    }
    if (!connection) {
      return apiError('No FileMaker connection available for this server', 'VALIDATION_ERROR', 400)
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
    console.error('[Tool Dry-Run Failed]', error)

    return NextResponse.json({ 
      success: false,
      status: 500, 
      duration, 
      error: error.message || 'Execution failed',
      code: 'FM_EXECUTION_ERROR'
    }, { status: 500 })
  }
})
