import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 300;

// GET /api/branches/[id] - Get details of a single branch
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const branch = await prisma.branch.findUnique({
      where: { id: (await params).id },
      include: {
        _count: { select: { tools: true, deployments: true } },
      },
    });

    if (!branch) {
      return NextResponse.json(
        { success: false, error: 'Branch not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: branch });
  } catch (error) {
    console.error('[API GET Branch Error]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}

const UpdateBranchSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9\-\/]+$/, 'Lowercase letters, numbers, hyphens, slashes only').optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived', 'merged']).optional(),
});

// PUT /api/branches/[id] - Update branch details (archive/restore/rename)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const branchId = (await params).id;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });

    if (!branch) {
      return NextResponse.json(
        { success: false, error: 'Branch not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Always guard against main/protected branch modifications
    if (branch.isDefault || branch.isProtected) {
      return NextResponse.json(
        { success: false, error: 'Cannot modify the main branch', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const body = UpdateBranchSchema.parse(await req.json());

    const before = JSON.stringify({
      name: branch.name,
      description: branch.description,
      status: branch.status,
    });

    const updated = await prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status && { status: body.status }),
      },
    });

    await log({
      action: LOG_ACTIONS.BRANCH_UPDATED || 'branch.updated',
      entityType: 'branch',
      entityId: branch.id,
      entityName: updated.name,
      serverId: branch.serverId,
      before,
      after: JSON.stringify({
        name: updated.name,
        description: updated.description,
        status: updated.status,
      }),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.issues },
        { status: 400 }
      );
    }
    console.error('[API PUT Branch Error]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}

// DELETE /api/branches/[id] - Hard delete an active or archived branch
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const branchId = (await params).id;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });

    if (!branch) {
      return NextResponse.json(
        { success: false, error: 'Branch not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Always guard against main/protected branch deletion
    if (branch.isDefault || branch.isProtected) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete the main branch', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const before = JSON.stringify(branch);

    // Delete in order to maintain referential integrity
    await prisma.$transaction([
      prisma.branchTool.deleteMany({ where: { branchId } }),
      prisma.branch.delete({ where: { id: branchId } }),
    ]);

    await log({
      action: LOG_ACTIONS.BRANCH_DELETED || 'branch.deleted',
      entityType: 'branch',
      entityId: branch.id,
      entityName: branch.name,
      serverId: branch.serverId,
      before,
    });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('[API DELETE Branch Error]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
