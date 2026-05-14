---
description: # Workflow 12: Fixing Broken Places & End-to-End Wiring
---

## Overview The app currently breaks in many places. This workflow lists every known break point, the root cause, and the fix. Apply these in order before building new features.  ---  ## Break 

## Overview
The app currently breaks in many places. This workflow lists every known break point, the root cause, and the fix. Apply these in order before building new features.

---

## Break 1: Missing Prisma Models

### Problem
`RelationshipGraph`, `ToolGenerationJob`, `PlaygroundSession`, `BrowsedSchema` don't exist yet — any code that imports from `@prisma/client` will fail to compile.

### Fix
Add all models to `prisma/schema.prisma` then run:
```bash
npx prisma migrate dev --name add_ai_automation_models
npx prisma generate
```

### Models to add (full definitions)
```prisma
model RelationshipGraph {
  id            String     @id @default(cuid())
  connectionId  String     @unique
  connection    Connection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  relationships String
  generatedBy   String     @default("ai")
  generatedAt   DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
}

model ToolGenerationJob {
  id           String   @id @default(cuid())
  serverId     String
  server       Server   @relation(fields: [serverId], references: [id], onDelete: Cascade)
  status       String   @default("pending")
  progress     Int      @default(0)
  log          String   @default("[]")
  toolsCreated Int      @default(0)
  error        String?
  startedAt    DateTime?
  completedAt  DateTime?
  createdAt    DateTime @default(now())
}

model PlaygroundSession {
  id           String   @id @default(cuid())
  serverId     String?
  userMessage  String
  agentPlan    String?
  stepLog      String   @default("[]")
  finalResult  String?
  status       String   @default("running")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

Also add these relations to existing models:
```prisma
// On Server model — add:
  generationJobs  ToolGenerationJob[]

// On Connection model — add:
  relationshipGraph RelationshipGraph?
  browsedSchema     BrowsedSchema?
```

---

## Break 2: Tool Execution Falls Through to undefined handlerType

### Problem
`handlerType` values like `"multi-step"`, `"odata"`, `"system"` aren't handled in the execute route, causing silent 500s.

### Fix — `src/app/api/tools/[id]/execute/route.ts`
```typescript
import { executeMultiStepTool } from '@/lib/filemaker/multi-executor';
import { executeSystemTool } from '@/lib/tools/system-executor';

// Inside POST handler:
const config = JSON.parse(tool.handlerConfig);
let result: any;

switch (tool.handlerType) {
  case 'system':
    result = executeSystemTool(config.operation, inputParams);
    break;
  case 'multi-step':
  case 'find':
  case 'create':
  case 'update':
  case 'delete':
  case 'list':
  case 'script':
  case 'odata':
    if (config.steps?.length > 0) {
      result = await executeMultiStepTool(config.steps, config.connectionId, inputParams);
    } else {
      result = await executeTool({ handlerType: tool.handlerType, handlerConfig: config, params: inputParams });
    }
    break;
  default:
    return NextResponse.json({ success: false, error: `Unknown handlerType: ${tool.handlerType}`, code: 'UNSUPPORTED_HANDLER' }, { status: 400 });
}
```

---

## Break 3: Schema Browser Returns 404 When No BrowsedSchema Row

### Problem
`GET /api/connections/[id]/browse-schema` returns 404 if schema hasn't been fetched yet, breaking the UI that tries to load on mount.

### Fix
Return an empty schema state instead of 404:
```typescript
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const bs = await prisma.browsedSchema.findUnique({ where: { connectionId: params.id } });
  // Return empty state — never 404
  return NextResponse.json({
    success: true,
    data: bs ? {
      layouts: JSON.parse(bs.rawLayouts),
      // ...etc
    } : {
      layouts: [], scripts: [], odataTables: [],
      suggestedRelationships: [], selectedLayouts: [],
      selectedTables: [], selectedScripts: [],
      fetchedAt: null,
    },
  });
}
```

---

## Break 4: Server Creation Doesn't Trigger Tool Generation

### Problem
`POST /api/servers` creates the server but never kicks off tool generation. The server detail screen shows 0 tools.

### Fix — `src/app/api/servers/route.ts` POST handler
```typescript
const server = await prisma.server.create({ ... });

// After server creation, check if linked connection has compiled schema
if (parsed.connectionIds?.length) {
  const conn = await prisma.connection.findUnique({
    where: { id: parsed.connectionIds[0] },
    include: { browsedSchema: true },
  });

  if (conn?.browsedSchema?.compiledSchema) {
    // Create job and run async
    const job = await prisma.toolGenerationJob.create({
      data: { serverId: server.id, status: 'pending' },
    });
    setImmediate(() => runToolGenerationJob(job.id, server.id));
  }
  // If no compiled schema: tools can be generated later via POST /servers/[id]/generate-tools
}

return NextResponse.json({ success: true, data: { ...server, generationStarted: !!conn?.browsedSchema?.compiledSchema } }, { status: 201 });
```

---

## Break 5: Playground Has No Tool Selection and No AI Mode

### Problem
The current Playground only has a static JSON editor. There is no AI orchestration, no progress view, no tabular result output.

### New Playground Page Structure
The Playground needs two tabs:

#### Tab 1: Manual Tool Test (existing)
- Select tool dropdown → auto-fills JSON
- Send request → Response Inspector

#### Tab 2: AI Orchestrated Test (new)
```
[Select MCP Server] (optional filter)
[Text input: "Find all orders for john@example.com and show average value"]
[Run with AI] button
  ↓
[Progress Panel]
  Step 1 ✓  search_customers — "Find the customer record for the given email"  [230ms]
  Step 2 ✓  get_customers_with_orders — "Retrieve all orders for the found customer"  [410ms]
  Step 3 ✓  calculate_average — "Calculate average order value"  [2ms]
  
[Result Panel — Tabular]
  | OrderID | ProductName | TotalAmount | Status | OrderDate |
  |---------|-------------|-------------|--------|-----------|
  | 101     | Widget Pro  | $250.00     | Open   | 2025-01-10|
  | 102     | Widget Lite | $99.00      | Closed | 2025-01-15|
  
  Average Order Value: $174.50
```

---

## Break 6: callAI Throws When AppSettings Row Doesn't Exist

### Problem
`callAI()` calls `prisma.appSettings.findUnique()`. On fresh install, this returns null and crashes because `settings.aiProvider` throws.

### Fix — `src/lib/ai/client.ts`
```typescript
// Always upsert — never crash on missing settings
const settings = await prisma.appSettings.upsert({
  where: { id: 'singleton' },
  create: { id: 'singleton' },
  update: {},
});

// Fallback chain for API key
const apiKey = settings.aiApiKeyEncrypted
  ? decrypt(settings.aiApiKeyEncrypted)
  : process.env.AI_API_KEY
  ?? process.env.ANTHROPIC_API_KEY
  ?? '';

if (!apiKey) {
  throw new Error('No AI API key configured. Go to Settings → AI Provider and add your API key.');
}
```

---

## Break 7: fast-xml-parser Not Installed

### Problem
`schema-browser.ts` imports `fast-xml-parser` which isn't in package.json.

### Fix
```bash
npm install fast-xml-parser
```

---

## Break 8: setImmediate in Next.js App Router

### Problem
`setImmediate(() => runJob(...))` may not work reliably in Next.js edge runtime or serverless deploys.

### Fix
Always force Node.js runtime on routes that use `setImmediate`:
```typescript
// At the top of any route file that uses setImmediate:
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute timeout for long generation jobs
```

---

## Break 9: JSON.parse on Undefined Crashes the App

### Problem
Many places do `JSON.parse(tool.handlerConfig)` or `JSON.parse(bs.compiledSchema)` without checking if the value is null/undefined.

### Fix — Add a safe parser helper
**File**: `src/lib/utils/safe-parse.ts`
```typescript
export function safeParseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
```

Use everywhere:
```typescript
import { safeParseJSON } from '@/lib/utils/safe-parse';

const config = safeParseJSON(tool.handlerConfig, {});
const schema = safeParseJSON(bs?.compiledSchema, { layouts: [], scripts: [], relationships: [] });
```

---

## End-to-End Flow After All Fixes

```
1. Add ServerConnection (admin creds) → Test → List databases
2. Pick database → Add file credentials → Create Connection
3. Connection detail: Browse Schema → POST /browse-schema (fetches layouts, scripts, OData)
4. Select layouts + fields → PUT /schema/selections
5. Infer Relationships → POST /infer-relationships (AI analyzes fields + portals)
6. Review + confirm relationship graph
7. Create MCP Server → linked to Connection
   → POST /servers triggers tool generation job immediately
   → GET /servers/[id]/generate-tools/status polls until done
8. Server detail screen shows tools as they appear (poll every 2s until job done)
9. Playground → AI Test tab → type request → POST /playground/ai-run
   → returns sessionId → poll GET /playground/sessions/[id]
   → progress steps stream in → tabular result when done
```