---
trigger: always_on
---

# Rules File 3: Code Structure & Patterns

## RULE: Folder Structure for Backend Code
```
src/
  app/
    api/
      connections/
        route.ts               ← GET all, POST create
        [id]/
          route.ts             ← GET, PUT, DELETE
          test/route.ts        ← POST test connection
          schema/route.ts      ← GET schema cache
      servers/
        route.ts
        [id]/
          route.ts
          config/route.ts      ← GET MCP config JSON
      tools/
        route.ts
        [id]/
          route.ts
          execute/route.ts     ← POST execute tool
        suggest/route.ts       ← POST AI suggestions
      deployments/
        route.ts
        [id]/
          rollback/route.ts
      branches/
        route.ts
        [id]/
          merge/route.ts
      playground/
        execute/route.ts
        history/route.ts
  lib/
    prisma.ts                  ← singleton Prisma client
    crypto.ts                  ← encrypt/decrypt
    filemaker/
      client.ts                ← FileMakerClient class
      session.ts               ← withFMSession wrapper
      executor.ts              ← tool execution engine
    db/
      connections.ts           ← DB helper functions
```

---

## RULE: Prisma Singleton
```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```
Import from `@/lib/prisma` everywhere — never `new PrismaClient()` inline.

---

## RULE: Async/Await + Try/Catch (no .then() chains)
```typescript
// WRONG
fileMakerFetch().then(data => ...).catch(err => ...);

// CORRECT
try {
  const data = await fileMakerFetch();
} catch (err) {
  // handle
}
```

---

## RULE: Type-Safe Handler Config
Define TypeScript types for each handler config shape:
```typescript
interface FindHandlerConfig {
  connectionId: string;
  layout: string;
  fieldMappings: Record<string, string>;
  limit?: number;
}

interface ScriptHandlerConfig {
  connectionId: string;
  scriptName: string;
}
```

---

## RULE: JSON Storage in SQLite
Prisma + SQLite stores JSON as strings. Always:
```typescript
// Storing
data: { inputSchema: JSON.stringify(parsedSchema) }

// Reading
const schema = JSON.parse(tool.inputSchema);
```

---

## RULE: Tool Name Validation
Tool names must be `snake_case`, lowercase, start with a letter:
```typescript
z.string().regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case')
```
Good: `search_customers`, `create_invoice`
Bad: `Search Customers`, `createInvoice`, `123tool`

---

## RULE: Environment Variables
Required env vars — add to `.env.example`:
```
DATABASE_URL="file:./dev.db"
ENCRYPTION_KEY="<32-byte hex string>"
NEXTAUTH_URL="http://localhost:3000"
```

---

## RULE: Execution Record
Every tool execution (success or fail) must be saved to the `Execution` table:
```typescript
prisma.execution.create({
  data: {
    toolId,
    inputParams: JSON.stringify(params),
    result: JSON.stringify(result) ?? null,
    error: err?.message ?? null,
    status: 'success' | 'error',
    duration, // milliseconds
  }
})
```

---

## RULE: No Business Logic in Route Files
Route files should only:
1. Parse request
2. Validate with Zod
3. Call a lib/ function
4. Return response

Business logic (FM calls, transformations) lives in `src/lib/`.

---

## RULE: Logging
```typescript
// Use structured logging — prefix with module name
console.log('[FileMakerClient] Logged in to', this.config.database);
console.error('[executor] FM execution failed', { toolId, error: err.message });
// NEVER log: passwords, tokens, full FM responses with sensitive data
```

---

## RULE: Next.js Route Handler Export Naming
```typescript
// MUST use named exports matching HTTP verbs
export async function GET(req: Request) { ... }
export async function POST(req: Request) { ... }
export async function PUT(req: Request) { ... }
export async function DELETE(req: Request) { ... }

// Dynamic route params signature:
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) { ... }
```