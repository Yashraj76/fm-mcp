import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const createToolSchema = z.object({
  name: z.string().min(1, 'Tool name is required'),
  description: z.string().min(1, 'Description is required'),
  category: z.string().optional(),
  branchId: z.string().optional(), // optional — not all create flows pass a branchId
  inputSchema: z.union([z.string(), z.record(z.string(), z.any())]).optional().transform(
    (v) => v === undefined ? '{}' : (typeof v === 'string' ? v : JSON.stringify(v))
  ),
  outputSchema: z.union([z.string(), z.record(z.string(), z.any())]).optional().nullable().transform(
    (v) => v === undefined || v === null ? null : (typeof v === 'string' ? v : JSON.stringify(v))
  ),
  handlerConfig: z.union([z.string(), z.record(z.string(), z.any())]).optional().transform(
    (v) => v === undefined ? '{}' : (typeof v === 'string' ? v : JSON.stringify(v))
  ),
  fmLayout: z.string().optional(),
  fmScript: z.string().optional(),
  fmMethod: z.enum(['create', 'read', 'update', 'delete', 'find', 'script', 'custom']).optional(),
  // Accept both `isEnabled` and `enabled` (UI uses `enabled` in duplicate flow)
  isEnabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
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
      return NextResponse.json({ success: false, error: 'Server not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const whereClause: Record<string, unknown> = { serverId: id }
    if (category) {
      whereClause.category = category
    }

    const tools = await db.tool.findMany({
      where: whereClause,
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { executions: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: tools })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch tools', code: 'SERVER_ERROR' }, { status: 500 })
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
      return NextResponse.json({ success: false, error: 'Server not found', code: 'NOT_FOUND' }, { status: 404 })
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

    // Check for duplicate tool name in the same server
    const existingTool = await db.tool.findFirst({
      where: {
        serverId: id,
        name: parsed.data.name,
      },
    })
    if (existingTool) {
      return NextResponse.json(
        { success: false, error: 'A tool with this name already exists in this branch', code: 'DUPLICATE' },
        { status: 409 }
      )
    }

    const { branchId, enabled, isEnabled, ...restData } = parsed.data;
    const tool = await db.tool.create({
      data: {
        ...restData,
        // Resolve `enabled` alias → `isEnabled`
        isEnabled: isEnabled ?? enabled ?? true,
        serverId: id,
      },
    })

    return NextResponse.json({ success: true, data: tool }, { status: 201 })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Failed to create tool', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
