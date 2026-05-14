---
description: # Workflow 15: Server Detail Screen — Connection Config UI
---

## Overview
The MCP Server detail screen needs a "Connect" section that shows all connection configs, API key management, and transport status. This is the UI a user interacts with after creating a server to get the credentials and configs needed to connect external clients.

---

## New API Route: Connection Status Check

**File**: `src/app/api/servers/[id]/connection-status/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const [server, apiKey] = await Promise.all([
    prisma.server.findUnique({
      where: { id: params.id },
      include: { tools: { where: { enabled: true }, select: { id: true } } },
    }),
    prisma.mcpApiKey.findUnique({ where: { serverId: params.id } }),
  ]);

  if (!server) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const isProd = process.env.NODE_ENV === 'production';
  const baseUrl = isProd
    ? (process.env.NEXT_PUBLIC_APP_URL ?? '')
    : 'http://localhost:3000';

  return NextResponse.json({
    success: true,
    data: {
      server: { id: server.id, name: server.name, enabledToolCount: server.tools.length },
      apiKey: apiKey
        ? { configured: true, prefix: apiKey.keyPrefix, lastUsedAt: apiKey.lastUsedAt }
        : { configured: false },
      endpoints: {
        streamableHttp: `${baseUrl}/api/mcp/${server.id}/mcp`,
        sse: `${baseUrl}/api/mcp/${server.id}/sse`,
        localStreamableHttp: `http://localhost:3000/api/mcp/${server.id}/mcp`,
        localSse: `http://localhost:3000/api/mcp/${server.id}/sse`,
      },
      transport: {
        streamableHttpAvailable: true,
        sseAvailable: !!process.env.REDIS_URL,
        sseMessage: process.env.REDIS_URL
          ? 'SSE ready (Redis connected)'
          : 'SSE unavailable — configure REDIS_URL to enable Claude Desktop support',
      },
    },
  });
}
```

---

## UI Sections on Server Detail Screen

The server detail screen (`/servers/[id]`) needs a new **"Connect"** tab with these sections:

### Section 1: Readiness Checklist
Show a checklist of prerequisites before connection configs are shown:
```
✓ Server created
✓ Connection linked
✓ Schema browsed and saved
✓ Relationships inferred
✓ Tools generated (12 tools)
✗ API key not generated  ← highlight in orange
```

### Section 2: API Key Management
```
[API Key]
Status: Not configured  (or "Configured — prefix: mcp_a1b2c3...")
Last used: 2 hours ago

[Generate API Key]  ← POST /api/servers/[id]/api-key
                        Shows key ONCE in a copy modal
[Rotate Key]        ← same endpoint, overwrites existing
[Revoke Key]        ← DELETE /api/servers/[id]/api-key
```

API key reveal modal (shown once after generation):
```
Your API Key (copy now — will not be shown again)
┌─────────────────────────────────────────────────┐
│ mcp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0 │
└─────────────────────────────────────────────────┘
[Copy to Clipboard]  [Done]
```

### Section 3: Transport Status
```
Transports
─────────────────────────────────────────────
Streamable HTTP    ✓ Available    (recommended)
SSE                ✗ Redis not configured
                   → Add REDIS_URL in Vercel to enable Claude Desktop
```

### Section 4: Connection Config Tabs

Four tabs, each with a copy button:

**Tab: Cursor / VS Code / ChatGPT**
```json
{
  "mcpServers": {
    "my-filemaker-server": {
      "url": "https://your-app.vercel.app/api/mcp/{serverId}/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

**Tab: Claude Desktop (SSE)**
```json
{
  "mcpServers": {
    "my-filemaker-server": {
      "url": "https://your-app.vercel.app/api/mcp/{serverId}/sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

**Tab: Claude Desktop (mcp-remote proxy)**
```json
{
  "mcpServers": {
    "my-filemaker-server": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-app.vercel.app/api/mcp/{serverId}/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

**Tab: Local Development**
```json
{
  "mcpServers": {
    "my-filemaker-server-local": {
      "url": "http://localhost:3000/api/mcp/{serverId}/mcp"
    }
  }
}
```

### Section 5: Test Connection Button
```
[Test Connection]  → GET /api/servers/[id]/test-mcp-endpoint
```

**File**: `src/app/api/servers/[id]/test-mcp-endpoint/route.ts`

```typescript
import { NextResponse } from 'next/server';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const baseUrl = process.env.NODE_ENV === 'production'
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'http://localhost:3000';

  const mcpUrl = `${baseUrl}/api/mcp/${params.id}/mcp`;

  try {
    // Send initialize request to own MCP endpoint
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1,
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'self-test', version: '1.0' },
        },
      }),
    });

    const json = await res.json();
    const toolsRes = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2, params: {} }),
    });
    const toolsJson = await toolsRes.json();

    return NextResponse.json({
      success: true,
      data: {
        endpoint: mcpUrl,
        protocolVersion: json.result?.protocolVersion,
        serverInfo: json.result?.serverInfo,
        toolCount: toolsJson.result?.tools?.length ?? 0,
        tools: (toolsJson.result?.tools ?? []).map((t: any) => t.name),
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: `Connection test failed: ${err.message}`,
      data: { endpoint: mcpUrl },
    }, { status: 500 });
  }
}
```

---

## Notes on the "Replace YOUR_API_KEY" Problem

The config JSON shown in the UI should auto-fill the API key when one is configured. In the frontend, after the user generates a key and copies it, store it in component state (not localStorage — security) so the config tabs can show the real key:

```typescript
// In the React component:
const [apiKey, setApiKey] = useState<string | null>(null);

// After generating key:
const key = response.data.key;
setApiKey(key);  // keep in memory only for this session

// In config templates:
const configJson = JSON.stringify({
  mcpServers: {
    [serverSlug]: {
      url: endpoints.streamableHttp,
      headers: { Authorization: `Bearer ${apiKey ?? 'YOUR_API_KEY'}` },
    },
  },
}, null, 2);
```

---

## Self-Test Flow Notes

The self-test (`/test-mcp-endpoint`) skips API key validation intentionally (it's calling itself from the server). Make sure `validateApiKey` skips auth when called from the same host, or pass an internal secret:

```typescript
// In validateApiKey:
if (token === process.env.INTERNAL_TEST_SECRET) return true;
```

Add `INTERNAL_TEST_SECRET` to env with a random UUID.