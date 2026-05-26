import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto';
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response';

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

    const override = branchTool ? safeParseJSON(branchTool.overrideData, {}) : {};
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
    console.error('[API GET Branch Tool Detail Error]', error);
    return apiServerError('Internal server error');
    }
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

    const body = await req.json();
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
        ? safeParseJSON(body.handlerConfig, {}) 
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

    // Store override as JSON — doesn't mutate the base tool
    const overrideData = {
      ...(body.name && { name: body.name }),
      ...(body.description && { description: body.description }),
      ...(body.inputSchema && { inputSchema: typeof body.inputSchema === 'string' ? body.inputSchema : JSON.stringify(body.inputSchema) }),
      ...(body.handlerConfig && { handlerConfig: typeof body.handlerConfig === 'string' ? body.handlerConfig : JSON.stringify(body.handlerConfig) }),
      ...(body.isEnabled !== undefined ? { isEnabled: body.isEnabled } : (body.enabled !== undefined && { isEnabled: body.enabled })),
    };

    await prisma.branchTool.upsert({
      where: { branchId_toolId: { branchId: params.id, toolId: params.toolId } },
      create: {
        branchId: params.id,
        toolId: params.toolId,
        action: 'modified',
        overrideData: JSON.stringify(overrideData),
      },
      update: {
        action: 'modified',
        overrideData: JSON.stringify(overrideData),
      },
    });

    await log({
      action: LOG_ACTIONS.TOOL_UPDATED,
      entityType: 'tool', entityId: tool.id, entityName: tool.name,
      serverId: branch.serverId, branchId: params.id,
      before: JSON.stringify(beforeData),
      after: JSON.stringify(overrideData),
      meta: { branch: branch.name, overrideOnly: true },
    });

    return apiSuccess({ toolId: params.toolId, branch: branch.name });
    } catch (error) {
    console.error('[API PUT Branch Tool Error]', error);
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
      return apiError('Use DELETE /api/tools/[id] to delete tools from main', 'VALIDATION_ERROR', 400);
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
    });

    return apiSuccess({ deleted: true, fromBranchOnly: true });
    } catch (error) {
    console.error('[API DELETE Branch Tool Error]', error);
    return apiServerError('Internal server error');
    }
  });
