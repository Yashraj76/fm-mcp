import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/deployments/[id]/rollback
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const deployment = await db.deployment.findUnique({ where: { id } })
    
    if (!deployment) {
      return NextResponse.json({ success: false, error: 'Deployment not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // A rollback in this system means restoring the branch's snapshot to match the deployment's snapshot
    await db.branch.update({
      where: { id: deployment.branchId },
      data: {
        snapshot: deployment.snapshot,
        commitMessage: `Rollback to deployment ${deployment.version}`
      }
    })

    // Also update the server
    await db.mcpServer.update({
      where: { id: deployment.serverId },
      data: { version: deployment.version }
    })
    
    return NextResponse.json({ success: true, data: { message: 'Rollback successful' } })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
