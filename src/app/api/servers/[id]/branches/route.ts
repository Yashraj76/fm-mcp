import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const createBranchSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  parentId: z.string().optional(),
  commitMessage: z.string().optional(),
})

// GET /api/servers/[id]/branches - List branches for a server
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

    const branches = await db.branch.findMany({
      where: { serverId: id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: { tools: true, children: true },
        },
        parent: {
          select: { id: true, name: true, commitHash: true },
        },
      },
    })

    return NextResponse.json(branches)
  } catch (error) {
    console.error('Error fetching branches:', error)
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 })
  }
}

// POST /api/servers/[id]/branches - Create a new branch
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
    const parsed = createBranchSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Check for duplicate branch name
    const existingBranch = await db.branch.findFirst({
      where: { serverId: id, name: parsed.data.name },
    })
    if (existingBranch) {
      return NextResponse.json(
        { error: 'A branch with this name already exists' },
        { status: 409 }
      )
    }

    // Determine parent branch
    let parentId = parsed.data.parentId
    if (!parentId) {
      const defaultBranch = await db.branch.findFirst({
        where: { serverId: id, isDefault: true },
      })
      parentId = defaultBranch?.id
    }

    // Get parent snapshot if exists
    let snapshot = JSON.stringify({ tools: [], connections: [], config: server.config })
    if (parentId) {
      const parent = await db.branch.findUnique({ where: { id: parentId } })
      if (parent) {
        snapshot = parent.snapshot
      }
    }

    const branch = await db.branch.create({
      data: {
        serverId: id,
        name: parsed.data.name,
        parentId,
        status: 'active',
        commitMessage: parsed.data.commitMessage || `Create branch ${parsed.data.name}`,
        commitHash: `sha_${Date.now().toString(36)}`,
        snapshot,
      },
    })

    return NextResponse.json(branch, { status: 201 })
  } catch (error) {
    console.error('Error creating branch:', error)
    return NextResponse.json({ error: 'Failed to create branch' }, { status: 500 })
  }
}
