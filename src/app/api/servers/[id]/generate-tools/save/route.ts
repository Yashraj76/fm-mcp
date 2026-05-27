import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { mapStrategy } from '@/lib/tools/job-runner';
import { normalizeTool } from '@/lib/tools/normalize-tool';
import { withAuth } from "@/lib/auth/api-guard";
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export const runtime = 'nodejs';
export const POST = withAuth(async (req, { params, userId }) => {
    try {
    const { id } = await params;
    const { tools, branchId } = await req.json();

    if (!Array.isArray(tools) || tools.length === 0) {
      return apiError('No tools provided to save', 'VALIDATION_ERROR', 400);
    }

    const server = await prisma.mcpServer.findFirst({
      where: { id, userId },
      include: { connections: { take: 1 } }
    });

    if (!server) {
      return apiNotFound('Server not found');
    }

    const defaultBranch = await prisma.branch.findFirst({
      where: {
        serverId: id, isDefault: true }
    });

    if (!defaultBranch) {
      return apiError('No default branch found for this server', 'VALIDATION_ERROR', 400);
    }

    if (branchId) {
      const branchExists = await prisma.branch.findFirst({
        where: { id: branchId, serverId: id }
      });
      if (!branchExists) {
        return apiNotFound('Branch not found for this server');
      }
    }

    const targetBranchId = branchId || defaultBranch.id;
    const connId = server.connections[0]?.connectionId;

    let saved = 0;

    for (const rawDef of tools) {
      try {
        // Ensure connectionId is available for normalization
        const prepped = { ...rawDef, isAiGenerated: true };
        if (!prepped.handlerConfig?.connectionId && connId) {
          const hc = typeof prepped.handlerConfig === 'string'
            ? safeParseJSON(prepped.handlerConfig, {})
            : { ...(prepped.handlerConfig ?? {}) };
          hc.connectionId = connId;
          prepped.handlerConfig = hc;
        }

        // Normalize — fills missing fmMethod, category, inputSchema, handlerConfig fields
        const toolDef = normalizeTool(prepped);

        // Inject connectionId into handlerConfig if still missing after normalization
        const hc = safeParseJSON(toolDef.handlerConfig, {});
        if (!hc.connectionId && connId) {
          hc.connectionId = connId;
          toolDef.handlerConfig = JSON.stringify(hc);
        }

        // Idempotency: skip if tool name already exists on this server
        const exists = await prisma.tool.findFirst({
          where: { serverId: id, name: toolDef.name },
        });
        if (exists) continue;

        const createdTool = await prisma.tool.create({
          data: {
            name: toolDef.name,
            description: toolDef.description,
            inputSchema: toolDef.inputSchema,
            outputSchema: toolDef.outputSchema,
            handlerConfig: toolDef.handlerConfig,
            isEnabled: toolDef.isEnabled,
            category: toolDef.category,
            fmMethod: toolDef.fmMethod,
            fmLayout: toolDef.fmLayout,
            fmScript: toolDef.fmScript,
            serverId: id,
            isAiGenerated: true,
          },
        });

        await prisma.branchTool.create({
          data: {
            branchId: targetBranchId,
            toolId: createdTool.id,
            action: 'added',
            overrideData: '{}',
          },
        });
        saved++;
      } catch (e: any) {
        console.error(`Skipped tool "${rawDef.name}":`, e.message);
      }
    }

    return apiSuccess({ saved });
    } catch (error: any) {
    console.error('Error saving tools:', error);
    return apiServerError(error.message);
    }
    });
