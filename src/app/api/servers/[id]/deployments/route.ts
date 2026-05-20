import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { incrementVersion } from '@/lib/utils/version';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';

// GET /api/servers/[id]/deployments — list deployments with all fields needed by UI
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '20');
  const { id: serverId } = await params;

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
    const snap = safeParseJSON(d.snapshot, {} as any);
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
      configSnapshot: d.snapshot,  // alias snapshot → configSnapshot for UI
      branchSnapshot: d.snapshot,
    };
  });

  return NextResponse.json({ success: true, data: shaped });
}

// POST /api/servers/[id]/deployments — manually create a deployment snapshot
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: serverId } = await params;
    const body = await req.json().catch(() => ({}));
    const changelog: string = body.changelog || 'Manual deployment';

    const server = await prisma.mcpServer.findUnique({ where: { id: serverId } });
    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const mainBranch = await prisma.branch.findFirst({
      where: { serverId, isDefault: true },
    });
    if (!mainBranch) {
      return NextResponse.json({ success: false, error: 'Main branch not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const lastDeployment = await prisma.deployment.findFirst({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
    });
    const nextVersion = incrementVersion(lastDeployment?.version ?? server.version);

    const allTools = await prisma.tool.findMany({ where: { serverId } });
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
    });

    return NextResponse.json({
      success: true,
      data: { id: deployment.id, version: nextVersion, toolCount: allTools.length },
    }, { status: 201 });

  } catch (error: any) {
    console.error('[API Error] POST /api/servers/[id]/deployments', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create deployment', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
