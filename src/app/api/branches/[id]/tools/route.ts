import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';

// GET: effective tool list for this branch
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const branchTools = await prisma.branchTool.findMany({
    where: { branchId: (await params).id, action: { not: 'deleted' } },
    include: { tool: true },
    orderBy: { createdAt: 'asc' },
  });

  // Merge override data into tool records
  const tools = branchTools.map(bt => {
    const base = bt.tool;
    const override = safeParseJSON(bt.overrideData, {});
    return {
      ...base,
      ...override,
      _branchAction: bt.action,        // "inherited" | "modified" | "added"
      _branchToolId: bt.id,
    };
  });

  return NextResponse.json({ success: true, data: tools });
}

// POST: add a new tool to this branch only
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const branch = await prisma.branch.findUnique({ where: { id: (await params).id } });
  if (!branch) return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });

  const body = await req.json();

  // Create the base tool record (linked to server, not branch directly)
  const tool = await prisma.tool.create({
    data: {
      name: body.name,
      description: body.description,
      inputSchema: JSON.stringify(body.inputSchema),
      fmMethod: body.handlerType,
      handlerConfig: JSON.stringify(body.handlerConfig),
      isEnabled: body.enabled ?? true,
      category: body.category ?? 'custom',
      serverId: branch.serverId,
    },
  });

  // Add to this branch as "added"
  await prisma.branchTool.create({
    data: { branchId: (await params).id, toolId: tool.id, action: 'added' },
  });

  await log({
    action: LOG_ACTIONS.TOOL_CREATED,
    entityType: 'tool', entityId: tool.id, entityName: tool.name,
    serverId: branch.serverId, branchId: (await params).id,
    after: JSON.stringify({ name: tool.name, fmMethod: tool.fmMethod }),
    meta: { branch: branch.name, addedOnBranch: true },
  });

  return NextResponse.json({ success: true, data: tool }, { status: 201 });
}
