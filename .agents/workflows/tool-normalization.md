---
description: # Workflow 24: Tool Normalization, AI Prompt Fixes & Complete Field Enforcement
---

## Overview
Fixes Problems 5 and 6. Every tool saved — whether created manually, via AI Suggest, or Auto-Generate — passes through a normalisation function that fills missing fields with intelligent defaults. AI prompts are updated to always return complete tool definitions.

---

## Step 1: normalizeTool() — Complete Field Enforcer

**File**: `src/lib/tools/normalize-tool.ts`

```typescript
import { fmFieldToParamName } from '../utils/field-name-utils';
import { safeParseJSON } from '../utils/safe-parse';

export interface RawToolDef {
  name?: string;
  description?: string;
  category?: string;
  fmMethod?: string;
  fmLayout?: string;
  fmScript?: string;
  isEnabled?: boolean;
  isAiGenerated?: boolean;
  inputSchema?: any;
  outputSchema?: any;
  handlerConfig?: any;
  executionStrategy?: string;  // AI-generated tools use this
  steps?: any[];               // AI-generated multi-step tools
  [key: string]: any;
}

export interface NormalizedTool {
  name: string;
  description: string;
  category: string;
  fmMethod: string;
  fmLayout: string | null;
  fmScript: string | null;
  isEnabled: boolean;
  isAiGenerated: boolean;
  inputSchema: string;   // JSON string
  outputSchema: string;  // JSON string
  handlerConfig: string; // JSON string
}

// Category derived from fmMethod when category is missing
const METHOD_TO_CATEGORY: Record<string, string> = {
  find: 'Find',
  create: 'CRUD',
  update: 'CRUD',
  delete: 'CRUD',
  list: 'CRUD',
  get: 'CRUD',
  script: 'Script',
  'sequential-multi-table': 'Multi-Table',
  'odata-filter': 'Custom',
  'odata-expand': 'Multi-Table',
  'odata-batch': 'Multi-Table',
  system: 'system',
  custom: 'Custom',
};

// fmMethod derived from executionStrategy (AI-generated tools)
const STRATEGY_TO_METHOD: Record<string, string> = {
  'fm-find': 'find',
  'fm-create': 'create',
  'fm-update': 'update',
  'fm-delete': 'delete',
  'fm-list': 'list',
  'fm-script': 'script',
  'sequential-multi-table': 'sequential-multi-table',
  'odata-filter': 'odata-filter',
  'odata-expand': 'odata-expand',
  'odata-batch': 'odata-batch',
  'system': 'system',
};

export function normalizeTool(raw: RawToolDef): NormalizedTool {
  // 1. Resolve fmMethod from executionStrategy if missing
  let fmMethod = raw.fmMethod ?? '';
  if (!fmMethod && raw.executionStrategy) {
    fmMethod = STRATEGY_TO_METHOD[raw.executionStrategy] ?? 'custom';
  }
  if (!fmMethod) fmMethod = 'custom';

  // 2. Resolve category from fmMethod if missing
  let category = raw.category ?? '';
  if (!category) {
    category = METHOD_TO_CATEGORY[fmMethod] ?? 'Custom';
  }

  // 3. Resolve fmLayout from handlerConfig if missing
  let fmLayout = raw.fmLayout ?? null;
  const handlerConfigRaw = raw.handlerConfig ?? {};
  const hc = typeof handlerConfigRaw === 'string'
    ? safeParseJSON(handlerConfigRaw, {})
    : handlerConfigRaw;

  if (!fmLayout && hc.layout) fmLayout = hc.layout;
  if (!fmLayout && hc.steps?.[0]?.layout) fmLayout = hc.steps[0].layout;

  // 4. Resolve fmScript
  let fmScript = raw.fmScript ?? null;
  if (!fmScript && hc.script) fmScript = hc.script;
  if (!fmScript && hc.scriptName) fmScript = hc.scriptName;

  // 5. Build complete handlerConfig
  let handlerConfig = { ...hc };

  // If AI-generated tool has steps at top level, move into handlerConfig
  if (raw.steps && !handlerConfig.steps) {
    handlerConfig.steps = raw.steps;
  }

  // Ensure method is set in handlerConfig
  if (!handlerConfig.method) {
    handlerConfig.method = fmMethod;
  }

  // Ensure layout is set in handlerConfig for single-step tools
  if (fmLayout && !handlerConfig.layout && !handlerConfig.steps) {
    handlerConfig.layout = fmLayout;
  }

  // Ensure script is in handlerConfig for script tools
  if (fmScript && fmMethod === 'script' && !handlerConfig.script && !handlerConfig.scriptName) {
    handlerConfig.scriptName = fmScript;
  }

  // 6. Build complete inputSchema
  let inputSchema: any = {};
  if (raw.inputSchema) {
    inputSchema = typeof raw.inputSchema === 'string'
      ? safeParseJSON(raw.inputSchema, {})
      : raw.inputSchema;
  }

  // Ensure inputSchema has at minimum: type, properties, required
  if (!inputSchema.type) inputSchema.type = 'object';
  if (!inputSchema.properties) inputSchema.properties = {};
  if (!inputSchema.required) inputSchema.required = [];

  // For update/delete tools, ensure recordId is in inputSchema
  if (['update', 'delete', 'get'].includes(fmMethod) && !inputSchema.properties.recordId) {
    inputSchema.properties.recordId = {
      type: 'string',
      description: 'The FileMaker record ID to target',
    };
    if (!inputSchema.required.includes('recordId')) {
      inputSchema.required.push('recordId');
    }
  }

  // 7. Build outputSchema (default empty structure if missing)
  let outputSchema: any = raw.outputSchema ?? {};
  if (typeof outputSchema === 'string') outputSchema = safeParseJSON(outputSchema, {});
  if (!outputSchema.type) outputSchema = { type: 'object', properties: {} };

  // 8. Build description if missing
  let description = raw.description ?? '';
  if (!description) {
    const layoutPart = fmLayout ? ` in the ${fmLayout} layout` : '';
    const methodPart: Record<string, string> = {
      find: `Search for records${layoutPart}`,
      create: `Create a new record${layoutPart}`,
      update: `Update a record${layoutPart}`,
      delete: `Delete a record${layoutPart}`,
      list: `List records${layoutPart}`,
      script: `Run the ${fmScript ?? 'FileMaker'} script`,
      'sequential-multi-table': `Retrieve related records across multiple layouts`,
    };
    description = methodPart[fmMethod] ?? `Execute a FileMaker operation${layoutPart}`;
  }

  return {
    name: raw.name ?? 'unnamed_tool',
    description,
    category,
    fmMethod,
    fmLayout,
    fmScript,
    isEnabled: raw.isEnabled ?? raw.enabled ?? true,
    isAiGenerated: raw.isAiGenerated ?? false,
    inputSchema: JSON.stringify(inputSchema),
    outputSchema: JSON.stringify(outputSchema),
    handlerConfig: JSON.stringify(handlerConfig),
  };
}
```

---

## Step 2: Apply normalizeTool in Every Save Path

### Auto-Generate Save Route
Update `src/app/api/servers/[id]/generate-tools/save/route.ts`:

```typescript
import { normalizeTool } from '@/lib/tools/normalize-tool';

// Inside the save loop:
for (const rawTool of selectedTools) {
  const tool = normalizeTool({ ...rawTool, isAiGenerated: true });

  // Skip if name already exists
  const exists = await prisma.tool.findFirst({ where: { serverId: params.id, name: tool.name } });
  if (exists) { skipped++; continue; }

  // Inject connectionId if missing
  const hc = JSON.parse(tool.handlerConfig);
  if (!hc.connectionId && connectionId) {
    hc.connectionId = connectionId;
    tool.handlerConfig = JSON.stringify(hc);
  }

  await prisma.tool.create({ data: { ...tool, serverId: params.id, userId } });
  saved++;
}
```

### AI Suggest (Quick) Route
Update `src/app/api/tools/suggest/route.ts`:

```typescript
const rawSuggestion = await generateSuggestion(prompt, compiledSchema);
const normalized = normalizeTool({ ...rawSuggestion, isAiGenerated: true });
return NextResponse.json({ success: true, data: normalized });
```

### AI Prompt Dialog Route
Update `src/app/api/servers/[id]/ai/generate-from-prompt/route.ts`:

```typescript
const rawTools: any[] = parseAIResponse(aiText);
const normalized = rawTools.map(t => normalizeTool({ ...t, isAiGenerated: true }));
return NextResponse.json({ success: true, data: normalized });
```

---

## Step 3: Updated AI Prompts — Enforce All Fields

Update `src/lib/ai/prompts/create-tools.ts` — add to the end of the prompt:

```typescript
// Add this section to CREATE_TOOLS_PROMPT:
const COMPLETE_TOOL_ENFORCEMENT = `
## REQUIRED FIELDS — Every Tool Must Include ALL of These

Every tool in the output array MUST have every one of these fields populated. No exceptions. No nulls. No omissions.

{
  "name": "string — snake_case, starts with verb, unique",
  "description": "string — 1-2 sentences for AI agents. What it does + when to use it.",
  "category": "string — EXACTLY one of: CRUD | Find | Script | Custom | Multi-Table",
  "fmMethod": "string — EXACTLY one of: find | create | update | delete | list | get | script | sequential-multi-table | odata-filter | odata-expand | odata-batch | system",
  "fmLayout": "string | null — the FileMaker layout name if this tool uses Data API. null for odata/system tools.",
  "fmScript": "string | null — script name if fmMethod is 'script', otherwise null",
  "isEnabled": true,
  "isAiGenerated": true,
  "inputSchema": {
    "type": "object",
    "properties": { "fieldName": { "type": "string", "description": "..." } },
    "required": []
  },
  "handlerConfig": {
    "connectionId": "same connectionId from input — REQUIRED",
    "method": "same as fmMethod",
    "layout": "same as fmLayout — for Data API tools",
    "fieldMappings": { "inputParam": "FMFieldName" },
    "steps": []  // only for sequential-multi-table and odata tools
  }
}

## Rules
1. category and fmMethod must BOTH be present and consistent:
   - fmMethod "find" → category "Find"
   - fmMethod "create"|"update"|"delete"|"list"|"get" → category "CRUD"
   - fmMethod "script" → category "Script"
   - fmMethod "sequential-multi-table"|"odata-expand"|"odata-batch" → category "Multi-Table"
   - fmMethod "odata-filter" → category "Custom"
2. handlerConfig.connectionId must always equal the connectionId from the input payload
3. handlerConfig.method must equal fmMethod
4. For update and delete tools: inputSchema.properties must include "recordId" as a required string field
5. For find tools: inputSchema.properties must include at least one searchable field from the layout
6. Never leave description as an empty string — always write a meaningful description
`;
```

---

## Step 4: Tool Validation API-Side

Add to the tool create/update API route — validate that key fields are populated:

**File**: `src/lib/tools/validate-tool.ts`

```typescript
export interface ToolValidationError {
  field: string;
  message: string;
}

export function validateToolForSave(tool: any): ToolValidationError[] {
  const errors: ToolValidationError[] = [];

  if (!tool.name) errors.push({ field: 'name', message: 'Tool name is required' });
  if (!tool.description) errors.push({ field: 'description', message: 'Description is required' });
  if (!tool.fmMethod) errors.push({ field: 'fmMethod', message: 'FileMaker method is required' });
  if (!tool.category) errors.push({ field: 'category', message: 'Category is required' });

  // Validate handlerConfig
  const hc = typeof tool.handlerConfig === 'string'
    ? safeParseJSON(tool.handlerConfig, null)
    : tool.handlerConfig;

  if (!hc) {
    errors.push({ field: 'handlerConfig', message: 'Handler config is invalid JSON' });
  } else {
    if (!hc.connectionId && tool.fmMethod !== 'system') {
      errors.push({ field: 'handlerConfig.connectionId', message: 'connectionId is required in handlerConfig' });
    }
    if (!hc.method) {
      errors.push({ field: 'handlerConfig.method', message: 'method is required in handlerConfig' });
    }
    if (['find', 'create', 'update', 'delete', 'list', 'get'].includes(tool.fmMethod) && !hc.layout) {
      errors.push({ field: 'handlerConfig.layout', message: 'layout is required for Data API tools' });
    }
  }

  // recordId required in inputSchema for update/delete
  if (['update', 'delete', 'get'].includes(tool.fmMethod)) {
    const inputSchema = safeParseJSON(tool.inputSchema, { properties: {} });
    if (!inputSchema.properties?.recordId) {
      errors.push({ field: 'inputSchema', message: 'update/delete/get tools must have recordId in inputSchema' });
    }
  }

  return errors;
}
```

Use in the POST route:
```typescript
const validationErrors = validateToolForSave(body);
if (validationErrors.length > 0) {
  return 