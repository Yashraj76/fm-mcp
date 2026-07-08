import { z, ZodError } from 'zod';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai/client';
import { PLAYGROUND_ORCHESTRATOR_PROMPT } from '@/lib/ai/prompts/playground-orchestrator';
import { runPlaygroundSession } from '@/lib/playground/session-runner';
import { getEffectiveTools } from '@/lib/branching';
import { withAuth } from "@/lib/auth/api-guard";
import { apiSuccess, apiNotFound, apiServerError, apiError, apiValidationFailed } from '@/lib/utils/api-response';
import { safeParseJSON } from '@/lib/utils/safe-parse';

const runSchema = z.object({
  serverId: z.string().optional(),
  branchId: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
});

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = withAuth(async (req, { userId }) => {
  try {
    const bodyObj = await req.json().catch(() => ({}));
    const { serverId, branchId, message } = runSchema.parse(bodyObj);

    // Validate branch ownership and infer serverId if not provided
    let resolvedServerId = serverId;
    if (branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: branchId, server: { userId } },
      });
      if (!branch) return apiNotFound('Branch not found');
      if (resolvedServerId && resolvedServerId !== branch.serverId) {
        return apiError('Branch does not belong to the specified server', 'VALIDATION_ERROR', 400);
      }
      resolvedServerId = branch.serverId;
    } else if (resolvedServerId) {
      const server = await prisma.mcpServer.findFirst({ where: { id: resolvedServerId, userId } });
      if (!server) return apiNotFound('Server not found');
    }

    // Load available tools — use branch-effective set when branchId provided
    let toolList: Array<{ name: string; description: string; inputSchema: Record<string, any>; category: string | null }>;
    if (branchId) {
      const effectiveTools = await getEffectiveTools(branchId);
      toolList = effectiveTools
        .filter((t: any) => t.isEnabled)
        .map((t: any) => ({
          name: t.name as string,
          description: t.description as string,
          inputSchema: safeParseJSON<Record<string, any>>(
            typeof t.inputSchema === 'string' ? t.inputSchema : JSON.stringify(t.inputSchema ?? {}),
            {}
          ),
          category: t.category as string | null,
        }));
    } else {
      const tools = await prisma.tool.findMany({
        where: {
          server: { userId },
          isEnabled: true,
          deletedAt: null,
          ...(resolvedServerId ? { serverId: resolvedServerId } : {}),
        },
        select: { name: true, description: true, inputSchema: true, category: true },
      });
      toolList = tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: safeParseJSON<Record<string, any>>(t.inputSchema, {}),
        category: t.category,
      }));
    }

    // Ask AI to produce execution plan
    let plan: any;
    try {
      const aiText = await callAI({
        systemPrompt: PLAYGROUND_ORCHESTRATOR_PROMPT,
        userMessage: `Available tools:\n${JSON.stringify(toolList, null, 2)}\n\nUser request: ${message}`,
        maxOutputTokens: 3000,
        userId,
      });
      const clean = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      plan = safeParseJSON<any>(clean, null);
      if (!plan || typeof plan !== 'object') {
        // Fallback matching brace check
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) plan = safeParseJSON<any>(match[0], null);
      }
      if (!plan || typeof plan !== 'object') {
        logger.error({ output: aiText.substring(0, 500) }, '[AI Parse Error]')
        return apiError('AI plan parsing failed: invalid plan object shape', 'AI_PARSE_ERROR', 500);
      }
    } catch (err: any) {
      return apiServerError('AI planning failed: ' + err.message);
    }

// Create session — store branchId so the branch context survives process restarts
const session = await prisma.playgroundSession.create({
  data: {
    userId,
    serverId: resolvedServerId ?? null,
    branchId: branchId ?? null,
    userMessage: message,
    agentPlan: JSON.stringify(plan),
    stepLog: '[]',
    status: 'running',
  },
});

// Run async — pass branchId so the runner uses effective tool versions
setImmediate(() => runPlaygroundSession(session.id, plan, resolvedServerId, branchId));

return apiSuccess({
  sessionId: session.id,
  plan: { intent: plan.intent, stepCount: plan.steps?.length ?? 0, outputFormat: plan.outputFormat, tableConfig: plan.tableConfig },
}, 202);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues);
    }
    return apiServerError(error.message);
  }
});
