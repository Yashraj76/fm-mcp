import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get('serverId') ?? undefined;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

  const where = { ...(serverId ? { serverId } : {}), createdAt: { gte: since } };

  const [total, byAction, byEntity, executions] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.groupBy({ by: ['action'], where, _count: true, orderBy: { _count: { action: 'desc' } }, take: 10 }),
    prisma.activityLog.groupBy({ by: ['entityType'], where, _count: true }),
    prisma.activityLog.count({ where: { ...where, action: 'tool.executed' } }),
  ]);

  const failedExecutions = await prisma.activityLog.count({
    where: { ...where, action: 'tool.execution_failed' },
  });

  return NextResponse.json({
    success: true,
    data: {
      period: '7d',
      total,
      executions,
      failedExecutions,
      successRate: executions > 0
        ? Math.round(((executions - failedExecutions) / executions) * 100)
        : null,
      byAction: byAction.map(r => ({ action: r.action, count: r._count })),
      byEntity: byEntity.map(r => ({ entityType: r.entityType, count: r._count })),
    },
  });
}
