import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { mapStrategy } from '@/lib/tools/job-runner';
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

    const server = await prisma.mcpServer.findUnique({
      where: {
          userId: userId,
        id },
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

    for (const toolDef of tools) {
      try {
        const handlerConfig = typeof toolDef.handlerConfig === 'string' 
          ? safeParseJSON(toolDef.handlerConfig, {}) 
          : { ...toolDef.handlerConfig };
        
        // Ensure connectionId is present for orchestration
        if (!handlerConfig.connectionId && connId) {
          handlerConfig.connectionId = connId;
        }

        // Check for uniqueness per server
        const exists = await prisma.tool.findFirst({
          where: {
            serverId: id, name: toolDef.name }
        });

        if (exists) {
          continue;
        }

        const createdTool = await prisma.tool.create({
          data: {
            name: toolDef.name,
            description: toolDef.description,
            inputSchema: JSON.stringify(toolDef.inputSchema),
            handlerConfig: JSON.stringify(handlerConfig),
            isEnabled: toolDef.enabled ?? true,
            category: toolDef.category ?? 'generated',
            fmMethod: toolDef.fmMethod || mapStrategy(toolDef.executionStrategy),
            serverId: id,
            isAiGenerated: true
          },
        });
        
        await prisma.branchTool.create({
          data: {
            branchId: targetBranchId,
            toolId: createdTool.id,
            action: 'added',
            overrideData: '{}'
          }
        });
        saved++;
      } catch (e: any) {
        console.error(`Skipped tool "${toolDef.name}":`, e.message);
      }
    }

    return apiSuccess({ saved });
    } catch (error: any) {
    console.error('Error saving tools:', error);
    return apiServerError(error.message);
    }
    });
