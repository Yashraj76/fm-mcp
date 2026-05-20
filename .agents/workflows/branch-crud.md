---
description: # Workflow 16: Branch CRUD & Tool Isolation
---

## Overview
Branches give teams isolated environments to build and test tools without affecting the live `main` branch. This workflow implements creating, forking, editing tools on a branch, and the diff view.

---

## Step 1: Auto-create `main` on Server Creation

**Update**: `src/app/api/servers/route.ts` — POST handler, after server creation:

```typescript
// Always create main branch on server creation
const mainBranch = await prisma.branch.create({
  data: {
    name: 'main',
    serverId: server.id,
    isDefault: true,
    isProtected: true,
    description: 'Production branch — always live',
    status: 'active',
  },
});

await log({
  action: LOG_ACTIONS.BRANCH_CREATED,
  entityType: 'branch', entityId: mainBranch.id, entityName: 'main',
  serverId: server.id,
  meta: { isDefault: true, isProtected: true },
});
```

---

## Step 2: Branch List & Create

**File**: `src/app/api/servers/[id]/branches/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { z } from 'zod';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const branches = await prisma.branch.findMany({
    where: { serverId: params.id },
    include: {
      _count: { select: { tools: true, deployments: true } },
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ success: true, data: branches });
}

const CreateBranchSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9\-\/]+$/, 'Lowercase letters, numbers, hyphens, slashes only'),
  description: z.string().optional(),
  fromBranchId: z.string().optional(), // fork from this branch; defaults to main
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = CreateBranchSchema.parse(await req.json());

  // Find source branch (default: main)
  const sourceBranch = body.fromBranchId
    ? await prisma.branch.findUnique({ where: { id: body.fromBranchId } })
    : await prisma.branch.findFirst({ where: { serverId: params.id, isDefault: true } });

  if (!sourceBranch) {
    return NextResponse.json({ success: false, error: 'Source branch not found' }, { status: 404 });
  }

  // Prevent duplicate branch names on same server
  const existing = await prisma.branch.findUnique({
    where: { serverId_name: { serverId: params.id, name: body.name } },
  });
  if (existing) {
    return NextResponse.json({ success: false, error: `Branch "${body.name}" already exists` }, { status: 409 });
  }

  // Create branch
  const branch = await prisma.branch.create({
    data: {
      name: body.name,
      serverId: params.id,
      description: body.description,
      isDefault: false,
      isProtected: false,
      status: 'active',
    },
  });

  // Fork all tools from source branch as "inherited"
  const sourceTools = await getEffectiveTools(sourceBranch.id);
  if (sourceTools.length > 0) {
    await prisma.branchTool.createMany({
      data: sourceTools.map(tool => ({
        branchId: branch.id,
        toolId: tool.id,
        action: 'inherited',
      })),
    });
  }

  await log({
    action: LOG_ACTIONS.BRANCH_CREATED,
    entityType: 'branch', entityId: branch.id, entityName: branch.name,
    serverId: params.id,
    meta: { forkedFrom: sourceBranch.name, toolCount: sourceTools.length },
  });

  return NextResponse.json({ success: true, data: branch }, { status: 201 });
}

// Get all "effective" tools visible on a branch
// (inherited tools that haven't been deleted, plus added tools)
async function getEffectiveTools(branchId: string) {
  const branchTools = await prisma.branchTool.findMany({
    where: { branchId, action: { not: 'deleted' } },
    include: { tool: true },
  });
  return branchTools.map(bt => bt.tool);
}
```

---

## Step 3: Branch Tool Operations

**File**: `src/app/api/branches/[id]/tools/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';

// GET: effective tool list for this branch
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const branchTools = await prisma.branchTool.findMany({
    where: { branchId: params.id, action: { not: 'deleted' } },
    include: { tool: true },
    orderBy: { createdAt: 'asc' },
  });

  // Merge override data into tool records
  const tools = branchTools.map(bt => {
    const base = bt.tool;
    const override = safeParseJSON(bt.overrideData, {});
    return {
      ...base,
      ...override,
      _branchAction: bt.action,        // "inherited" | "modified" | "added"
      _branchToolId: bt.id,
    };
  });

  return NextResponse.json({ success: true, data: tools });
}

// POST: add a new tool to this branch only
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const branch = await prisma.branch.findUnique({ where: { id: params.id } });
  if (!branch) return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });

  const body = await req.json();

  // Create the base tool record (linked to server, not branch directly)
  const tool = await prisma.tool.create({
    data: {
      name: body.name,
      description: body.description,
      inputSchema: JSON.stringify(body.inputSchema),
      handlerType: body.handlerType,
      handlerConfig: JSON.stringify(body.handlerConfig),
      enabled: body.enabled ?? true,
      category: body.category ?? 'custom',
      serverId: branch.serverId,
    },
  });

  // Add to this branch as "added"
  await prisma.branchTool.create({
    data: { branchId: params.id, toolId: tool.id, action: 'added' },
  });

  await log({
    action: LOG_ACTIONS.TOOL_CREATED,
    entityType: 'tool', entityId: tool.id, entityName: tool.name,
    serverId: branch.serverId, branchId: params.id,
    after: JSON.stringify({ name: tool.name, handlerType: tool.handlerType }),
    meta: { branch: branch.name, addedOnBranch: true },
  });

  return NextResponse.json({ success: true, data: tool }, { status: 201 });
}
```

**File**: `src/app/api/branches/[id]/tools/[toolId]/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, LOG_ACTIONS } from '@/lib/logging/logger';
import { safeParseJSON } from '@/lib/utils/safe-parse';

// PUT: override a tool on this branch (non-destructive — doesn't touch main)
export async function PUT(
  req: Request,
  { params }: { params: { id: string; toolId: string } }
) {
  const branch = await prisma.branch.findUnique({ where: { id: params.id } });
  if (!branch) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const tool = await prisma.tool.findUnique({ where: { id: params.toolId } });
  if (!tool) return NextResponse.json({ success: false, error: 'Tool not found' }, { status: 404 });

  const beforeData = {
    name: tool.name, description: tool.description,
    handlerType: tool.handlerType, enabled: tool.enabled,
  };

  // Store override as JSON — doesn't mutate the base tool
  const overrideData = {
    ...(body.name && { name: body.name }),
    ...(body.description && { description: body.description }),
    ...(body.inputSchema && { inputSchema: JSON.stringify(body.inputSchema) }),
    ...(body.handlerConfig && { handlerConfig: JSON.stringify(body.handlerConfig) }),
    ...(body.enabled !== undefined && { enabled: body.enabled }),
  };

  await prisma.branchTool.upsert({
    where: { branchId_toolId: { branchId: params.id, toolId: params.toolId } },
    create: {
      branchId: params.id,
      toolId: params.toolId,
      action: 'modified',
      overrideData: JSON.stringify(overrideData),
    },
    update: {
      action: 'modified',
      overrideData: JSON.stringify(overrideData),
    },
  });

  await log({
    action: LOG_ACTIONS.TOOL_UPDATED,
    entityType: 'tool', entityId: tool.id, entityName: tool.name,
    serverId: branch.serverId, branchId: params.id,
    before: JSON.stringify(beforeData),
    after: JSON.stringify(overrideData),
    meta: { branch: branch.name, overrideOnly: true },
  });

  return NextResponse.json({ success: true, data: { toolId: params.toolId, branch: branch.name } });
}

// DELETE: mark tool as deleted on this branch (doesn't delete from main)
export async function DELETE(
  _: Request,
  { params }: { params: { id: string; toolId: string } }
) {
  const branch = await prisma.branch.findUnique({ where: { id: params.id } });
  if (branch?.isDefault) {
    return NextResponse.json(
      { success: false, error: 'Use DELETE /api/tools/[id] to delete tools from main' },
      { status: 400 }
    );
  }

  const tool = await prisma.tool.findUnique({ where: { id: params.toolId } });

  await prisma.branchTool.upsert({
    where: { branchId_toolId: { branchId: params.id, toolId: params.toolId } },
    create: { branchId: params.id, toolId: params.toolId, action: 'deleted' },
    update: { action: 'deleted' },
  });

  await log({
    action: LOG_ACTIONS.TOOL_DELETED,
    entityType: 'tool', entityId: params.toolId, entityName: tool?.name ?? params.toolId,
    serverId: branch?.serverId, branchId: params.id,
    meta: { branch: branch?.name, softDeleteOnBranch: true },
  });

  return NextResponse.json({ success: true, data: { deleted: true, fromBranchOnly: true } });
}
```

---

## Step 4: Branch Diff

**File**: `src/app/api/branches/[id]/diff/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const branch = await prisma.branch.findUnique({
    where: { id: params.id },
    include: { server: true },
  });
  if (!branch || branch.isDefault) {
    return NextResponse.json({ success: false, error: 'Cannot diff main against itself' }, { status: 400 });
  }

  // Get main branch tools
  const mainBranch = await prisma.branch.findFirst({
    where: { serverId: branch.serverId, isDefault: true },
  });
  const mainBranchTools = await prisma.branchTool.findMany({
    where: { branchId: mainBranch!.id },
    include: { tool: true },
  });

  // Get this branch's changes
  const branchChanges = await prisma.branchTool.findMany({
    where: { branchId: params.id },
    include: { tool: true },
  });

  const diff = {
    branch: { id: branch.id, name: branch.name },
    base: { id: mainBranch!.id, name: 'main' },
    added: [] as any[],
    modified: [] as any[],
    deleted: [] as any[],
    inherited: [] as any[],
    summary: { added: 0, modified: 0, deleted: 0, unchanged: 0 },
  };

  for (const change of branchChanges) {
    const override = safeParseJSON(change.overrideData, {});
    const entry = {
      toolId: change.toolId,
      name: override.name ?? change.tool.name,
      originalName: change.tool.name,
      action: change.action,
      overrides: Object.keys(override),
    };

    if (change.action === 'added') { diff.added.push(entry); diff.summary.added++; }
    else if (change.action === 'modified') { diff.modified.push(entry); diff.summary.modified++; }
    else if (change.action === 'deleted') { diff.deleted.push(entry); diff.summary.deleted++; }
    else { diff.inherited.push(entry); diff.summary.unchanged++; }
  }

  return NextResponse.json({ success: true, data: diff });
}
```