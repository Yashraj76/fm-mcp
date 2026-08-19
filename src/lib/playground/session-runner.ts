import { prisma } from '../prisma';
import { safeParseJSON } from '../utils/safe-parse';
import { executeToolWithParams } from '../tools/executor-service';
import { FMConnectionServer, FMConnection } from '@prisma/client';
import { resolveToolConnection } from '../filemaker/resolve-connection';
import { getEffectiveTools } from '../branching';
import { callAI as _callAI } from '../ai/client';
import { PLAYGROUND_SUMMARIZER_PROMPT } from '../ai/prompts/playground-summarizer';
import { logger } from '../logger';

/** Injectable dependencies — override in tests to avoid live AI calls. */
export interface SessionRunnerDeps {
  callAI?: typeof _callAI;
}

type StepLog = { stepIndex: number; toolName: string; reason: string; status: 'running' | 'done' | 'error'; result?: unknown; error?: string; durationMs?: number };

type PlanStep = {
  stepIndex: number;
  toolName: string;
  reason: string;
  params: Record<string, unknown>;
  extractFromResult?: { fieldPath: string; bindAs: string };
};

type Plan = {
  intent: string;
  outputFormat?: string;
  tableConfig?: unknown;
  steps: PlanStep[];
};

async function updateSession(id: string, patch: Partial<{ status: string; finalResult: string }>) {
  await prisma.playgroundSession.update({ where: { id }, data: { ...patch, updatedAt: new Date() } });
}

async function appendStep(id: string, entry: StepLog) {
  const s = await prisma.playgroundSession.findUnique({ where: { id } });
  const log: StepLog[] = safeParseJSON(s?.stepLog, []);
  const existing = log.findIndex(e => e.stepIndex === entry.stepIndex);
  if (existing >= 0) log[existing] = entry;
  else log.push(entry);
  await prisma.playgroundSession.update({ where: { id }, data: { stepLog: JSON.stringify(log) } });
}

/**
 * Resolve the effective tool for a plan step.
 *
 * When a branchId is provided the tool is looked up via getEffectiveTools so
 * that branch-level overrides (fmMethod, handlerConfig, etc.) are applied.
 * Without a branchId the raw Tool row is used directly.
 *
 * Exported for unit testing.
 */
export async function resolveToolForStep(
  toolName: string,
  serverId: string | undefined,
  branchId: string | undefined
): Promise<any | null> {
  if (branchId) {
    const effectiveTools = await getEffectiveTools(branchId);
    return (
      effectiveTools.find(
        (t: any) => t.name === toolName && (!serverId || t.serverId === serverId)
      ) ?? null
    );
  }
  return prisma.tool.findFirst({
    where: serverId ? { serverId, name: toolName, deletedAt: null } : { name: toolName, deletedAt: null },
    include: { server: { include: { connections: { include: { connection: true } } } } },
  });
}

export async function runPlaygroundSession(
  sessionId: string,
  plan: Plan,
  serverId?: string,
  branchId?: string,
  userId?: string,
  deps: SessionRunnerDeps = {},
) {
  const callAI = deps.callAI ?? _callAI;
  const steps = plan.steps ?? [];
  const results: Record<number, unknown> = {};

  try {
    for (const step of steps) {
      const logEntry: StepLog = { stepIndex: step.stepIndex, toolName: step.toolName, reason: step.reason, status: 'running' };
      await appendStep(sessionId, logEntry);
      const start = Date.now();

      // Resolve {{step_N.result.path}} references in params
      const resolvedParams = resolveParams(step.params, results);

      try {
        const tool = await resolveToolForStep(step.toolName, serverId, branchId);

        if (!tool) throw new Error(`Tool "${step.toolName}" not found`);

        const config = safeParseJSON<{ connectionId?: string }>(tool.handlerConfig, {});
        const toolServerConnections = tool.server?.connections as (FMConnectionServer & { connection: FMConnection })[];
        const validConnection = resolveToolConnection(
          config.connectionId,
          toolServerConnections ?? [],
          step.toolName
        );

        const result = await executeToolWithParams(tool, resolvedParams, validConnection) as Record<string, unknown>;

        results[step.stepIndex] = result;

        // Process extractFromResult if defined
        if (step.extractFromResult) {
          const { fieldPath, bindAs } = step.extractFromResult;
          const extractedValue = getByPath(result, fieldPath);
          if (extractedValue !== undefined) {
            result[bindAs] = extractedValue;
          }
        }

        await appendStep(sessionId, { ...logEntry, status: 'done', result, durationMs: Date.now() - start });
      } catch (err: unknown) {
        await appendStep(sessionId, { ...logEntry, status: 'error', error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start });
        // Continue to next step unless it dependsOn this one
      }
    }

    // Build final result
    const finalResult = buildFinalResult(plan, results) as Record<string, unknown>;

    // Synthesize a human-readable answer from the raw tool results. This is
    // a nice-to-have on top of the data the platform already has — a failure
    // here (no API key, network error, etc.) must never fail the session;
    // the raw results remain fully available as a fallback.
    try {
      const answerText = await callAI({
        systemPrompt: PLAYGROUND_SUMMARIZER_PROMPT,
        userMessage: `Original request: ${plan.intent ?? '(no intent provided)'}\n\nTool results:\n${JSON.stringify(results, null, 2)}`,
        maxOutputTokens: 800,
        userId,
      });
      finalResult.answerText = answerText.trim();
    } catch (err: unknown) {
      logger.warn({ err, sessionId }, '[Playground] Answer synthesis failed — falling back to raw results');
    }

    await updateSession(sessionId, { status: 'done', finalResult: JSON.stringify(finalResult) });

  } catch (err: unknown) {
    await updateSession(sessionId, { status: 'error', finalResult: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) });
  }
}

function resolveParams(params: unknown, results: Record<number, unknown>): Record<string, unknown> {
  if (typeof params !== 'object' || params === null) return params as Record<string, unknown>;
  const resolved: Record<string, unknown> = Array.isArray(params) ? ([] as unknown as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      const path = value.slice(2, -2).trim();
      const stepMatch = path.match(/^step_(\d+)\.(.+)$/);
      if (stepMatch) {
        const stepIdx = parseInt(stepMatch[1]);
        let fieldPath = stepMatch[2];
        
        // Strip "result." prefix if AI included it
        if (fieldPath.startsWith('result.')) {
          fieldPath = fieldPath.slice(7);
        }

        const stepResult = results[stepIdx];
        if (!stepResult) {
          resolved[key] = value;
          continue;
        }

        if (fieldPath.includes('[*]')) {
          const [arrayPath, field] = fieldPath.split('[*].');
          const arr = getByPath(stepResult, arrayPath);
          resolved[key] = Array.isArray(arr) ? arr.map((item: unknown) => getByPath(item, field)) : [];
        } else {
          resolved[key] = getByPath(stepResult, fieldPath);
        }
      } else {
        resolved[key] = value;
      }
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== 'object' || obj === null) return obj;
  return path.split('.').reduce((curr: any, key) => {
    if (curr === null || curr === undefined) return undefined;
    if (curr[key] !== undefined) return curr[key];
    // Case-insensitive fallback
    const foundKey = Object.keys(curr).find(k => k.toLowerCase() === key.toLowerCase());
    return foundKey ? curr[foundKey] : undefined;
  }, obj);
}

function buildFinalResult(plan: Plan, results: Record<number, unknown>) {
  const keys = Object.keys(results).map(Number);
  if (keys.length === 0) {
      return {
          intent: plan.intent,
          outputFormat: plan.outputFormat ?? 'json',
          tableConfig: plan.tableConfig ?? null,
          primaryData: null,
          summaryData: null,
          allResults: results,
      };
  }
  
  const lastStepIdx = Math.max(...keys);
  return {
    intent: plan.intent,
    outputFormat: plan.outputFormat ?? 'json',
    tableConfig: plan.tableConfig ?? null,
    primaryData: results[lastStepIdx - (plan.tableConfig ? 1 : 0)] ?? null, // main data
    summaryData: plan.tableConfig ? results[lastStepIdx] : null,
    allResults: results,
  };
}
