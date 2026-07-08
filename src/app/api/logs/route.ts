import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { withAuth } from "@/lib/auth/api-guard";
export const GET = withAuth(async (req, { params, userId }) => {
    const { searchParams } = new URL(req.url);

    const serverId = searchParams.get('serverId') ?? undefined;
    const branchId = searchParams.get('branchId') ?? undefined;
    const entityType = searchParams.get('entityType') ?? undefined;
    const action = searchParams.get('action') ?? undefined;
    const from = searchParams.get('from') ?? undefined;     // ISO date string
    const to = searchParams.get('to') ?? undefined;         // ISO date string
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
    const cursor = searchParams.get('cursor') ?? undefined; // for pagination

    // Fetch all servers owned by the logged-in user to restrict logs access
    const userServers = await prisma.mcpServer.findMany({
      where: { userId },
      select: { id: true },
    });
    const userServerIds = userServers.map((s) => s.id);

    const where: any = {};
    if (serverId) {
      if (!userServerIds.includes(serverId)) {
        return NextResponse.json({ success: false, error: 'Server not found', code: 'NOT_FOUND' }, { status: 404 });
      }
      where.serverId = serverId;
    } else {
      // Restrict only to servers owned by the user
      where.serverId = { in: userServerIds };
    }

    if (branchId) where.branchId = branchId;
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;
    if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
    }

    const logs = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // fetch one extra to determine if there's a next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return NextResponse.json({
    success: true,
    data: data.map(l => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      entityName: l.entityName,
      serverId: l.serverId,
      branchId: l.branchId,
      deploymentId: l.deploymentId,
      hasDiff: !!(l.before && l.after),
      meta: safeParseJSON<any>(l.meta, null),
      createdAt: l.createdAt,
    })),
    pagination: { hasMore, nextCursor, limit },
    });
    });
