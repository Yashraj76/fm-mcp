import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from "@/lib/auth/api-guard";
export const GET = withAuth(async (req, { params, userId }) => {
    const { searchParams } = new URL(req.url);
    const serverId = searchParams.get('serverId') ?? undefined;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

    // Fetch all servers owned by the logged-in user to restrict logs access
    const userServers = await prisma.mcpServer.findMany({
      where: { userId },
      select: { id: true },
    });
    const userServerIds = userServers.map((s) => s.id);

    if (serverId && !userServerIds.includes(serverId)) {
      return NextResponse.json({ success: false, error: 'Server not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const where = {
      serverId: serverId ? serverId : { in: userServerIds },
      createdAt: { gte: since },
    };

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
    });
