---
trigger: always_on
---

# Rules File 7: MCP Transport, Deployment & Security Rules

---

## RULE: Always Export GET, POST, and DELETE from MCP Routes
The MCP spec requires all three HTTP methods. Missing any one causes clients to fail:
- `POST` — tool calls, initialize
- `GET` — SSE stream establishment, server-sent events
- `DELETE` — session termination

```typescript
// Required exports on every MCP route
export const GET = routeHandler;
export const POST = routeHandler;
export const DELETE = routeHandler;
export async function OPTIONS() { /* CORS preflight */ }
```

---

## RULE: MCP Routes Must Use Node.js Runtime
```typescript
export const runtime = 'nodejs';       // REQUIRED — never edge
export const maxDuration = 60;         // seconds — set higher on Vercel Pro
```
Without `runtime = 'nodejs'`, `mcp-handler`, `bcryptjs`, `https.Agent`, and `prisma` will all fail.

---

## RULE: Transport Priority (use both, serve both)
| Transport | When to Use | Clients |
|-----------|-------------|---------|
| Streamable HTTP | Primary, always enabled | Cursor, VS Code, ChatGPT, Claude.ai |
| SSE | Legacy, requires Redis | Claude Desktop (current) |
| mcp-remote proxy | stdio bridge | Any client via `npx mcp-remote` |

Never disable Streamable HTTP. SSE is optional but enables Claude Desktop natively.

---

## RULE: SSE Requires Redis — Fail Gracefully Without It
```typescript
// In config / status checks:
const sseAvailable = !!process.env.REDIS_URL;

// In mcp-handler config:
{
  redisUrl: process.env.REDIS_URL,  // undefined = SSE silently disabled
}
```
Never throw when Redis is missing. Log a warning, show a message in the UI, and continue with Streamable HTTP only.

---

## RULE: API Keys Are Hashed — Never Stored Plain
- Generate with `crypto.randomUUID()` + prefix `mcp_`
- Hash with `bcrypt` (cost 10) before storing
- Return raw key ONCE at generation time — never again
- Show only the prefix (first 12 chars) in the UI for identification
- Rotate = generate new, hash, upsert (old key immediately invalidated)

---

## RULE: CORS Headers on ALL MCP Responses
External AI clients connect from different origins. Every response from `/api/mcp/*` must include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id
Access-Control-Expose-Headers: Mcp-Session-Id
```
`Mcp-Session-Id` header is part of the Streamable HTTP spec and must be exposed.

---

## RULE: JSON-RPC Tool Results Must Use MCP Content Format
```typescript
// CORRECT MCP tool response format
return {
  content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
};

// On error:
return {
  content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
  isError: true,
};

// WRONG — don't return plain objects or arrays
return result;  // ← breaks MCP protocol
```

---

## RULE: JSON Schema → Zod Conversion Must Be Defensive
The `buildZodSchema` function must never throw. Unknown field types default to `z.string()`. Missing `properties` defaults to `{}`. Every field not in `required` gets `.optional()`.

---

## RULE: SQLite Cannot Be Used on Vercel Production
Vercel's filesystem is ephemeral — data written to SQLite is lost on each deploy. For production:
- **Turso** — SQLite-compatible, works with Prisma via libsql adapter, free tier available
- **Neon** — serverless Postgres, generous free tier
- **PlanetScale** — MySQL-compatible serverless

Local dev can keep SQLite. Add detection:
```typescript
// Prisma automatically uses DATABASE_URL — just change the URL in production
```

---

## RULE: Prisma Generate Must Run at Build Time
```json
{
  "scripts": {
    "build": "prisma generate && next build",
    "postinstall": "prisma generate"
  }
}
```
Without `prisma generate` in the build, the Vercel deployment will crash immediately.

---

## RULE: API Key Validation Skipped in Development
For developer convenience, skip API key check when `NODE_ENV === 'development'` AND no token is provided. This means localhost testing doesn't require generating a key first. Log a clear warning when this bypass fires.

---

## RULE: NEXT_PUBLIC_APP_URL Must Be Set on Vercel
The config generator needs the public URL to construct correct endpoint URLs for clients:
```
NEXT_PUBLIC_APP_URL = https://your-project.vercel.app
```
Without this, the config generator outputs wrong URLs. Detect and surface this clearly:
```typescript
if (!process.env.NEXT_PUBLIC_APP_URL && isProd) {
  console.error('[Config] NEXT_PUBLIC_APP_URL not set — endpoint URLs will be wrong');
}
```

---

## RULE: Tool Execution Timeout on Vercel
FileMaker queries can be slow (FM Auth + query = 2-8 seconds). With Vercel Hobby's 10s limit, complex multi-step tools will timeout. Solutions:
- **Vercel Pro**: set `maxDuration: 60` (sufficient for almost all FM queries)
- **Fluid Compute**: keeps functions warm, eliminates cold start FM auth overhead
- **Tool design**: break very complex tools into smaller ones rather than one giant tool

---

## RULE: mcp-remote for Claude Desktop (Recommended)
Until Claude Desktop supports Streamable HTTP natively, recommend `mcp-remote` as the connection method:
```bash
npx mcp-remote https://your-app.vercel.app/api/mcp/SERVER_ID/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```
This proxies Streamable HTTP over stdio, which Claude Desktop supports. Show this as the primary Claude Desktop option in the UI config.

---

## RULE: Self-Test Uses Internal Secret, Not User API Key
The server self-test endpoint (`/test-mcp-endpoint`) calls the MCP route from the server itself. It must bypass the API key check using a separate `INTERNAL_TEST_SECRET` env var — never expose or use the user's key internally.