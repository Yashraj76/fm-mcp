---
description: # Workflow 7: OData Execution — $filter, $expand, $batch
---

## Overview
Implements OData-specific query strategies for multi-table and complex filter scenarios. OData auth uses Basic Auth (not FM token sessions), operates on tables directly (not layouts), and supports rich query options.

---

## OData Base URL
```
https://{host}:{port}/fmi/odata/v4/{database}
```
Note: OData uses `v4` always. FM Data API uses `v1`.

---

## OData Auth (Basic — different from FM Data API)
```typescript
const credentials = Buffer.from(`${username}:${password}`).toString('base64');
headers: {
  'Authorization': `Basic ${credentials}`,  // NOT Bearer
  'Accept': 'application/json',
  'OData-Version': '4.0',
}
```

---

## Strategy 1: OData `$filter` with AND / OR

### AND condition
```
GET /fmi/odata/v4/MyDB/Customers?$filter=Status eq 'Active' and City eq 'New York'
```

### OR condition
```
GET /fmi/odata/v4/MyDB/Customers?$filter=Status eq 'Active' or Status eq 'Pending'
```

### Contains (like `*value*` in FM find)
```
GET /fmi/odata/v4/MyDB/Customers?$filter=contains(Name,'John')
```

### Starts with
```
GET /fmi/odata/v4/MyDB/Customers?$filter=startswith(Email,'admin')
```

### Complex (AND + OR grouped)
```
GET /fmi/odata/v4/MyDB/Orders?$filter=(Status eq 'Open' or Status eq 'Pending') and TotalAmount gt 1000
```

### Field names with spaces
```
GET /fmi/odata/v4/MyDB/Orders?$filter="Order Date" gt 2024-01-01T00:00:00Z
```
Enclose in double-quotes.

---

## Strategy 2: OData `$expand` (join related table in one call)

```
GET /fmi/odata/v4/MyDB/Customers?$filter=Email eq 'john@example.com'&$expand=Orders
```
Returns customers with inline expanded Orders array.

### Nested expand with filter
```
GET /fmi/odata/v4/MyDB/Customers?$expand=Orders($filter=Status eq 'Open')
```

### Expand + select specific fields
```
GET /fmi/odata/v4/MyDB/Customers?$expand=Orders($select=OrderID,TotalAmount,Status)&$select=CustomerID,Name,Email
```

**Requirement**: The relationship must exist in FileMaker as a defined relationship. OData exposes FM relationships as navigation properties automatically.

---

## Strategy 3: OData `$batch` (multiple operations in one HTTP call)

Use when a tool needs to write to multiple tables atomically, e.g., create an order AND update customer LastOrderDate.

**File**: `src/lib/filemaker/odata-batch.ts`

```typescript
import https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { decrypt } from '../crypto';

interface BatchOperation {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  table: string;
  body?: Record<string, any>;
  recordId?: string | number;
}

export async function executeODataBatch(
  operations: BatchOperation[],
  conn: any
): Promise<any[]> {
  const odataBase = `https://${conn.host}:${conn.port}/fmi/odata/v4/${encodeURIComponent(conn.database)}`;
  const agent = new https.Agent({ rejectUnauthorized: conn.sslVerify });
  const credentials = Buffer.from(`${conn.username}:${decrypt(conn.passwordEncrypted)}`).toString('base64');

  const boundary = `batch_${uuidv4().replace(/-/g, '')}`;
  const changesetBoundary = `changeset_${uuidv4().replace(/-/g, '')}`;

  // Build multipart body
  let body = '';
  const writes = operations.filter(op => op.method !== 'GET');
  const reads = operations.filter(op => op.method === 'GET');

  // Add GET reads (outside changeset)
  for (const op of reads) {
    body += `--${boundary}\r\n`;
    body += `Content-Type: application/http\r\n\r\n`;
    body += `GET ${odataBase}/${op.table} HTTP/1.1\r\n\r\n`;
  }

  // Add writes inside a changeset (atomic)
  if (writes.length > 0) {
    body += `--${boundary}\r\n`;
    body += `Content-Type: multipart/mixed; boundary=${changesetBoundary}\r\n\r\n`;

    for (let i = 0; i < writes.length; i++) {
      const op = writes[i];
      const url = op.recordId
        ? `${odataBase}/${op.table}(${op.recordId})`
        : `${odataBase}/${op.table}`;

      body += `--${changesetBoundary}\r\n`;
      body += `Content-Type: application/http\r\n`;
      body += `Content-ID: ${i + 1}\r\n\r\n`;
      body += `${op.method} ${url} HTTP/1.1\r\n`;

      if (op.body) {
        const jsonBody = JSON.stringify(op.body);
        body += `Content-Type: application/json\r\n`;
        body += `Content-Length: ${jsonBody.length}\r\n\r\n`;
        body += `${jsonBody}\r\n`;
      } else {
        body += `\r\n`;
      }
    }

    body += `--${changesetBoundary}--\r\n`;
  }

  body += `--${boundary}--`;

  const res = await fetch(`${odataBase}/$batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
      'OData-Version': '4.0',
      'Accept': 'application/json',
    },
    body,
    agent,
  } as any);

  if (!res.ok) throw new Error(`OData batch failed: ${res.status} ${await res.text()}`);

  // Parse multipart response
  const responseText = await res.text();
  return parseMultipartResponse(responseText);
}

function parseMultipartResponse(text: string): any[] {
  // Extract JSON payloads from multipart response
  const jsonBlocks = text.match(/\{[\s\S]*?\}/g) ?? [];
  return jsonBlocks.map(block => {
    try { return JSON.parse(block); } catch { return block; }
  });
}
```

---

## OData Helper — URL Builder

**File**: `src/lib/filemaker/odata-url.ts`

```typescript
export function buildODataUrl(
  base: string,
  table: string,
  options: {
    filter?: string;
    expand?: string[];
    select?: string[];
    top?: number;
    skip?: number;
    orderby?: string;
    count?: boolean;
  },
  context: Record<string, any> = {}
): string {
  const params: string[] = [];

  if (options.filter) {
    // Interpolate {param} placeholders
    let filter = options.filter;
    for (const [key, val] of Object.entries(context)) {
      const escaped = typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : String(val);
      filter = filter.replace(new RegExp(`\\{${key}\\}`, 'g'), escaped);
    }
    params.push(`$filter=${encodeURIComponent(filter)}`);
  }

  if (options.expand?.length) params.push(`$expand=${options.expand.join(',')}`);
  if (options.select?.length) params.push(`$select=${options.select.join(',')}`);
  if (options.top) params.push(`$top=${options.top}`);
  if (options.skip) params.push(`$skip=${options.skip}`);
  if (options.orderby) params.push(`$orderby=${encodeURIComponent(options.orderby)}`);
  if (options.count) params.push(`$count=true`);

  return `${base}/${encodeURIComponent(table)}${params.length ? '?' + params.join('&') : ''}`;
}
```

---

## OData vs FM Data API — When to Use Which

| Scenario | Use |
|----------|-----|
| Simple CRUD (create, update, delete, find) | FM Data API |
| Complex AND/OR filters on one table | Either (OData `$filter` is cleaner) |
| Join two related tables in one call | OData `$expand` |
| Multiple writes atomically | OData `$batch` |
| Running FileMaker scripts | FM Data API only |
| Container field operations | FM Data API (multipart) |
| Pagination with sort | OData (`$top`, `$skip`, `$orderby`) |
| Aggregations / counts | OData (`$apply`, `$count`) |

---

## OData $filter Operators Reference

| Operator | Meaning | Example |
|----------|---------|---------|
| `eq` | Equals | `Status eq 'Active'` |
| `ne` | Not equals | `Status ne 'Deleted'` |
| `gt` | Greater than | `Amount gt 100` |
| `lt` | Less than | `Amount lt 500` |
| `ge` | Greater or equal | `Amount ge 100` |
| `le` | Less or equal | `Amount le 500` |
| `and` | AND | `A eq 'x' and B eq 'y'` |
| `or` | OR | `A eq 'x' or A eq 'y'` |
| `not` | NOT | `not (Status eq 'Closed')` |
| `contains(f,v)` | Contains string | `contains(Name,'John')` |
| `startswith(f,v)` | Starts with | `startswith(Email,'admin')` |
| `endswith(f,v)` | Ends with | `endswith(Email,'.com')` |