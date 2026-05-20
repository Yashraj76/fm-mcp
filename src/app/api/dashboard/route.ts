import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/dashboard - Get platform dashboard statistics
export async function GET() {
  try {
    const [
      totalConnections,
      activeConnections,
      totalServers,
      deployedServers,
      totalBranches,
      totalTools,
      enabledTools,
      totalDeployments,
      recentDeployments,
      totalExecutions,
      successfulExecutions,
      recentExecutions,
      totalSuggestions,
      pendingSuggestions,
    ] = await Promise.all([
      // Total connections
      db.fMConnection.count(),

      // Active (connected) connections
      db.fMConnection.count({ where: { status: 'connected' } }),

      // Total servers
      db.mcpServer.count(),

      // Deployed servers
      db.mcpServer.count({ where: { status: 'deployed' } }),

      // Total branches
      db.branch.count({ where: { status: 'active' } }),

      // Total tools
      db.tool.count(),

      // Enabled tools
      db.tool.count({ where: { isEnabled: true } }),

      // Total deployments
      db.deployment.count(),

      // Recent deployments (last 7 days)
      db.deployment.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),

      // Total executions
      db.toolExecution.count(),

      // Successful executions
      db.toolExecution.count({ where: { status: 'success' } }),

      // Recent executions (last 24 hours)
      db.toolExecution.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),

      // Total AI suggestions
      db.aiSuggestion.count(),

      // Pending suggestions
      db.aiSuggestion.count({ where: { status: 'pending' } }),
    ])

    // Get server distribution by status
    const serversByStatus = await db.mcpServer.groupBy({
      by: ['status'],
      _count: true,
    })

    // Get tools by category
    const toolsByCategory = await db.tool.groupBy({
      by: ['category'],
      _count: true,
      where: { category: { not: null } },
    })

    // Get execution success rate (last 100 executions)
    const recentExecutionStats = await db.toolExecution.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { status: true, duration: true },
    })

    const successRate = recentExecutionStats.length > 0
      ? recentExecutionStats.filter((e) => e.status === 'success').length / recentExecutionStats.length
      : 0

    const avgDuration = recentExecutionStats.length > 0
      ? recentExecutionStats.reduce((sum, e) => sum + (e.duration || 0), 0) / recentExecutionStats.length
      : 0

    // Get recent deployments with details
    const latestDeployments = await db.deployment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        server: { select: { name: true } },
        branch: { select: { name: true } },
      },
    })

    // Get recent connections
    const recentConnections = await db.fMConnection.findMany({
      orderBy: { lastTested: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        host: true,
        status: true,
        lastTested: true,
      },
    })

    // Get top tools by execution count
    const topTools = await db.tool.findMany({
      orderBy: { executions: { _count: 'desc' } },
      take: 5,
      include: {
        _count: { select: { executions: true } },
        server: { select: { name: true } },
      },
    })

    return NextResponse.json({
      overview: {
        connections: {
          total: totalConnections,
          active: activeConnections,
          inactive: totalConnections - activeConnections,
        },
        servers: {
          total: totalServers,
          deployed: deployedServers,
          draft: serversByStatus.find((s) => s.status === 'draft')?._count || 0,
          staging: serversByStatus.find((s) => s.status === 'staging')?._count || 0,
        },
        branches: {
          total: totalBranches,
        },
        tools: {
          total: totalTools,
          enabled: enabledTools,
          disabled: totalTools - enabledTools,
          byCategory: toolsByCategory.map((t) => ({
            category: t.category,
            count: t._count,
          })),
        },
        deployments: {
          total: totalDeployments,
          recent: recentDeployments,
        },
        executions: {
          total: totalExecutions,
          successful: successfulExecutions,
          failed: totalExecutions - successfulExecutions,
          recent: recentExecutions,
          successRate: Math.round(successRate * 100),
          avgDuration: Math.round(avgDuration),
        },
        ai: {
          totalSuggestions: totalSuggestions,
          pendingSuggestions,
        },
      },
      recentActivity: {
        deployments: latestDeployments.map((d) => ({
          id: d.id,
          serverName: d.server.name,
          version: d.version,
          status: d.status,
          branchName: d.branch?.name,
          toolCount: 0,
          deployedAt: d.deployedAt,
          createdAt: d.createdAt,
        })),
        connections: recentConnections.map((c) => ({
          id: c.id,
          name: c.name,
          host: c.host,
          status: c.status,
          lastTested: c.lastTested,
        })),
      },
      topTools: topTools.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        serverName: t.server.name,
        category: t.category,
        executionCount: t._count.executions,
        isEnabled: t.isEnabled,
      })),
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    )
  }
}
