import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const rollbackSchema = z.object({
  reason: z.string().optional(),
})

// POST /api/servers/[id]/deployments/[deploymentId]/rollback - Rollback to a previous deployment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deploymentId: string }> }
) {
  try {
    const { id, deploymentId } = await params

    // Find the deployment to rollback to
    const targetDeployment = await db.deployment.findFirst({
      where: { id: deploymentId, serverId: id },
    })

    if (!targetDeployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 })
    }

    if (targetDeployment.status !== 'deployed') {
      return NextResponse.json(
        { error: 'Can only rollback to a successfully deployed version' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const parsed = rollbackSchema.safeParse(body || {})

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Find the current active deployment
    const currentDeployment = await db.deployment.findFirst({
      where: {
        serverId: id,
        status: 'deployed',
        id: { not: deploymentId },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Mark current deployment as rolled back
    if (currentDeployment) {
      await db.deployment.update({
        where: { id: currentDeployment.id },
        data: { status: 'rolled_back' },
      })
    }

    // Create a new rollback deployment
    const rollbackVersion = targetDeployment.version + '-rollback'

    const rollbackDeployment = await db.deployment.create({
      data: {
        serverId: id,
        branchId: targetDeployment.branchId,
        branchName: targetDeployment.branchName,
        branchSnapshot: targetDeployment.branchSnapshot,
        status: 'deployed',
        version: rollbackVersion,
        changelog: `Rollback to v${targetDeployment.version}${parsed.data.reason ? `: ${parsed.data.reason}` : ''}`,
        deployedAt: new Date(),
        rollbackFrom: currentDeployment?.id,
        configSnapshot: targetDeployment.configSnapshot,
        toolCount: targetDeployment.toolCount,
      },
    })

    return NextResponse.json({
      message: `Successfully rolled back to version ${targetDeployment.version}`,
      previousDeployment: currentDeployment
        ? { id: currentDeployment.id, version: currentDeployment.version }
        : null,
      targetDeployment: { id: targetDeployment.id, version: targetDeployment.version },
      rollback: rollbackDeployment,
    })
  } catch (error) {
    console.error('Error during rollback:', error)
    return NextResponse.json({ error: 'Failed to perform rollback' }, { status: 500 })
  }
}
