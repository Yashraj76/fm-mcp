import { z, ZodError } from 'zod';
import { apiSuccess, apiNotFound, apiError, apiServerError, apiValidationFailed } from '@/lib/utils/api-response';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { getEffectiveTools } from '@/lib/branching';
import { withAuth } from "@/lib/auth/api-guard";
import { logger } from '@/lib/logger'
const CreateBranchSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9\-\/]+$/, 'Lowercase letters, numbers, hyphens, slashes only'),
  description: z.string().optional(),
  fromBranchId: z.string().optional(), // fork from this branch; defaults to main
});
export const GET = withAuth(async (_, { params, userId }) => {
  try {
    const server = await prisma.mcpServer.findFirst({
      where: { id: params.id, userId }
    });
    if (!server) {
      return apiNotFound('Server not found');
    }

    const branches = await prisma.branch.findMany({
      where: { serverId: params.id },
      include: {
        _count: { select: { tools: true, deployments: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return apiSuccess(branches);
  } catch (error) {
    logger.error({ err: error }, '[API Error]');
    return apiServerError('Failed to list branches');
  }
});

export const POST = withAuth(async (req, { params, userId }) => {
  try {
    const server = await prisma.mcpServer.findFirst({
      where: { id: params.id, userId }
    });
    if (!server) {
      return apiNotFound('Server not found');
    }

    const bodyObj = await req.json().catch(() => ({}));
    const body = CreateBranchSchema.parse(bodyObj);

    // Find source branch (default: main)
    const sourceBranch = body.fromBranchId
    ? await prisma.branch.findFirst({
        where: { id: body.fromBranchId, server: { userId } }
      })
    : await prisma.branch.findFirst({
        where: { serverId: params.id, isDefault: true }
      });

    if (!sourceBranch) {
      return apiNotFound('Source branch not found');
    }

    // Prevent duplicate branch names on same server
    const existing = await prisma.branch.findUnique({
      where: {
        serverId_name: { serverId: params.id, name: body.name }
      },
    });
    if (existing) {
      return apiError(`Branch "${body.name}" already exists`, 'CONFLICT', 409);
    }

    // Read source tools before the transaction (read-only, outside is fine)
    const sourceTools = await getEffectiveTools(sourceBranch.id);

    // Create branch + fork its tools atomically so we never have a branch
    // that exists but has no tool links (partial fork).
    const branch = await prisma.$transaction(async (tx) => {
      const newBranch = await tx.branch.create({
        data: {
          name: body.name,
          serverId: params.id,
          description: body.description,
          isDefault: false,
          isProtected: false,
          status: 'active',
        },
      });

      if (sourceTools.length > 0) {
        await tx.branchTool.createMany({
          data: sourceTools.map(tool => ({
            branchId: newBranch.id,
            toolId: tool.id as string,
            action: 'inherited',
          })),
        });
      }

      return newBranch;
    });

    await log({
      action: LOG_ACTIONS.BRANCH_CREATED,
      entityType: 'branch', entityId: branch.id, entityName: branch.name,
      serverId: params.id,
      meta: { forkedFrom: sourceBranch.name, toolCount: sourceTools.length },
      actorUserId: userId,
    });

    return apiSuccess(branch, 201);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues);
    }
    logger.error({ err: error }, '[API Error]');
    return apiServerError('Failed to create branch');
  }
});
