import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';

export const GET = withAuth(async (req: NextRequest, { params, userId }) => {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    // If jobId is provided, look up that specific job; otherwise get the latest
    const job = await prisma.toolGenerationJob.findFirst({
    where: {
        userId: userId,
        serverId: id,
        ...(jobId ? { id: jobId } : {}),
      },
    orderBy: { createdAt: 'desc' },
    });
    if (!job) return NextResponse.json({ success: false, error: 'No job found' }, { status: 404 });

    return NextResponse.json({
    success: true,
    data: {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      generatedTools: job.generatedTools,
      toolsCreated: job.toolsCreated,
      log: safeParseJSON(job.log, []),
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    },
    });
});
