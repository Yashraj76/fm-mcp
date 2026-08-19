import { withFMSession } from '../filemaker/session'
import { FileMakerClient, FileMakerError } from '../filemaker/client'
import { executeSystemTool } from './system-executor'
import {
  executeODataFilter,
  executeODataExpand,
  executeODataBatch,
  ODataHandlerConfig,
} from '../filemaker/odata-executor'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import { projectByPath } from '@/lib/utils/output-selector'

/**
 * Accepts either FileMaker's native sort shape (already `{fieldName,
 * sortOrder}[]`) or a convenience string like "Field asc" / "Field,desc" /
 * "FieldA asc, FieldB desc" and normalizes to the array `client.find` expects.
 */
function normalizeSort(raw: unknown): { fieldName: string; sortOrder: string }[] | undefined {
  if (!raw) return undefined
  if (Array.isArray(raw)) return raw as { fieldName: string; sortOrder: string }[]
  if (typeof raw !== 'string') return undefined
  return raw.split(',').map(part => {
    const [fieldName, order] = part.trim().split(/\s+/)
    return { fieldName, sortOrder: /desc/i.test(order ?? '') ? 'descend' : 'ascend' }
  }).filter(s => s.fieldName)
}

/**
 * Execute standard single-table FileMaker operations.
 */
export async function executeSingleStepTool(
  client: FileMakerClient,
  fmMethod: string,
  handlerConfig: any,
  body: any
): Promise<any> {
  const fmLayout = handlerConfig.layout
  const fmScript = handlerConfig.script

  switch (fmMethod) {
    case 'find': {
      if (!fmLayout) throw new Error('Layout required for find')
      
      const fieldMappings: Record<string, string> = handlerConfig.fieldMappings || {}
      const RESERVED_PARAMS = new Set(['limit', 'offset', 'sort', '_limit', '_offset'])
      const { limit: bodyLimit, offset: bodyOffset, sort: bodySort, ...fieldBody } = body as Record<string, unknown>
      const effectiveLimit = Number(bodyLimit) || Number(handlerConfig.limit) || 50
      const effectiveOffset = Number(bodyOffset) || 1
      const sortParam = normalizeSort(bodySort)

      const rawQuery = Array.isArray(fieldBody) ? fieldBody : [fieldBody]
      const mappedQuery = rawQuery.map((criterion: Record<string, unknown>) => {
        const mapped: Record<string, string | number> = {}
        for (const [inputKey, inputVal] of Object.entries(criterion)) {
          if (RESERVED_PARAMS.has(inputKey)) continue
          const fmField = fieldMappings[inputKey] || inputKey
          mapped[fmField] = inputVal as string | number
        }
        return mapped
      })

      const isEmptyQuery = mappedQuery.length === 1 && Object.keys(mappedQuery[0]).length === 0
      if (isEmptyQuery) {
        return client.listRecords(fmLayout, effectiveLimit, effectiveOffset)
      }

      return client.find(fmLayout, mappedQuery, effectiveLimit, effectiveOffset, sortParam)
    }

    case 'create':
      if (!fmLayout) throw new Error('Layout required for create')
      return client.createRecord(fmLayout, body)

    case 'get':
      if (!fmLayout) throw new Error('Layout required for get')
      if (!body?.recordId) throw new Error('recordId required in body for get')
      return client.getRecord(fmLayout, body.recordId)

    case 'update': {
      if (!fmLayout) throw new Error('Layout required for update')
      if (!body?.recordId) throw new Error('recordId required in body for update')
      const { recordId, ...updateData } = body
      return client.updateRecord(fmLayout, recordId, updateData)
    }

    case 'delete':
      if (!fmLayout) throw new Error('Layout required for delete')
      if (!body?.recordId) throw new Error('recordId required in body for delete')
      return client.deleteRecord(fmLayout, body.recordId)

    case 'list':
      if (!fmLayout) throw new Error('Layout required for list')
      return client.listRecords(fmLayout, body?.limit || 100, body?.offset || 1)

    case 'script': {
      if (!fmLayout) throw new Error('Layout required for script')
      if (!fmScript) throw new Error('Script name required')
      const param = typeof body === 'object' ? JSON.stringify(body) : String(body)
      return client.runScript(fmLayout, fmScript, param)
    }

    default:
      throw new Error(`Unsupported handler type: ${fmMethod}`)
  }
}

/**
 * Execute sequential multi-table FileMaker operations.
 */
export async function executeMultiStepTool(
  client: FileMakerClient,
  steps: any[],
  body: any
): Promise<any> {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('Multi-step handler requires a "steps" array in handlerConfig with at least one step.')
  }
  
  const stepResults: unknown[] = []
  const runtimeParams: Record<string, unknown> = { ...(body as Record<string, unknown>) }
  const year = new Date().getFullYear()

  for (const step of steps) {
    if (step.api !== 'data-api') throw new Error(`Unsupported step api: ${step.api}`)
    const layout = step.layout
    if (!layout) throw new Error(`Step ${step.stepIndex}: layout is required`)

    const fieldMappings: Record<string, string> = step.fieldMappings || {}
    const staticFilters: Record<string, string> = step.staticFilters || {}
    const stepLimit = Number(step.limit) || 500

    // ── JOIN MODE ──
    if (step.joinField && step.joinFrom && Array.isArray(runtimeParams[step.joinFrom])) {
      const ids = runtimeParams[step.joinFrom] as unknown[]
      if (ids.length === 0) {
        stepResults.push({ response: { data: [], dataInfo: { foundCount: 0 } }, _skipped: 'empty join set' })
        continue
      }

      const CHUNK_SIZE = 100
      let allData: any[] = []
      let totalFound = 0
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE)
        const orQuery = chunk.map(id => ({ [step.joinField]: `=${String(id)}` }))
        try {
          const chunkResult = await client.find(layout, orQuery, stepLimit, 1, step.sort)
          const chunkData = (chunkResult as any)?.response?.data || []
          allData = allData.concat(chunkData)
          totalFound += (chunkResult as any)?.response?.dataInfo?.foundCount || 0
        } catch (err: any) {
          if (!(err instanceof FileMakerError) || !err.isNoRecordsFound) throw err
        }
      }

      // Apply static filters client-side
      const clientFiltered = allData.filter(record => {
        const fd = record?.fieldData || {}
        for (const [fmField, rawVal] of Object.entries(staticFilters)) {
          const expandedVal = (rawVal as string)
            .replace('{year}', String(year))
            .replace('{yearStart}', `1/1/${year}`)
            .replace('{yearEnd}', `12/31/${year}`)
          if (expandedVal.includes('...')) {
            const [startStr, endStr] = expandedVal.split('...')
            const recVal = fd[fmField]
            if (!recVal) return false
            try {
              const parseLocal = (s: string) => {
                const [m, d, y] = s.trim().split('/').map(Number)
                return new Date(y, m - 1, d).getTime()
              }
              const recTs = parseLocal(String(recVal))
              const startTs = parseLocal(startStr)
              const endTs = parseLocal(endStr)
              if (recTs < startTs || recTs > endTs) return false
            } catch { return false }
          } else {
            if (String(fd[fmField]) !== expandedVal) return false
          }
        }
        return true
      })

      stepResults.push({
        response: {
          data: clientFiltered.slice(0, stepLimit),
          dataInfo: {
            foundCount: clientFiltered.length,
            returnedCount: Math.min(clientFiltered.length, stepLimit),
            _rawFetchedCount: allData.length,
            _clientFiltered: true,
            layout,
          }
        }
      })
      continue
    }

    // ── STANDARD MODE ──
    // `recordId` is a reserved runtime param (like limit/offset) rather than
    // a mappable FM field — get/update/delete address a specific record by
    // id, never through fieldMappings.
    const RESERVED_STEP_PARAMS = new Set(['limit', 'offset', '_limit', '_offset', 'recordId'])
    const query: Record<string, string | number> = {}

    for (const [inputKey, fmField] of Object.entries(fieldMappings)) {
      if (RESERVED_STEP_PARAMS.has(inputKey) || RESERVED_STEP_PARAMS.has(fmField as string)) continue
      if (runtimeParams[inputKey] !== undefined) {
        query[fmField as string] = runtimeParams[inputKey] as string | number
      }
    }

    for (const [fmField, fmVal] of Object.entries(staticFilters)) {
      query[fmField] = (fmVal as string)
        .replace('{year}', String(year))
        .replace('{yearStart}', `1/1/${year}`)
        .replace('{yearEnd}', `12/31/${year}`)
    }

    if (fieldMappings.orderEnteredDate !== undefined && runtimeParams.orderEnteredDate === undefined) {
      query[fieldMappings.orderEnteredDate] = `1/1/${year}...12/31/${year}`
    }

    let stepResult;
    const stepOperation = step.operation || 'find'

    // Previously this branch only ever ran `find`/`listRecords` regardless of
    // `stepOperation` — a step configured as create/update/delete/get/script
    // silently executed as a find instead. Every AI-generated tool (and, once
    // the tool dialog's FileMaker/Multi-Table tabs are merged, every manually
    // built single-table tool too) goes through this path via a 1-step
    // `steps[]` array, so those operations must be dispatched correctly here.
    switch (stepOperation) {
      case 'get': {
        const recordId = runtimeParams.recordId
        if (recordId === undefined) throw new Error(`Step ${step.stepIndex}: recordId is required for get`)
        stepResult = await client.getRecord(layout, String(recordId))
        break
      }
      case 'create':
        stepResult = await client.createRecord(layout, query)
        break
      case 'update': {
        const recordId = runtimeParams.recordId
        if (recordId === undefined) throw new Error(`Step ${step.stepIndex}: recordId is required for update`)
        stepResult = await client.updateRecord(layout, String(recordId), query)
        break
      }
      case 'delete': {
        const recordId = runtimeParams.recordId
        if (recordId === undefined) throw new Error(`Step ${step.stepIndex}: recordId is required for delete`)
        stepResult = await client.deleteRecord(layout, String(recordId))
        break
      }
      case 'script': {
        if (!step.scriptName) throw new Error(`Step ${step.stepIndex}: scriptName is required for script`)
        const scriptParam = Object.keys(query).length > 0 ? JSON.stringify(query) : JSON.stringify(runtimeParams)
        stepResult = await client.runScript(layout, step.scriptName, scriptParam)
        break
      }
      case 'list': {
        const listLimit = Number(runtimeParams['limit']) || stepLimit
        const listOffset = Number(runtimeParams['offset']) || 1
        stepResult = await client.listRecords(layout, listLimit, listOffset)
        break
      }
      default: {
        // 'find' (or unset) — empty query falls back to a plain list, same
        // as before.
        if (Object.keys(query).length === 0) {
          const listLimit = Number(runtimeParams['limit']) || stepLimit
          const listOffset = Number(runtimeParams['offset']) || 1
          stepResult = await client.listRecords(layout, listLimit, listOffset)
        } else {
          stepResult = await client.find(layout, [query], stepLimit, 1, step.sort)
        }
      }
    }
    stepResults.push(stepResult)

    // ── EXTRACTION ──
    if (step.extractField && step.useExtractedAs) {
      const allRecords: any[] = (stepResult as any)?.response?.data || []
      if (allRecords.length === 0) {
        return { stepResults, message: `No records found in step ${step.stepIndex}, aborting chain` }
      }

      if (step.extractMode === 'all') {
        const allValues = allRecords
          .map((r: any) => r?.fieldData?.[step.extractField])
          .filter((v: unknown) => v !== undefined && v !== null && v !== '')
        runtimeParams[step.useExtractedAs] = [...new Set(allValues)]
      } else {
        const firstRecord = allRecords[0]?.fieldData
        if (firstRecord?.[step.extractField] !== undefined) {
          runtimeParams[step.useExtractedAs] = firstRecord[step.extractField]
        } else {
          return { stepResults, message: `Extract field "${step.extractField}" not found in step ${step.stepIndex} result` }
        }
      }
    }
  }

  return { stepResults, runtimeParams }
}

/**
 * High-level entry point to execute ANY tool against its parameters and connection.
 */
export async function executeToolWithParams(
  tool: {
    category?: string | null
    fmMethod?: string | null
    handlerConfig?: string | Record<string, any> | null
    outputSelector?: string | null
    [key: string]: any
  },
  params: Record<string, any>,
  connection: any
): Promise<any> {
  const result = await executeToolInternal(tool, params, connection)
  return tool.outputSelector ? projectByPath(result, tool.outputSelector) : result
}

async function executeToolInternal(
  tool: {
    category?: string | null
    fmMethod?: string | null
    handlerConfig?: string | Record<string, any> | null
    [key: string]: any
  },
  params: Record<string, any>,
  connection: any
): Promise<any> {
  const handlerConfig = (typeof tool.handlerConfig === 'string'
    ? safeParseJSON<Record<string, unknown>>(tool.handlerConfig, {})
    : tool.handlerConfig || {}) as Record<string, unknown>

  const fmMethod = (tool.fmMethod || handlerConfig.type || handlerConfig.method || 'find') as string

  // 1. SYSTEM TOOLS (No FM connection needed)
  if (tool.category === 'system') {
    const operation = (handlerConfig.operation || fmMethod) as string
    return executeSystemTool(operation, params)
  }

  if (!connection) {
    throw new Error('No FileMaker connection associated with this tool/server')
  }

  // 2. ODATA TOOLS
  const isOData = fmMethod.startsWith('odata-') || (typeof handlerConfig.type === 'string' && handlerConfig.type.startsWith('odata-'))
  if (isOData) {
    const odataConfig = handlerConfig as unknown as ODataHandlerConfig
    switch (odataConfig.type) {
      case 'odata-filter':
        return executeODataFilter(odataConfig, params, connection)
      case 'odata-expand':
        return executeODataExpand(odataConfig, params, connection)
      case 'odata-batch':
        return executeODataBatch(odataConfig, params, connection)
      default:
        throw new Error(`Unknown OData handler type: ${odataConfig.type}`)
    }
  }

  // 3. FILEMAKER SESSION TOOLS (Multi-step or Single-step)
  return withFMSession(connection, async (client) => {
    if (fmMethod === 'multi-step' || handlerConfig.method === 'sequential-multi-table' || Array.isArray(handlerConfig.steps)) {
      return executeMultiStepTool(client, (handlerConfig.steps as any[]) || [], params)
    }

    return executeSingleStepTool(client, fmMethod, handlerConfig, params)
  })
}
