import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/deployments - List deployments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const serverId = searchParams.get('serverId')
    
    const deployments = await db.deployment.findMany({
      where: serverId ? { serverId } : undefined,
      orderBy: { createdAt: 'desc' }
    })
    
    return NextResponse.json({ success: true, data: deployments })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// POST /api/deployments - Create deployment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { serverId, branchId, version, environment, description } = body
    
    const branch = await db.branch.findUnique({ where: { id: branchId } })
    if (!branch) {
      return NextResponse.json({ success: false, error: 'Branch not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const deployment = await db.deployment.create({
      data: {
        serverId,
        branchId,
        version: version || '1.0.0',
        environment: environment || 'production',
        status: 'deployed',
        snapshot: branch.snapshot, // Copy current branch snapshot
        config: branch.snapshot, // Just using snapshot for config
      }
    })
    
    // Update server status
    await db.mcpServer.update({
      where: { id: serverId },
      data: { status: 'deployed', version: version || '1.0.0' }
    })
    
    return NextResponse.json({ success: true, data: deployment }, { status: 201 })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
