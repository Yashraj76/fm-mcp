import { safeParseJSON } from '../utils/safe-parse'

export interface RawToolDef {
  name?: string
  description?: string
  category?: string
  fmMethod?: string
  fmLayout?: string
  fmScript?: string
  isEnabled?: boolean
  enabled?: boolean
  isAiGenerated?: boolean
  inputSchema?: any
  outputSchema?: any
  handlerConfig?: any
  executionStrategy?: string
  steps?: any[]
  [key: string]: any
}

export interface NormalizedTool {
  name: string
  description: string
  category: string
  fmMethod: string
  fmLayout: string | null
  fmScript: string | null
  isEnabled: boolean
  isAiGenerated: boolean
  inputSchema: string   // JSON string
  outputSchema: string  // JSON string
  handlerConfig: string // JSON string
}

/** Maps AI executionStrategy → internal fmMethod */
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
  system: 'system',
}

/** Maps fmMethod → category */
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
}

/**
 * Normalises a raw tool definition (from AI or user input) to a complete,
 * database-ready NormalizedTool. Always call this before saving an AI-generated tool.
 */
export function normalizeTool(raw: RawToolDef): NormalizedTool {
  // ── 1. Resolve fmMethod ──────────────────────────────────────────────────
  let fmMethod = (raw.fmMethod ?? '').trim()
  if (!fmMethod && raw.executionStrategy) {
    fmMethod = STRATEGY_TO_METHOD[raw.executionStrategy] ?? 'custom'
  }
  if (!fmMethod) fmMethod = 'custom'

  // ── 2. Resolve category ──────────────────────────────────────────────────
  let category = (raw.category ?? '').trim()
  // Normalise legacy/AI values to valid enum
  if (category === 'lookup') category = 'Find'
  if (category === 'multi-table') category = 'Multi-Table'
  if (!METHOD_TO_CATEGORY[fmMethod.toLowerCase()] && !category) category = 'Custom'
  if (!category) category = METHOD_TO_CATEGORY[fmMethod] ?? 'Custom'

  // ── 3. Parse handlerConfig ───────────────────────────────────────────────
  const handlerConfigRaw = raw.handlerConfig ?? {}
  const hc: Record<string, any> =
    typeof handlerConfigRaw === 'string'
      ? safeParseJSON(handlerConfigRaw, {})
      : { ...handlerConfigRaw }

  // ── 4. Resolve fmLayout ──────────────────────────────────────────────────
  let fmLayout: string | null = raw.fmLayout ?? null
  if (!fmLayout && hc.layout) fmLayout = hc.layout
  if (!fmLayout && Array.isArray(hc.steps) && hc.steps[0]?.layout) {
    fmLayout = hc.steps[0].layout
  }
  if (!fmLayout && Array.isArray(raw.steps) && raw.steps[0]?.layout) {
    fmLayout = raw.steps[0].layout
  }

  // ── 5. Resolve fmScript ──────────────────────────────────────────────────
  let fmScript: string | null = raw.fmScript ?? null
  if (!fmScript && hc.script) fmScript = hc.script
  if (!fmScript && hc.scriptName) fmScript = hc.scriptName
  if (!fmScript && Array.isArray(hc.steps) && hc.steps[0]?.scriptName) {
    fmScript = hc.steps[0].scriptName
  }

  // ── 6. Build complete handlerConfig ──────────────────────────────────────
  // If AI put steps at the top level, move them into handlerConfig
  if (raw.steps && !hc.steps) {
    hc.steps = raw.steps
  }

  // Ensure method is set
  if (!hc.method) hc.method = fmMethod

  // For single-step tools, ensure layout is present in hc
  if (fmLayout && !hc.layout && !Array.isArray(hc.steps)) {
    hc.layout = fmLayout
  }

  // For script tools, ensure scriptName is present
  if (fmScript && fmMethod === 'script' && !hc.script && !hc.scriptName) {
    hc.scriptName = fmScript
  }

  // ── 7. Build complete inputSchema ────────────────────────────────────────
  let inputSchema: any = {}
  if (raw.inputSchema) {
    inputSchema =
      typeof raw.inputSchema === 'string'
        ? safeParseJSON(raw.inputSchema, {})
        : raw.inputSchema
  }
  if (!inputSchema.type) inputSchema.type = 'object'
  if (!inputSchema.properties) inputSchema.properties = {}
  if (!inputSchema.required) inputSchema.required = []

  // update / delete / get tools must have recordId
  if (
    ['update', 'delete', 'get'].includes(fmMethod) &&
    !inputSchema.properties.recordId
  ) {
    inputSchema.properties = {
      recordId: {
        type: 'string',
        description: 'The FileMaker record ID to target',
      },
      ...inputSchema.properties,
    }
    if (!inputSchema.required.includes('recordId')) {
      inputSchema.required.unshift('recordId')
    }
  }

  // ── 8. Build complete outputSchema ───────────────────────────────────────
  let outputSchema: any = raw.outputSchema ?? {}
  if (typeof outputSchema === 'string') outputSchema = safeParseJSON(outputSchema, {})
  if (!outputSchema.type) outputSchema = { type: 'object', properties: {} }

  // ── 9. Build description ─────────────────────────────────────────────────
  let description = (raw.description ?? '').trim()
  if (!description) {
    const layoutPart = fmLayout ? ` in the ${fmLayout} layout` : ''
    const methodDescriptions: Record<string, string> = {
      find: `Search for records${layoutPart}`,
      create: `Create a new record${layoutPart}`,
      update: `Update a record${layoutPart}`,
      delete: `Delete a record${layoutPart}`,
      list: `List records${layoutPart}`,
      get: `Get a record${layoutPart}`,
      script: `Run the ${fmScript ?? 'FileMaker'} script`,
      'sequential-multi-table': `Retrieve related records across multiple layouts`,
    }
    description = methodDescriptions[fmMethod] ?? `Execute a FileMaker operation${layoutPart}`
  }

  return {
    name: (raw.name ?? 'unnamed_tool').trim(),
    description,
    category,
    fmMethod,
    fmLayout,
    fmScript,
    isEnabled: raw.isEnabled ?? raw.enabled ?? true,
    isAiGenerated: raw.isAiGenerated ?? false,
    inputSchema: JSON.stringify(inputSchema),
    outputSchema: JSON.stringify(outputSchema),
    handlerConfig: JSON.stringify(hc),
  }
}
