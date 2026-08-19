import { type ToolStep } from '@/components/tools/multi-table-builder'
import { type JsonSchema } from '@/components/tools/schema-builder'

export interface ExtraParam {
  name: string
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description: string
  required: boolean
}

/** The one extra param the executor itself depends on by exact name — see
 * RESERVED_STEP_PARAMS/RESERVED_PARAMS in executor-service.ts. Auto-added
 * whenever a step needs to address a single record by id. */
export function defaultRecordIdParam(): ExtraParam {
  return { name: 'recordId', type: 'string', description: 'The FileMaker record ID to target', required: true }
}

/**
 * inputSchema is generated, not hand-authored: every step's fieldMappings key
 * becomes a param (mapped to that step's FM field), and every declared extra
 * param (pagination, recordId, script args, etc. — anything that isn't a
 * layout field) is added alongside it. This is the single source of truth
 * consumed by the Test tab and by validate-tool.ts's fieldMappings↔inputSchema
 * cross-check.
 */
export function deriveInputSchema(steps: ToolStep[], extraParams: ExtraParam[]): JsonSchema {
  const properties: Record<string, unknown> = {}

  for (const step of steps) {
    for (const [inputParam, fmField] of Object.entries(step.fieldMappings || {})) {
      if (!inputParam || properties[inputParam]) continue
      properties[inputParam] = {
        type: 'string',
        description: `Maps to FileMaker field "${fmField}"${step.layout ? ` on layout "${step.layout}"` : ''}`,
      }
    }
  }

  const required: string[] = []
  for (const p of extraParams) {
    if (!p.name) continue
    properties[p.name] = {
      type: p.type,
      ...(p.description ? { description: p.description } : {}),
    }
    if (p.required) required.push(p.name)
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

/** Whatever inputSchema properties aren't covered by any step's fieldMappings
 * (pagination, recordId, script args, ...) become extra params — used both
 * to seed the dialog's editor when loading an existing tool, and server-side
 * to regenerate AI-generated tools' inputSchema from their own fieldMappings
 * rather than trusting the model kept the two in sync. */
export function reverseDeriveExtraParams(inputSchema: JsonSchema | null | undefined, steps: ToolStep[]): ExtraParam[] {
  const mappedKeys = new Set(steps.flatMap(s => Object.keys(s.fieldMappings || {})))
  const properties = inputSchema?.properties || {}
  const required = new Set(inputSchema?.required || [])
  const params: ExtraParam[] = []
  for (const [name, raw] of Object.entries(properties)) {
    if (mappedKeys.has(name)) continue
    const prop = raw as Record<string, unknown>
    params.push({
      name,
      type: (prop.type as ExtraParam['type']) || 'string',
      description: (prop.description as string) || '',
      required: required.has(name),
    })
  }
  return params
}
