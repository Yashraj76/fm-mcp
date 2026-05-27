---
trigger: always_on
---

# Rules File 10: Quality Gates & Regression Prevention

These rules prevent repeated regressions in auth isolation, API consistency, MCP transport, frontend performance, type safety, and deployment readiness.

---

## RULE: Do Not Mark Work Complete Until Verification Passes
Every sprint, task, or feature is incomplete until these commands pass:

```bash
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

If one command cannot run, report the blocker explicitly and do not call the sprint closed.

---

## RULE: No Raw Internal Frontend API `fetch`
Client components must call app API routes through `@/lib/utils/api-client`.

```typescript
// WRONG
await fetch('/api/servers')

// CORRECT
await api.get<Server[]>('/api/servers')
```

Allowed exceptions:
- `src/lib/utils/api-client.ts`
- Server-side calls to external services
- FileMaker/Admin API client wrappers
- MCP self-test routes that intentionally call the MCP endpoint

Check before completion:
```bash
rg -n "fetch\\((`|\"|')/api" src/components src/app
```

---

## RULE: No Unsafe API JSON Parsing
API routes must not call `JSON.parse` directly. Use `safeParseJSON` or Zod parsing.

```typescript
// WRONG
const config = JSON.parse(tool.handlerConfig)

// CORRECT
const config = safeParseJSON(tool.handlerConfig, {})
```

Check before completion:
```bash
rg -n "JSON\\.parse\\(" src/app/api
```

Direct `JSON.parse` is allowed in client-side JSON editors only when wrapped in `try/catch` and surfaced as a user validation error.

---

## RULE: Zustand Selectors Must Be Narrow
Never subscribe to the whole store in React components.

```typescript
// WRONG
const { currentServerId, setCurrentServerId } = useAppStore()

// CORRECT
const currentServerId = useAppStore((s) => s.currentServerId)
const setCurrentServerId = useAppStore((s) => s.setCurrentServerId)
```

Check before completion:
```bash
rg -n "useAppStore\\(\\)" src/components src/app src/lib
```

---

## RULE: User-Owned API Reads Must Be Scoped Up Front
Every API route that reads user-owned data must use `withAuth()` and must scope the first DB read by `userId` or an owning parent relation.

```typescript
// WRONG — fetches by ID, checks owner later
const tool = await db.tool.findUnique({ where: { id }, include: { server: true } })
if (tool.server.userId !== userId) return notFound()

// CORRECT
const tool = await db.tool.findFirst({
  where: { id, server: { userId } },
})
```

Allowed exceptions:
- `/api/mcp/[serverId]/[transport]`, because it is public and authenticated by MCP API key
- Post-ownership mutation by primary key after the owned record has already been proven
- Background jobs that receive a trusted `userId` and immediately verify the owning server

---

## RULE: Execution Helpers Must Preserve Ownership Context
If a route verifies ownership and then calls a helper that re-fetches a tool, connection, server, branch, deployment, session, or job, pass `userId` or pass the already-authorized object.

```typescript
// WRONG
await executeTool(toolId, params)

// CORRECT
await executeTool(toolId, params, userId)
// OR
await executeToolWithParams(authorizedTool, params, authorizedConnection)
```

Helpers must not silently fall back from a missing/invalid user-owned resource to another user's resource.

---

## RULE: MCP Transport Must Stay Protocol-Compliant
The MCP route must keep all of these:

```typescript
export const runtime = 'nodejs'
export const maxDuration = 60
export async function GET(...) {}
export async function POST(...) {}
export async function DELETE(...) {}
export async function OPTIONS() {}
```

Every MCP response must include:
```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id
Access-Control-Expose-Headers: Mcp-Session-Id
```

Tool responses must use MCP content format:
```typescript
return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
```

---

## RULE: MCP API Keys Are Hashed and Shown Once
API keys must:
- Start with `mcp_`
- Be hashed with bcrypt before storage
- Store only `keyHash`, `keyPrefix`, `createdAt`, and `lastUsedAt`
- Return the raw key only from generation/rotation
- Never be returned by metadata/config endpoints

---

## RULE: Transport Readiness Endpoints Must Stay Complete
`/api/servers/[id]/connection-status` must return:
- server readiness
- API-key configured state, prefix, and last-used timestamp
- Streamable HTTP and SSE endpoint URLs
- `streamableHttpAvailable`
- `sseAvailable`
- `redisConfigured`
- human-readable `sseMessage`
- linked connection status rows

`/api/servers/[id]/test-mcp-endpoint` must:
- Use `withAuth()`
- Verify the server belongs to the user
- Call the MCP endpoint with `x-internal-test-secret`
- Never use or expose the user's raw API key

---

## RULE: Production Build Must Generate Prisma
`package.json` must include both:

```json
{
  "scripts": {
    "build": "prisma generate && next build",
    "postinstall": "prisma generate"
  }
}
```

---

## RULE: Type Safety Must Improve, Not Regress
Do not introduce new `any` in high-traffic route payloads, DTOs, or execution configs unless there is a documented reason.

Prefer:
- Zod schemas with `z.infer`
- Shared DTO interfaces in `src/lib/utils/dto.ts`
- Typed API client responses
- Specific handler config types

---

## RULE: Accessibility Must Be Checked for New UI
Any new dialog, tabbed panel, menu, or custom control must have:
- keyboard access
- visible focus state
- accessible name or label
- semantic button/link usage
- no text-only icon buttons without `aria-label` or tooltip

Run a keyboard pass before calling UI work complete.

---

## RULE: Known Non-Blocking Debt Must Be Tracked
If a check passes but emits a framework warning, record it as non-blocking debt instead of ignoring it.

Current known debt:
- Next.js warns that `middleware.ts` should move to the newer `proxy` convention.
