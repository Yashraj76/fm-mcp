import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { z } from 'zod';
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeBranch } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiForbidden, apiServerError } from '@/lib/utils/api-response'

export const runtime = 'nodejs';
export const maxDuration = 300;

// GET /api/branches/[id] - Get details of a single branch
const UpdateBranchSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9\-\/]+$/, 'Lowercase letters, numbers, hyphens, slashes only').optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived', 'merged']).optional(),
});

// PUT /api/branches/[id] - Update branch details (archive/restore/rename)
// DELETE /api/branches/[id] - Hard delete an active or archived branch
export const GET = withAuth(async (_, { params, userId }) => {
    try {
    const branch = await prisma.branch.findFirst({
      where: {
        id: params.id,
        server: { userId }
      },
      include: {
        _count: { select: { tools: true, deployments: true } },
      },
    });

    if (!branch) {
      return apiNotFound('Branch not found');
    }

    return apiSuccess(toSafeBranch(branch));
    } catch (error) {
    console.error('[API GET Branch Error]', error);
    return apiServerError('Internal server error');
    }
    });

export const PUT = withAuth(async (req, { params, userId }) => {
    try {
    const branchId = params.id;
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        server: { userId }
      }
    });

    if (!branch) {
      return apiNotFound('Branch not found');
    }

    // Always guard against main/protected branch modifications
    if (branch.isDefault || branch.isProtected) {
      return apiForbidden('Cannot modify the main branch');
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

    return apiSuccess(toSafeBranch(updated));
    } catch (error) {
    if (error instanceof z.ZodError) {
      return apiValidationFailed(error.issues);
    }
    console.error('[API PUT Branch Error]', error);
    return apiServerError('Internal server error');
    }
    });

export const DELETE = withAuth(async (_, { params, userId }) => {
    try {
    const branchId = params.id;
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        server: { userId }
      }
    });

    if (!branch) {
      return apiNotFound('Branch not found');
    }

    // Always guard against main/protected branch deletion
    if (branch.isDefault || branch.isProtected) {
      return apiForbidden('Cannot delete the main branch');
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

    return apiSuccess({ deleted: true });
    } catch (error) {
    console.error('[API DELETE Branch Error]', error);
    return apiServerError('Internal server error');
    }
    });
