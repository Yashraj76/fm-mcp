import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai/client';
import { PLAYGROUND_ORCHESTRATOR_PROMPT } from '@/lib/ai/prompts/playground-orchestrator';
import { runPlaygroundSession } from '@/lib/playground/session-runner';
import { withAuth } from "@/lib/auth/api-guard";
import { apiSuccess, apiNotFound, apiServerError, apiError } from '@/lib/utils/api-response';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = withAuth(async (req, { params, userId }) => {
    try {
    const { serverId, message } = await req.json();
    if (!message) return apiError('message required', 'VALIDATION_ERROR', 400);

    if (serverId) {
      const server = await prisma.mcpServer.findFirst({
        where: { id: serverId, userId }
      });
      if (!server) {
        return apiNotFound('Server not found');
      }
    }

    // Load available tools for this server, scoped strictly to the logged-in user
    const tools = await prisma.tool.findMany({
      where: {
        server: { userId },
        isEnabled: true,
        ...(serverId ? { serverId } : {})
      },
      select: { name: true, description: true, inputSchema: true, category: true },
    });

    const toolList = tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: safeParseJSON(t.inputSchema, {}),
      category: t.category,
    }));

    // Ask AI to produce execution plan
    let plan: any;
    try {
      const aiText = await callAI({
        systemPrompt: PLAYGROUND_ORCHESTRATOR_PROMPT,
        userMessage: `Available tools:\n${JSON.stringify(toolList, null, 2)}\n\nUser request: ${message}`,
        maxOutputTokens: 3000,
      });
      const clean = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      plan = safeParseJSON(clean, null);
      if (!plan || typeof plan !== 'object') {
        // Fallback matching brace check
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) plan = safeParseJSON(match[0], null);
      }
      if (!plan || typeof plan !== 'object') {
        console.error('[AI Parse Error] Raw output:', aiText.substring(0, 500));
        return apiError('AI plan parsing failed: invalid plan object shape', 'AI_PARSE_ERROR', 500);
      }
    } catch (err: any) {
      return apiServerError('AI planning failed: ' + err.message);
    }

// Create session
const session = await prisma.playgroundSession.create({
data: {
    userId: userId,
    serverId: serverId ?? null,
  userMessage: message,
  agentPlan: JSON.stringify(plan),
  stepLog: '[]',
  status: 'running',
},
});

// Run async
setImmediate(() => runPlaygroundSession(session.id, plan, serverId));

return apiSuccess({
  sessionId: session.id,
  plan: { intent: plan.intent, stepCount: plan.steps?.length ?? 0, outputFormat: plan.outputFormat, tableConfig: plan.tableConfig },
}, 202);
    } catch (error: any) {
    return apiServerError(error.message);
    }
});
