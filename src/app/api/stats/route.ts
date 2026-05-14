import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/stats - Get dashboard statistics
export async function GET() {
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

    return NextResponse.json({
      success: true,
      data: {
        totalConnections: connections,
        connectedConnections,
        activeServers,
        totalServers: servers,
        totalTools: tools,
        totalDeployments: deployments,
      }
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch stats', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
