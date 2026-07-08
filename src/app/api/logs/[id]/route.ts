import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { withAuth } from "@/lib/auth/api-guard";
import { apiSuccess, apiNotFound } from '@/lib/utils/api-response';

export const GET = withAuth(async (_, { params, userId }) => {
    const entry = await prisma.activityLog.findFirst({
      where: {
        id: (await params).id,
        OR: [
          { serverId: null },
          { server: { userId } }
        ]
      },
      include: { server: true }
    });
    if (!entry) {
      return apiNotFound();
    }

    const before = safeParseJSON<any>(entry.before, null);
    const after = safeParseJSON<any>(entry.after, null);

    // Build a field-level diff when both before and after exist
    let diff: Record<string, { before: any; after: any }> | null = null;
    if (before && after && typeof before === 'object' && typeof after === 'object') {
    diff = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        diff[key] = { before: before[key], after: after[key] };
      }
    }
    if (Object.keys(diff).length === 0) diff = null;
    }

    return apiSuccess({
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityName: entry.entityName,
      serverId: entry.serverId,
      branchId: entry.branchId,
      deploymentId: entry.deploymentId,
      before,
      after,
      diff,
      meta: safeParseJSON<any>(entry.meta, null),
      createdAt: entry.createdAt,
    });
    });
