---
description: # Workflow 4: MCP Server & Tool CRUD
---



## Overview
Servers are containers for tools. Tools define what AI agents can do with FileMaker data.

---

## Prisma Models (reference)
```prisma
model Server {
  id          String   @id @default(cuid())
  name        String
  description String?
  version     String   @default("1.0.0")
  tools       Tool[]
  connections Connection[] @relation("ServerConnections")
  deployments Deployment[]
  branches    Branch[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Tool {
  id            String   @id @default(cuid())
  name          String
  description   String
  inputSchema   String   // JSON Schema
  handlerType   String
  handlerConfig String   // JSON
  enabled       Boolean  @default(true)
  category      String   @default("custom")
  serverId      String
  server        Server   @relation(fields: [serverId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

---

## Server Routes

**File**: `src/app/api/servers/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const CreateServerSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  connectionIds: z.array(z.string()).optional(),
});

export async function GET() {
  const servers = await prisma.server.findMany({
    include: { _count: { select: { tools: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ success: true, data: servers });
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateServerSchema.parse(body);

  const server = await prisma.server.create({
    data: {
      name: parsed.name,
      description: parsed.description,
      version: parsed.version,
      connections: parsed.connectionIds
        ? { connect: parsed.connectionIds.map((id) => ({ id })) }
        : undefined,
    },
  });

  // Auto-create a default "main" branch
  await prisma.branch.create({
    data: { name: 'main', serverId: server.id, isDefault: true },
  });

  return NextResponse.json({ success: true, data: server }, { status: 201 });
}
```

**File**: `src/app/api/servers/[id]/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const server = await prisma.server.findUnique({
    where: { id: params.id },
    include: { tools: true, connections: { select: { id: true, name: true, status: true } } },
  });
  if (!server) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: server });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const updated = await prisma.server.update({ where: { id: params.id }, data: body });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.server.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, data: null });
}
```

---

## MCP Config Generation

**File**: `src/app/api/servers/[id]/config/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const server = await prisma.server.findUnique({
    where: { id: params.id },
    include: { tools: { where: { enabled: true } } },
  });
  if (!server) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const mcpConfig = {
    mcpServers: {
      [server.name.toLowerCase().replace(/\s+/g, '-')]: {
        command: 'node',
        args: [`/path/to/mcp-proxy`, `--server-id`, server.id],
        env: { SERVER_ID: server.id, API_BASE: process.env.NEXTAUTH_URL ?? 'http://localhost:3000' },
      },
    },
  };

  return NextResponse.json({ success: true, data: mcpConfig });
}
```

---

## Tool Routes

**File**: `src/app/api/tools/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const CreateToolSchema = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'snake_case only'),
  description: z.string().min(1),
  inputSchema: z.record(z.any()),
  handlerType: z.enum(['find', 'create', 'get', 'update', 'delete', 'list', 'script']),
  handlerConfig: z.record(z.any()),
  enabled: z.boolean().default(true),
  category: z.string().default('custom'),
  serverId: z.string(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get('serverId');
  const enabled = searchParams.get('enabled');

  const tools = await prisma.tool.findMany({
    where: {
      ...(serverId ? { serverId } : {}),
      ...(enabled !== null ? { enabled: enabled === 'true' } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ success: true, data: tools });
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateToolSchema.parse(body);

  const tool = await prisma.tool.create({
    data: {
      ...parsed,
      inputSchema: JSON.stringify(parsed.inputSchema),
      handlerConfig: JSON.stringify(parsed.handlerConfig),
    },
  });
  return NextResponse.json({ success: true, data: tool }, { status: 201 });
}
```

**File**: `src/app/api/tools/[id]/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const tool = await prisma.tool.findUnique({ where: { id: params.id } });
  if (!tool) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: tool });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: any = { ...body };
  if (body.inputSchema) data.inputSchema = JSON.stringify(body.inputSchema);
  if (body.handlerConfig) data.handlerConfig = JSON.stringify(body.handlerConfig);
  const updated = await prisma.tool.update({ where: { id: params.id }, data });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.tool.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, data: null });
}
```

---

## AI Suggest Tool (Bonus)

**File**: `src/app/api/tools/suggest/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Given a schema (layouts + scripts), suggest tool definitions
export async function POST(req: Request) {
  const { connectionId, serverId } = await req.json();
  const conn = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!conn?.schemaCache) return NextResponse.json({ success: false, error: 'No schema cache' }, { status: 400 });

  const schema = JSON.parse(conn.schemaCache);
  const suggestions = schema.layouts.map((layout: any) => ({
    name: `search_${layout.name.toLowerCase().replace(/\s+/g, '_')}`,
    description: `Search records in the ${layout.name} layout`,
    handlerType: 'find',
    handlerConfig: { connectionId, layout: layout.name, fieldMappings: {} },
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
    },
    serverId,
    category: 'generated',
  }));

  return NextResponse.json({ success: true, data: suggestions });
}
```