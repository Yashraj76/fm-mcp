---
description: # Workflow 3: Tool Execution Engine
---



## Overview
The execution engine maps MCP tool calls to FileMaker Data API operations. It is the core of the platform.

---

## Tool Schema (Prisma reference)
```prisma
model Tool {
  id           String   @id @default(cuid())
  name         String   // e.g. "search_customers"
  description  String
  inputSchema  String   // JSON Schema string
  handlerType  String   // "find"|"create"|"get"|"update"|"delete"|"list"|"script"
  handlerConfig String  // JSON: layout name, field mappings, script name, etc.
  enabled      Boolean  @default(true)
  category     String   @default("custom")
  serverId     String
  server       Server   @relation(fields: [serverId], references: [id])
  executions   Execution[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

---

## Handler Config Shapes (by handlerType)

### `find`
```json
{
  "connectionId": "conn_123",
  "layout": "Contacts",
  "fieldMappings": { "email": "Email", "name": "FullName" },
  "limit": 50
}
```

### `create`
```json
{
  "connectionId": "conn_123",
  "layout": "Contacts",
  "fieldMappings": { "email": "Email", "name": "FullName" }
}
```

### `get` / `update` / `delete`
```json
{
  "connectionId": "conn_123",
  "layout": "Contacts"
}
```

### `list`
```json
{
  "connectionId": "conn_123",
  "layout": "Contacts",
  "defaultLimit": 20
}
```

### `script`
```json
{
  "connectionId": "conn_123",
  "scriptName": "ProcessOrder"
}
```

---

## Execution Engine

**File**: `src/lib/filemaker/executor.ts`

```typescript
import { withFMSession } from './session';

export type HandlerType = 'find' | 'create' | 'get' | 'update' | 'delete' | 'list' | 'script';

interface ExecuteOptions {
  handlerType: HandlerType;
  handlerConfig: Record<string, any>;
  params: Record<string, any>;
}

export async function executeTool({ handlerType, handlerConfig, params }: ExecuteOptions) {
  const { connectionId } = handlerConfig;

  return withFMSession(connectionId, async (client) => {
    const headers = client.getAuthHeaders();
    const base = client.getBaseUrl();
    const agent = client.getAgent();
    const layout = encodeURIComponent(handlerConfig.layout ?? '');

    const fetchFM = (url: string, opts: RequestInit = {}) =>
      fetch(url, { ...opts, headers: { ...headers, ...(opts.headers ?? {}) }, agent } as any);

    switch (handlerType) {
      case 'find': {
        const query = buildFindQuery(params, handlerConfig.fieldMappings ?? {});
        const res = await fetchFM(`${base}/layouts/${layout}/_find`, {
          method: 'POST',
          body: JSON.stringify({ query, limit: handlerConfig.limit ?? 50 }),
        });
        return parseFMResponse(await res.json());
      }

      case 'create': {
        const fieldData = mapFields(params, handlerConfig.fieldMappings ?? {});
        const res = await fetchFM(`${base}/layouts/${layout}/records`, {
          method: 'POST',
          body: JSON.stringify({ fieldData }),
        });
        return parseFMResponse(await res.json());
      }

      case 'get': {
        const { recordId } = params;
        const res = await fetchFM(`${base}/layouts/${layout}/records/${recordId}`);
        return parseFMResponse(await res.json());
      }

      case 'update': {
        const { recordId, ...fields } = params;
        const fieldData = mapFields(fields, handlerConfig.fieldMappings ?? {});
        const res = await fetchFM(`${base}/layouts/${layout}/records/${recordId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fieldData }),
        });
        return parseFMResponse(await res.json());
      }

      case 'delete': {
        const { recordId } = params;
        const res = await fetchFM(`${base}/layouts/${layout}/records/${recordId}`, { method: 'DELETE' });
        return parseFMResponse(await res.json());
      }

      case 'list': {
        const limit = params.limit ?? handlerConfig.defaultLimit ?? 20;
        const offset = params.offset ?? 1;
        const res = await fetchFM(`${base}/layouts/${layout}/records?_limit=${limit}&_offset=${offset}`);
        return parseFMResponse(await res.json());
      }

      case 'script': {
        const scriptName = encodeURIComponent(handlerConfig.scriptName);
        const scriptParam = params.param ? `?script.param=${encodeURIComponent(params.param)}` : '';
        const res = await fetchFM(`${base}/_scripts/${scriptName}${scriptParam}`);
        return parseFMResponse(await res.json());
      }

      default:
        throw new Error(`Unknown handler type: ${handlerType}`);
    }
  });
}

// Map tool input params to FM field names
function mapFields(params: Record<string, any>, mappings: Record<string, string>) {
  const fieldData: Record<string, any> = {};
  for (const [paramKey, fmField] of Object.entries(mappings)) {
    if (params[paramKey] !== undefined) fieldData[fmField] = params[paramKey];
  }
  return fieldData;
}

// Build FM find query from params
function buildFindQuery(params: Record<string, any>, mappings: Record<string, string>) {
  const criterion: Record<string, string> = {};
  for (const [paramKey, fmField] of Object.entries(mappings)) {
    if (params[paramKey] !== undefined) criterion[fmField] = `*${params[paramKey]}*`;
  }
  return [criterion];
}

function parseFMResponse(json: any) {
  if (json.messages?.[0]?.code !== '0') {
    throw new FMError(json.messages?.[0]);
  }
  return json.response;
}

class FMError extends Error {
  code: string;
  constructor(msg: { code: string; message: string }) {
    super(msg?.message ?? 'FileMaker error');
    this.code = msg?.code ?? 'UNKNOWN';
  }
}
```

---

## Execute API Route

**File**: `src/app/api/tools/[id]/execute/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeTool } from '@/lib/filemaker/executor';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const tool = await prisma.tool.findUnique({ where: { id: params.id } });
  if (!tool) return NextResponse.json({ success: false, error: 'Tool not found' }, { status: 404 });
  if (!tool.enabled) return NextResponse.json({ success: false, error: 'Tool is disabled' }, { status: 400 });

  const inputParams = await req.json();
  const start = Date.now();

  try {
    const result = await executeTool({
      handlerType: tool.handlerType as any,
      handlerConfig: JSON.parse(tool.handlerConfig),
      params: inputParams,
    });

    const duration = Date.now() - start;

    await prisma.execution.create({
      data: {
        toolId: tool.id,
        inputParams: JSON.stringify(inputParams),
        result: JSON.stringify(result),
        status: 'success',
        duration,
      },
    });

    return NextResponse.json({ success: true, data: { result, duration, status: 'success' } });
  } catch (err: any) {
    const duration = Date.now() - start;

    await prisma.execution.create({
      data: {
        toolId: tool.id,
        inputParams: JSON.stringify(inputParams),
        result: null,
        error: err.message,
        status: 'error',
        duration,
      },
    });

    return NextResponse.json({ success: false, error: err.message, code: err.code ?? 'EXECUTION_ERROR', data: { duration } }, { status: 500 });
  }
}
```