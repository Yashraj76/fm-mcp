import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { z } from 'zod';
import { getEffectiveTools } from '@/lib/branching';
import { withAuth } from "@/lib/auth/api-guard";
const CreateBranchSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9\-\/]+$/, 'Lowercase letters, numbers, hyphens, slashes only'),
  description: z.string().optional(),
  fromBranchId: z.string().optional(), // fork from this branch; defaults to main
});
export const GET = withAuth(async (_, { params, userId }) => {
    const server = await prisma.mcpServer.findFirst({
      where: { id: params.id, userId }
    });
    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 });
    }

    const branches = await prisma.branch.findMany({
      where: { serverId: params.id },
      include: {
        _count: { select: { tools: true, deployments: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json({ success: true, data: branches });
  });

export const POST = withAuth(async (req, { params, userId }) => {
    const server = await prisma.mcpServer.findFirst({
      where: { id: params.id, userId }
    });
    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 });
    }

    const body = CreateBranchSchema.parse(await req.json());

    // Find source branch (default: main)
    const sourceBranch = body.fromBranchId
    ? await prisma.branch.findFirst({
        where: { id: body.fromBranchId, server: { userId } }
      })
    : await prisma.branch.findFirst({
        where: { serverId: params.id, isDefault: true }
      });

    if (!sourceBranch) {
      return NextResponse.json({ success: false, error: 'Source branch not found' }, { status: 404 });
    }

    // Prevent duplicate branch names on same server
    const existing = await prisma.branch.findUnique({
      where: {
        serverId_name: { serverId: params.id, name: body.name }
      },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: `Branch "${body.name}" already exists` }, { status: 409 });
    }

    // Create branch
    const branch = await prisma.branch.create({
      data: {
        name: body.name,
        serverId: params.id,
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
      serverId: params.id,
      meta: { forkedFrom: sourceBranch.name, toolCount: sourceTools.length },
    });

    return NextResponse.json({ success: true, data: branch }, { status: 201 });
  });
