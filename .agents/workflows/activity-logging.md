---
description: # Workflow 18: Activity Logging System & Log Query API
---

## Overview
Every significant action gets logged automatically via a fire-and-forget logger. Logs are queryable with filters by server, branch, entity type, action, and date range. The UI surfaces these in a dedicated Logs section with diff views.

---

## Step 1: Logger Utility

**File**: `src/lib/logging/logger.ts`

```typescript
import { prisma } from '../prisma';

export const LOG_ACTIONS = {
  SERVER_CREATED: 'server.created',
  SERVER_UPDATED: 'server.updated',
  SERVER_DELETED: 'server.deleted',
  BRANCH_CREATED: 'branch.created',
  BRANCH_MERGED: 'branch.merged',
  BRANCH_ARCHIVED: 'branch.archived',
  BRANCH_DELETED: 'branch.deleted',
  TOOL_CREATED: 'tool.created',
  TOOL_UPDATED: 'tool.updated',
  TOOL_DELETED: 'tool.deleted',
  TOOL_ENABLED: 'tool.enabled',
  TOOL_DISABLED: 'tool.disabled',
  TOOL_GENERATED: 'tool.generated',
  TOOL_EXECUTED: 'tool.executed',
  TOOL_EXECUTION_FAILED: 'tool.execution_failed',
  DEPLOYMENT_CREATED: 'deployment.created',
  DEPLOYMENT_ROLLED_BACK: 'deployment.rolled_back',
  CONNECTION_CREATED: 'connection.created',
  CONNECTION_TESTED: 'connection.tested',
  SCHEMA_BROWSED: 'schema.browsed',
  RELATIONSHIPS_INFERRED: 'schema.relationships_inferred',
  API_KEY_GENERATED: 'api_key.generated',
  API_KEY_ROTATED: 'api_key.rotated',
  API_KEY_REVOKED: 'api_key.revoked',
  API_KEY_USED: 'api_key.used',
} as const;

export type LogAction = typeof LOG_ACTIONS[keyof typeof LOG_ACTIONS];

interface LogOptions {
  action: LogAction;
  entityType: string;
  entityId: string;
  entityName: string;
  serverId?: string;
  branchId?: string;
  deploymentId?: string;
  before?: string;
  after?: string;
  meta?: Record<string, any>;
  actorIp?: string;
}

// Fire-and-forget — never awaited in main request path
export function log(options: LogOptions): void {
  prisma.activityLog.create({
    data: {
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId,
      entityName: options.entityName,
      serverId: options.serverId ?? null,
      branchId: options.branchId ?? null,
      deploymentId: options.deploymentId ?? null,
      before: options.before ?? null,
      after: options.after ?? null,
      meta: options.meta ? JSON.stringify(options.meta) : null,
      actorIp: options.actorIp ?? null,
    },
  }).catch(err => {
    // Log errors to console only — never re-throw
    console.error('[Logger] Failed to write activity log:', err.message);
  });
}

// Awaitable version for when you need to ensure the log is written
export async function logAwait(options: LogOptions): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action: options.action,
        entityType: options.entityType,
        entityId: options.entityId,
        entityName: options.entityName,
        serverId: options.serverId ?? null,
        branchId: options.branchId ?? null,
        deploymentId: options.deploymentId ?? null,
        before: options.before ?? null,
        after: options.after ?? null,
        meta: options.meta ? JSON.stringify(options.meta) : null,
        actorIp: options.actorIp ?? null,
      },
    });
  } catch (err: any) {
    console.error('[Logger] Failed:', err.message);
  }
}
```

---

## Step 2: Auto-Log Middleware for Tool Execution

Add logging into the tool execute route automatically:

**Update**: `src/app/api/tools/[id]/execute/route.ts`

```typescript
// After successful execution:
log({
  action: LOG_ACTIONS.TOOL_EXECUTED,
  entityType: 'tool', entityId: tool.id, entityName: tool.name,
  serverId: tool.serverId,
  meta: { durationMs: duration, paramKeys: Object.keys(inputParams) },
});

// After failed execution:
log({
  action: LOG_ACTIONS.TOOL_EXECUTION_FAILED,
  entityType: 'tool', entityId: tool.id, entityName: tool.name,
  serverId: tool.serverId,
  meta: { durationMs: duration, error: err.message },
});
```

---

## Step 3: Log Query API

**File**: `src/app/api/logs/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const serverId = searchParams.get('serverId') ?? undefined;
  const branchId = searchParams.get('branchId') ?? undefined;
  const entityType = searchParams.get('entityType') ?? undefined;
  const action = searchParams.get('action') ?? undefined;
  const from = searchParams.get('from') ?? undefined;     // ISO date string
  const to = searchParams.get('to') ?? undefined;         // ISO date string
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const cursor = searchParams.get('cursor') ?? undefined; // for pagination

  const where: any = {};
  if (serverId) where.serverId = serverId;
  if (branchId) where.branchId = branchId;
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // fetch one extra to determine if there's a next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > limit;
  const data = hasMore ? logs.slice(0, limit) : logs;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return NextResponse.json({
    success: true,
    data: data.map(l => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      entityName: l.entityName,
      serverId: l.serverId,
      branchId: l.branchId,
      deploymentId: l.deploymentId,
      hasDiff: !!(l.before && l.after),
      meta: safeParseJSON(l.meta, null),
      createdAt: l.createdAt,
    })),
    pagination: { hasMore, nextCursor, limit },
  });
}
```

**File**: `src/app/api/logs/[id]/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const entry = await prisma.activityLog.findUnique({ where: { id: params.id } });
  if (!entry) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const before = safeParseJSON(entry.before, null);
  const after = safeParseJSON(entry.after, null);

  // Build a field-level diff when both before and after exist
  let diff: Record<string, { before: any; after: any }> | null = null;
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    diff = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        diff[key] = { before: before[key], after: after[key] };
      }
    }
    if (Object.keys(diff).length === 0) diff = null;
  }

  return NextResponse.json({
    success: true,
    data: {
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityName: entry.entityName,
      serverId: entry.serverId,
      branchId: entry.branchId,
      deploymentId: entry.deploymentId,
      before,
      after,
      diff,
      meta: safeParseJSON(entry.meta, null),
      createdAt: entry.createdAt,
    },
  });
}
```

---

## Step 4: Server-Scoped Log Route

**File**: `src/app/api/servers/[id]/logs/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? undefined;
  const entityType = searchParams.get('entityType') ?? undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  const logs = await prisma.activityLog.findMany({
    where: {
      serverId: params.id,
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({
    success: true,
    data: logs.map(l => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityName: l.entityName,
      branchId: l.branchId,
      deploymentId: l.deploymentId,
      hasDiff: !!(l.before && l.after),
      meta: safeParseJSON(l.meta, null),
      createdAt: l.createdAt,
    })),
  });
}
```

---

## Step 5: Log Stats for Dashboard

**File**: `src/app/api/logs/stats/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get('serverId') ?? undefined;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

  const where = { ...(serverId ? { serverId } : {}), createdAt: { gte: since } };

  const [total, byAction, byEntity, executions] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.groupBy({ by: ['action'], where, _count: true, orderBy: { _count: { action: 'desc' } }, take: 10 }),
    prisma.activityLog.groupBy({ by: ['entityType'], where, _count: true }),
    prisma.activityLog.count({ where: { ...where, action: 'tool.executed' } }),
  ]);

  const failedExecutions = await prisma.activityLog.count({
    where: { ...where, action: 'tool.execution_failed' },
  });

  return NextResponse.json({
    success: true,
    data: {
      period: '7d',
      total,
      executions,
      failedExecutions,
      successRate: executions > 0
        ? Math.round(((executions - failedExecutions) / executions) * 100)
        : null,
      byAction: byAction.map(r => ({ action: r.action, count: r._count })),
      byEntity: byEntity.map(r => ({ entityType: r.entityType, count: r._count })),
    },
  });
}
```

---

## Log UI Layout (for frontend reference)

### Logs Page Sections
```
[Filters bar]
  Server: [dropdown]  Entity: [dropdown]  Action: [dropdown]  Date: [range picker]

[Stats row — refreshes with filters]
  Total (7d): 234   |  Tool Executions: 89  |  Success Rate: 96%  |  Failures: 3

[Log entries — infinite scroll / load more]
  ┌─────────────────────────────────────────────────────────────────┐
  │ 🟢 tool.executed     search_customers    Customers Server   2m ago │
  │    Server: CRM MCP · Branch: main · Duration: 312ms           │
  ├─────────────────────────────────────────────────────────────────┤
  │ 🔵 branch.merged     feature/new-tools  Orders Server     1h ago  │
  │    +3 tools added · 1 modified · v1.2.0 deployed  [View diff]  │
  ├─────────────────────────────────────────────────────────────────┤
  │ 🔴 tool.execution_failed  create_order   Orders Server    3h ago  │
  │    Error: FM Error 401: Insufficient privileges  [Details]      │
  └─────────────────────────────────────────────────────────────────┘

[Diff Modal — opens on "View diff"]
  Changed fields:
  description:  "Old description..."  →  "New, improved description..."
  handlerConfig.steps[0].layout:  "Orders"  →  "OrdersV2"
```

### Action Color Coding
```typescript
const ACTION_COLORS: Record<string, string> = {
  'tool.executed': 'green',
  'tool.execution_failed': 'red',
  'branch.merged': 'blue',
  'deployment.created': 'blue',
  'deployment.rolled_back': 'orange',
  'tool.created': 'teal',
  'tool.deleted': 'red',
  'tool.updated': 'yellow',
  'api_key.generated': 'purple',
  'api_key.revoked': 'red',
};
```