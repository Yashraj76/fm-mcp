---
trigger: always_on
---

# Rules File 8: Branching, Version Control & Logging Rules

---

## RULE: main Is Always Protected
The `main` branch has `isProtected: true` and `isDefault: true`. These fields must never be
changed after creation. No API route should allow deleting or renaming `main`.

```typescript
// Always guard against main deletion:
if (branch.isDefault || branch.isProtected) {
  return NextResponse.json({ success: false, error: 'Cannot modify the main branch' }, { status: 403 });
}
```

---

## RULE: Tool Edits on Feature Branches Are Non-Destructive
When a user edits a tool while on a feature branch, **never** update the `Tool` record directly. Instead, write to `BranchTool.overrideData`. The base `Tool` record is only updated during a merge into `main`.

```
Feature Branch: edit tool → BranchTool { action: "modified", overrideData: { name: "..." } }
Merge → apply overrideData to actual Tool record → safe
```

---

## RULE: Effective Tool Resolution Order
When serving tools for a branch (for display or execution), always resolve in this order:
1. Start with the base `Tool` record
2. Check if a `BranchTool` exists for this branch+tool
3. If `action === "deleted"` → exclude the tool entirely
4. If `action === "modified"` → merge `overrideData` on top of base tool (overrideData wins)
5. If `action === "inherited"` or `action === "added"` → use base tool as-is

---

## RULE: The Live MCP Endpoint Always Serves main
The MCP route (`/api/mcp/[serverId]/[transport]`) must always load tools from the `main` branch. It must never serve a feature branch's tools externally. Feature branches are only visible inside the platform UI and playground.

```typescript
// In MCP route handler:
const mainBranch = await prisma.branch.findFirst({
  where: { serverId, isDefault: true },
});
const tools = await getEffectiveTools(mainBranch.id);
```

---

## RULE: Snapshots Must Be Complete and Self-Contained
A `Deployment.snapshot` JSON must contain everything needed to restore that state without hitting the database. This means:

```json
{
  "version": "1.2.0",
  "tools": [ { "name": "...", "inputSchema": "...", "handlerConfig": "...", ... } ],
  "serverId": "...",
  "serverName": "...",
  "snapshotAt": "2025-01-01T00:00:00Z",
  "stats": { "totalTools": 12, "added": 3, "modified": 1, "deleted": 0 }
}
```
Never store only IDs in a snapshot. If the referenced Tool record is later deleted, the rollback must still work.

---

## RULE: Rollback Is Atomic via $transaction
Rollback must wrap all operations in a single Prisma `$transaction`. If any step fails, the entire rollback is cancelled and the current state is preserved. Never partially restore a snapshot.

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Delete current tools
  // 2. Recreate from snapshot
  // 3. Update deployment live status
  // 4. Update server version
  // All or nothing
});
```

---

## RULE: Version Numbers Are Server-Level, Not Branch-Level
Versions (semver) live on the `Server` and `Deployment`, not on branches. Branches are named by convention (feature/xyz). A new version is created only when a branch is merged into `main`.

---

## RULE: Branch Names Follow a Convention
Enforce with Zod: `^[a-z0-9\-\/]+$`
- `main` — always present, protected
- `feature/description` — new features
- `hotfix/description` — urgent fixes
- `test/description` — experimental

Reject spaces, uppercase, special characters. The `serverId_name` composite unique index enforces no duplicates per server.

---

## RULE: Logging Is Always Fire-and-Forget
Never `await log(...)` in the main request path. Logging must never cause a request to fail or slow down. Use the `log()` function (not `logAwait`) everywhere except in jobs where you explicitly need confirmation.

```typescript
// CORRECT — non-blocking
log({ action: LOG_ACTIONS.TOOL_UPDATED, ... });
return NextResponse.json({ success: true });

// WRONG — can delay or fail the response
await logAwait({ ... });
return NextResponse.json({ success: true });
```

---

## RULE: Log before AND after for Mutations
For any `update` or `delete`, always capture the state before mutating:

```typescript
const tool = await prisma.tool.findUnique({ where: { id } }); // capture BEFORE
const before = JSON.stringify({ name: tool.name, description: tool.description });

await prisma.tool.update({ ... }); // mutate

log({ ..., before, after: JSON.stringify(newValues) });
```

---

## RULE: Diff Is Field-Level, Not Raw JSON
The `GET /api/logs/[id]` endpoint must compute a field-level diff — show only what changed, not a full JSON dump. The UI uses this to show "description changed from X to Y" rather than two blobs of JSON.

---

## RULE: Log Retention — Never Auto-Delete
Activity logs are permanent audit records. Never add any cleanup job or TTL to `ActivityLog`. If storage becomes a concern, implement archiving to cold storage — not deletion.

---

## RULE: Pagination on All Log Routes
All log list endpoints (`GET /api/logs`, `GET /api/servers/[id]/logs`) must support cursor-based pagination. Default limit 50, max 200. Never return all logs without a limit — the table can be very large.

```typescript
const logs = await prisma.activityLog.findMany({
  take: limit + 1,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
});
```

---

## RULE: Branch Tool Count in Branch List Response
The branch list (`GET /api/servers/[id]/branches`) must always include counts:
```typescript
include: {
  _count: { select: { tools: true, deployments: true } },
}
```
The UI needs this to show "12 tools · 3 deployments" without a second request.

---

## RULE: Merge Marks Branch as Archived, Not Deleted
After merging, set `branch.status = "merged"`. Never delete merged branches — they are part of the version history. The user can see what was in each merged branch.

---

## RULE: onDeleteSetNull for Log Relations
Foreign key relations from `ActivityLog` to `Server`, `Branch`, `Deployment` must use `onDelete: SetNull`. This ensures log entries are never deleted when the entity they reference is deleted — the log record stays, the FK just becomes null.