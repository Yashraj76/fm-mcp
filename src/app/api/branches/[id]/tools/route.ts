import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto';
import { apiSuccess, apiNotFound, apiServerError, apiError, apiValidationFailed } from '@/lib/utils/api-response';
import { z, ZodError } from 'zod';
import { validateToolForSave } from '@/lib/tools/validate-tool';
import { createToolWithBranch } from '@/lib/tools/create-tool-with-branch';
import { checkDuplicateToolName, duplicateToolNameMessage, DUPLICATE_TOOL_NAME_CODE } from '@/lib/tools/duplicate-tool-name';
import { logger } from '@/lib/logger'

// GET: effective tool list for this branch
// POST: add a new tool to this branch only
export const GET = withAuth(async (_, { params, userId }) => {
    try {
    const branch = await prisma.branch.findFirst({
      where: {
        id: params.id,
        server: { userId }
      }
    });
    if (!branch) {
      return apiNotFound('Branch not found');
    }

    const branchTools = await prisma.branchTool.findMany({
      where: {
        branchId: params.id,
        action: { not: 'deleted' },
        tool: { deletedAt: null },
      },
      include: { tool: true },
      orderBy: { createdAt: 'asc' },
    }) as any[];

    // Merge override data into tool records and convert to safe DTO
    const tools = branchTools.map(bt => {
      const base = bt.tool;
      const override = safeParseJSON<Record<string, any>>(bt.overrideData, {});
      const merged = {
        ...base,
        ...override,
      };
      const safe = toSafeTool(merged);
      return {
        ...safe,
        _branchAction: bt.action,        // "inherited" | "modified" | "added"
        _branchToolId: bt.id,
      };
    });

    return apiSuccess(tools);
    } catch (error) {
    logger.error({ err: error }, '[API GET Branch Tools Error]');
    return apiServerError('Internal server error');
    }
  });

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.any().optional(),
  fmMethod: z.string().optional(),
  handlerType: z.string().optional(),
  handlerConfig: z.any().optional(),
  isEnabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
  category: z.string().optional(),
  isAiGenerated: z.boolean().optional(),
});

export const POST = withAuth(async (req, { params, userId }) => {
    let toolName = '';
    try {
    const branch = await prisma.branch.findFirst({
      where: {
        id: params.id,
        server: { userId }
      }
    });
    if (!branch) return apiNotFound('Branch not found');

    const bodyObj = await req.json().catch(() => ({}));
    const body = createSchema.parse(bodyObj);
    toolName = body.name;

    const toolForValidation = {
      name: body.name,
      description: body.description ?? '',
      fmMethod: body.handlerType || body.fmMethod || 'custom',
      category: body.category ?? 'custom',
      handlerConfig: typeof body.handlerConfig === 'string'
        ? body.handlerConfig
        : JSON.stringify(body.handlerConfig ?? {}),
      inputSchema: typeof body.inputSchema === 'string'
        ? body.inputSchema
        : JSON.stringify(body.inputSchema ?? {}),
    }
    const toolValidationErrors = validateToolForSave(toolForValidation)
    if (toolValidationErrors.length > 0) {
      return apiValidationFailed(toolValidationErrors)
    }

    let handlerConfigObj: any = {}
    if (body.handlerConfig) {
      handlerConfigObj = typeof body.handlerConfig === 'string'
        ? safeParseJSON<Record<string, any>>(body.handlerConfig, {})
        : body.handlerConfig;
    }
    if (handlerConfigObj.connectionId) {
      const isLinked = await prisma.fMConnectionServer.findFirst({
        where: {
          connectionId: handlerConfigObj.connectionId,
          serverId: branch.serverId,
        }
      });
      if (!isLinked) {
        return apiError('The connection specified in handlerConfig is not linked to this server', 'VALIDATION_ERROR', 400);
      }
    }

    // Pre-check before hitting the DB constraint for a friendlier error message.
    const dupCheck = await checkDuplicateToolName(prisma, branch.serverId, body.name)
    if (dupCheck.isDuplicate) {
      return apiError(duplicateToolNameMessage(body.name), DUPLICATE_TOOL_NAME_CODE, 409)
    }

    // Atomically create the base tool record and link it to this branch
    const { tool } = await createToolWithBranch(
      prisma,
      {
        name: body.name,
        description: body.description ?? '',
        inputSchema: typeof body.inputSchema === 'string' ? body.inputSchema : JSON.stringify(body.inputSchema),
        fmMethod: body.handlerType || body.fmMethod || 'custom',
        handlerConfig: typeof body.handlerConfig === 'string' ? body.handlerConfig : JSON.stringify(body.handlerConfig),
        isEnabled: body.enabled ?? body.isEnabled ?? true,
        category: body.category ?? 'custom',
        isAiGenerated: body.isAiGenerated || false,
        serverId: branch.serverId,
      },
      params.id,
    );

    await log({
      action: LOG_ACTIONS.TOOL_CREATED,
      entityType: 'tool', entityId: tool.id, entityName: tool.name,
      serverId: branch.serverId, branchId: params.id,
      after: JSON.stringify({ name: tool.name, fmMethod: tool.fmMethod }),
      meta: { branch: branch.name, addedOnBranch: true },
      actorUserId: userId,
    });

    return apiSuccess(toSafeTool(tool), 201);
    } catch (error: any) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues);
    }
    if (error?.code === 'P2002') {
      return apiError(duplicateToolNameMessage(toolName), DUPLICATE_TOOL_NAME_CODE, 409);
    }
    logger.error({ err: error }, '[API POST Branch Tools Error]');
    return apiServerError('Internal server error');
    }
  });
