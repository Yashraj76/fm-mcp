import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.toolGenerationJob.findFirst({
    where: { serverId: id },
    orderBy: { createdAt: 'desc' },
  });
  if (!job) return NextResponse.json({ success: false, error: 'No job found' }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      toolsCreated: job.toolsCreated,
      log: JSON.parse(job.log),
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    },
  });
}
