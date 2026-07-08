import { prisma } from '../prisma';
import { withFMSession } from './session';
import { FileMakerError } from './client';
import { logger } from '../logger';

export interface MultiStepConfig {
  steps: {
    stepIndex: number;
    layout: string;
    extractField?: string;
    useExtractedAs?: string;
    fieldMappings?: Record<string, string>;
    limit?: number;
    [key: string]: any;
  }[];
  connectionId: string;
}

export async function executeMultiStepTool(steps: MultiStepConfig['steps'], connectionId: string, params: Record<string, unknown>, userId?: string) {
  let connId = connectionId;

  // Fallback: if connectionId is missing, try to find it from the server
  if (!connId && steps.length > 0) {
     // This is a bit tricky without serverId, but usually connectionId is passed.
     // If not, we'll throw a better error later.
  }

  if (!connId) throw new Error('Connection ID missing in multi-step tool config');

  const connection = await prisma.fMConnection.findFirst({
    where: userId ? { id: connId, userId } : { id: connId }
  });
  if (!connection) throw new Error('Connection not found');

  return withFMSession(connection, async (client) => {
    const results: Record<number, any> = {};
    const context: Record<string, any> = { ...params };

    for (const step of steps) {
      // Build query for this step
      const query: Record<string, string | number> = {};
      
      if (step.fieldMappings) {
        for (const [paramKey, fmField] of Object.entries(step.fieldMappings)) {
          // Check context (passed params or extracted from previous steps)
          if (context[paramKey] !== undefined) {
            query[fmField as string] = context[paramKey] as string | number;
          }
        }
      }

      // Execute find
      try {
        // Execute find only if we have criteria
        if (Object.keys(query).length === 0) {
           logger.warn({ stepIndex: step.stepIndex }, 'multi-executor: step has empty query criteria, skipping')
           results[step.stepIndex] = [];
           continue; // Skip the find
        }

        const res = await client.find(step.layout, [query], step.limit || 50);
        const data = res.response.data ?? [];
        results[step.stepIndex] = data;

        // Extract field for next steps if needed
        if (step.extractField && step.useExtractedAs && data.length > 0) {
          context[step.useExtractedAs] = data[0].fieldData[step.extractField];
        }

        // If no records found and it's a critical path, we might want to stop
        if (data.length === 0 && steps.indexOf(step) < steps.length - 1 && step.extractField) {
          logger.warn({ stepIndex: step.stepIndex }, 'multi-executor: step returned no records, returning early')
          break;
        }
      } catch (err: unknown) {
        // FM Data API code 401 = "No records match" — safe to treat as empty result
        // for intermediate steps. client.ts already handles this gracefully so this
        // branch is a safety net, but we must NOT catch HTTP 401 (auth failure) here.
        if (err instanceof FileMakerError && err.isNoRecordsFound) {
          results[step.stepIndex] = [];
        } else {
          throw err;
        }
      }
    }

    // Return the last step's result as the main data
    const lastStep = steps[steps.length - 1];
    return {
      status: 'success',
      data: (results[lastStep.stepIndex] as any[])?.map((r: any) => ({
        recordId: r.recordId,
        ...r.fieldData
      })) || [],
      stepResults: results
    };
  });
}
