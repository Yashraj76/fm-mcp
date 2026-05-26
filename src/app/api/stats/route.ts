import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from "@/lib/auth/api-guard";

// GET /api/stats - Get dashboard statistics
export const GET = withAuth(async (req, { params, userId }) => {
    try {
    const [connections, servers, tools, deployments] = await Promise.all([
      db.fMConnection.count(),
      db.mcpServer.count(),
      db.tool.count(),
      db.deployment.count(),
    ])

    const connectedConnections = await db.fMConnection.count({
      where: { status: 'connected' },
    })

    const activeServers = await db.mcpServer.count({
      where: { status: { in: ['staging', 'deployed'] } },
    })

    const [totalExecutions, passedExecutions, failedExecutions, avgDurationResult] = await Promise.all([
      db.toolExecution.count(),
      db.toolExecution.count({ where: { status: 'success' } }),
      db.toolExecution.count({ where: { status: 'error' } }),
      db.toolExecution.aggregate({ _avg: { duration: true } })
    ])

    return NextResponse.json({
      success: true,
      data: {
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
      }
    })
    } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch stats', code: 'SERVER_ERROR' }, { status: 500 })
    }
    });
