import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai/client';
import { PLAYGROUND_ORCHESTRATOR_PROMPT } from '@/lib/ai/prompts/playground-orchestrator';
import { runPlaygroundSession } from '@/lib/playground/session-runner';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const { serverId, message } = await req.json();
  if (!message) return NextResponse.json({ success: false, error: 'message required' }, { status: 400 });

  // Load available tools for this server
  const tools = await prisma.tool.findMany({
    where: serverId ? { serverId, isEnabled: true } : { isEnabled: true },
    select: { name: true, description: true, inputSchema: true, category: true },
  });

  const toolList = tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: JSON.parse(t.inputSchema),
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
    plan = JSON.parse(clean);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'AI planning failed: ' + err.message }, { status: 500 });
  }

  // Create session
  const session = await prisma.playgroundSession.create({
    data: {
      serverId: serverId ?? null,
      userMessage: message,
      agentPlan: JSON.stringify(plan),
      stepLog: '[]',
      status: 'running',
    },
  });

  // Run async
  setImmediate(() => runPlaygroundSession(session.id, plan, serverId));

  return NextResponse.json({
    success: true,
    data: {
      sessionId: session.id,
      plan: { intent: plan.intent, stepCount: plan.steps?.length ?? 0, outputFormat: plan.outputFormat },
    },
  }, { status: 202 });
}
