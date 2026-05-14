import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runToolGenerationJob } from '@/lib/tools/job-runner';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = await prisma.mcpServer.findUnique({ where: { id } });
  if (!server) return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 });

  // Create job record
  const job = await prisma.toolGenerationJob.create({
    data: { serverId: id, status: 'pending' },
  });

  // Run async — do not await
  setImmediate(() => runToolGenerationJob(job.id, id));

  return NextResponse.json({ success: true, data: { jobId: job.id, status: 'pending' } }, { status: 202 });
}
