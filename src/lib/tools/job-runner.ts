import { prisma } from '../prisma';
import { callAI as _callAI } from '../ai/client';
import { CREATE_TOOLS_PROMPT } from '../ai/prompts/create-tools';
import { seedDefaultTools } from './default-tools';
import { safeParseJSON } from '../utils/safe-parse';
import { sanitizeText } from '../utils/sanitizer';
import { logger } from '../logger';

/** Injectable dependencies — override in tests to avoid live AI calls. */
export interface JobRunnerDeps {
  callAI?: typeof _callAI
}

type LogEntry = { time: string; message: string; level: 'info' | 'error' | 'success' };

async function appendLog(jobId: string, message: string, level: LogEntry['level'] = 'info') {
  const job = await prisma.toolGenerationJob.findUnique({ where: { id: jobId } });
  const log: LogEntry[] = safeParseJSON(job?.log, []);
  log.push({ time: new Date().toISOString(), message, level });
  await prisma.toolGenerationJob.update({
    where: { id: jobId },
    data: { log: JSON.stringify(log) },
  });
}

export async function runToolGenerationJob(
  jobId: string,
  serverId: string,
  userId: string,
  connectionId: string,
  deps: JobRunnerDeps = {}
) {
  const callAI = deps.callAI ?? _callAI;
  await prisma.toolGenerationJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date(), progress: 5 },
  });

  try {
    await appendLog(jobId, 'Loading server and connection data...');
    const server = await prisma.mcpServer.findFirst({
      where: { id: serverId, userId },
      include: { connections: { include: { connection: { include: { browsedSchema: true } } } } },
    });
    if (!server) throw new Error('Server not found or unauthorized');

    const connServer = server.connections.find((c: any) => c.connectionId === connectionId);
    if (!connServer?.connection) {
      throw new Error(`Connection "${connectionId}" is not linked to this server or was removed.`);
    }

    const conn = connServer.connection;

    if (!conn.browsedSchema?.compiledSchema) {
      throw new Error('Connection has no compiled schema. Browse schema and save selections first.');
    }

    const compiledSchema = safeParseJSON<Record<string, any>>(conn.browsedSchema.compiledSchema, {});

    // Pre-flight: schema must have at least one layout or table selected
    const schemaLayouts: any[] = Array.isArray(compiledSchema.layouts) ? compiledSchema.layouts : [];
    const schemaTables: any[] = Array.isArray(compiledSchema.tables) ? compiledSchema.tables : [];
    if (schemaLayouts.length === 0 && schemaTables.length === 0) {
      throw new Error(
        'No layouts selected in schema. Open Schema Browser for this connection, select at least one layout, then try again.'
      );
    }
    await appendLog(jobId, `Schema ready: ${schemaLayouts.length} layout(s), ${schemaTables.length} table(s).`);

    // Seed default system tools first
    await appendLog(jobId, 'Creating default system tools (add, subtract, average, percentage)...');
    await seedDefaultTools(serverId);
    await prisma.toolGenerationJob.update({ where: { id: jobId }, data: { progress: 20 } });

    // Build AI input
    await appendLog(jobId, 'Preparing schema payload for AI...');
    const inputPayload = {
      serverName: server.name,
      serverDescription: server.description ?? '',
      connectionId: conn.id,
      compiledSchema,
    };
    await prisma.toolGenerationJob.update({ where: { id: jobId }, data: { progress: 35 } });

    // Call AI
    await appendLog(jobId, 'Calling AI to generate tools (this may take 15-30 seconds)...');
    let aiText: string;
    try {
      aiText = await callAI({
        systemPrompt: CREATE_TOOLS_PROMPT,
        userMessage: JSON.stringify(inputPayload, null, 2),
        maxOutputTokens: 8000,
        userId,
      });
    } catch (aiErr: any) {
      const msg: string = aiErr.message ?? '';
      if (msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('not configured')) {
        throw new Error('AI provider not configured. Go to Settings → AI to add your API key, then try again.');
      }
      throw new Error(`AI generation failed: ${msg}`);
    }
    await prisma.toolGenerationJob.update({ where: { id: jobId }, data: { progress: 70 } });

    // Parse
    await appendLog(jobId, 'Parsing AI response...');
    
    let clean = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Find the first [ and last ] to extract only the array
    const startBracket = clean.indexOf('[');
    const endBracket = clean.lastIndexOf(']');
    
    if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
      clean = clean.substring(startBracket, endBracket + 1);
    }

    let toolDefs: any[];
    try {
      toolDefs = safeParseJSON(clean);
      if (!Array.isArray(toolDefs)) throw new Error('Expected an array');
    } catch (parseErr: any) {
      logger.error({ output: sanitizeText(aiText.substring(0, 500)) }, '[AI Parse Error]')
      throw new Error(`Failed to parse AI output as JSON: ${parseErr.message}`);
    }

    await appendLog(jobId, `AI generated ${toolDefs.length} tools. Saving to database...`);
    await prisma.toolGenerationJob.update({ where: { id: jobId }, data: { progress: 80 } });

    // We now just save the toolDefs to the job record so the UI can preview them
    await appendLog(jobId, `AI generated ${toolDefs.length} tools. Waiting for user selection...`);
    
    await prisma.toolGenerationJob.update({
      where: { id: jobId },
      data: {
        status: 'done',
        progress: 100,
        generatedTools: JSON.stringify(toolDefs),
        completedAt: new Date(),
      },
    });
    await appendLog(jobId, `✓ Done. ${toolDefs.length} tools ready for preview.`, 'success');

  } catch (err: any) {
    await prisma.toolGenerationJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: err.message, completedAt: new Date() },
    });
    await appendLog(jobId, `✗ Failed: ${err.message}`, 'error');
  }
}

/**
 * A job is stale if it has been in 'running' state longer than `thresholdMs`.
 * This happens when a Vercel function timed out after the runner was started
 * but before it could mark itself 'done' or 'failed'.
 */
export const JOB_STALE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes

export function isJobStale(
  job: { status: string; startedAt: Date | null },
  thresholdMs = JOB_STALE_THRESHOLD_MS
): boolean {
  if (job.status !== 'running' || !job.startedAt) return false
  return Date.now() - job.startedAt.getTime() > thresholdMs
}

export function mapStrategy(strategy: string): string {
  const map: Record<string, string> = {
    'fm-find': 'find', 'fm-create': 'create', 'fm-update': 'update',
    'fm-delete': 'delete', 'fm-list': 'list', 'fm-script': 'script',
    'sequential-multi-table': 'multi-step', 'odata-filter': 'odata',
    'odata-expand': 'odata', 'odata-batch': 'odata-batch',
    'system': 'system',
  };
  return map[strategy] ?? 'multi-step';
}
