---
description: # Workflow 13: MCP Transport Route (Vercel + Localhost)
---

## Overview
Implements the actual MCP protocol endpoint using `mcp-handler`. Supports Streamable HTTP (primary) and SSE (legacy for Claude Desktop). Works identically on localhost and Vercel.

---

## Step 1: Install Packages

```bash
npm install mcp-handler @modelcontextprotocol/sdk zod
npm install @upstash/redis   # or: npm install ioredis
npm install bcryptjs
npm install @types/bcryptjs -D
```

---

## Step 2: The MCP Route Handler

**File**: `src/app/api/mcp/[serverId]/[transport]/route.ts`

```typescript
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { executeMultiStepTool } from '@/lib/filemaker/multi-executor';
import { executeSystemTool } from '@/lib/tools/system-executor';
import { validateApiKey } from '@/lib/mcp/api-key';

// Required: Node.js runtime only — never edge
export const runtime = 'nodejs';
export const maxDuration = 60; // seconds — increase to 300 on Vercel Pro for long FM queries

// Build handler for a specific server
async function buildServerHandler(serverId: string) {
  // Load all enabled tools for this server
  const tools = await prisma.tool.findMany({
    where: { serverId, enabled: true },
  });

  return createMcpHandler(
    (server) => {
      for (const tool of tools) {
        const inputSchema = safeParseJSON(tool.inputSchema, { type: 'object', properties: {} });
        const handlerConfig = safeParseJSON(tool.handlerConfig, {});

        // Convert JSON Schema to Zod schema for mcp-handler
        const zodSchema = buildZodSchema(inputSchema);

        server.tool(
          tool.name,
          tool.description,
          zodSchema,
          async (params) => {
            try {
              let result: any;

              if (tool.handlerType === 'system') {
                result = executeSystemTool(handlerConfig.operation, params);
              } else if (handlerConfig.steps?.length > 0) {
                result = await executeMultiStepTool(
                  handlerConfig.steps,
                  handlerConfig.connectionId,
                  params
                );
              } else {
                throw new Error(`Tool "${tool.name}" has no valid handler configuration`);
              }

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                  },
                ],
              };
            } catch (err: any) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ error: err.message, tool: tool.name }),
                  },
                ],
                isError: true,
              };
            }
          }
        );
      }
    },
    {
      // MCP Server metadata
      name: `filemaker-mcp-${serverId}`,
      version: '1.0.0',
    },
    {
      basePath: `/api/mcp/${serverId}`,
      streamableHttpEndpoint: '/mcp',
      sseEndpoint: '/sse',
      sseMessageEndpoint: '/message',
      redisUrl: process.env.REDIS_URL,   // undefined = SSE disabled gracefully
      maxDuration: 60,
      verboseLogs: process.env.NODE_ENV === 'development',
    }
  );
}

// ─── Route Exports ─────────────────────────────────────────────────────────

async function routeHandler(
  req: NextRequest,
  { params }: { params: { serverId: string; transport: string } }
) {
  const { serverId } = params;

  // 1. Validate server exists
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    return new Response(JSON.stringify({ error: 'MCP server not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // 2. Validate API key (skip for OPTIONS preflight)
  if (req.method !== 'OPTIONS') {
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    const valid = await validateApiKey(serverId, token);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid or missing API key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
  }

  // 3. Build and run handler
  const handler = await buildServerHandler(serverId);
  const response = await handler(req);

  // 4. Add CORS headers to response
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => newHeaders.set(k, v));

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  });
}

export const GET = routeHandler;
export const POST = routeHandler;
export const DELETE = routeHandler;

// OPTIONS for CORS preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  };
}

// Convert JSON Schema properties to Zod object schema for mcp-handler
function buildZodSchema(jsonSchema: any): Record<string, z.ZodTypeAny> {
  const props = jsonSchema?.properties ?? {};
  const required: string[] = jsonSchema?.required ?? [];
  const zodFields: Record<string, z.ZodTypeAny> = {};

  for (const [key, def] of Object.entries(props as Record<string, any>)) {
    let field: z.ZodTypeAny;

    switch (def.type) {
      case 'number':
      case 'integer':
        field = z.number().describe(def.description ?? '');
        break;
      case 'boolean':
        field = z.boolean().describe(def.description ?? '');
        break;
      case 'array':
        field = z.array(
          def.items?.type === 'number' ? z.number() : z.string()
        ).describe(def.description ?? '');
        break;
      case 'object':
        field = z.record(z.unknown()).describe(def.description ?? '');
        break;
      default:
        field = z.string().describe(def.description ?? '');
    }

    // Make optional if not in required array
    if (!required.includes(key)) {
      field = field.optional();
    }

    zodFields[key] = field;
  }

  return zodFields;
}
```

---

## Step 3: API Key Management

**File**: `src/lib/mcp/api-key.ts`

```typescript
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';

export function generateApiKey(): { key: string; prefix: string } {
  const raw = 'mcp_' + crypto.randomUUID().replace(/-/g, '');
  return {
    key: raw,
    prefix: raw.substring(0, 12),   // shown in UI: "mcp_a1b2c3d4"
  };
}

export async function createApiKey(serverId: string): Promise<string> {
  const { key, prefix } = generateApiKey();
  const keyHash = await bcrypt.hash(key, 10);

  await prisma.mcpApiKey.upsert({
    where: { serverId },
    create: { serverId, keyHash, keyPrefix: prefix },
    update: { keyHash, keyPrefix: prefix },
  });

  return key;  // returned ONCE — never stored in plain text
}

export async function validateApiKey(serverId: string, token: string): Promise<boolean> {
  if (!token) return false;

  const record = await prisma.mcpApiKey.findUnique({ where: { serverId } });
  if (!record) return false;

  const valid = await bcrypt.compare(token, record.keyHash);

  if (valid) {
    // Update last used timestamp (don't await — non-blocking)
    prisma.mcpApiKey.update({
      where: { serverId },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});
  }

  return valid;
}
```

**API Routes for Key Management**:

**File**: `src/app/api/servers/[id]/api-key/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createApiKey } from '@/lib/mcp/api-key';

// GET: show prefix + last used (never the actual key)
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const keyRecord = await prisma.mcpApiKey.findUnique({ where: { serverId: params.id } });
  return NextResponse.json({
    success: true,
    data: keyRecord
      ? { hasKey: true, prefix: keyRecord.keyPrefix, lastUsedAt: keyRecord.lastUsedAt }
      : { hasKey: false },
  });
}

// POST: generate a new key (rotates if one exists)
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const server = await prisma.server.findUnique({ where: { id: params.id } });
  if (!server) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const key = await createApiKey(params.id);

  // Return the raw key ONCE — user must copy it now
  return NextResponse.json({
    success: true,
    data: {
      key,
      warning: 'Copy this key now. It will not be shown again.',
    },
  });
}

// DELETE: revoke key
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.mcpApiKey.deleteMany({ where: { serverId: params.id } });
  return NextResponse.json({ success: true, data: { revoked: true } });
}
```

---

## Step 4: Updated Config Generator

**File**: `src/app/api/servers/[id]/config/route.ts` (replace existing)

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const server = await prisma.server.findUnique({
    where: { id: params.id },
    include: {
      tools: { where: { enabled: true }, select: { name: true, description: true } },
      apiKey: { select: { keyPrefix: true, lastUsedAt: true } },
    },
  });
  if (!server) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const isProd = process.env.NODE_ENV === 'production';
  const baseUrl = isProd
    ? (process.env.NEXT_PUBLIC_APP_URL ?? 'https://YOUR_VERCEL_URL.vercel.app')
    : 'http://localhost:3000';

  const serverName = server.name.toLowerCase().replace(/\s+/g, '-');
  const mcpBase = `${baseUrl}/api/mcp/${server.id}`;

  const config = {
    serverInfo: {
      name: server.name,
      id: server.id,
      toolCount: server.tools.length,
      hasApiKey: !!server.apiKey,
      apiKeyPrefix: server.apiKey?.keyPrefix ?? null,
    },

    // Streamable HTTP (preferred — works with Cursor, VS Code, ChatGPT, Claude.ai)
    streamableHttp: {
      url: `${mcpBase}/mcp`,
      description: 'Streamable HTTP transport. Use with Cursor, VS Code Copilot, ChatGPT, Claude.ai.',
      cursorConfig: {
        mcpServers: {
          [serverName]: {
            url: `${mcpBase}/mcp`,
            headers: { Authorization: 'Bearer YOUR_API_KEY' },
          },
        },
      },
      claudeDesktopNote: 'Claude Desktop does not yet support Streamable HTTP. Use the SSE config below.',
    },

    // SSE (legacy — required for Claude Desktop)
    sse: {
      url: `${mcpBase}/sse`,
      description: 'SSE transport. Use with Claude Desktop. Requires Redis.',
      requiresRedis: true,
      claudeDesktopConfig: {
        mcpServers: {
          [serverName]: {
            url: `${mcpBase}/sse`,
            headers: { Authorization: 'Bearer YOUR_API_KEY' },
          },
        },
      },
    },

    // mcp-remote proxy (allows stdio clients to use your remote server)
    mcpRemoteProxy: {
      description: 'Use mcp-remote to proxy Streamable HTTP over stdio for any client.',
      install: 'npm install -g mcp-remote',
      claudeDesktopConfig: {
        mcpServers: {
          [serverName]: {
            command: 'npx',
            args: [
              'mcp-remote',
              `${mcpBase}/mcp`,
              '--header',
         