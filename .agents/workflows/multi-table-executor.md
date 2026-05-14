---
description: # Workflow 6: Multi-Table Tool Execution Engine
---

## Overview
Extends the base executor to handle tools with multiple steps — sequential FM Data API calls and OData queries with `$filter`, `$expand`, and `$batch`.

---

## Step Definition Types

A tool's `handlerConfig.steps` array drives execution. Each step has:
```typescript
interface ToolStep {
  stepIndex: number;
  api: 'data-api' | 'odata';
  operation: 'find' | 'create' | 'update' | 'delete' | 'list' | 'script' | 'odata-get' | 'odata-batch';
  layout?: string;           // data-api only
  table?: string;            // odata only
  fieldMappings?: Record<string, string>;
  filterExpression?: string; // odata $filter template, uses {param} interpolation
  expandTables?: string[];   // odata $expand
  selectFields?: string[];   // odata $select
  top?: number;              // odata $top
  extractField?: string;     // field to extract from this step's result
  useExtractedAs?: string;   // param name to carry to next step
  scriptName?: string;       // for script operations
}
```

---

## Multi-Step Executor

**File**: `src/lib/filemaker/multi-executor.ts`

```typescript
import { withFMSession } from './session';
import { FileMakerClient } from './client';
import { prisma } from '../prisma';
import { decrypt } from '../crypto';
import https from 'https';

export async function executeMultiStepTool(
  steps: ToolStep[],
  connectionId: string,
  inputParams: Record<string, any>
): Promise<any> {
  const conn = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error('Connection not found');

  // Carry context between steps
  const context: Record<string, any> = { ...inputParams };
  let lastResult: any = null;

  // Group steps by API type to share FM session
  for (const step of steps.sort((a, b) => a.stepIndex - b.stepIndex)) {
    if (step.api === 'data-api') {
      lastResult = await executeFMStep(step, conn, context);
    } else if (step.api === 'odata') {
      lastResult = await executeODataStep(step, conn, context);
    }

    // Extract value from result and inject into context for next step
    if (step.extractField && lastResult) {
      const records = lastResult.data ?? lastResult.value ?? [];
      const firstRecord = Array.isArray(records) ? records[0] : records;
      const extracted = firstRecord?.fieldData?.[step.extractField]
        ?? firstRecord?.[step.extractField];

      if (extracted !== undefined && step.useExtractedAs) {
        context[step.useExtractedAs] = extracted;
      }
    }
  }

  return lastResult;
}

// ─── FM Data API Step ────────────────────────────────────────────────────────

async function executeFMStep(step: ToolStep, conn: any, context: Record<string, any>) {
  const client = new FileMakerClient({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    password: decrypt(conn.passwordEncrypted),
    sslVerify: conn.sslVerify,
  });

  await client.login();
  try {
    const headers = client.getAuthHeaders();
    const base = client.getBaseUrl();
    const agent = client.getAgent();
    const layout = encodeURIComponent(step.layout!);

    const fetchFM = (url: string, opts: any = {}) =>
      fetch(url, { ...opts, headers: { ...headers, ...opts.headers }, agent });

    switch (step.operation) {
      case 'find': {
        // Build query from fieldMappings + context
        // Supports AND (single criterion object) and OR (multiple criterion objects)
        const query = buildFindQuery(context, step.fieldMappings ?? {});
        const res = await fetchFM(`${base}/layouts/${layout}/_find`, {
          method: 'POST',
          body: JSON.stringify({ query, limit: context.limit ?? 50, offset: context.offset ?? 1 }),
        });
        return assertFMOk(await res.json());
      }

      case 'create': {
        const fieldData = mapFields(context, step.fieldMappings ?? {});
        const res = await fetchFM(`${base}/layouts/${layout}/records`, {
          method: 'POST',
          body: JSON.stringify({ fieldData }),
        });
        return assertFMOk(await res.json());
      }

      case 'update': {
        const { recordId, ...rest } = context;
        const fieldData = mapFields(rest, step.fieldMappings ?? {});
        const res = await fetchFM(`${base}/layouts/${layout}/records/${recordId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fieldData }),
        });
        return assertFMOk(await res.json());
      }

      case 'delete': {
        const res = await fetchFM(`${base}/layouts/${layout}/records/${context.recordId}`, { method: 'DELETE' });
        return assertFMOk(await res.json());
      }

      case 'list': {
        const res = await fetchFM(`${base}/layouts/${layout}/records?_limit=${context.limit ?? 20}&_offset=${context.offset ?? 1}`);
        return assertFMOk(await res.json());
      }

      case 'script': {
        const scriptName = encodeURIComponent(step.scriptName!);
        const param = context.param ? `?script.param=${encodeURIComponent(context.param)}` : '';
        const res = await fetchFM(`${base}/_scripts/${scriptName}${param}`);
        return assertFMOk(await res.json());
      }
    }
  } finally {
    await client.logout();
  }
}

// ─── OData Step ──────────────────────────────────────────────────────────────

async function executeODataStep(step: ToolStep, conn: any, context: Record<string, any>) {
  const odataBase = `https://${conn.host}:${conn.port}/fmi/odata/v4/${encodeURIComponent(conn.database)}`;
  const agent = new https.Agent({ rejectUnauthorized: conn.sslVerify });
  const credentials = Buffer.from(`${conn.username}:${decrypt(conn.passwordEncrypted)}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${credentials}`,
    'Accept': 'application/json',
    'OData-Version': '4.0',
  };

  if (step.operation === 'odata-get') {
    const params = buildODataParams(step, context);
    const url = `${odataBase}/${encodeURIComponent(step.table!)}${params}`;
    const res = await fetch(url, { headers, agent } as any);
    if (!res.ok) throw new Error(`OData error ${res.status}: ${await res.text()}`);
    return await res.json();
  }

  if (step.operation === 'odata-batch') {
    // See WORKFLOW_07 for batch implementation
    throw new Error('Use odata-batch executor for batch operations');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildODataParams(step: ToolStep, context: Record<string, any>): string {
  const parts: string[] = [];

  // Interpolate {param} placeholders in filterExpression
  if (step.filterExpression) {
    let filter = step.filterExpression;
    for (const [key, value] of Object.entries(context)) {
      filter = filter.replace(`{${key}}`, typeof value === 'string' ? `'${value}'` : String(value));
    }
    parts.push(`$filter=${encodeURIComponent(filter)}`);
  }

  if (step.expandTables?.length) {
    parts.push(`$expand=${step.expandTables.map(encodeURIComponent).join(',')}`);
  }

  if (step.selectFields?.length) {
    parts.push(`$select=${step.selectFields.join(',')}`);
  }

  if (step.top ?? context.limit) {
    parts.push(`$top=${step.top ?? context.limit}`);
  }

  return parts.length ? `?${parts.join('&')}` : '';
}

function buildFindQuery(context: Record<string, any>, mappings: Record<string, string>) {
  // AND condition: single criterion object
  // OR condition: push multiple criterion objects into the array
  const criterion: Record<string, string> = {};
  for (const [paramKey, fmField] of Object.entries(mappings)) {
    if (context[paramKey] !== undefined && context[paramKey] !== null && context[paramKey] !== '') {
      criterion[fmField] = `*${context[paramKey]}*`;
    }
  }
  return Object.keys(criterion).length > 0 ? [criterion] : [{}]; // empty = find all
}

function mapFields(context: Record<string, any>, mappings: Record<string, string>) {
  const fieldData: Record<string, any> = {};
  for (const [paramKey, fmField] of Object.entries(mappings)) {
    if (context[paramKey] !== undefined) fieldData[fmField] = context[paramKey];
  }
  return fieldData;
}

function assertFMOk(json: any) {
  if (json?.messages?.[0]?.code !== '0') {
    throw new Error(`FM Error ${json?.messages?.[0]?.code}: ${json?.messages?.[0]?.message}`);
  }
  return json.response;
}
```

---

## Updated Execute Route (supports multi-step)

**File**: `src/app/api/tools/[id]/execute/route.ts` (update)

```typescript
import { executeMultiStepTool } from '@/lib/filemaker/multi-executor';
import { executeTool } from '@/lib/filemaker/executor'; // original single-step

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const tool = await prisma.tool.findUnique({ where: { id: params.id } });
  if (!tool || !tool.enabled) return errorResponse('Tool not found or disabled', 404);

  const inputParams = await req.json();
  const config = JSON.parse(tool.handlerConfig);
  const start = Date.now();

  try {
    let result;

    if (config.steps && config.steps.length > 0) {
      // Multi-step execution path
      result = await executeMultiStepTool(config.steps, config.connectionId, inputParams);
    } else {
      // Legacy single-step path
      result = await executeTool({ handlerType: tool.handlerType, handlerConfig: config, params: inputParams });
    }

    // ... save execution, return result
  } catch (err: any) {
    // ... save failed execution, return error
  }
}
```

---

## AND vs OR in FM Data API

```typescript
// AND — all conditions in one criterion object
const query = [{ "Email": "*john*", "Status": "Active" }];

// OR — multiple criterion objects in the array
const query = [
  { "Email": "*john@example.com*" },
  { "Phone": "*555-1234*" }
];

// Complex: (Email contains X AND Status=Active) OR (Name contains X)
const query = [
  { "Email": "*john*", "Status": "Active" },
  { "Name": "*john*" }
];
```

POST body:
```json
{
  "query": [ ...criterion objects... ],
  "limit": 50,
  "offset": 1
}
```