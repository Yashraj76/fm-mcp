import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { z } from 'zod';
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeBranch } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiForbidden, apiServerError, apiError } from '@/lib/utils/api-response'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs';
export const maxDuration = 300;

// GET /api/branches/[id] - Get details of a single branch
const UpdateBranchSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9\-\/]+$/, 'Lowercase letters, numbers, hyphens, slashes only').optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived', 'merged']).optional(),
  // Points every tool execution on this branch at a different FileMaker
  // connection (e.g. a sandbox file) instead of the server's default. null
  // clears the override. The connection only needs to be owned by this user —
  // it does not need to already be linked to this server.
  connectionOverrideId: z.string().nullable().optional(),
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
        connectionOverride: { select: { id: true, name: true, database: true } },
      },
    });

    if (!branch) {
      return apiNotFound('Branch not found');
    }

    return apiSuccess(toSafeBranch(branch));
    } catch (error) {
    logger.error({ err: error }, '[API GET Branch Error]');
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

    if (body.connectionOverrideId) {
      const owned = await prisma.fMConnection.findFirst({
        where: { id: body.connectionOverrideId, userId },
      });
      if (!owned) {
        return apiError('Connection not found', 'VALIDATION_ERROR', 400);
      }
    }

    const before = JSON.stringify({
      name: branch.name,
      description: branch.description,
      status: branch.status,
      connectionOverrideId: branch.connectionOverrideId,
    });

    const updated = await prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status && { status: body.status }),
        ...(body.connectionOverrideId !== undefined && { connectionOverrideId: body.connectionOverrideId }),
      },
      include: { connectionOverride: { select: { id: true, name: true, database: true } } },
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
        connectionOverrideId: updated.connectionOverrideId,
      }),
      actorUserId: userId,
    });

    return apiSuccess(toSafeBranch(updated));
    } catch (error) {
    if (error instanceof z.ZodError) {
      return apiValidationFailed(error.issues);
    }
    logger.error({ err: error }, '[API PUT Branch Error]');
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
      actorUserId: userId,
    });

    return apiSuccess({ deleted: true });
    } catch (error) {
    logger.error({ err: error }, '[API DELETE Branch Error]');
    return apiServerError('Internal server error');
    }
    });
