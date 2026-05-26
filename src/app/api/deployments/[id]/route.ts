import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { withAuth } from "@/lib/auth/api-guard";
import { apiSuccess, apiNotFound } from '@/lib/utils/api-response';

export const GET = withAuth(async (_, { params, userId }) => {
    const dep = await prisma.deployment.findFirst({
      where: {
        id: (await params).id,
        server: { userId }
      },
      include: { branch: { select: { name: true } }, server: { select: { name: true, userId: true } } },
    });
    if (!dep || dep.server.userId !== userId) return apiNotFound();

    const snapshot = safeParseJSON(dep.snapshot, {});
    return apiSuccess({
      id: dep.id, version: dep.version, changelog: dep.changelog,
      status: dep.status, isLive: dep.isLive, deployedAt: dep.deployedAt,
      server: dep.server, branch: dep.branch,
      snapshot: {
        toolCount: snapshot.tools?.length ?? 0,
        stats: snapshot.stats,
        snapshotAt: snapshot.snapshotAt,
        tools: (snapshot.tools ?? []).map((t: any) => ({
          name: t.name, description: t.description, category: t.category, enabled: t.isEnabled ?? t.enabled,
        })),
      },
    });
    });
