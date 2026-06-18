import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runToolGenerationJob } from '@/lib/tools/job-runner';
import { withAuth } from "@/lib/auth/api-guard";

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = withAuth(async (_, { params, userId }) => {
    const { id } = await params;
    const server = await prisma.mcpServer.findFirst({
      where: { id, userId }
    });
    if (!server) return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 });

    // Create job record
    const job = await prisma.toolGenerationJob.create({
    data: {
        userId: userId,
        serverId: id, status: 'pending' },
    });

    // Run async — do not await
    setImmediate(() => runToolGenerationJob(job.id, id, userId));

    return NextResponse.json({ success: true, data: { jobId: job.id, status: 'pending' } }, { status: 202 });
    });
