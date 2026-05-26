import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { getEffectiveTools } from '@/lib/branching'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse'

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
// POST /api/servers/[id]/tools - Create a new tool
export const GET = withAuth(async (request, { params, userId }) => {
    try {
    const { id } = params
    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId')
    const category = searchParams.get('category')

    const server = await db.mcpServer.findFirst({
      where: { id, userId }
    })
    if (!server) {
      return apiNotFound('Server not found')
    }

    let tools;
    if (branchId) {
      const branchExists = await db.branch.findFirst({
        where: { id: branchId, serverId: id }
      });
      if (!branchExists) {
        return apiNotFound('Branch not found for this server');
      }
      tools = await getEffectiveTools(branchId);
      if (category) {
        tools = tools.filter((t: any) => t.category === category);
      }
      // Assuming getEffectiveTools already includes executions count? Actually no, getEffectiveTools only returns tools.
      // But we can just return the tools array as is. The UI might not strictly need executions count here, or we fetch it if needed.
    } else {
      const whereClause: Record<string, unknown> = { serverId: id }
      if (category) {
        whereClause.category = category
      }

      tools = await db.tool.findMany({
        where: whereClause,
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: {
            select: { executions: true },
          },
        },
      })
    }

    return apiSuccess(tools.map(toSafeTool))
    } catch (error) {
    console.error('[API Error]', error)
    return apiServerError('Failed to fetch tools')
    }
  });
export const POST = withAuth(async (request, { params, userId }) => {
    try {
    const { id } = params
    const server = await db.mcpServer.findFirst({
      where: { id, userId }
    })
    if (!server) {
      return apiNotFound('Server not found')
    }

    const body = await request.json()
    const parsed = createToolSchema.safeParse(body)

    if (!parsed.success) {
      return apiValidationFailed(parsed.error.flatten())
    }

    if (parsed.data.branchId) {
      const branch = await db.branch.findFirst({
        where: { id: parsed.data.branchId, serverId: id }
      })
      if (!branch) {
        return apiNotFound('Branch not found for this server')
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
      return apiError('A tool with this name already exists in this branch', 'DUPLICATE', 409)
    }

    let handlerConfigObj: any = safeParseJSON(parsed.data.handlerConfig, {})
    if (handlerConfigObj.connectionId) {
      const isLinked = await db.fMConnectionServer.findFirst({
        where: {
          connectionId: handlerConfigObj.connectionId,
          serverId: id,
        }
      })
      if (!isLinked) {
        return apiError('The connection specified in handlerConfig is not linked to this server', 'VALIDATION_ERROR', 400)
      }
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

    return apiSuccess(toSafeTool(tool), 201)
    } catch (error) {
    console.error('[API Error]', error)
    return apiServerError('Failed to create tool')
    }
  });
