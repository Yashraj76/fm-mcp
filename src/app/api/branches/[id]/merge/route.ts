import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { incrementVersion } from '@/lib/utils/version';
import { withAuth } from "@/lib/auth/api-guard";
export const POST = withAuth(async (req, { params, userId }) => {
    const { changelog } = await req.json();

    const branch = await prisma.branch.findFirst({
      where: {
        id: params.id,
        server: { userId }
      },
      include: { server: true },
    });

    if (!branch) return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });
    if (branch.isDefault) return NextResponse.json({ success: false, error: 'Cannot merge main into itself' }, { status: 400 });
    if (branch.status !== 'active') return NextResponse.json({ success: false, error: `Branch is ${branch.status}` }, { status: 400 });

    // Load the main branch
    const mainBranch = await prisma.branch.findFirst({
      where: {
        serverId: branch.serverId,
        isDefault: true
      },
    });
    if (!mainBranch) throw new Error('Main branch not found');

    // Load all branch changes
    const branchChanges = await prisma.branchTool.findMany({
      where: { branchId: params.id },
      include: { tool: true },
    });

    const changesByAction = {
      added: branchChanges.filter(c => c.action === 'added'),
      modified: branchChanges.filter(c => c.action === 'modified'),
      deleted: branchChanges.filter(c => c.action === 'deleted'),
    };

    // Determine next version
    const lastDeployment = await prisma.deployment.findFirst({
      where: { serverId: branch.serverId },
      orderBy: { createdAt: 'desc' },
    });
    const nextVersion = incrementVersion(lastDeployment?.version ?? branch.server.version);

    // Execute merge in a transaction
    const result = await prisma.$transaction(async (tx) => {

    // 1. Apply ADDED tools — give them "inherited" status on main
    for (const change of changesByAction.added) {
      await tx.branchTool.upsert({
        where: { branchId_toolId: { branchId: mainBranch.id, toolId: change.toolId } },
        create: { branchId: mainBranch.id, toolId: change.toolId, action: 'inherited' },
        update: { action: 'inherited' },
      });
    }

    // 2. Apply MODIFIED tools — write override data into the actual Tool record on main
    for (const change of changesByAction.modified) {
      const override = safeParseJSON(change.overrideData, {});
      const updateData: any = {};
      if (override.name) updateData.name = override.name;
      if (override.description) updateData.description = override.description;
      if (override.inputSchema) updateData.inputSchema = override.inputSchema;
      if (override.handlerConfig) updateData.handlerConfig = override.handlerConfig;
      if (override.enabled !== undefined) updateData.isEnabled = override.enabled;

      if (Object.keys(updateData).length > 0) {
        await tx.tool.update({ where: { id: change.toolId }, data: updateData });
      }
    }

    // 3. Apply DELETED tools — actually delete them from main
    for (const change of changesByAction.deleted) {
      await tx.branchTool.deleteMany({ where: { branchId: mainBranch.id, toolId: change.toolId } });
      await tx.tool.delete({ where: { id: change.toolId } });
    }

    // 4. Mark branch as merged
    await tx.branch.update({
      where: { id: params.id },
      data: { status: 'merged', mergedAt: new Date(), mergedIntoId: mainBranch.id },
    });

    // 5. Update server version
    await tx.mcpServer.update({ where: { id: branch.serverId }, data: { version: nextVersion } });

    // 6. Mark all previous deployments as superseded
    await tx.deployment.updateMany({
      where: { serverId: branch.serverId, isLive: true },
      data: { isLive: false, status: 'superseded' },
    });

    // 7. Create deployment snapshot
    const allTools = await tx.tool.findMany({ where: { serverId: branch.serverId } });
    const snapshot = {
      version: nextVersion,
      mergedFrom: branch.name,
      tools: allTools,
      serverId: branch.serverId,
      serverName: branch.server.name,
      snapshotAt: new Date().toISOString(),
      stats: {
        totalTools: allTools.length,
        added: changesByAction.added.length,
        modified: changesByAction.modified.length,
        deleted: changesByAction.deleted.length,
      },
    };

    const deployment = await tx.deployment.create({
      data: {
        serverId: branch.serverId,
        branchId: mainBranch.id,
        version: nextVersion,
        snapshot: JSON.stringify(snapshot),
        changelog: changelog ?? `Merged ${branch.name} → main`,
        status: 'active',
        isLive: true,
      },
    });

    return { deployment, snapshot, nextVersion };
    });

    await log({
    action: LOG_ACTIONS.BRANCH_MERGED,
    entityType: 'branch', entityId: branch.id, entityName: branch.name,
    serverId: branch.serverId, branchId: mainBranch.id, deploymentId: result.deployment.id,
    meta: {
      mergedInto: 'main',
      version: result.nextVersion,
      toolsAdded: changesByAction.added.length,
      toolsModified: changesByAction.modified.length,
      toolsDeleted: changesByAction.deleted.length,
    },
    });

    await log({
    action: LOG_ACTIONS.DEPLOYMENT_CREATED,
    entityType: 'deployment', entityId: result.deployment.id, entityName: `v${result.nextVersion}`,
    serverId: branch.serverId, deploymentId: result.deployment.id,
    meta: { version: result.nextVersion, mergedFrom: branch.name, changelog },
    });

    return NextResponse.json({
    success: true,
    data: {
      deployment: { id: result.deployment.id, version: result.nextVersion },
      stats: result.snapshot.stats,
    },
    });
    });
