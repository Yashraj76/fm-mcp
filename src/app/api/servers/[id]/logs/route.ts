import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? undefined;
  const entityType = searchParams.get('entityType') ?? undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  const logs = await prisma.activityLog.findMany({
    where: {
      serverId: (await params).id,
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({
    success: true,
    data: logs.map(l => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityName: l.entityName,
      branchId: l.branchId,
      deploymentId: l.deploymentId,
      hasDiff: !!(l.before && l.after),
      meta: safeParseJSON(l.meta, null),
      createdAt: l.createdAt,
    })),
  });
}
