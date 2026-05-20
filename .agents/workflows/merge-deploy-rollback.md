---
description: # Workflow 17: Branch Merge, Deployments & Rollback
---

## Overview
Merging applies branch changes to `main` and creates a versioned deployment snapshot. Rollback restores any past snapshot atomically. This is the version control backbone of the platform.

---

## Step 1: Merge Branch into Main

**File**: `src/app/api/branches/[id]/merge/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { incrementVersion } from '@/lib/utils/version';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { changelog } = await req.json();

  const branch = await prisma.branch.findUnique({
    where: { id: params.id },
    include: { server: true },
  });

  if (!branch) return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });
  if (branch.isDefault) return NextResponse.json({ success: false, error: 'Cannot merge main into itself' }, { status: 400 });
  if (branch.status !== 'active') return NextResponse.json({ success: false, error: `Branch is ${branch.status}` }, { status: 400 });

  // Load the main branch
  const mainBranch = await prisma.branch.findFirst({
    where: { serverId: branch.serverId, isDefault: true },
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
      if (override.enabled !== undefined) updateData.enabled = override.enabled;

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
    await tx.server.update({ where: { id: branch.serverId }, data: { version: nextVersion } });

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
}
```

---

## Step 2: Version Utility

**File**: `src/lib/utils/version.ts`

```typescript
// Increment semver patch (1.0.0 → 1.0.1)
export function incrementVersion(version: string): string {
  const parts = (version ?? '1.0.0').split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  parts[2] = (parts[2] ?? 0) + 1;
  return parts.join('.');
}

// Increment minor version (1.0.3 → 1.1.0) — for significant changes
export function incrementMinorVersion(version: string): string {
  const parts = (version ?? '1.0.0').split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  parts[1] = (parts[1] ?? 0) + 1;
  parts[2] = 0;
  return parts.join('.');
}
```

---

## Step 3: Deployment List & Detail

**File**: `src/app/api/servers/[id]/deployments/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '20');

  const deployments = await prisma.deployment.findMany({
    where: { serverId: params.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, version: true, changelog: true, status: true,
      isLive: true, deployedAt: true, branchId: true,
      branch: { select: { name: true } },
    },
  });

  return NextResponse.json({ success: true, data: deployments });
}
```

**File**: `src/app/api/deployments/[id]/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const dep = await prisma.deployment.findUnique({
    where: { id: params.id },
    include: { branch: { select: { name: true } }, server: { select: { name: true } } },
  });
  if (!dep) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const snapshot = safeParseJSON(dep.snapshot, {});
  return NextResponse.json({
    success: true,
    data: {
      id: dep.id, version: dep.version, changelog: dep.changelog,
      status: dep.status, isLive: dep.isLive, deployedAt: dep.deployedAt,
      server: dep.server, branch: dep.branch,
      snapshot: {
        toolCount: snapshot.tools?.length ?? 0,
        stats: snapshot.stats,
        snapshotAt: snapshot.snapshotAt,
        tools: (snapshot.tools ?? []).map((t: any) => ({
          name: t.name, description: t.description, category: t.category, enabled: t.enabled,
        })),
      },
    },
  });
}
```

---

## Step 4: Rollback

**File**: `src/app/api/deployments/[id]/rollback/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const targetDep = await prisma.deployment.findUnique({
    where: { id: params.id },
    include: { server: true },
  });
  if (!targetDep) return NextResponse.json({ success: false, error: 'Deployment not found' }, { status: 404 });
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
          handlerType: toolData.handlerType,
          handlerConfig: typeof toolData.handlerConfig === 'string'
            ? toolData.handlerConfig : JSON.stringify(toolData.handlerConfig),
          enabled: toolData.enabled,
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
      where: { id: params.id },
      data: { isLive: true, status: 'active' },
    });

    // 5. Update server version
    await tx.server.update({
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
}
```

---

## Deployment Timeline UI Data

**File**: `src/app/api/servers/[id]/deployments/timeline/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const [deployments, branches] = await Promise.all([
