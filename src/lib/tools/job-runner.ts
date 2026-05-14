import { prisma } from '../prisma';
import { callAI } from '../ai/client';
import { CREATE_TOOLS_PROMPT } from '../ai/prompts/create-tools';
import { seedDefaultTools } from './default-tools';

type LogEntry = { time: string; message: string; level: 'info' | 'error' | 'success' };

async function appendLog(jobId: string, message: string, level: LogEntry['level'] = 'info') {
  const job = await prisma.toolGenerationJob.findUnique({ where: { id: jobId } });
  const log: LogEntry[] = JSON.parse(job?.log ?? '[]');
  log.push({ time: new Date().toISOString(), message, level });
  await prisma.toolGenerationJob.update({
    where: { id: jobId },
    data: { log: JSON.stringify(log) },
  });
}

export async function runToolGenerationJob(jobId: string, serverId: string) {
  await prisma.toolGenerationJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date(), progress: 5 },
  });

  try {
    await appendLog(jobId, 'Loading server and connection data...');
    const server = await prisma.mcpServer.findUnique({
      where: { id: serverId },
      include: { connections: { include: { connection: { include: { browsedSchema: true } } } } },
    });
    if (!server) throw new Error('Server not found');

    const connServer = server.connections[0];
    if (!connServer || !connServer.connection) throw new Error('No connection linked to this server');
    
    const conn = connServer.connection;

    if (!conn.browsedSchema?.compiledSchema) {
      throw new Error('Connection has no compiled schema. Browse schema and save selections first.');
    }

    const compiledSchema = JSON.parse(conn.browsedSchema.compiledSchema);

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
    const aiText = await callAI({
      systemPrompt: CREATE_TOOLS_PROMPT,
      userMessage: JSON.stringify(inputPayload, null, 2),
      maxOutputTokens: 8000,
    });
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
      toolDefs = JSON.parse(clean);
      if (!Array.isArray(toolDefs)) throw new Error('Expected an array');
    } catch (parseErr: any) {
      console.error('[AI Parse Error] Raw output:', aiText.substring(0, 500));
      throw new Error(`Failed to parse AI output as JSON: ${parseErr.message}`);
    }

    await appendLog(jobId, `AI generated ${toolDefs.length} tools. Saving to database...`);
    await prisma.toolGenerationJob.update({ where: { id: jobId }, data: { progress: 80 } });

    // Save tools
    let saved = 0;
    
    // Default branch fetching logic
    const defaultBranch = await prisma.branch.findFirst({
        where: { serverId, isDefault: true }
    });
    
    if (!defaultBranch) {
        throw new Error('No default branch found for this server');
    }

    for (const toolDef of toolDefs) {
      try {
        const handlerConfig = typeof toolDef.handlerConfig === 'string' 
          ? JSON.parse(toolDef.handlerConfig) 
          : { ...toolDef.handlerConfig };
        
        // Ensure connectionId is present for orchestration
        if (!handlerConfig.connectionId) {
          handlerConfig.connectionId = conn.id;
        }

        // Check for uniqueness per server
        const exists = await prisma.tool.findFirst({
          where: { serverId, name: toolDef.name }
        });

        if (exists) {
          await appendLog(jobId, `Tool "${toolDef.name}" already exists. Skipping.`);
          continue;
        }

        await prisma.tool.create({
          data: {
            name: toolDef.name,
            description: toolDef.description,
            inputSchema: JSON.stringify(toolDef.inputSchema),
            handlerConfig: JSON.stringify(handlerConfig),
            isEnabled: toolDef.enabled ?? true,
            category: toolDef.category ?? 'generated',
            fmMethod: toolDef.fmMethod || mapStrategy(toolDef.strategy),
            serverId,
            branchId: defaultBranch.id,
            isAiGenerated: true
          },
        });
        saved++;
      } catch (e: any) {
        await appendLog(jobId, `Skipped tool "${toolDef.name}": ${e.message}`, 'error');
      }
    }

    await prisma.toolGenerationJob.update({
      where: { id: jobId },
      data: {
        status: 'done',
        progress: 100,
        toolsCreated: saved,
        completedAt: new Date(),
      },
    });
    await appendLog(jobId, `✓ Done. ${saved} tools created successfully.`, 'success');

  } catch (err: any) {
    await prisma.toolGenerationJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: err.message, completedAt: new Date() },
    });
    await appendLog(jobId, `✗ Failed: ${err.message}`, 'error');
  }
}

function mapStrategy(strategy: string): string {
  const map: Record<string, string> = {
    'fm-find': 'find', 'fm-create': 'create', 'fm-update': 'update',
    'fm-delete': 'delete', 'fm-list': 'list', 'fm-script': 'script',
    'sequential-multi-table': 'multi-step', 'odata-filter': 'odata',
    'odata-expand': 'odata', 'odata-batch': 'odata-batch',
    'system': 'system',
  };
  return map[strategy] ?? 'multi-step';
}
