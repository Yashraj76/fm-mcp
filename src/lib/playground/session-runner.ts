import { prisma } from '../prisma';
import { safeParseJSON } from '../utils/safe-parse';
import { executeToolWithParams } from '../tools/executor-service';

type StepLog = { stepIndex: number; toolName: string; reason: string; status: 'running' | 'done' | 'error'; result?: any; error?: string; durationMs?: number };

async function updateSession(id: string, patch: any) {
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

export async function runPlaygroundSession(sessionId: string, plan: any, serverId?: string) {
  const steps = plan.steps ?? [];
  const results: Record<number, any> = {};

  try {
    for (const step of steps) {
      const logEntry: StepLog = { stepIndex: step.stepIndex, toolName: step.toolName, reason: step.reason, status: 'running' };
      await appendStep(sessionId, logEntry);
      const start = Date.now();

      // Resolve {{step_N.result.path}} references in params
      const resolvedParams = resolveParams(step.params, results);

      try {
        const tool = await prisma.tool.findFirst({
          where: serverId ? { serverId, name: step.toolName } : { name: step.toolName },
          include: { server: { include: { connections: { include: { connection: true } } } } }
        });

        if (!tool) throw new Error(`Tool "${step.toolName}" not found`);

        let result: any;
        const config = safeParseJSON(tool.handlerConfig, {});

        let validConnectionId = config.connectionId;
        let validConnection = tool.server?.connections?.find((c: any) => c.connectionId === validConnectionId)?.connection;
        if (!validConnection) {
          validConnection = tool.server?.connections?.[0]?.connection;
          validConnectionId = validConnection?.id;
        }

        result = await executeToolWithParams(tool, resolvedParams, validConnection);

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
      } catch (err: any) {
        await appendStep(sessionId, { ...logEntry, status: 'error', error: err.message, durationMs: Date.now() - start });
        // Continue to next step unless it dependsOn this one
      }
    }

    // Build final result
    const finalResult = buildFinalResult(plan, results);
    await updateSession(sessionId, { status: 'done', finalResult: JSON.stringify(finalResult) });

  } catch (err: any) {
    await updateSession(sessionId, { status: 'error', finalResult: JSON.stringify({ error: err.message }) });
  }
}

function resolveParams(params: any, results: Record<number, any>): any {
  if (typeof params !== 'object' || params === null) return params;
  const resolved: any = Array.isArray(params) ? [] : {};
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
          resolved[key] = Array.isArray(arr) ? arr.map((item: any) => getByPath(item, field)) : [];
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

function getByPath(obj: any, path: string): any {
  if (!path) return obj;
  return path.split('.').reduce((curr, key) => {
    if (curr === null || curr === undefined) return undefined;
    if (curr[key] !== undefined) return curr[key];
    // Case-insensitive fallback
    const foundKey = Object.keys(curr).find(k => k.toLowerCase() === key.toLowerCase());
    return foundKey ? curr[foundKey] : undefined;
  }, obj);
}

function buildFinalResult(plan: any, results: Record<number, any>) {
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
