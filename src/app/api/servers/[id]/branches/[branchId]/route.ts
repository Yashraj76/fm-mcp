import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateBranchSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['active', 'merged', 'archived', 'deleted']).optional(),
  commitMessage: z.string().optional(),
  snapshot: z.string().optional(),
})

const mergeBranchSchema = z.object({
  targetBranchId: z.string().min(1, 'Target branch ID is required'),
  mergeMessage: z.string().optional(),
})

const revertBranchSchema = z.object({
  commitHash: z.string().optional(),
  message: z.string().optional(),
})

// GET /api/servers/[id]/branches/[branchId] - Get single branch with tools
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  try {
    const { id, branchId } = await params
    const branch = await db.branch.findFirst({
      where: { id: branchId, serverId: id },
      include: {
        tools: {
          orderBy: { sortOrder: 'asc' },
        },
        parent: {
          select: { id: true, name: true, commitHash: true, status: true },
        },
        children: {
          select: { id: true, name: true, status: true },
        },
      },
    })

    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    return NextResponse.json(branch)
  } catch (error) {
    console.error('Error fetching branch:', error)
    return NextResponse.json({ error: 'Failed to fetch branch' }, { status: 500 })
  }
}

// PUT /api/servers/[id]/branches/[branchId] - Update a branch
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  try {
    const { id, branchId } = await params
    const branch = await db.branch.findFirst({ where: { id: branchId, serverId: id } })
    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateBranchSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = { ...parsed.data }
    if (parsed.data.commitMessage || parsed.data.snapshot) {
      updateData.commitHash = `sha_${Date.now().toString(36)}`
    }

    const updated = await db.branch.update({
      where: { id: branchId },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating branch:', error)
    return NextResponse.json({ error: 'Failed to update branch' }, { status: 500 })
  }
}

// POST /api/servers/[id]/branches/[branchId]/merge - Merge branch
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  try {
    const { id, branchId } = await params
    const body = await request.json()

    // Check if this is a merge operation
    if (body.action === 'merge') {
      const parsed = mergeBranchSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: parsed.error.flatten() },
          { status: 400 }
        )
      }

      const sourceBranch = await db.branch.findFirst({
        where: { id: branchId, serverId: id },
      })
      if (!sourceBranch) {
        return NextResponse.json({ error: 'Source branch not found' }, { status: 404 })
      }

      const targetBranch = await db.branch.findFirst({
        where: { id: parsed.data.targetBranchId, serverId: id },
      })
      if (!targetBranch) {
        return NextResponse.json({ error: 'Target branch not found' }, { status: 404 })
      }

      // Merge: update target snapshot with source tools
      const sourceSnapshot = JSON.parse(sourceBranch.snapshot || '{}')
      const targetSnapshot = JSON.parse(targetBranch.snapshot || '{}')

      // Merge tools from source into target
      const mergedTools = [
        ...(targetSnapshot.tools || []),
        ...(sourceSnapshot.tools || []),
      ]

      const mergedSnapshot = {
        ...targetSnapshot,
        tools: mergedTools,
        mergedFrom: sourceBranch.name,
        mergedAt: new Date().toISOString(),
      }

      // Update target branch
      const updatedTarget = await db.branch.update({
        where: { id: parsed.data.targetBranchId },
        data: {
          snapshot: JSON.stringify(mergedSnapshot),
          commitMessage: parsed.data.mergeMessage || `Merge branch '${sourceBranch.name}' into '${targetBranch.name}'`,
          commitHash: `sha_merge_${Date.now().toString(36)}`,
        },
      })

      // Mark source branch as merged
      const updatedSource = await db.branch.update({
        where: { id: branchId },
        data: { status: 'merged' },
      })

      return NextResponse.json({
        message: `Branch '${sourceBranch.name}' merged into '${targetBranch.name}'`,
        source: updatedSource,
        target: updatedTarget,
      })
    }

    // Check if this is a revert operation
    if (body.action === 'revert') {
      const parsed = revertBranchSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: parsed.error.flatten() },
          { status: 400 }
        )
      }

      const branch = await db.branch.findFirst({
        where: { id: branchId, serverId: id },
      })
      if (!branch) {
        return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
      }

      // Revert to current snapshot (simplified - in production would use commit history)
      const reverted = await db.branch.update({
        where: { id: branchId },
        data: {
          commitMessage: parsed.data.message || `Revert to previous state on '${branch.name}'`,
          commitHash: `sha_revert_${Date.now().toString(36)}`,
        },
      })

      return NextResponse.json({
        message: `Branch '${branch.name}' reverted`,
        branch: reverted,
      })
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "merge" or "revert".' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error in branch operation:', error)
    return NextResponse.json(
      { error: 'Failed to perform branch operation' },
      { status: 500 }
    )
  }
}

// DELETE /api/servers/[id]/branches/[branchId] - Delete a branch
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  try {
    const { id, branchId } = await params
    const branch = await db.branch.findFirst({ where: { id: branchId, serverId: id } })
    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    if (branch.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete the default branch' },
        { status: 400 }
      )
    }

    await db.branch.update({
      where: { id: branchId },
      data: { status: 'deleted' },
    })

    return NextResponse.json({ message: 'Branch deleted successfully' })
  } catch (error) {
    console.error('Error deleting branch:', error)
    return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500 })
  }
}
