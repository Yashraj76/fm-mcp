import { apiSuccess, apiNotFound, apiError, apiServerError } from '@/lib/utils/api-response';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { withAuth } from "@/lib/auth/api-guard";
import { toolCreateDataFromSnapshot } from '@/lib/deployments/tool-from-snapshot';
import { logger } from '@/lib/logger'
export const POST = withAuth(async (_, { params, userId }) => {
  try {
    const targetDep = await prisma.deployment.findFirst({
      where: {
        id: (await params).id,
        server: { userId }
      },
      include: { server: true },
    });
    if (!targetDep || targetDep.server.userId !== userId) {
      return apiNotFound('Deployment not found');
    }
    if (targetDep.isLive) return apiError('Already the live deployment', 'VALIDATION_ERROR', 400);

    const snapshot = safeParseJSON<{ tools: any[] }>(targetDep.snapshot, { tools: [] });
    const mainBranch = await prisma.branch.findFirst({
      where: { serverId: targetDep.serverId, isDefault: true },
    });

    await prisma.$transaction(async (tx) => {
    // 1. Soft-delete current tools to preserve ToolExecution history; hard-delete branch links
    await tx.branchTool.deleteMany({ where: { branchId: mainBranch!.id } });
    await tx.tool.updateMany({
      where: { serverId: targetDep.serverId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // 2. Recreate tools from snapshot — all execution-critical and metadata
    //    fields are mapped via toolCreateDataFromSnapshot to ensure the
    //    rolled-back tools are identical to what was originally deployed.
    for (const toolData of snapshot.tools ?? []) {
      const newTool = await tx.tool.create({
        data: {
          ...toolCreateDataFromSnapshot(toolData),
          serverId: targetDep.serverId,
        },
      });
      await tx.branchTool.create({
        data: { branchId: mainBranch!.id, toolId: newTool.id, action: 'inherited' },
      });
    }

    // 3. Mark current live as superseded
    await tx.deployment.updateMany({
      where: { serverId: targetDep.serverId, isLive: true },
      data: { isLive: false, status: 'rolled_back' },
    });

    // 4. Mark target as live again
    await tx.deployment.update({
      where: { id: (await params).id },
      data: { isLive: true, status: 'active' },
    });

    // 5. Update server version
    await tx.mcpServer.update({
      where: { id: targetDep.serverId },
      data: { version: targetDep.version },
    });
    });

    await log({
    action: LOG_ACTIONS.DEPLOYMENT_ROLLED_BACK,
    entityType: 'deployment', entityId: targetDep.id, entityName: `v${targetDep.version}`,
    serverId: targetDep.serverId,
    meta: { rolledBackTo: targetDep.version, toolCount: snapshot.tools?.length ?? 0 },
    actorUserId: userId,
    });

    return apiSuccess({ rolledBackTo: targetDep.version, toolCount: snapshot.tools?.length ?? 0 });
  } catch (error) {
    logger.error({ err: error }, '[API Error]');
    return apiServerError('Failed to rollback deployment');
  }
});
