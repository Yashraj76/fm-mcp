import { safeParseJSON } from '../utils/safe-parse'

const KNOWN_FM_METHODS = new Set([
  'find', 'create', 'update', 'delete', 'list', 'get', 'script', 'custom',
  'sequential-multi-table', 'odata-filter', 'odata-expand', 'odata-batch', 'system',
])

export interface ToolValidationError {
  field: string
  message: string
}

/**
 * Validates a (possibly normalised) tool definition before saving.
 * Returns an array of errors — empty means the tool is valid.
 */
export function validateToolForSave(tool: any): ToolValidationError[] {
  const errors: ToolValidationError[] = []

  if (!tool.name?.trim()) {
    errors.push({ field: 'name', message: 'Tool name is required' })
  } else if (tool.name.trim() === 'unnamed_tool') {
    errors.push({ field: 'name', message: 'Tool name is required (placeholder "unnamed_tool" is not allowed)' })
  }
  if (!tool.description?.trim()) {
    errors.push({ field: 'description', message: 'Description is required' })
  }
  if (!tool.fmMethod?.trim()) {
    errors.push({ field: 'fmMethod', message: 'FileMaker method is required' })
  } else if (!KNOWN_FM_METHODS.has(tool.fmMethod.trim())) {
    errors.push({ field: 'fmMethod', message: `"${tool.fmMethod}" is not a recognised FileMaker method` })
  }
  if (!tool.category?.trim()) {
    errors.push({ field: 'category', message: 'Category is required' })
  }

  const hcRaw =
    typeof tool.handlerConfig === 'string' ? tool.handlerConfig : JSON.stringify(tool.handlerConfig ?? {})
  const hc = safeParseJSON<any>(hcRaw, null)

  if (!hc) {
    errors.push({ field: 'handlerConfig', message: 'Handler config is invalid JSON' })
  } else {
    if (!hc.connectionId && tool.fmMethod !== 'system') {
      errors.push({
        field: 'handlerConfig.connectionId',
        message: 'connectionId is required in handlerConfig (except for system tools)',
      })
    }
    if (!hc.method) {
      errors.push({ field: 'handlerConfig.method', message: 'method is required in handlerConfig' })
    }
    if (
      ['find', 'create', 'update', 'delete', 'list', 'get'].includes(tool.fmMethod) &&
      !hc.layout &&
      !(Array.isArray(hc.steps) && hc.steps[0]?.layout)
    ) {
      errors.push({
        field: 'handlerConfig.layout',
        message: 'layout is required in handlerConfig for Data API tools',
      })
    }
  }

  // recordId required in inputSchema for update/delete/get
  if (['update', 'delete', 'get'].includes(tool.fmMethod)) {
    const inputSchemaRaw =
      typeof tool.inputSchema === 'string' ? tool.inputSchema : JSON.stringify(tool.inputSchema ?? {})
    const inputSchema = safeParseJSON<any>(inputSchemaRaw, { properties: {} })
    if (!inputSchema?.properties?.recordId) {
      errors.push({
        field: 'inputSchema',
        message: 'update/delete/get tools must have recordId in inputSchema.properties',
      })
    }
  }

  return errors
}
