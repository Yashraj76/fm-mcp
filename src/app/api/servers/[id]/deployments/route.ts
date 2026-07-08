import { z, ZodError } from 'zod';
import { apiSuccess, apiNotFound, apiServerError, apiValidationFailed } from '@/lib/utils/api-response';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { incrementVersion } from '@/lib/utils/version';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { withAuth } from "@/lib/auth/api-guard";
import { logger } from '@/lib/logger'

// GET /api/servers/[id]/deployments — list deployments with all fields needed by UI
// POST /api/servers/[id]/deployments — manually create a deployment snapshot

const createDeploymentSchema = z.object({
  changelog: z.string().optional(),
});

export const GET = withAuth(async (req, { params, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') ?? '20');
    const { id: serverId } = params;

    const server = await prisma.mcpServer.findFirst({
      where: { id: serverId, userId }
    });
    if (!server) {
      return apiNotFound('Server not found');
    }

    const deployments = await prisma.deployment.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, version: true, changelog: true, status: true,
        isLive: true, deployedAt: true, branchId: true, snapshot: true,
        createdAt: true,
        branch: { select: { name: true } },
      },
    });

    // Shape response to match what DeploymentsPage expects
    const shaped = deployments.map((d) => {
      const snap = safeParseJSON<{ stats?: { totalTools?: number }, tools?: any[] }>(d.snapshot, {});
      const toolCount: number = snap?.stats?.totalTools ?? snap?.tools?.length ?? 0;
      return {
        id: d.id,
        serverId,
        branchId: d.branchId,
        branchName: d.branch?.name ?? '',
        status: d.status,
        version: d.version,
        changelog: d.changelog,
        deployedAt: d.deployedAt,
        rolledBackAt: null,          // schema doesn't have this field; always null
        rollbackFrom: null,
        toolCount,
        createdAt: d.createdAt,
        snapshot: d.snapshot,
      };
    });

    return apiSuccess(shaped);
  } catch (error) {
    logger.error({ err: error }, '[API Error]');
    return apiServerError('Failed to list deployments');
  }
});
export const POST = withAuth(async (req, { params, userId }) => {
    try {
    const { id: serverId } = params;
    const body = await req.json().catch(() => ({}));
    const { changelog = 'Manual deployment' } = createDeploymentSchema.parse(body);

    const server = await prisma.mcpServer.findFirst({
      where: { id: serverId, userId }
    });
    if (!server) {
      return apiNotFound('Server not found');
    }

    const mainBranch = await prisma.branch.findFirst({
      where: { serverId, isDefault: true },
    });
    if (!mainBranch) {
      return apiNotFound('Main branch not found');
    }

    const lastDeployment = await prisma.deployment.findFirst({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
    });
    const nextVersion = incrementVersion(lastDeployment?.version ?? server.version);

    const allTools = await prisma.tool.findMany({
      where: { serverId, deletedAt: null }
    });
    const snapshot = {
      version: nextVersion,
      tools: allTools,
      serverId,
      serverName: server.name,
      snapshotAt: new Date().toISOString(),
      stats: { totalTools: allTools.length, added: 0, modified: 0, deleted: 0 },
    };

    const deployment = await prisma.$transaction(async (tx) => {
      // Supersede existing live deployment
      await tx.deployment.updateMany({
        where: { serverId, isLive: true },
        data: { isLive: false, status: 'superseded' },
      });

      const dep = await tx.deployment.create({
        data: {
          serverId,
          branchId: mainBranch.id,
          version: nextVersion,
          snapshot: JSON.stringify(snapshot),
          changelog,
          status: 'active',
          isLive: true,
        },
      });

      await tx.mcpServer.update({ where: { id: serverId }, data: { version: nextVersion } });
      return dep;
    });

    log({
      action: LOG_ACTIONS.DEPLOYMENT_CREATED,
      entityType: 'deployment', entityId: deployment.id, entityName: `v${nextVersion}`,
      serverId, deploymentId: deployment.id,
      meta: { version: nextVersion, changelog, toolCount: allTools.length },
      actorUserId: userId,
    });

    return apiSuccess({ id: deployment.id, version: nextVersion, toolCount: allTools.length }, 201);

  } catch (error: any) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues);
    }
    logger.error({ err: error }, '[API Error] POST /api/servers/[id]/deployments');
    return apiServerError('Failed to create deployment');
  }
});
