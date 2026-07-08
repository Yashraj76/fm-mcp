import { apiSuccess, apiServerError } from '@/lib/utils/api-response'
import { db } from '@/lib/db'
import { withAuth } from "@/lib/auth/api-guard";
import { logger } from '@/lib/logger'

// GET /api/stats - Get dashboard statistics
export const GET = withAuth(async (req, { params, userId }) => {
    try {
    const [connections, servers, tools, deployments] = await Promise.all([
      db.fMConnection.count({ where: { userId } }),
      db.mcpServer.count({ where: { userId } }),
      db.tool.count({ where: { server: { userId }, deletedAt: null } }),
      db.deployment.count({ where: { server: { userId } } }),
    ])

    const connectedConnections = await db.fMConnection.count({
      where: { userId, status: 'connected' },
    })

    const activeServers = await db.mcpServer.count({
      where: { userId, status: { in: ['staging', 'deployed'] } },
    })

    const [totalExecutions, passedExecutions, failedExecutions, avgDurationResult] = await Promise.all([
      db.toolExecution.count({ where: { tool: { server: { userId } } } }),
      db.toolExecution.count({ where: { status: 'success', tool: { server: { userId } } } }),
      db.toolExecution.count({ where: { status: 'error', tool: { server: { userId } } } }),
      db.toolExecution.aggregate({
        _avg: { duration: true },
        where: { tool: { server: { userId } } }
      })
    ])

    return apiSuccess({
      totalConnections: connections,
      connectedConnections,
      activeServers,
      totalServers: servers,
      totalTools: tools,
      totalDeployments: deployments,
      apiStats: {
        total: totalExecutions,
        passed: passedExecutions,
        failed: failedExecutions,
        avgDuration: Math.round(avgDurationResult._avg.duration || 0)
      }
    })
  } catch (error) {
    logger.error({ err: error }, 'Error fetching stats:')
    return apiServerError('Failed to fetch stats')
  }
})
