import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateToolSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  branchId: z.string().optional(),
  inputSchema: z.string().optional(),
  outputSchema: z.string().nullable().optional(),
  handlerConfig: z.string().optional(),
  fmLayout: z.string().nullable().optional(),
  fmScript: z.string().nullable().optional(),
  fmMethod: z.enum(['create', 'read', 'update', 'delete', 'find', 'script', 'custom']).nullable().optional(),
  isEnabled: z.boolean().optional(),
  testConfig: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

// GET /api/servers/[id]/tools/[toolId] - Get a single tool
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  try {
    const { id, toolId } = await params
    const tool = await db.tool.findFirst({
      where: { id: toolId, serverId: id },
      include: {
        branch: {
          select: { id: true, name: true, isDefault: true },
        },
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        versions: {
          orderBy: { version: 'desc' },
        },
      },
    })

    if (!tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 })
    }

    return NextResponse.json(tool)
  } catch (error) {
    console.error('Error fetching tool:', error)
    return NextResponse.json({ error: 'Failed to fetch tool' }, { status: 500 })
  }
}

// PUT /api/servers/[id]/tools/[toolId] - Update a tool
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  try {
    const { id, toolId } = await params
    const tool = await db.tool.findFirst({ where: { id: toolId, serverId: id } })
    if (!tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateToolSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // If moving to a different branch, verify the branch exists
    if (parsed.data.branchId) {
      const branch = await db.branch.findFirst({
        where: { id: parsed.data.branchId, serverId: id },
      })
      if (!branch) {
        return NextResponse.json({ error: 'Target branch not found' }, { status: 404 })
      }
    }

    const updateData: Record<string, unknown> = { ...parsed.data }
    // Auto-increment version if significant changes
    if (parsed.data.inputSchema || parsed.data.handlerConfig || parsed.data.fmLayout) {
      updateData.version = { increment: 1 }
    }

    const updatedTool = await db.tool.update({
      where: { id: toolId },
      data: updateData,
    })

    return NextResponse.json(updatedTool)
  } catch (error) {
    console.error('Error updating tool:', error)
    return NextResponse.json({ error: 'Failed to update tool' }, { status: 500 })
  }
}

// DELETE /api/servers/[id]/tools/[toolId] - Delete a tool
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  try {
    const { id, toolId } = await params
    const tool = await db.tool.findFirst({ where: { id: toolId, serverId: id } })
    if (!tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 })
    }

    await db.tool.delete({ where: { id: toolId } })

    return NextResponse.json({ message: 'Tool deleted successfully' })
  } catch (error) {
    console.error('Error deleting tool:', error)
    return NextResponse.json({ error: 'Failed to delete tool' }, { status: 500 })
  }
}
