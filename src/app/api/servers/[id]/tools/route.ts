import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const createToolSchema = z.object({
  name: z.string().min(1, 'Tool name is required'),
  description: z.string().min(1, 'Description is required'),
  category: z.string().optional(),
  branchId: z.string().min(1, 'Branch ID is required'),
  inputSchema: z.string().min(1, 'Input schema (JSON) is required'),
  outputSchema: z.string().optional(),
  handlerConfig: z.string().min(1, 'Handler config (JSON) is required'),
  fmLayout: z.string().optional(),
  fmScript: z.string().optional(),
  fmMethod: z.enum(['create', 'read', 'update', 'delete', 'find', 'script', 'custom']).optional(),
  isEnabled: z.boolean().default(true),
  testConfig: z.string().optional(),
  sortOrder: z.number().int().default(0),
})

// GET /api/servers/[id]/tools - List tools for a server (optionally filtered by branch)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId')
    const category = searchParams.get('category')

    const server = await db.mcpServer.findUnique({ where: { id } })
    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    const whereClause: Record<string, unknown> = { serverId: id }
    if (branchId) {
      whereClause.branchId = branchId
    } else {
      // Default to the default branch's tools
      const defaultBranch = await db.branch.findFirst({
        where: { serverId: id, isDefault: true, status: 'active' },
      })
      if (defaultBranch) {
        whereClause.branchId = defaultBranch.id
      }
    }
    if (category) {
      whereClause.category = category
    }

    const tools = await db.tool.findMany({
      where: whereClause,
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { executions: true, versions: true },
        },
      },
    })

    return NextResponse.json(tools)
  } catch (error) {
    console.error('Error fetching tools:', error)
    return NextResponse.json({ error: 'Failed to fetch tools' }, { status: 500 })
  }
}

// POST /api/servers/[id]/tools - Create a new tool
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
    const parsed = createToolSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    if (parsed.data.branchId) {
      const branch = await db.branch.findFirst({
        where: { id: parsed.data.branchId, serverId: id },
      })
      if (!branch) {
        return NextResponse.json(
          { error: 'Branch not found for this server' },
          { status: 404 }
        )
      }
    }

    // Check for duplicate tool name in the same branch
    const existingTool = await db.tool.findFirst({
      where: {
        serverId: id,
        branchId: parsed.data.branchId,
        name: parsed.data.name,
      },
    })
    if (existingTool) {
      return NextResponse.json(
        { error: 'A tool with this name already exists in this branch' },
        { status: 409 }
      )
    }

    const tool = await db.tool.create({
      data: {
        ...parsed.data,
        serverId: id,
      },
    })

    return NextResponse.json(tool, { status: 201 })
  } catch (error) {
    console.error('Error creating tool:', error)
    return NextResponse.json({ error: 'Failed to create tool' }, { status: 500 })
  }
}
