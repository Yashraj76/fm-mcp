import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/servers/[id]/deployments/[deploymentId] - Get a single deployment
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; deploymentId: string }> }
) {
  try {
    const { id, deploymentId } = await params
    const deployment = await db.deployment.findFirst({
      where: { id: deploymentId, serverId: id },
    })

    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 })
    }

    const parsedConfig = JSON.parse(deployment.configSnapshot || '{}')
    const parsedBranchSnapshot = JSON.parse(deployment.branchSnapshot || '{}')

    return NextResponse.json({
      ...deployment,
      config: parsedConfig,
      branchSnapshot: parsedBranchSnapshot,
    })
  } catch (error) {
    console.error('Error fetching deployment:', error)
    return NextResponse.json({ error: 'Failed to fetch deployment' }, { status: 500 })
  }
}
