import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';

// PUT: override a tool on this branch (non-destructive — doesn't touch main)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  const branch = await prisma.branch.findUnique({ where: { id: (await params).id } });
  if (!branch) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const tool = await prisma.tool.findUnique({ where: { id: (await params).toolId } });
  if (!tool) return NextResponse.json({ success: false, error: 'Tool not found' }, { status: 404 });

  const beforeData = {
    name: tool.name, description: tool.description,
    fmMethod: tool.fmMethod ?? '', enabled: tool.isEnabled,
  };

  // Store override as JSON — doesn't mutate the base tool
  const overrideData = {
    ...(body.name && { name: body.name }),
    ...(body.description && { description: body.description }),
    ...(body.inputSchema && { inputSchema: JSON.stringify(body.inputSchema) }),
    ...(body.handlerConfig && { handlerConfig: JSON.stringify(body.handlerConfig) }),
    ...(body.enabled !== undefined && { isEnabled: body.enabled }),
  };

  await prisma.branchTool.upsert({
    where: { branchId_toolId: { branchId: (await params).id, toolId: (await params).toolId } },
    create: {
      branchId: (await params).id,
      toolId: (await params).toolId,
      action: 'modified',
      overrideData: JSON.stringify(overrideData),
    },
    update: {
      action: 'modified',
      overrideData: JSON.stringify(overrideData),
    },
  });

  await log({
    action: LOG_ACTIONS.TOOL_UPDATED,
    entityType: 'tool', entityId: tool.id, entityName: tool.name,
    serverId: branch.serverId, branchId: (await params).id,
    before: JSON.stringify(beforeData),
    after: JSON.stringify(overrideData),
    meta: { branch: branch.name, overrideOnly: true },
  });

  return NextResponse.json({ success: true, data: { toolId: (await params).toolId, branch: branch.name } });
}

// DELETE: mark tool as deleted on this branch (doesn't delete from main)
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  const branch = await prisma.branch.findUnique({ where: { id: (await params).id } });
  if (branch?.isDefault) {
    return NextResponse.json(
      { success: false, error: 'Use DELETE /api/tools/[id] to delete tools from main' },
      { status: 400 }
    );
  }

  const tool = await prisma.tool.findUnique({ where: { id: (await params).toolId } });

  await prisma.branchTool.upsert({
    where: { branchId_toolId: { branchId: (await params).id, toolId: (await params).toolId } },
    create: { branchId: (await params).id, toolId: (await params).toolId, action: 'deleted' },
    update: { action: 'deleted' },
  });

  await log({
    action: LOG_ACTIONS.TOOL_DELETED,
    entityType: 'tool', entityId: (await params).toolId, entityName: tool?.name ?? (await params).toolId,
    serverId: branch?.serverId, branchId: (await params).id,
    meta: { branch: branch?.name, softDeleteOnBranch: true },
  });

  return NextResponse.json({ success: true, data: { deleted: true, fromBranchOnly: true } });
}
