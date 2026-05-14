---
description: # Workflow 11: AI Relationship Suggestion & App Settings (AI Provider Config)
---

## Overview
Two concerns: (1) Suggest relationships between FM tables/layouts using AI by analyzing field names and portals. (2) Make AI provider configurable in Settings so the tool generator uses whatever AI the user configured — not a hardcoded key.

---

## Part A: AI Relationship Suggestion

### Prompt sent to AI agent

**File**: `src/lib/ai/prompts/suggest-relationships.ts`

```typescript
export const SUGGEST_RELATIONSHIPS_PROMPT = `
You are a FileMaker database analyst. You will receive a list of FileMaker layouts and OData tables with their field names, and a list of portals (which reveal existing FM relationships).

Your task: identify ALL meaningful relationships between these layouts/tables.

## Input format
{
  "layouts": [
    { "name": "Customers", "fields": ["CustomerID", "Name", "Email"], "portals": [{ "table": "Orders", "fields": ["OrderID", "CustomerID"] }] }
  ],
  "odataTables": [
    { "name": "Orders", "fields": ["OrderID", "CustomerID", "ProductName", "TotalAmount"] }
  ]
}

## Detection rules (apply all):
1. PORTAL RULE: If layout A has a portal to table B → certain relationship. confidence: "high"
2. FOREIGN KEY RULE: If table B has a field named exactly like table A's primary key (e.g., "CustomerID" in Orders matches "CustomerID" in Customers) → likely relationship. confidence: "high"
3. NAMING PATTERN RULE: Fields ending in "ID", "_id", "Key", "_key", "Ref", "No" are foreign key candidates. confidence: "medium"
4. TABLE NAME RULE: If a field in table B contains table A's name (e.g., "CustomerRef" in Orders) → possible relationship. confidence: "low"

## Output format
Return ONLY a valid JSON array. No prose, no markdown, no explanation:
[
  {
    "from": "Customers",
    "to": "Orders",
    "key": "CustomerID",
    "type": "one-to-many",
    "confidence": "high",
    "reason": "Customers layout has portal to Orders; Orders has CustomerID field matching Customers.CustomerID",
    "source": "portal"
  }
]

## Notes
- "from" is the parent table (one side), "to" is the child table (many side)
- "key" is the shared field name that links them
- "type" is always "one-to-many" unless you can determine otherwise from field names
- Only include relationships you are reasonably confident about
- Do not invent field names — only reference fields provided in the input
`.trim();
```

---

### API Route: Suggest Relationships

**File**: `src/app/api/connections/[id]/schema/ai-relationships/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai/client';
import { SUGGEST_RELATIONSHIPS_PROMPT } from '@/lib/ai/prompts/suggest-relationships';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const bs = await prisma.browsedSchema.findUnique({ where: { connectionId: params.id } });
  if (!bs) return NextResponse.json({ success: false, error: 'Schema not fetched yet' }, { status: 404 });

  const layoutMeta = JSON.parse(bs.rawLayoutMeta);
  const odataMeta = JSON.parse(bs.rawODataMeta);

  const inputPayload = {
    layouts: Object.values(layoutMeta).map((l: any) => ({
      name: l.name,
      fields: l.fields.map((f: any) => f.name),
      portals: l.portals.map((p: any) => ({ table: p.table, fields: p.fields.map((f: any) => f.name) })),
    })),
    odataTables: Object.values(odataMeta).map((t: any) => ({
      name: t.name,
      fields: t.fields.map((f: any) => f.name),
    })),
  };

  const aiText = await callAI({
    systemPrompt: SUGGEST_RELATIONSHIPS_PROMPT,
    userMessage: JSON.stringify(inputPayload, null, 2),
    maxTokens: 2000,
  });

  let relationships = [];
  try {
    const clean = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    relationships = JSON.parse(clean);
  } catch {
    return NextResponse.json({ success: false, error: 'AI returned invalid JSON', code: 'AI_PARSE_ERROR' }, { status: 500 });
  }

  await prisma.browsedSchema.update({
    where: { connectionId: params.id },
    data: { suggestedRelationships: JSON.stringify(relationships) },
  });

  return NextResponse.json({ success: true, data: relationships });
}
```

---

## Part B: App Settings — Configurable AI Provider

### Prisma Model

```prisma
model AppSettings {
  id        String   @id @default("singleton")  // always one row
  aiProvider String  @default("anthropic")       // "anthropic" | "openai" | "ollama" | "custom"
  aiModel   String   @default("claude-sonnet-4-20250514")
  aiApiKeyEncrypted String?
  aiBaseUrl String?  // for Ollama/custom: http://localhost:11434/v1
  updatedAt DateTime @updatedAt
}
```

### Settings API Routes

**File**: `src/app/api/settings/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto';

export async function GET() {
  const settings = await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });

  return NextResponse.json({
    success: true,
    data: {
      aiProvider: settings.aiProvider,
      aiModel: settings.aiModel,
      aiBaseUrl: settings.aiBaseUrl,
      hasApiKey: !!settings.aiApiKeyEncrypted,
    },
    // Never return aiApiKeyEncrypted
  });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const updateData: any = {
    aiProvider: body.aiProvider,
    aiModel: body.aiModel,
    aiBaseUrl: body.aiBaseUrl ?? null,
  };
  if (body.aiApiKey) {
    updateData.aiApiKeyEncrypted = encrypt(body.aiApiKey);
  }

  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  });

  return NextResponse.json({ success: true, data: { updated: true } });
}
```

---

## Part C: Unified AI Client (reads from Settings)

**File**: `src/lib/ai/client.ts`

```typescript
import { prisma } from '../prisma';
import { decrypt } from '../crypto';

interface AICallOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
}

export async function callAI(options: AICallOptions): Promise<string> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });

  const provider = settings?.aiProvider ?? 'anthropic';
  const model = settings?.aiModel ?? 'claude-sonnet-4-20250514';
  const apiKey = settings?.aiApiKeyEncrypted ? decrypt(settings.aiApiKeyEncrypted) : process.env.AI_API_KEY ?? '';
  const baseUrl = settings?.aiBaseUrl;

  switch (provider) {
    case 'anthropic':
      return callAnthropic({ model, apiKey, ...options });
    case 'openai':
      return callOpenAI({ model, apiKey, baseUrl: baseUrl ?? 'https://api.openai.com/v1', ...options });
    case 'ollama':
      return callOpenAI({ model, apiKey: 'ollama', baseUrl: baseUrl ?? 'http://localhost:11434/v1', ...options });
    case 'custom':
      return callOpenAI({ model, apiKey, baseUrl: baseUrl!, ...options });
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

async function callAnthropic(opts: AICallOptions & { model: string; apiKey: string }): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.systemPrompt,
      messages: [{ role: 'user', content: opts.userMessage }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic error: ${data.error?.message}`);
  return data.content?.[0]?.text ?? '';
}

async function callOpenAI(opts: AICallOptions & { model: string; apiKey: string; baseUrl: string }): Promise<string> {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4000,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userMessage },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI-compatible error: ${data.error?.message}`);
  return data.choices?.[0]?.message?.content ?? '';
}
```

---

## Updated Tool Generator (uses callAI)

Update `src/lib/tools/generator.ts` to replace direct Anthropic fetch with:
```typescript
import { callAI } from '../ai/client';
import { TOOL_GENERATOR_SYSTEM_PROMPT } from '../ai/prompts/tool-generator';

const aiText = await callAI({
  systemPrompt: TOOL_GENERATOR_SYSTEM_PROMPT,
  userMessage: JSON.stringify(inputPayload, null, 2),
  maxTokens: 8000,
});
```
And it reads the compiled schema from `BrowsedSchema.compiledSchema` instead of the raw schema cache:
```typescript
const compiled = conn.browsedSchema?.compiledSchema
  ? JSON.parse(conn.browsedSchema.compiledSchema)
  : null;
if (!compiled) throw new Error('Connection has no saved schema. Browse schema first.');
```

---

## Notes
- `callAI()` always reads from DB settings — no hardcoded keys anywhere in codebase
- Ollama uses the OpenAI-compatible API format — same client, different baseUrl
- The AI relationship suggestion route can be re-called any time to refresh suggestions
- After suggestions are returned, user sees them in the schema browser UI and can accept/reject before saving selections