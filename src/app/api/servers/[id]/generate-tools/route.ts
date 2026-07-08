import { apiSuccess, apiNotFound, apiServerError, apiError } from '@/lib/utils/api-response';
import { prisma } from '@/lib/prisma';
import { runToolGenerationJob, isJobStale } from '@/lib/tools/job-runner';
import { resolveGenerationConnection } from '@/lib/tools/resolve-generation-connection';
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { logger } from '@/lib/logger'

export const runtime = 'nodejs';
// Allow up to 5 minutes — the AI call alone takes 15–30 s; seeding + parsing adds more.
export const maxDuration = 300;

export const POST = withAuth(async (req, { params, userId }) => {
  try {
    const { id } = await params;

    const bodyObj = await req.json().catch(() => ({}));
    const { connectionId: requestedConnectionId } = bodyObj as { connectionId?: string };

    const server = await prisma.mcpServer.findFirst({
      where: { id, userId },
      include: {
        connections: {
          include: { connection: { select: { id: true, name: true, database: true } } },
        },
      },
    });
    if (!server) return apiNotFound('Server not found');

    // Resolve which connection to use — enforces single-select for multi-connection servers.
    const connResult = resolveGenerationConnection(requestedConnectionId, server.connections as any);
    if (!connResult.ok) {
      if (connResult.reason === 'no-connections') {
        return apiError(
          'No connections are linked to this server. Go to Connections and attach a FileMaker database first.',
          'NO_CONNECTIONS',
          400
        );
      }
      if (connResult.reason === 'connection-required') {
        return apiError(
          'This server has multiple connections. Select which one to generate tools from.',
          'CONNECTION_REQUIRED',
          400,
          { connections: connResult.connections }
        );
      }
      // invalid-connection
      return apiError(
        'The selected connection is not linked to this server.',
        'INVALID_CONNECTION',
        400
      );
    }
    const resolvedConnectionId = connResult.connectionId;

    // Block duplicate jobs — if a non-stale pending/running job exists, reject.
    const activeJob = await prisma.toolGenerationJob.findFirst({
      where: { userId, serverId: id, status: { in: ['pending', 'running'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (activeJob && !isJobStale(activeJob)) {
      return apiError(
        'A generation job is already in progress for this server. Wait for it to finish or refresh to check its status.',
        'JOB_ALREADY_RUNNING',
        409
      );
    }

    // Create the job record first so the client gets a jobId immediately.
    const job = await prisma.toolGenerationJob.create({
      data: { userId, serverId: id, status: 'pending' },
    });

    // Run synchronously and await completion before sending the response.
    //
    // WHY: Vercel serverless functions freeze the Node.js process the moment
    // the HTTP response is sent. setImmediate / "fire-and-forget" schedules
    // work to run AFTER the response — i.e., after the process is frozen — so
    // the job would be silently lost, staying 'pending' in the DB forever.
    // maxDuration=300 gives this function up to 5 minutes for the full run.
    await runToolGenerationJob(job.id, id, userId, resolvedConnectionId);

    // Re-read the persisted state written by runToolGenerationJob so the caller
    // receives the definitive status, not a stale in-memory snapshot.
    const completed = await prisma.toolGenerationJob.findUnique({ where: { id: job.id } });

    // Build a connectionId → name map so the preview UI can show connection names.
    const generatedList = safeParseJSON<any[]>(completed?.generatedTools ?? null, []);
    const connIds = [
      ...new Set(
        generatedList
          .map((t: any) => {
            const hc = typeof t.handlerConfig === 'string' ? safeParseJSON<any>(t.handlerConfig, {}) : (t.handlerConfig ?? {});
            return hc.connectionId as string | undefined;
          })
          .filter(Boolean) as string[]
      ),
    ];
    const connRows = connIds.length > 0
      ? await prisma.fMConnection.findMany({ where: { id: { in: connIds }, userId }, select: { id: true, name: true } })
      : [];
    const connectionMap: Record<string, string> = Object.fromEntries(connRows.map(c => [c.id, c.name]));

    return apiSuccess({
      jobId: job.id,
      status: completed?.status ?? 'failed',
      progress: completed?.progress ?? 0,
      generatedTools: completed?.generatedTools ?? null,
      connectionMap,
      error: completed?.error ?? null,
      completedAt: completed?.completedAt ?? null,
      log: safeParseJSON<any[]>(completed?.log, []),
    });
  } catch (error) {
    logger.error({ err: error }, '[API Error]');
    return apiServerError('Failed to start tool generation');
  }
});
