import { NextResponse } from 'next/server'
import { withAuth } from "@/lib/auth/api-guard"
import { db } from '@/lib/db'

export const GET = withAuth(async (request, { params, userId }) => {
  try {
    const { id } = await params
    const server = await db.mcpServer.findFirst({
      where: { id, userId },
      include: {
        connections: {
          include: {
            connection: true
          }
        },
        apiKey: true
      }
    })

    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const connectionStatuses = server.connections.map(c => ({
      connectionId: c.connection.id,
      name: c.connection.name,
      database: c.connection.database,
      status: c.connection.status,
      lastTested: c.connection.lastTested,
      lastError: c.connection.lastError,
      isActive: c.isActive
    }))

    const serverReady = connectionStatuses.length > 0 && connectionStatuses.some(c => c.isActive && c.status === 'connected')

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const mcpBase = `${baseUrl}/api/mcp/${server.id}`

    const redisConfigured = !!process.env.REDIS_URL
    const sseAvailable = redisConfigured
    const streamableHttpAvailable = true

    const sseMessage = redisConfigured
      ? "Redis is configured. SSE transport is available for Claude Desktop."
      : "Redis is not configured. SSE transport is disabled; use Streamable HTTP or mcp-remote proxy."

    const responseData = {
      serverReady,
      hasApiKey: !!server.apiKey,
      apiKeyPrefix: server.apiKey?.keyPrefix || null,
      apiKeyLastUsedAt: server.apiKey?.lastUsedAt || null,
      endpoints: {
        streamableHttp: `${mcpBase}/mcp`,
        sse: `${mcpBase}/sse`
      },
      transports: {
        streamableHttpAvailable,
        sseAvailable,
        redisConfigured,
        sseMessage
      },
      connections: connectionStatuses
    }

    return NextResponse.json({ success: true, data: responseData })
  } catch (error: any) {
    console.error('[Connection Status API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
})
