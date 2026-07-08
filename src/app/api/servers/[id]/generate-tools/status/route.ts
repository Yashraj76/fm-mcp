import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { isJobStale } from '@/lib/tools/job-runner';
import { logger } from '@/lib/logger'

export const GET = withAuth(async (req: NextRequest, { params, userId }) => {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    const job = await prisma.toolGenerationJob.findFirst({
    where: {
        userId,
        serverId: id,
        ...(jobId ? { id: jobId } : {}),
      },
    orderBy: { createdAt: 'desc' },
    });
    if (!job) return NextResponse.json({ success: false, error: 'No job found' }, { status: 404 });

    // A job can get stuck in 'running' if the Vercel function timed out before
    // the runner could write its final state. Surface this as a failure so the
    // UI doesn't poll indefinitely.
    let effectiveStatus = job.status
    let effectiveError = job.error

    if (isJobStale(job)) {
      effectiveStatus = 'failed'
      effectiveError = 'Job timed out. The generation process exceeded the maximum allowed duration. Please try again.'
      // Persist the timeout so subsequent polls return a stable state
      await prisma.toolGenerationJob.update({
        where: { id: job.id },
        data: { status: 'failed', error: effectiveError, completedAt: new Date() },
      }).catch((e) => logger.error({ err: e }, '[job status] Failed to persist timeout state:'))
    }

    return NextResponse.json({
    success: true,
    data: {
      jobId: job.id,
      status: effectiveStatus,
      progress: job.progress,
      generatedTools: job.generatedTools,
      toolsCreated: job.toolsCreated,
      log: safeParseJSON<any[]>(job.log, []),
      error: effectiveError,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    },
    });
});
