import { prisma } from '@/lib/prisma';
import { normalizeTool } from '@/lib/tools/normalize-tool';
import { validateToolForSave } from '@/lib/tools/validate-tool';
import { createToolWithBranch } from '@/lib/tools/create-tool-with-branch';
import { resolveSaveConnectionId } from '@/lib/tools/resolve-save-connection';
import { withAuth } from "@/lib/auth/api-guard";
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { z, ZodError } from 'zod';
import { logger } from '@/lib/logger'

const saveToolsSchema = z.object({
  tools: z.array(z.any()),
  branchId: z.string().optional(),
});

export const runtime = 'nodejs';
export const POST = withAuth(async (req, { params, userId }) => {
  try {
    const { id } = await params;
    const bodyObj = await req.json().catch(() => ({}));
    const { tools, branchId } = saveToolsSchema.parse(bodyObj);

    if (!Array.isArray(tools) || tools.length === 0) {
      return apiError('No tools provided to save', 'VALIDATION_ERROR', 400);
    }

    const server = await prisma.mcpServer.findFirst({
      where: { id, userId },
      include: { connections: true }
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

    let saved = 0;
    let skipped = 0;
    let failed = 0;
    const failedNames: string[] = [];

    for (const rawDef of tools) {
      try {
        // Resolve which connection this tool should use
        const rawHc = typeof rawDef.handlerConfig === 'string'
          ? safeParseJSON<Record<string, any>>(rawDef.handlerConfig, {})
          : { ...(rawDef.handlerConfig ?? {}) };

        const resolvedConnId = resolveSaveConnectionId(
          rawDef.name ?? 'unknown',
          rawHc.connectionId ?? null,
          server.connections as any,
        );

        rawHc.connectionId = resolvedConnId;
        const prepped = { ...rawDef, isAiGenerated: true, handlerConfig: rawHc };

        // Normalize — fills missing fmMethod, category, inputSchema, handlerConfig fields
        const toolDef = normalizeTool(prepped);

        // Validate semantic correctness before saving
        const validationErrors = validateToolForSave(toolDef);
        if (validationErrors.length > 0) {
          throw new Error(
            `Tool "${toolDef.name}" failed validation: ${validationErrors.map((e) => e.message).join('; ')}`
          );
        }

        // Ensure connectionId survived normalization
        const hc = safeParseJSON<Record<string, unknown>>(toolDef.handlerConfig, {});
        if (!hc.connectionId) {
          hc.connectionId = resolvedConnId;
          toolDef.handlerConfig = JSON.stringify(hc);
        }

        // Idempotency: skip if tool name already exists on this server
        const exists = await prisma.tool.findFirst({
          where: { serverId: id, name: toolDef.name, deletedAt: null },
        });
        if (exists) { skipped++; continue; }

        await createToolWithBranch(
          prisma,
          {
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
          targetBranchId,
        );
        saved++;
      } catch (e: any) {
        failed++;
        failedNames.push(rawDef.name ?? 'unknown');
        logger.error({ errMsg: e.message }, `Failed tool "${rawDef.name}":`);
      }
    }

    return apiSuccess({ saved, skipped, failed, failedNames });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues);
    }
    logger.error({ err: error }, 'Error saving tools:');
    return apiServerError(error.message);
  }
});
