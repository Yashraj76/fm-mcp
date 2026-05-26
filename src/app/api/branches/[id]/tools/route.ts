import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto';
import { apiSuccess, apiNotFound, apiServerError, apiError } from '@/lib/utils/api-response';

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
        action: { not: 'deleted' }
      },
      include: { tool: true },
      orderBy: { createdAt: 'asc' },
    });

    // Merge override data into tool records and convert to safe DTO
    const tools = branchTools.map(bt => {
      const base = bt.tool;
      const override = safeParseJSON(bt.overrideData, {});
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
    console.error('[API GET Branch Tools Error]', error);
    return apiServerError('Internal server error');
    }
  });

export const POST = withAuth(async (req, { params, userId }) => {
    try {
    const branch = await prisma.branch.findFirst({
      where: {
        id: params.id,
        server: { userId }
      }
    });
    if (!branch) return apiNotFound('Branch not found');

    const body = await req.json();

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

    // Create the base tool record (linked to server, not branch directly)
    const tool = await prisma.tool.create({
      data: {
        name: body.name,
        description: body.description,
        inputSchema: typeof body.inputSchema === 'string' ? body.inputSchema : JSON.stringify(body.inputSchema),
        fmMethod: body.handlerType || body.fmMethod || 'custom',
        handlerConfig: typeof body.handlerConfig === 'string' ? body.handlerConfig : JSON.stringify(body.handlerConfig),
        isEnabled: body.enabled ?? body.isEnabled ?? true,
        category: body.category ?? 'custom',
        isAiGenerated: body.isAiGenerated || false,
        serverId: branch.serverId,
      },
    });

    // Add to this branch as "added"
    await prisma.branchTool.create({
      data: {
        branchId: params.id,
        toolId: tool.id,
        action: 'added'
      },
    });

    await log({
      action: LOG_ACTIONS.TOOL_CREATED,
      entityType: 'tool', entityId: tool.id, entityName: tool.name,
      serverId: branch.serverId, branchId: params.id,
      after: JSON.stringify({ name: tool.name, fmMethod: tool.fmMethod }),
      meta: { branch: branch.name, addedOnBranch: true },
    });

    return apiSuccess(toSafeTool(tool), 201);
    } catch (error) {
    console.error('[API POST Branch Tools Error]', error);
    return apiServerError('Internal server error');
    }
  });
