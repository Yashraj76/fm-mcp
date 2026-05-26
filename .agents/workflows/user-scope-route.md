---
description: # Workflow 21: User-Scoped API Routes & Data Isolation
---

## Overview
Every API route must extract the authenticated user and filter all Prisma queries by `userId`. This ensures complete data isolation — no user can ever read or write another user's resources.

---

## Step 1: API Route Auth Guard Helper

**File**: `src/lib/auth/api-guard.ts`

```typescript
import { NextResponse } from 'next/server';
import { getUserFromRequest } from './get-user';

export type AuthedHandler = (
  req: Request,
  context: { params: Record<string, string>; userId: string }
) => Promise<Response>;

// Wraps a route handler with auth check
// Returns 401 if not authenticated, otherwise injects userId into context
export function withAuth(handler: AuthedHandler) {
  return async (req: Request, { params }: { params: Record<string, string> }) => {
    const { user, error } = await getUserFromRequest();

    if (!user || error) {
      return NextResponse.json(
        { success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    return handler(req, { params, userId: user.id });
  };
}
```

---

## Step 2: Updated API Routes — Pattern

Apply this pattern to EVERY API route. Below are the key ones — apply the same change to all others.

### Connections

**File**: `src/app/api/connections/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { encrypt } from '@/lib/crypto';
import { z } from 'zod';

const CreateConnectionSchema = z.object({ /* ... existing ... */ });

// GET — only returns this user's connections
export const GET = withAuth(async (req, { userId }) => {
  const connections = await prisma.connection.findMany({
    where: { userId },                    // ← scoped
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, host: true, port: true,
      database: true, username: true, sslVerify: true,
      authType: true, status: true, lastTestedAt: true,
      lastError: true, createdAt: true,
    },
  });
  return NextResponse.json({ success: true, data: connections });
});

// POST — creates connection owned by this user
export const POST = withAuth(async (req, { userId }) => {
  const body = CreateConnectionSchema.parse(await req.json());
  const connection = await prisma.connection.create({
    data: {
      ...body,
      passwordEncrypted: encrypt(body.password),
      userId,                              // ← stamp with user
    },
  });
  return NextResponse.json({ success: true, data: { id: connection.id } }, { status: 201 });
});
```

### Connections [id] route — ownership check

**File**: `src/app/api/connections/[id]/route.ts`

```typescript
export const GET = withAuth(async (req, { params, userId }) => {
  const conn = await prisma.connection.findFirst({
    where: {
      id: params.id,
      userId,              // ← must belong to this user
    },
  });
  if (!conn) {
    // Return 404 (not 403) — don't reveal that the resource exists
    return NextResponse.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: conn });
});

export const PUT = withAuth(async (req, { params, userId }) => {
  // Verify ownership before update
  const existing = await prisma.connection.findFirst({ where: { id: params.id, userId } });
  if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.connection.update({ where: { id: params.id }, data: body });
  return NextResponse.json({ success: true, data: { id: updated.id } });
});

export const DELETE = withAuth(async (req, { params, userId }) => {
  const existing = await prisma.connection.findFirst({ where: { id: params.id, userId } });
  if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  await prisma.connection.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, data: null });
});
```

### Servers

```typescript
export const GET = withAuth(async (req, { userId }) => {
  const servers = await prisma.server.findMany({
    where: { userId },
    include: { _count: { select: { tools: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ success: true, data: servers });
});

export const POST = withAuth(async (req, { userId }) => {
  const body = await req.json();
  const server = await prisma.server.create({
    data: { ...body, userId },
  });
  return NextResponse.json({ success: true, data: server }, { status: 201 });
});
```

### Tools

```typescript
export const GET = withAuth(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get('serverId');

  // If serverId given, verify user owns that server first
  if (serverId) {
    const server = await prisma.server.findFirst({ where: { id: serverId, userId } });
    if (!server) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  const tools = await prisma.tool.findMany({
    where: {
      server: { userId },    // ← join through Server to filter by userId
      ...(serverId ? { serverId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ success: true, data: tools });
});
```

### Logs

```typescript
export const GET = withAuth(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get('serverId');

  // Only return logs for servers owned by this user
  const userServerIds = await prisma.server.findMany({
    where: { userId },
    select: { id: true },
  }).then(servers => servers.map(s => s.id));

  const logs = await prisma.activityLog.findMany({
    where: {
      serverId: serverId
        ? (userServerIds.includes(serverId) ? serverId : 'NONE')
        : { in: userServerIds },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ success: true, data: logs });
});
```

---

## Step 3: Prisma Migration for userId

Add `userId` field to all user-owned models, then migrate:

```prisma
// In schema.prisma — add to each model:
model ServerConnection {
  id      String @id @default(cuid())
  userId  String                        // ← add this
  // ... existing fields
  @@index([userId])
}

model Connection {
  id      String @id @default(cuid())
  userId  String                        // ← add this
  // ... existing fields
  @@index([userId])
}

model Server {
  id      String @id @default(cuid())
  userId  String                        // ← add this
  // ... existing fields
  @@index([userId])
}

model PlaygroundSession {
  id      String @id @default(cuid())
  userId  String?                       // ← add this (nullable for backward compat)
  // ... existing fields
}

model AppSettings {
  id      String @id @default("singleton")
  userId  String?  // null = global default; non-null = user-specific override
  // ... existing fields
}
```

```bash
npx prisma migrate dev --name add_user_id
```

---

## Step 4: Ownership Check Helper

**File**: `src/lib/db/ownership.ts`

```typescript
import { prisma } from '../prisma';

// Returns true if the resource belongs to this user
export async function userOwns(
  model: 'connection' | 'server' | 'serverConnection',
  id: string,
  userId: string
): Promise<boolean> {
  let record: any = null;

  if (model === 'connection') {
    record = await prisma.connection.findFirst({ where: { id, userId }, select: { id: true } });
  } else if (model === 'server') {
    record = await prisma.server.findFirst({ where: { id, userId }, select: { id: true } });
  } else if (model === 'serverConnection') {
    record = await prisma.serverConnection.findFirst({ where: { id, userId }, select: { id: true } });
  }

  return !!record;
}

// Use in nested resource routes (e.g. /api/connections/[id]/browse-schema)
export async function requireOwnership(
  model: 'connection' | 'server' | 'serverConnection',
  id: string,
  userId: string
): Promise<void> {
  const owns = await userOwns(model, id, userId);
  if (!owns) throw new Error('NOT_FOUND'); // throw, not return — catch at route level
}
```

Usage in nested routes:
```typescript
export const POST = withAuth(async (req, { params, userId }) => {
  try {
    await requireOwnership('connection', params.id, userId);
  } catch {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  // ... rest of handler
});
```

---

## Step 5: Seeding userId on Tool Generation

Update `src/lib/tools/job-runner.ts` — when loading the server, ensure it belongs to the user:

```typescript
// The job runner runs in background (no request context) — store userId in the job
model ToolGenerationJob {
  // ... existing fields
  userId  String?   // ← add this
}

// When creating the job:
const job = await prisma.toolGenerationJob.create({
  data: { serverId: server.id, userId, status: 'pending' },
});
```

---

## Step 6: AppSettings Per-User

When reading app settings, check for user-specific settings first, then fall back to global:

```typescript
export async function getAppSettings(userId?: string) {
  if (userId) {
    const userSettings = await prisma.appSettings.findFirst({
      where: { userId },
    });
    if (userSettings) return userSettings;
  }
  // Fall back to global singleton
  return prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}
```

Settings routes should also use `withAuth` and save with `userId`:
```typescript
export const PUT = withAuth(async (req, { userId }) => {
  const body = await req.json();
  await prisma.appSettings.upsert({
    where: { userId },   // per-user settings row
    create: { userId, ...body },
    update: body,
  });
  return NextResponse.json({ success: true, data: { updated: true } });
});
```