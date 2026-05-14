---
description: # Workflow 8: Auto-Tool Generation on Server Creation
---

## Overview
When a new MCP server is created with a connection, the platform calls the AI agent (using the PROMPT_tool_autogenerate.md system prompt) to generate tools automatically. This workflow wires that flow into the API.

---

## Trigger Points
1. User clicks "Create Server" → POST `/api/servers` with `connectionIds`
2. User clicks "AI Suggest" on the Tools page → POST `/api/tools/suggest`
3. User manually triggers → POST `/api/servers/[id]/generate-tools`

---

## Route: Auto-Generate on Server Create

**File**: `src/app/api/servers/route.ts` (update POST handler)

```typescript
import { generateToolsForServer } from '@/lib/tools/generator';

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateServerSchema.parse(body);

  const server = await prisma.server.create({
    data: {
      name: parsed.name,
      description: parsed.description,
      version: parsed.version,
      connections: parsed.connectionIds
        ? { connect: parsed.connectionIds.map((id: string) => ({ id })) }
        : undefined,
    },
    include: { connections: true },
  });

  await prisma.branch.create({
    data: { name: 'main', serverId: server.id, isDefault: true },
  });

  // Auto-generate tools if we have connections and a description
  if (parsed.connectionIds?.length && parsed.description) {
    // Run async — don't block the server creation response
    generateToolsForServer(server.id, parsed.connectionIds[0]).catch(err =>
      console.error('[AutoGenerate] Failed:', err.message)
    );
  }

  return NextResponse.json({ success: true, data: server }, { status: 201 });
}
```

---

## Tool Generator Service

**File**: `src/lib/tools/generator.ts`

```typescript
import { prisma } from '../prisma';

const TOOL_GENERATOR_SYSTEM_PROMPT = `
  [paste full contents of PROMPT_tool_autogenerate.md here at build time]
  Or load from file: readFileSync('prompts/tool_autogenerate.md', 'utf-8')
`;

export async function generateToolsForServer(
  serverId: string,
  connectionId: string
): Promise<void> {
  const [server, conn] = await Promise.all([
    prisma.server.findUnique({ where: { id: serverId } }),
    prisma.connection.findUnique({ where: { id: connectionId } }),
  ]);

  if (!server || !conn) throw new Error('Server or connection not found');

  // Get cached schema — must be pre-fetched or fetched now
  let schema = conn.schemaCache ? JSON.parse(conn.schemaCache) : null;
  if (!schema) {
    // Trigger schema fetch via internal API
    const res = await fetch(`${process.env.NEXTAUTH_URL}/api/connections/${connectionId}/schema`);
    const data = await res.json();
    schema = data.data;
  }

  const inputPayload = {
    serverName: server.name,
    serverDescription: server.description ?? '',
    schema,
    connectionId,
  };

  // Call Anthropic API (or your existing AI agent)
  const aiResponse = await callAIAgent(inputPayload);

  // Parse the JSON array from AI response
  const toolDefinitions = parseToolDefinitions(aiResponse);

  // Save all tools to DB
  await Promise.all(
    toolDefinitions.map((tool: any) =>
      prisma.tool.create({
        data: {
          name: tool.name,
          description: tool.description,
          inputSchema: JSON.stringify(tool.inputSchema),
          handlerType: mapStrategyToHandlerType(tool.executionStrategy),
          handlerConfig: JSON.stringify({
            connectionId,
            steps: tool.handlerConfig.steps,
          }),
          enabled: tool.enabled ?? true,
          category: tool.category ?? 'generated',
          serverId,
        },
      })
    )
  );

  console.log(`[AutoGenerate] Created ${toolDefinitions.length} tools for server ${serverId}`);
}

async function callAIAgent(payload: any): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: TOOL_GENERATOR_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate MCP tools for this server:\n\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    }),
  });

  const data = await res.json();
  return data.content?.[0]?.text ?? '[]';
}

function parseToolDefinitions(aiText: string): any[] {
  // Strip any markdown code fences if model adds them
  const clean = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('[AutoGenerate] Failed to parse tool JSON:', aiText.substring(0, 200));
    return [];
  }
}

function mapStrategyToHandlerType(strategy: string): string {
  const map: Record<string, string> = {
    'fm-find': 'find',
    'fm-create': 'create',
    'fm-update': 'update',
    'fm-delete': 'delete',
    'fm-list': 'list',
    'fm-script': 'script',
    'odata-filter': 'odata',
    'odata-expand': 'odata',
    'odata-batch': 'odata-batch',
    'sequential-multi-table': 'multi-step',
  };
  return map[strategy] ?? 'multi-step';
}
```

---

## Route: Manual Re-Generate

**File**: `src/app/api/servers/[id]/generate-tools/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateToolsForServer } from '@/lib/tools/generator';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { connectionId, replaceExisting } = body;

  if (replaceExisting) {
    await prisma.tool.deleteMany({
      where: { serverId: params.id, category: 'generated' },
    });
  }

  await generateToolsForServer(params.id, connectionId);

  const tools = await prisma.tool.findMany({ where: { serverId: params.id } });
  return NextResponse.json({ success: true, data: { toolsGenerated: tools.length } });
}
```

---

## Generation Flow Diagram

```
POST /api/servers
    └─> Create Server in DB
    └─> Create "main" branch
    └─> [async] generateToolsForServer()
            └─> Fetch server + connection from DB
            └─> GET schema from cache or /api/connections/[id]/schema
            └─> Build input payload { serverName, description, schema, connectionId }
            └─> POST to Anthropic API with TOOL_GENERATOR_SYSTEM_PROMPT
            └─> Parse JSON array from response
            └─> prisma.tool.create() × N tools
            └─> Log completion
```

---

## Environment Variables Needed
```
ANTHROPIC_API_KEY=sk-ant-...
NEXTAUTH_URL=http://localhost:3000
```

---

## Notes
- Generation runs async so it doesn't block the server creation response
- Frontend should poll `GET /api/tools?serverId=xxx` every 2 seconds after server creation to show tools appearing
- If schema has no relationships, only CRUD tools are generated
- Re-generation with `replaceExisting: true` only removes `category: 'generated'` tools — preserves manually created tools