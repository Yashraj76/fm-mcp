import { apiSuccess, apiNotFound, apiServerError } from '@/lib/utils/api-response';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { withAuth } from "@/lib/auth/api-guard";
import { logger } from '@/lib/logger'
export const GET = withAuth(async (req, { params, userId }) => {
  try {
    const server = await prisma.mcpServer.findFirst({
      where: { id: params.id, userId }
    });
    if (!server) {
      return apiNotFound('Server not found');
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') ?? undefined;
    const entityType = searchParams.get('entityType') ?? undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
    const cursor = searchParams.get('cursor') ?? undefined;

    const logs = await prisma.activityLog.findMany({
      where: {
        serverId: params.id,
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return apiSuccess({
      data: data.map(l => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityName: l.entityName,
        branchId: l.branchId,
        deploymentId: l.deploymentId,
        hasDiff: !!(l.before && l.after),
        meta: safeParseJSON<any>(l.meta, null),
        createdAt: l.createdAt,
      })),
      pagination: { hasMore, nextCursor, limit }
    });
  } catch (error) {
    logger.error({ err: error }, '[API Error]');
    return apiServerError('Failed to list server logs');
  }
});
