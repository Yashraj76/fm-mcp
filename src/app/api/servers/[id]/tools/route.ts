import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { getEffectiveTools } from '@/lib/branching'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import { validateToolForSave } from '@/lib/tools/validate-tool'
import { createToolWithBranch } from '@/lib/tools/create-tool-with-branch'
import { fmMethodSchema } from '@/lib/tools/fm-methods'
import { checkDuplicateToolName, duplicateToolNameMessage, DUPLICATE_TOOL_NAME_CODE } from '@/lib/tools/duplicate-tool-name'
import { logger } from '@/lib/logger'

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
  outputSelector: z.string().nullable().optional(),
  handlerConfig: z.union([z.string(), z.record(z.string(), z.any())]).optional().transform(
    (v) => v === undefined ? '{}' : (typeof v === 'string' ? v : JSON.stringify(v))
  ),
  fmLayout: z.string().optional(),
  fmScript: z.string().optional(),
  fmMethod: fmMethodSchema.optional(),
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
      const whereClause: Record<string, unknown> = { serverId: id, deletedAt: null }
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
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Failed to fetch tools')
    }
  });
export const POST = withAuth(async (request, { params, userId }) => {
    let toolName = '';
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
    toolName = parsed.data.name;

    if (parsed.data.branchId) {
      const branch = await db.branch.findFirst({
        where: { id: parsed.data.branchId, serverId: id }
      })
      if (!branch) {
        return apiNotFound('Branch not found for this server')
      }
    }

    const toolValidationErrors = validateToolForSave(parsed.data)
    if (toolValidationErrors.length > 0) {
      return apiValidationFailed(toolValidationErrors)
    }

    let handlerConfigObj: any = safeParseJSON<Record<string, any>>(parsed.data.handlerConfig, {})
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

    // Pre-check before hitting the DB constraint — gives a friendlier error message
    // than a raw P2002, and avoids a wasted insert attempt in the common case.
    const dupCheck = await checkDuplicateToolName(db, id, parsed.data.name)
    if (dupCheck.isDuplicate) {
      return apiError(duplicateToolNameMessage(parsed.data.name), DUPLICATE_TOOL_NAME_CODE, 409)
    }

    const { branchId, enabled, isEnabled, ...restData } = parsed.data;
    const toolData = {
      ...restData,
      isEnabled: isEnabled ?? enabled ?? true,
      isAiGenerated: false,
      serverId: id,
    };

    // Determine which branch to link — explicit branchId, or the server's default branch
    let targetBranchId = branchId;
    if (!targetBranchId) {
      const defaultBranch = await db.branch.findFirst({ where: { serverId: id, isDefault: true } });
      if (defaultBranch) targetBranchId = defaultBranch.id;
    }

    let tool: any;
    if (targetBranchId) {
      // Atomically create Tool + BranchTool so the tool is visible to getEffectiveTools
      const result = await createToolWithBranch(db, toolData, targetBranchId);
      tool = result.tool;
    } else {
      // No branch exists yet (e.g. server has no branches) — create Tool only
      tool = await db.tool.create({ data: toolData });
    }

    return apiSuccess(toSafeTool(tool), 201)
    } catch (error: any) {
    if (error?.code === 'P2002') {
      return apiError(duplicateToolNameMessage(toolName), DUPLICATE_TOOL_NAME_CODE, 409)
    }
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Failed to create tool')
    }
  });
