import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { withAuth } from "@/lib/auth/api-guard";
export const POST = withAuth(async (_, { params, userId }) => {
    const targetDep = await prisma.deployment.findFirst({
      where: {
        id: (await params).id,
        server: { userId }
      },
      include: { server: true },
    });
    if (!targetDep || targetDep.server.userId !== userId) {
      return NextResponse.json({ success: false, error: 'Deployment not found' }, { status: 404 });
    }
    if (targetDep.isLive) return NextResponse.json({ success: false, error: 'Already the live deployment' }, { status: 400 });

    const snapshot = safeParseJSON(targetDep.snapshot, { tools: [] });
    const mainBranch = await prisma.branch.findFirst({
      where: { serverId: targetDep.serverId, isDefault: true },
    });

    await prisma.$transaction(async (tx) => {
    // 1. Delete ALL current tools on main
    await tx.branchTool.deleteMany({ where: { branchId: mainBranch!.id } });
    await tx.tool.deleteMany({ where: { serverId: targetDep.serverId } });

    // 2. Recreate tools from snapshot
    for (const toolData of snapshot.tools ?? []) {
      const newTool = await tx.tool.create({
        data: {
          name: toolData.name,
          description: toolData.description,
          inputSchema: typeof toolData.inputSchema === 'string'
            ? toolData.inputSchema : JSON.stringify(toolData.inputSchema),
          handlerConfig: typeof toolData.handlerConfig === 'string'
            ? toolData.handlerConfig : JSON.stringify(toolData.handlerConfig),
          isEnabled: toolData.isEnabled ?? toolData.enabled,
          category: toolData.category,
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
    });

    return NextResponse.json({
    success: true,
    data: { rolledBackTo: targetDep.version, toolCount: snapshot.tools?.length ?? 0 },
    });
    });
