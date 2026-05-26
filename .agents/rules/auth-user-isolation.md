---
trigger: always_on
---

# Rules File 9: Authentication, User Isolation & Supabase Rules

---

## RULE: Always Use `getClaims()` / `getUser()` on the Server — Never `getSession()`
`getSession()` reads from cookies without validating the JWT signature. It can be spoofed. Always use `getUser()` (which internally calls `getClaims()` and validates against Supabase's public keys):

```typescript
// WRONG — insecure, can be spoofed
const { data: { session } } = await supabase.auth.getSession();
const userId = session?.user?.id;

// CORRECT — validates JWT signature every time
const { data: { user } } = await supabase.auth.getUser();
const userId = user?.id;
```

---

## RULE: Every User-Owned API Route Must Use `withAuth()`
No API route that touches user data should be callable without authentication. Wrap every handler:

```typescript
// WRONG
export async function GET(req: Request) {
  const connections = await prisma.connection.findMany();  // returns ALL users' data
}

// CORRECT
export const GET = withAuth(async (req, { userId }) => {
  const connections = await prisma.connection.findMany({ where: { userId } });
});
```

---

## RULE: Ownership Checks Return 404 — Not 403
When a user tries to access a resource that belongs to another user, return `404 Not Found`, not `403 Forbidden`. This prevents information disclosure — the caller cannot determine if the resource exists at all.

```typescript
// WRONG
if (resource.userId !== userId) return 404({ error: 'Forbidden' });  // reveals it exists

// CORRECT
const resource = await prisma.connection.findFirst({ where: { id, userId } });
if (!resource) return 404({ error: 'Not found' });  // same response whether missing or wrong user
```

---

## RULE: Never Filter by ID Alone — Always Include `userId`
Every `findUnique` and `findFirst` for user-owned resources must include `userId` in the where clause. Never trust the ID alone.

```typescript
// WRONG
await prisma.connection.findUnique({ where: { id: params.id } });

// CORRECT
await prisma.connection.findFirst({ where: { id: params.id, userId } });
// Note: findFirst supports compound where; findUnique requires unique index
```

---

## RULE: Nested Resources Inherit Ownership via Parent
Tools, branches, deployments, and logs don't have `userId` directly — they inherit through their `Server` relation. Always verify the parent server belongs to the user before accessing nested resources:

```typescript
// Before accessing /api/servers/[id]/tools:
const server = await prisma.server.findFirst({ where: { id: params.id, userId } });
if (!server) return 404;

// Now safely access tools
const tools = await prisma.tool.findMany({ where: { serverId: params.id } });
```

---

## RULE: The Supabase Service Role Key Is Server-Only
`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security and can access all users' data. Never expose it:
- Never put it in `NEXT_PUBLIC_*` env vars
- Never import it in Client Components or browser code
- Only use it in server-side admin operations (e.g., creating a user profile on signup)

---

## RULE: HTTP-Only Cookies — Never localStorage for Auth
Supabase SSR stores session tokens in HTTP-only cookies automatically. Never attempt to read or write auth tokens from `localStorage` or `sessionStorage`. This protects against XSS attacks.

---

## RULE: Middleware Must Run on Every Non-Static Route
The `middleware.ts` matcher must cover all routes except static assets. Never whitelist routes in the middleware that should be protected — use the exclusion pattern:

```typescript
// CORRECT — exclude static, include everything else
matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg)$).*)']

// WRONG — only covers specific paths, misses new pages
matcher: ['/dashboard', '/connections', '/servers']
```

---

## RULE: Email Confirmation Is Required
`signUp` by default requires email confirmation in Supabase (if "Enable email confirmations" is ON in dashboard). The app must handle the unconfirmed state gracefully:
- After signup: show "Check your email" message — do NOT redirect to dashboard
- On login with unconfirmed email: surface the specific error message, not a generic one
- The `/auth/confirm` route handler is mandatory — without it, confirmation links don't work

---

## RULE: Auth Pages Redirect Authenticated Users Away
A logged-in user visiting `/login` or `/signup` should be redirected to `/`. Implemented in the proxy:

```typescript
if (user && isAuthPage) {
  return NextResponse.redirect(new URL('/', request.url));
}
```

---

## RULE: Sign Out Clears Server-Side Session
Use the server action `signOut()` which calls `supabase.auth.signOut()` on the server. Do not just clear cookies manually — Supabase must invalidate the session token server-side.

---

## RULE: Use the Supabase MCP for Infrastructure Setup Only
The Supabase MCP server (`https://mcp.supabase.com/mcp`) is a **development tool** used by your AI agent to scaffold the project. It is not used at runtime by the application. Never add Supabase MCP configuration to production app code.

The Supabase MCP is useful for:
- Creating the project
- Running SQL migrations
- Checking auth settings
- Viewing project config

---

## RULE: `AppSettings` Supports Per-User Override
The singleton global settings row (`id: "singleton"`) provides platform-wide defaults. Each user can have their own settings row (keyed by `userId`) which overrides the global. The `getAppSettings(userId)` helper always checks user-specific first.

---

## RULE: Migration Is Required — `userId` Cannot Be Added Without One
After adding `userId` to Prisma models, always run:
```bash
npx prisma migrate dev --name add_user_id
```
Without this, the schema and database are out of sync and Prisma will throw runtime errors. If existing data is present, add a default value to the migration SQL or use `@default("")` temporarily.

---

## RULE: The MCP Transport Route Stays Public (No Auth Required)
External MCP clients (Claude Desktop, Cursor) connect to `/api/mcp/[serverId]/[transport]` without a Supabase session — they use the API key instead. This route must NOT use `withAuth()`. It uses `validateApiKey()` which is a separate, stateless authentication mechanism.