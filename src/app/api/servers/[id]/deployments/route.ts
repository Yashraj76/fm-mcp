import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const deploySchema = z.object({
  branchId: z.string().optional(),
  changelog: z.string().optional(),
  targetEnvironment: z.enum(['staging', 'production']).default('staging'),
})

// GET /api/servers/[id]/deployments - List deployments for a server
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const server = await db.mcpServer.findUnique({ where: { id } })
    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    const deployments = await db.deployment.findMany({
      where: { serverId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        server: {
          select: { name: true, version: true },
        },
      },
    })

    return NextResponse.json(deployments)
  } catch (error) {
    console.error('Error fetching deployments:', error)
    return NextResponse.json({ error: 'Failed to fetch deployments' }, { status: 500 })
  }
}

// POST /api/servers/[id]/deployments - Create a new deployment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const server = await db.mcpServer.findUnique({ where: { id } })
    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = deploySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Determine which branch to deploy
    let targetBranchId = parsed.data.branchId
    if (!targetBranchId) {
      const defaultBranch = await db.branch.findFirst({
        where: { serverId: id, isDefault: true, status: 'active' },
      })
      targetBranchId = defaultBranch?.id
      if (!targetBranchId) {
        // Fall back to any active branch
        const anyBranch = await db.branch.findFirst({
          where: { serverId: id, status: 'active' },
          orderBy: { isDefault: 'desc' },
        })
        targetBranchId = anyBranch?.id
      }
    }

    if (!targetBranchId) {
      return NextResponse.json({ error: 'No active branch found to deploy' }, { status: 400 })
    }

    const branch = await db.branch.findFirst({
      where: { id: targetBranchId, serverId: id },
      include: {
        tools: { orderBy: { sortOrder: 'asc' } },
      },
    })

    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    if (branch.status !== 'active') {
      return NextResponse.json(
        { error: 'Cannot deploy from a non-active branch' },
        { status: 400 }
      )
    }

    // Get tool count and build config snapshot
    const toolCount = branch.tools.length
    const enabledTools = branch.tools.filter((t) => t.isEnabled)
    const configSnapshot = JSON.stringify({
      server: {
        name: server.name,
        version: server.version,
        description: server.description,
      },
      branch: {
        name: branch.name,
        commitHash: branch.commitHash,
      },
      tools: enabledTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: JSON.parse(t.inputSchema || '{}'),
        handlerConfig: JSON.parse(t.handlerConfig || '{}'),
        fmLayout: t.fmLayout,
        fmScript: t.fmScript,
        fmMethod: t.fmMethod,
      })),
    })

    // Determine version number
    const lastDeployment = await db.deployment.findFirst({
      where: { serverId: id },
      orderBy: { createdAt: 'desc' },
    })
    const versionParts = (lastDeployment?.version || '0.0.0').split('.')
    const newVersion = `${versionParts[0]}.${parseInt(versionParts[1]) + 1}.0`

    // Create deployment with simulated delay
    const deployment = await db.deployment.create({
      data: {
        serverId: id,
        branchId: branch.id,
        branchName: branch.name,
        branchSnapshot: branch.snapshot,
        status: 'deploying',
        version: newVersion,
        changelog: parsed.data.changelog || `Deploy branch '${branch.name}' as v${newVersion}`,
        configSnapshot,
        toolCount,
      },
    })

    // Simulate deployment process
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Complete the deployment
    const completedDeployment = await db.deployment.update({
      where: { id: deployment.id },
      data: {
        status: 'deployed',
        deployedAt: new Date(),
      },
    })

    // Update server status
    const targetEnv = parsed.data.targetEnvironment
    await db.mcpServer.update({
      where: { id },
      data: {
        status: targetEnv === 'production' ? 'deployed' : 'staging',
      },
    })

    return NextResponse.json(completedDeployment, { status: 201 })
  } catch (error) {
    console.error('Error creating deployment:', error)
    return NextResponse.json({ error: 'Failed to create deployment' }, { status: 500 })
  }
}
