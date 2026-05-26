import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { withAuth } from "@/lib/auth/api-guard";

export const runtime = 'nodejs';
export const maxDuration = 300;

// POST /api/branches/[id]/revert - Revert branch tools back to main state
export const POST = withAuth(async (_, { params, userId }) => {
    try {
    const branchId = params.id;
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        server: { userId }
      },
      include: { server: true },
    });

    if (!branch) {
      return NextResponse.json(
        { success: false, error: 'Branch not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (branch.isDefault || branch.isProtected) {
      return NextResponse.json(
        { success: false, error: 'Cannot revert the main branch', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    if (branch.status !== 'active') {
      return NextResponse.json(
        { success: false, error: `Branch is not active (currently ${branch.status})`, code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    // Find the source main branch
    const mainBranch = await prisma.branch.findFirst({
      where: {
        serverId: branch.serverId,
        isDefault: true
      },
    });

    if (!mainBranch) {
      return NextResponse.json(
        { success: false, error: 'Main branch not found for server', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    }

    // Load effective tools of main branch
    const mainTools = await prisma.branchTool.findMany({
      where: {
        branchId: mainBranch.id,
        action: { not: 'deleted' }
      },
    });

    // Run the revert inside a single database transaction
    await prisma.$transaction([
      // 1. Delete all overrides / tools on this branch
      prisma.branchTool.deleteMany({ where: { branchId } }),

      // 2. Clone tools from main branch as 'inherited'
      prisma.branchTool.createMany({
        data: mainTools.map(bt => ({
          branchId,
          toolId: bt.toolId,
          action: 'inherited',
        })),
      }),
    ]);

    await log({
      action: LOG_ACTIONS.BRANCH_REVERTED || 'branch.reverted',
      entityType: 'branch',
      entityId: branch.id,
      entityName: branch.name,
      serverId: branch.serverId,
      meta: { revertedTo: mainBranch.name, toolCount: mainTools.length },
    });

    return NextResponse.json({
      success: true,
      message: 'Branch reverted to main successfully',
      data: { toolCount: mainTools.length },
    });
    } catch (error) {
    console.error('[API POST Revert Branch Error]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
    }
    });
