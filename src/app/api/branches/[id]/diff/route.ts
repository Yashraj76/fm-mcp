import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const branch = await prisma.branch.findUnique({
    where: { id: (await params).id },
    include: { server: true },
  });
  if (!branch || branch.isDefault) {
    return NextResponse.json({ success: false, error: 'Cannot diff main against itself' }, { status: 400 });
  }

  // Get main branch tools
  const mainBranch = await prisma.branch.findFirst({
    where: { serverId: branch.serverId, isDefault: true },
  });
  const mainBranchTools = await prisma.branchTool.findMany({
    where: { branchId: mainBranch!.id },
    include: { tool: true },
  });

  // Get this branch's changes
  const branchChanges = await prisma.branchTool.findMany({
    where: { branchId: (await params).id },
    include: { tool: true },
  });

  const diff = {
    branch: { id: branch.id, name: branch.name },
    base: { id: mainBranch!.id, name: 'main' },
    added: [] as any[],
    modified: [] as any[],
    deleted: [] as any[],
    inherited: [] as any[],
    summary: { added: 0, modified: 0, deleted: 0, unchanged: 0 },
  };

  for (const change of branchChanges) {
    const override = safeParseJSON(change.overrideData, {});
    const entry = {
      toolId: change.toolId,
      name: override.name ?? change.tool.name,
      originalName: change.tool.name,
      action: change.action,
      overrides: Object.keys(override),
    };

    if (change.action === 'added') { diff.added.push(entry); diff.summary.added++; }
    else if (change.action === 'modified') { diff.modified.push(entry); diff.summary.modified++; }
    else if (change.action === 'deleted') { diff.deleted.push(entry); diff.summary.deleted++; }
    else { diff.inherited.push(entry); diff.summary.unchanged++; }
  }

  return NextResponse.json({ success: true, data: diff });
}
