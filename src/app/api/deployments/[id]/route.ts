import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const dep = await prisma.deployment.findUnique({
    where: { id: (await params).id },
    include: { branch: { select: { name: true } }, server: { select: { name: true } } },
  });
  if (!dep) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const snapshot = safeParseJSON(dep.snapshot, {});
  return NextResponse.json({
    success: true,
    data: {
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
    },
  });
}
