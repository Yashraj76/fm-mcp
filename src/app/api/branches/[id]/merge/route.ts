import { z, ZodError } from 'zod';
import { apiSuccess, apiNotFound, apiError, apiServerError, apiValidationFailed } from '@/lib/utils/api-response';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { incrementVersion } from '@/lib/utils/version';
import { withAuth } from "@/lib/auth/api-guard";
import { validateModifiedOverrides } from '@/lib/merge/validate-override-data';
import { logger } from '@/lib/logger'

const mergeSchema = z.object({
  changelog: z.string().optional(),
});

// Sentinel error classes thrown from inside the $transaction so the outer
// catch block can map them to the correct HTTP status without inspecting
// error messages (which Prisma may wrap in its own error types).
class MergeConflictError extends Error {
  constructor(status: string) {
    super(`Branch is already ${status}`);
    this.name = 'MergeConflictError';
  }
}
class MergeBranchGoneError extends Error {
  constructor() {
    super('Branch disappeared inside transaction');
    this.name = 'MergeBranchGoneError';
  }
}

export const POST = withAuth(async (req, { params, userId }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { changelog } = mergeSchema.parse(body);

    // ── Pre-transaction: ownership and invariant checks ─────────────────────
    // We do NOT check branch.status here. The only authoritative status check
    // is the one that runs after acquiring the row-level lock inside the
    // transaction, which serializes concurrent merges of the same branch.
    const branchMeta = await prisma.branch.findFirst({
      where: { id: params.id, server: { userId } },
      include: { server: true },
    });
    if (!branchMeta) return apiNotFound('Branch not found');
    if (branchMeta.isDefault) {
      return apiError('Cannot merge main into itself', 'VALIDATION_ERROR', 400);
    }

    const mainBranch = await prisma.branch.findFirst({
      where: { serverId: branchMeta.serverId, isDefault: true },
    });
    if (!mainBranch) return apiNotFound('Main branch not found');

    const branchChanges = await prisma.branchTool.findMany({
      where: { branchId: params.id },
      include: { tool: true },
    });

    const changesByAction = {
      added:    branchChanges.filter(c => c.action === 'added'),
      modified: branchChanges.filter(c => c.action === 'modified'),
      deleted:  branchChanges.filter(c => c.action === 'deleted'),
    };

    // ── Pre-transaction: validate all modified-tool overrideData ────────────
    // If any entry has corrupt JSON, abort before touching the DB so the branch
    // is never marked merged with silently dropped tool changes.
    const overrideValidation = validateModifiedOverrides(changesByAction.modified);
    if (!overrideValidation.ok) {
      return apiError(
        'One or more modified tools have corrupt override data and cannot be merged',
        'CORRUPT_OVERRIDE_DATA',
        422,
        overrideValidation.corrupt,
      );
    }

    // ── Serialized transaction with row-level lock ──────────────────────────
    //
    // How the lock prevents the race:
    //   Request A and Request B arrive simultaneously for the same branch.
    //   A acquires FOR UPDATE on the Branch row first. B blocks at the same
    //   SELECT … FOR UPDATE call. When A commits (status → 'merged'), B
    //   unblocks, reads status = 'merged', and throws MergeConflictError → 409.
    //   Only one Deployment with isLive=true is created per merge.
    //
    const result = await prisma.$transaction(async (tx) => {

      // ── 0. Acquire the lock; re-read status inside the transaction ─────────
      const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM "Branch" WHERE id = ${params.id} FOR UPDATE
      `;
      if (locked.length === 0) throw new MergeBranchGoneError();
      if (locked[0].status !== 'active') {
        throw new MergeConflictError(locked[0].status);
      }

      // ── 1. Compute the next version from the current live deployment ───────
      // Doing this inside the transaction ensures the version is monotonic even
      // when merges race on different branches of the same server.
      const liveDeployment = await tx.deployment.findFirst({
        where: { serverId: branchMeta.serverId, isLive: true },
        orderBy: { createdAt: 'desc' },
        select: { version: true },
      });
      const nextVersion = incrementVersion(
        liveDeployment?.version ?? branchMeta.server.version
      );

      // ── 2. Apply ADDED tools ────────────────────────────────────────────────
      for (const change of changesByAction.added) {
        await tx.branchTool.upsert({
          where: { branchId_toolId: { branchId: mainBranch.id, toolId: change.toolId } },
          create: { branchId: mainBranch.id, toolId: change.toolId, action: 'inherited' },
          update: { action: 'inherited' },
        });
        // Clear deletedAt so a previously soft-deleted tool that was re-added
        // on this branch becomes visible again after merge.
        await tx.tool.update({
          where: { id: change.toolId },
          data: { deletedAt: null },
        });
      }

      // ── 3. Apply MODIFIED tools ─────────────────────────────────────────────
      for (const change of changesByAction.modified) {
        const override = safeParseJSON<Record<string, any>>(change.overrideData, {});
        const updateData: Record<string, unknown> = {};
        if (override.name)                    updateData.name         = override.name;
        if (override.description)             updateData.description  = override.description;
        if (override.inputSchema)             updateData.inputSchema  = override.inputSchema;
        if (override.handlerConfig)           updateData.handlerConfig = override.handlerConfig;
        if (override.enabled !== undefined)   updateData.isEnabled    = override.enabled;

        if (Object.keys(updateData).length > 0) {
          await tx.tool.update({ where: { id: change.toolId }, data: updateData });
        }
      }

      // ── 4. Apply DELETED tools ──────────────────────────────────────────────
      for (const change of changesByAction.deleted) {
        await tx.branchTool.deleteMany({
          where: { branchId: mainBranch.id, toolId: change.toolId },
        });
        await tx.tool.update({
          where: { id: change.toolId },
          data: { deletedAt: new Date() },
        });
      }

      // ── 5. Mark branch as merged ────────────────────────────────────────────
      await tx.branch.update({
        where: { id: params.id },
        data: { status: 'merged', mergedAt: new Date(), mergedIntoId: mainBranch.id },
      });

      // ── 6. Bump server version ──────────────────────────────────────────────
      await tx.mcpServer.update({
        where: { id: branchMeta.serverId },
        data: { version: nextVersion },
      });

      // ── 7. Supersede existing live deployments ──────────────────────────────
      await tx.deployment.updateMany({
        where: { serverId: branchMeta.serverId, isLive: true },
        data: { isLive: false, status: 'superseded' },
      });

      // ── 8. Create the new deployment snapshot ──────────────────────────────
      // Because the row lock serializes merges, at most one Deployment with
      // isLive=true can be created for a given server per merge operation.
      const allTools = await tx.tool.findMany({
        where: { serverId: branchMeta.serverId, deletedAt: null },
      });

      const snapshot = {
        version: nextVersion,
        mergedFrom: branchMeta.name,
        tools: allTools,
        serverId: branchMeta.serverId,
        serverName: branchMeta.server.name,
        snapshotAt: new Date().toISOString(),
        stats: {
          totalTools:     allTools.length,
          added:          changesByAction.added.length,
          modified:       changesByAction.modified.length,
          deleted:        changesByAction.deleted.length,
        },
      };

      const deployment = await tx.deployment.create({
        data: {
          serverId:  branchMeta.serverId,
          branchId:  mainBranch.id,
          version:   nextVersion,
          snapshot:  JSON.stringify(snapshot),
          changelog: changelog ?? `Merged ${branchMeta.name} → main`,
          status:    'active',
          isLive:    true,
        },
      });

      return { deployment, snapshot, nextVersion };
    });

    await log({
      action: LOG_ACTIONS.BRANCH_MERGED,
      entityType: 'branch', entityId: branchMeta.id, entityName: branchMeta.name,
      serverId: branchMeta.serverId, branchId: mainBranch.id, deploymentId: result.deployment.id,
      meta: {
        mergedInto:    'main',
        version:       result.nextVersion,
        toolsAdded:    changesByAction.added.length,
        toolsModified: changesByAction.modified.length,
        toolsDeleted:  changesByAction.deleted.length,
      },
      actorUserId: userId,
    });

    await log({
      action: LOG_ACTIONS.DEPLOYMENT_CREATED,
      entityType: 'deployment', entityId: result.deployment.id, entityName: `v${result.nextVersion}`,
      serverId: branchMeta.serverId, deploymentId: result.deployment.id,
      meta: { version: result.nextVersion, mergedFrom: branchMeta.name, changelog },
      actorUserId: userId,
    });

    return apiSuccess({
      deployment: { id: result.deployment.id, version: result.nextVersion },
      stats: result.snapshot.stats,
    });

  } catch (error) {
    if (error instanceof ZodError)           return apiValidationFailed(error.issues);
    if (error instanceof MergeConflictError) return apiError(error.message, 'CONFLICT', 409);
    if (error instanceof MergeBranchGoneError) return apiNotFound('Branch not found');
    logger.error({ err: error }, '[API Error]');
    return apiServerError('Failed to merge branch');
  }
});
