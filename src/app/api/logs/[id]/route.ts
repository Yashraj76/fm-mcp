import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const entry = await prisma.activityLog.findUnique({ where: { id: (await params).id } });
  if (!entry) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const before = safeParseJSON(entry.before, null);
  const after = safeParseJSON(entry.after, null);

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

  return NextResponse.json({
    success: true,
    data: {
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
      meta: safeParseJSON(entry.meta, null),
      createdAt: entry.createdAt,
    },
  });
}
