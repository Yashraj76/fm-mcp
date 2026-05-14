---
trigger: always_on
---

# Rules File 6: AI Automation, Async Jobs & Playground Rules

---

## RULE: All AI Prompts Live in `src/lib/ai/prompts/`
Every AI system prompt is an exported `const` string from a dedicated file. No inline prompt strings in route files or service files.

```
src/lib/ai/prompts/
  infer-relationships.ts    → INFER_RELATIONSHIPS_PROMPT
  create-tools.ts           → CREATE_TOOLS_PROMPT
  playground-orchestrator.ts → PLAYGROUND_ORCHESTRATOR_PROMPT
  suggest-relationships.ts  → SUGGEST_RELATIONSHIPS_PROMPT (from Workflow 11)
```

---

## RULE: All AI Calls Go Through `callAI()`
Never call any AI provider API directly from a route file or service. Always use `src/lib/ai/client.ts → callAI()`. This ensures the configured provider/model/key is always used.

```typescript
// WRONG
await fetch('https://api.anthropic.com/v1/messages', { ... });

// CORRECT
import { callAI } from '@/lib/ai/client';
await callAI({ systemPrompt: MY_PROMPT, userMessage: payload, maxTokens: 4000 });
```

---

## RULE: Async Jobs Use DB Polling — No Websockets Required
For all background AI work (tool generation, playground sessions):
1. POST creates a job/session row → returns `{ jobId }` with HTTP 202
2. Background work runs via `setImmediate`
3. Frontend polls `GET .../status` or `GET .../sessions/[id]` every 2 seconds
4. Polling stops when `status === "done"` or `status === "failed"`

Never use WebSockets or SSE — the polling pattern works reliably in Next.js.

---

## RULE: Routes Using setImmediate Must Declare Node Runtime
```typescript
// Required at top of file:
export const runtime = 'nodejs';
export const maxDuration = 300;
```
Without this, Next.js may use the edge runtime which doesn't support Node.js globals.

---

## RULE: Tool Generation Is Idempotent
Calling `POST /servers/[id]/generate-tools` twice must not create duplicate tools. Use:
```typescript
// Check before creating
const exists = await prisma.tool.findFirst({ where: { serverId, name: tool.name } });
if (!exists) await prisma.tool.create({ ... });
```
Or delete generated tools first if `replaceExisting: true` is passed.

---

## RULE: System Tools Are Always Present
The four system tools (add_numbers, subtract_numbers, calculate_average, calculate_percentage) must be seeded on every server creation. They are seeded BEFORE AI-generated tools so they always appear first. They must never require a FileMaker connection.

```typescript
// In job runner, always seed system tools first:
await seedDefaultTools(serverId);
// Then call AI for FM-specific tools
```

---

## RULE: AI Output Must Always Be Parsed Defensively
```typescript
// Always strip code fences before parsing
const clean = aiText
  .replace(/```json\n?/g, '')
  .replace(/```\n?/g, '')
  .trim();

try {
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error('Expected array');
} catch (err) {
  // Log raw output for debugging
  console.error('[AI Parse Error] Raw output:', aiText.substring(0, 500));
  // Return safe fallback — never crash the route
  return [];
}
```

---

## RULE: Tool Name Uniqueness Per Server
Tool names must be unique within a server. Before saving any AI-generated tool:
```typescript
const nameExists = await prisma.tool.findFirst({ where: { serverId, name: tool.name } });
if (nameExists) {
  // Suffix with _v2, _v3, etc. or skip and log
  tool.name = `${tool.name}_v2`;
}
```

---

## RULE: Playground Progress Log Format
Every step log entry must have this exact shape:
```typescript
{
  stepIndex: number,       // 0-based
  toolName: string,        // exact tool name
  reason: string,          // from AI plan: why this tool is called
  status: 'running' | 'done' | 'error',
  result?: any,            // only when status === 'done'
  error?: string,          // only when status === 'error'
  durationMs?: number,     // execution time
}
```
The frontend renders this as a progress timeline. Shape must never change.

---

## RULE: Tabular Result Configuration
When `outputFormat === "table"`, the `tableConfig` from the AI plan drives rendering:
- `primaryTable`: the step whose result forms the main rows
- `columns`: exact field names from FM fieldData to show as columns
- `summaryFields`: computed values from system tools to show below table

The frontend must handle cases where columns don't exist in a row (show empty cell, not crash).

---

## RULE: Relationship Graph Is the Authority for Multi-Table Tools
The tool generator must read from `RelationshipGraph` (not from raw portal data). The relationship graph is the post-AI-inference, user-confirmed source of truth.

```typescript
// In job runner, after loading compiledSchema:
const rg = await prisma.relationshipGraph.findUnique({ where: { connectionId: conn.id } });
const relationships = rg ? JSON.parse(rg.relationships) : (compiledSchema.relationships ?? []);
// Merge into compiledSchema for the AI tool generator
compiledSchema.relationships = relationships;
```

---

## RULE: Field Names in Tools Must Come from Schema — Never Invented
The AI tool generator prompt explicitly prohibits inventing field names. If the executor receives a fieldMapping that references a non-existent FM field, FM returns error code 102 (Field missing). Before saving AI-generated tools:
```typescript
// Optional validation: check fieldMappings against known schema fields
// Log warnings but don't block saving — user can fix in tool editor
```

---

## RULE: `safeParseJSON` Everywhere
Never use bare `JSON.parse()` on any value that comes from the database. Always use:
```typescript
import { safeParseJSON } from '@/lib/utils/safe-parse';
const config = safeParseJSON(tool.handlerConfig, {});
```

---

## RULE: Empty State Handling on All Schema Routes
Any route that reads from `BrowsedSchema`, `RelationshipGraph`, or `ToolGenerationJob` must return a valid empty state (not 404) when the row doesn't exist yet. The frontend should show "not yet configured" UI, not an error screen.

```typescript
// Pattern:
const data = await prisma.browsedSchema.findUnique({ where: { connectionId: id } });
return NextResponse.json({ success: true, data: data ?? { layouts: [], scripts: [], ...emptyDefaults } });
```