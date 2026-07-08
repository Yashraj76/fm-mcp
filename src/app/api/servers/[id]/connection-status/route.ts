import { apiSuccess, apiNotFound, apiServerError, apiError } from '@/lib/utils/api-response'
import { withAuth } from "@/lib/auth/api-guard"
import { db } from '@/lib/db'
import { getPublicAppUrl, AppUrlConfigError } from '@/lib/utils/app-url'
import { logger } from '@/lib/logger'

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
      return apiNotFound('Server not found')
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

    const baseUrl = getPublicAppUrl()
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

    return apiSuccess(responseData)
  } catch (error: any) {
    if (error instanceof AppUrlConfigError) {
      return apiError(error.message, 'CONFIG_ERROR', 500)
    }
    logger.error({ err: error }, '[Connection Status API Error]')
    return apiServerError('Internal server error')
  }
})
