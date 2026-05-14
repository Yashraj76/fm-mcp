---
description: # Workflow 5: Deployments & Branches
---



## Overview
Deployments snapshot the current state of a server + all its tools. Branches enable Git-like feature development. Rollback restores a previous snapshot.

---

## Prisma Models (reference)
```prisma
model Deployment {
  id        String   @id @default(cuid())
  serverId  String
  server    Server   @relation(fields: [serverId], references: [id])
  version   String
  snapshot  String   // JSON: full server + tools state
  changelog String?
  status    String   @default("deployed") // "deployed" | "rolled_back"
  createdAt DateTime @default(now())
}

model Branch {
  id        String   @id @default(cuid())
  name      String
  serverId  String
  server    Server   @relation(fields: [serverId], references: [id])
  isDefault Boolean  @default(false)
  mergedAt  DateTime?
  createdAt DateTime @default(now())
}
```

---

## Deployment Routes

**File**: `src/app/api/deployments/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const CreateDeploymentSchema = z.object({
  serverId: z.string(),
  changelog: z.string().optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get('serverId');

  const deployments = await prisma.deployment.findMany({
    where: serverId ? { serverId } : undefined,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, serverId: true, version: true,
      changelog: true, status: true, createdAt: true,
    },
  });
  return NextResponse.json({ success: true, data: deployments });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { serverId, changelog } = CreateDeploymentSchema.parse(body);

  // Build snapshot of current server state
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { tools: true, connections: { select: { id: true, name: true } } },
  });
  if (!server) return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 });

  // Auto-increment version
  const lastDeployment = await prisma.deployment.findFirst({
    where: { serverId },
    orderBy: { createdAt: 'desc' },
  });
  const nextVersion = incrementVersion(lastDeployment?.version ?? server.version);

  const snapshot = JSON.stringify({
    server: { id: server.id, name: server.name, description: server.description, version: nextVersion },
    tools: server.tools,
    connections: server.connections,
    deployedAt: new Date().toISOString(),
  });

  const deployment = await prisma.deployment.create({
    data: { serverId, version: nextVersion, snapshot, changelog, status: 'deployed' },
  });

  // Update server version
  await prisma.server.update({ where: { id: serverId }, data: { version: nextVersion } });

  return NextResponse.json({ success: true, data: deployment }, { status: 201 });
}

function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  parts[2] = (parts[2] ?? 0) + 1;
  return parts.join('.');
}
```

---

## Rollback Route

**File**: `src/app/api/deployments/[id]/rollback/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const deployment = await prisma.deployment.findUnique({ where: { id: params.id } });
  if (!deployment) return NextResponse.json({ success: false, error: 'Deployment not found' }, { status: 404 });

  const snapshot = JSON.parse(deployment.snapshot);

  // Restore tools: delete current, re-create from snapshot
  await prisma.$transaction([
    prisma.tool.deleteMany({ where: { serverId: deployment.serverId } }),
    ...snapshot.tools.map((tool: any) =>
      prisma.tool.create({
        data: {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          handlerType: tool.handlerType,
          handlerConfig: tool.handlerConfig,
          enabled: tool.enabled,
          category: tool.category,
          serverId: deployment.serverId,
        },
      })
    ),
    prisma.server.update({
      where: { id: deployment.serverId },
      data: { version: snapshot.server.version },
    }),
    prisma.deployment.update({
      where: { id: params.id },
      data: { status: 'deployed' },
    }),
  ]);

  return NextResponse.json({ success: true, data: { restoredVersion: snapshot.server.version } });
}
```

---

## Branch Routes

**File**: `src/app/api/branches/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get('serverId');
  const branches = await prisma.branch.findMany({
    where: serverId ? { serverId } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ success: true, data: branches });
}

export async function POST(req: Request) {
  const { name, serverId } = await req.json();
  const branch = await prisma.branch.create({
    data: { name, serverId, isDefault: false },
  });
  return NextResponse.json({ success: true, data: branch }, { status: 201 });
}
```

**File**: `src/app/api/branches/[id]/merge/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Merge is a soft operation — mark branch as merged and trigger deployment
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const branch = await prisma.branch.findUnique({ where: { id: params.id } });
  if (!branch) return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });

  await prisma.branch.update({
    where: { id: params.id },
    data: { mergedAt: new Date() },
  });

  return NextResponse.json({ success: true, data: { merged: true, serverId: branch.serverId } });
}
```

---

## Deployment Status Lifecycle

```
[Current Tools State]
        ↓ POST /api/deployments
[Snapshot Created] → status: "deployed"
        ↓ POST /api/deployments/[id]/rollback
[Tools Restored] → old snapshot becomes active
```

## Notes
- Rollback is non-destructive to deployment records — it creates a new active state from old data
- Always run rollback inside a Prisma `$transaction` to ensure atomicity
- Snapshots store full tool definitions so rollback never needs to re-query FileMaker