import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { z } from 'zod';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const branches = await prisma.branch.findMany({
    where: { serverId: (await params).id },
    include: {
      _count: { select: { tools: true, deployments: true } },
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ success: true, data: branches });
}

const CreateBranchSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9\-\/]+$/, 'Lowercase letters, numbers, hyphens, slashes only'),
  description: z.string().optional(),
  fromBranchId: z.string().optional(), // fork from this branch; defaults to main
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = CreateBranchSchema.parse(await req.json());

  // Find source branch (default: main)
  const sourceBranch = body.fromBranchId
    ? await prisma.branch.findUnique({ where: { id: body.fromBranchId } })
    : await prisma.branch.findFirst({ where: { serverId: (await params).id, isDefault: true } });

  if (!sourceBranch) {
    return NextResponse.json({ success: false, error: 'Source branch not found' }, { status: 404 });
  }

  // Prevent duplicate branch names on same server
  const existing = await prisma.branch.findUnique({
    where: { serverId_name: { serverId: (await params).id, name: body.name } },
  });
  if (existing) {
    return NextResponse.json({ success: false, error: `Branch "${body.name}" already exists` }, { status: 409 });
  }

  // Create branch
  const branch = await prisma.branch.create({
    data: {
      name: body.name,
      serverId: (await params).id,
      description: body.description,
      isDefault: false,
      isProtected: false,
      status: 'active',
    },
  });

  // Fork all tools from source branch as "inherited"
  const sourceTools = await getEffectiveTools(sourceBranch.id);
  if (sourceTools.length > 0) {
    await prisma.branchTool.createMany({
      data: sourceTools.map(tool => ({
        branchId: branch.id,
        toolId: tool.id,
        action: 'inherited',
      })),
    });
  }

  await log({
    action: LOG_ACTIONS.BRANCH_CREATED,
    entityType: 'branch', entityId: branch.id, entityName: branch.name,
    serverId: (await params).id,
    meta: { forkedFrom: sourceBranch.name, toolCount: sourceTools.length },
  });

  return NextResponse.json({ success: true, data: branch }, { status: 201 });
}

// Get all "effective" tools visible on a branch
// (inherited tools that haven't been deleted, plus added tools)
async function getEffectiveTools(branchId: string) {
  const branchTools = await prisma.branchTool.findMany({
    where: { branchId, action: { not: 'deleted' } },
    include: { tool: true },
  });
  return branchTools.map(bt => bt.tool);
}
