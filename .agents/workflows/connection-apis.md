---
description: # Workflow 2: Connections CRUD API
---



## Overview
Implements full CRUD for FileMaker connections stored in SQLite via Prisma.

---

## Prisma Model (reference)
```prisma
model Connection {
  id                String   @id @default(cuid())
  name              String
  host              String
  port              Int      @default(443)
  database          String
  username          String
  passwordEncrypted String
  sslVerify         Boolean  @default(true)
  authType          String   @default("basic") // "basic" | "oauth" | "clarisId"
  status            String   @default("unknown") // "connected" | "error" | "unknown"
  lastTestedAt      DateTime?
  lastError         String?
  schemaCache       String?  // JSON blob
  schemaCachedAt    DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  servers           Server[] @relation("ServerConnections")
}
```

---

## Route: GET + POST `/api/connections`

**File**: `src/app/api/connections/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';
import { z } from 'zod';

const CreateConnectionSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().default(443),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  sslVerify: z.boolean().default(true),
  authType: z.enum(['basic', 'oauth', 'clarisId']).default('basic'),
});

export async function GET() {
  const connections = await prisma.connection.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, host: true, port: true,
      database: true, username: true, sslVerify: true,
      authType: true, status: true, lastTestedAt: true,
      lastError: true, createdAt: true,
      // NEVER return passwordEncrypted
    },
  });
  return NextResponse.json({ success: true, data: connections });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = CreateConnectionSchema.parse(body);

    const connection = await prisma.connection.create({
      data: {
        name: parsed.name,
        host: parsed.host,
        port: parsed.port,
        database: parsed.database,
        username: parsed.username,
        passwordEncrypted: encrypt(parsed.password),
        sslVerify: parsed.sslVerify,
        authType: parsed.authType,
      },
    });

    return NextResponse.json({ success: true, data: { id: connection.id, name: connection.name } }, { status: 201 });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return NextResponse.json({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: err.message, code: 'SERVER_ERROR' }, { status: 500 });
  }
}
```

---

## Route: GET, PUT, DELETE `/api/connections/[id]`

**File**: `src/app/api/connections/[id]/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const conn = await prisma.connection.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, host: true, port: true, database: true,
      username: true, sslVerify: true, authType: true, status: true,
      lastTestedAt: true, lastError: true, createdAt: true, updatedAt: true,
    },
  });
  if (!conn) return NextResponse.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ success: true, data: conn });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const updateData: any = { ...body };
    if (body.password) {
      updateData.passwordEncrypted = encrypt(body.password);
      delete updateData.password;
    }
    const updated = await prisma.connection.update({
      where: { id: params.id },
      data: updateData,
    });
    return NextResponse.json({ success: true, data: { id: updated.id } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.connection.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, data: null });
}
```

---

## Route: Schema Cache `/api/connections/[id]/schema`

**File**: `src/app/api/connections/[id]/schema/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withFMSession } from '@/lib/filemaker/session';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const conn = await prisma.connection.findUnique({ where: { id: params.id } });
  if (!conn) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  // Return cache if fresh
  if (conn.schemaCache && conn.schemaCachedAt) {
    const age = Date.now() - new Date(conn.schemaCachedAt).getTime();
    if (age < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, data: JSON.parse(conn.schemaCache), cached: true });
    }
  }

  // Refresh from FM
  const schema = await withFMSession(params.id, async (client) => {
    const headers = client.getAuthHeaders();
    const baseUrl = client.getBaseUrl();
    const agent = client.getAgent();

    const [layoutsRes, scriptsRes] = await Promise.all([
      fetch(`${baseUrl}/layouts`, { headers, agent } as any),
      fetch(`${baseUrl}/_scripts`, { headers, agent } as any),
    ]);

    const layouts = (await layoutsRes.json()).response?.layouts ?? [];
    const scripts = (await scriptsRes.json()).response?.scripts ?? [];

    return { layouts, scripts };
  });

  await prisma.connection.update({
    where: { id: params.id },
    data: { schemaCache: JSON.stringify(schema), schemaCachedAt: new Date() },
  });

  return NextResponse.json({ success: true, data: schema, cached: false });
}
```

---

## DB Helper

**File**: `src/lib/db/connections.ts`

```typescript
import { prisma } from '../prisma';

export async function getConnectionById(id: string) {
  const conn = await prisma.connection.findUnique({ where: { id } });
  if (!conn) throw new Error(`Connection ${id} not found`);
  return conn;
}
```