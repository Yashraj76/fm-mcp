import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto';
import { z, ZodError } from 'zod';
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response';
import { mergeToolOverrideFields } from '@/lib/branches/merge-override-fields';
import { logger } from '@/lib/logger'

// GET: get a specific tool for this branch with its overrides
// PUT: override a tool on this branch (non-destructive — doesn't touch main)
// DELETE: mark tool as deleted on this branch (doesn't delete from main)
export const GET = withAuth(async (_, { params, userId }) => {
    try {
    const branchId = params.id;
    const toolId = params.toolId;

    const tool = await prisma.tool.findFirst({
      where: {
        id: toolId,
        server: { userId }
      }
    });
    if (!tool) {
      return apiNotFound('Tool not found');
    }

    const branchTool = await prisma.branchTool.findUnique({
      where: { branchId_toolId: { branchId, toolId } },
    });

    const override = branchTool ? safeParseJSON<Record<string, any>>(branchTool.overrideData, {}) : {};
    const merged = {
      ...tool,
      ...override,
    };
    const safe = toSafeTool(merged);

    return apiSuccess({
      ...safe,
      _branchAction: branchTool?.action || 'inherited',
      _branchToolId: branchTool?.id,
    });
    } catch (error) {
    logger.error({ err: error }, '[API GET Branch Tool Detail Error]');
    return apiServerError('Internal server error');
    }
  });

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z.any().optional(),
  handlerConfig: z.any().optional(),
  outputSelector: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const PUT = withAuth(async (req, { params, userId }) => {
    try {
    const branch = await prisma.branch.findFirst({
      where: {
        id: params.id,
        server: { userId }
      }
    });
    if (!branch) return apiNotFound('Not found');

    const bodyObj = await req.json().catch(() => ({}));
    const body = updateSchema.parse(bodyObj);
    const tool = await prisma.tool.findFirst({
      where: {
        id: params.toolId,
        server: { userId }
      }
    });
    if (!tool) return apiNotFound('Tool not found');

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

    const beforeData = {
      name: tool.name, description: tool.description,
      fmMethod: tool.fmMethod ?? '', enabled: tool.isEnabled,
    };

    // Read the existing override so we can deep-merge rather than replace.
    // Without this, a second PUT that changes only `description` would erase
    // any `handlerConfig` saved by the first PUT.
    const existingBranchTool = await prisma.branchTool.findUnique({
      where: { branchId_toolId: { branchId: params.id, toolId: params.toolId } },
      select: { overrideData: true },
    });
    const existingOverride = safeParseJSON<Record<string, unknown>>(
      existingBranchTool?.overrideData,
      {},
    );

    // Build incoming fields from the validated request body only.
    const incomingOverride: Record<string, unknown> = {
      ...(body.name && { name: body.name }),
      ...(body.description && { description: body.description }),
      ...(body.inputSchema && { inputSchema: typeof body.inputSchema === 'string' ? body.inputSchema : JSON.stringify(body.inputSchema) }),
      ...(body.handlerConfig && { handlerConfig: typeof body.handlerConfig === 'string' ? body.handlerConfig : JSON.stringify(body.handlerConfig) }),
      ...(body.outputSelector !== undefined && { outputSelector: body.outputSelector }),
      ...(body.isEnabled !== undefined ? { isEnabled: body.isEnabled } : (body.enabled !== undefined ? { isEnabled: body.enabled } : {})),
    };

    // Merge: existing fields are preserved; incoming fields win on collision.
    const overrideData = mergeToolOverrideFields(existingOverride, incomingOverride);

    // Stamp the base tool's current updatedAt — merge compares this against
    // the base's updatedAt at merge time to detect whether another branch
    // changed the same tool underneath this one since this edit was made.
    await prisma.branchTool.upsert({
      where: { branchId_toolId: { branchId: params.id, toolId: params.toolId } },
      create: {
        branchId: params.id,
        toolId: params.toolId,
        action: 'modified',
        overrideData: JSON.stringify(overrideData),
        baseUpdatedAt: tool.updatedAt,
      },
      update: {
        action: 'modified',
        overrideData: JSON.stringify(overrideData),
        baseUpdatedAt: tool.updatedAt,
      },
    });

    await log({
      action: LOG_ACTIONS.TOOL_UPDATED,
      entityType: 'tool', entityId: tool.id, entityName: tool.name,
      serverId: branch.serverId, branchId: params.id,
      before: JSON.stringify(beforeData),
      after: JSON.stringify(overrideData),
      meta: { branch: branch.name, overrideOnly: true },
      actorUserId: userId,
    });

    return apiSuccess({ toolId: params.toolId, branch: branch.name });
    } catch (error: any) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues);
    }
    logger.error({ err: error }, '[API PUT Branch Tool Error]');
    return apiServerError('Internal server error');
    }
  });

export const DELETE = withAuth(async (_, { params, userId }) => {
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
    if (branch.isDefault) {
      return apiError('Use DELETE /api/servers/[id]/tools/[toolId] to delete tools from main', 'VALIDATION_ERROR', 400);
    }

    const tool = await prisma.tool.findFirst({
      where: {
        id: params.toolId,
        server: { userId }
      }
    });
    if (!tool) {
      return apiNotFound('Tool not found');
    }

    await prisma.branchTool.upsert({
      where: { branchId_toolId: { branchId: params.id, toolId: params.toolId } },
      create: { branchId: params.id, toolId: params.toolId, action: 'deleted' },
      update: { action: 'deleted' },
    });

    await log({
      action: LOG_ACTIONS.TOOL_DELETED,
      entityType: 'tool', entityId: params.toolId, entityName: tool?.name ?? params.toolId,
      serverId: branch.serverId, branchId: params.id,
      meta: { branch: branch.name, softDeleteOnBranch: true },
      actorUserId: userId,
    });

    return apiSuccess({ deleted: true, fromBranchOnly: true });
    } catch (error) {
    logger.error({ err: error }, '[API DELETE Branch Tool Error]');
    return apiServerError('Internal server error');
    }
  });
