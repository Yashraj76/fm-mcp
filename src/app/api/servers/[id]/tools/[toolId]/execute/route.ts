import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withFMSession } from '@/lib/filemaker/session'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, toolId: string }> }
) {
  const startTime = Date.now()
  let requestBody = ''
  
  try {
    const { toolId } = await params
    const bodyText = await request.text()
    requestBody = bodyText
    const body = bodyText ? JSON.parse(bodyText) : {}
    
    const tool = await db.tool.findUnique({
      where: { id: toolId },
      include: {
        server: {
          include: {
            connections: {
              include: { connection: true }
            }
          }
        }
      }
    })
    
    if (!tool) {
      return NextResponse.json({ success: false, error: 'Tool not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (!tool.isEnabled) {
      return NextResponse.json({ success: false, error: 'Tool is disabled', code: 'TOOL_DISABLED' }, { status: 400 })
    }

    const handlerConfig = JSON.parse(tool.handlerConfig || '{}')
    const fmMethod = tool.fmMethod || handlerConfig.type
    const fmLayout = tool.fmLayout || handlerConfig.layout
    const fmScript = tool.fmScript || handlerConfig.script
    
    // Choose connection (for now, use first connection linked to server, or handlerConfig.connectionId)
    const connectionId = handlerConfig.connectionId || (tool.server.connections[0] ? tool.server.connections[0].connectionId : null)
    
    if (!connectionId) {
      throw new Error('No FileMaker connection associated with this tool/server')
    }

    const connection = tool.server.connections.find(c => c.connectionId === connectionId)?.connection
      || await db.fMConnection.findUnique({ where: { id: connectionId }})

    if (!connection) {
      throw new Error('FileMaker connection not found')
    }

    // Execute with session
    const result = await withFMSession(connection, async (client) => {
      // ===== SEQUENTIAL MULTI-TABLE =====
      if (fmMethod === 'multi-step' || handlerConfig.method === 'sequential-multi-table') {
        const steps = handlerConfig.steps
        if (!Array.isArray(steps) || steps.length === 0) {
          throw new Error('Multi-step handler requires a "steps" array in handlerConfig with at least one step.')
        }
        const stepResults: unknown[] = []
        // Runtime params start from the user-supplied body
        const runtimeParams: Record<string, unknown> = { ...(body as Record<string, unknown>) }
        const year = new Date().getFullYear()

        for (const step of steps) {
          if (step.api !== 'data-api') throw new Error(`Unsupported step api: ${step.api}`)
          const layout = step.layout
          if (!layout) throw new Error(`Step ${step.stepIndex}: layout is required`)

          const fieldMappings: Record<string, string> = step.fieldMappings || {}
          const staticFilters: Record<string, string> = step.staticFilters || {}
          const stepLimit = Number(step.limit) || 500

          // ── JOIN MODE: build OR query from a previous step's extracted array ──
          if (step.joinField && step.joinFrom && Array.isArray(runtimeParams[step.joinFrom])) {
            const ids = runtimeParams[step.joinFrom] as unknown[]
            if (ids.length === 0) {
              stepResults.push({ response: { data: [], dataInfo: { foundCount: 0 } }, _skipped: 'empty join set' })
              continue
            }

            // FM can reject date ranges in large OR queries → fetch by ID join only, filter dates client-side
            // Chunk to avoid FM URL length limits (max ~100 criteria per request is safe)
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
                // FM "401 no records" is not a fatal error — chunk just had no matches
                if (!err.message?.includes('No records match')) throw err
              }
            }

            // Apply staticFilters client-side (handles date ranges safely)
            const clientFiltered = allData.filter(record => {
              const fd = record?.fieldData || {}
              for (const [fmField, rawVal] of Object.entries(staticFilters)) {
                const expandedVal = (rawVal as string)
                  .replace('{year}', String(year))
                  .replace('{yearStart}', `1/1/${year}`)
                  .replace('{yearEnd}', `12/31/${year}`)
                // Date range filter: "1/1/2026...12/31/2026"
                if (expandedVal.includes('...')) {
                  const [startStr, endStr] = expandedVal.split('...')
                  const recVal = fd[fmField]
                  if (!recVal) return false
                  try {
                    // Parse MM/DD/YYYY timezone-safely (avoid UTC offset shifting)
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
                  // Exact match filter
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


          // ── STANDARD MODE: build single criterion from fieldMappings + staticFilters ──
          const query: Record<string, unknown> = {}
          // From user-supplied params via fieldMappings
          for (const [inputKey, fmField] of Object.entries(fieldMappings)) {
            if (runtimeParams[inputKey] !== undefined) {
              query[fmField as string] = runtimeParams[inputKey]
            }
          }
          // Hardcoded static filters (e.g. ValidUser = "1")
          for (const [fmField, fmVal] of Object.entries(staticFilters)) {
            // Auto-expand year placeholders
            query[fmField] = (fmVal as string)
              .replace('{year}', String(year))
              .replace('{yearStart}', `1/1/${year}`)
              .replace('{yearEnd}', `12/31/${year}`)
          }
          // Legacy: auto-inject current year into OrderEnteredDate if mapped but not supplied
          if (fieldMappings.orderEnteredDate !== undefined && runtimeParams.orderEnteredDate === undefined) {
            query[fieldMappings.orderEnteredDate] = `1/1/${year}...12/31/${year}`
          }

          let stepResult;
          if (Object.keys(query).length === 0) {
            stepResult = await client.listRecords(layout, stepLimit, 1)
          } else {
            stepResult = await client.find(layout, [query], stepLimit, 1)
          }
          stepResults.push(stepResult)

          // ── EXTRACTION ──
          if (step.extractField && step.useExtractedAs) {
            const allRecords: any[] = (stepResult as any)?.response?.data || []
            if (allRecords.length === 0) {
              return { stepResults, message: `No records found in step ${step.stepIndex}, aborting chain` }
            }

            if (step.extractMode === 'all') {
              // Collect the field value from EVERY record (for OR join in next step)
              const allValues = allRecords
                .map((r: any) => r?.fieldData?.[step.extractField])
                .filter((v: unknown) => v !== undefined && v !== null && v !== '')
              runtimeParams[step.useExtractedAs] = [...new Set(allValues)] // deduplicate
            } else {
              // Default: extract from first record only
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

      // ===== SINGLE TABLE OPERATIONS =====
      switch (fmMethod) {
        case 'find':
          if (!fmLayout) throw new Error('Layout required for find')
          // Apply field mappings: translate input param names → FM field names (inputKey → fmField)
          const fieldMappings: Record<string, string> = handlerConfig.fieldMappings || {}
          const RESERVED_PARAMS = new Set(['limit', 'offset', 'sort', '_limit', '_offset'])
          const { limit: bodyLimit, offset: bodyOffset, ...fieldBody } = body as Record<string, unknown>
          const effectiveLimit = Number(bodyLimit) || Number(handlerConfig.limit) || 50
          const effectiveOffset = Number(bodyOffset) || 1
          const rawQuery = Array.isArray(fieldBody) ? fieldBody : [fieldBody]
          const mappedQuery = rawQuery.map((criterion: Record<string, unknown>) => {
            const mapped: Record<string, unknown> = {}
            for (const [inputKey, inputVal] of Object.entries(criterion)) {
              if (RESERVED_PARAMS.has(inputKey)) continue
              // Forward mapping: inputKey → fmField
              const fmField = fieldMappings[inputKey] || inputKey
              mapped[fmField] = inputVal
            }
            return mapped
          })
          
          const isEmptyQuery = mappedQuery.length === 1 && Object.keys(mappedQuery[0]).length === 0
          if (isEmptyQuery) {
            return client.listRecords(fmLayout, effectiveLimit, effectiveOffset)
          }
          
          return client.find(fmLayout, mappedQuery, effectiveLimit, effectiveOffset)
          
        case 'create':
          if (!fmLayout) throw new Error('Layout required for create')
          return client.createRecord(fmLayout, body)
          
        case 'get':
          if (!fmLayout) throw new Error('Layout required for get')
          if (!(body as any).recordId) throw new Error('recordId required in body for get')
          return client.getRecord(fmLayout, (body as any).recordId)
          
        case 'update':
          if (!fmLayout) throw new Error('Layout required for update')
          if (!(body as any).recordId) throw new Error('recordId required in body for update')
          const { recordId, ...updateData } = body as any
          return client.updateRecord(fmLayout, recordId, updateData)
          
        case 'delete':
          if (!fmLayout) throw new Error('Layout required for delete')
          if (!(body as any).recordId) throw new Error('recordId required in body for delete')
          return client.deleteRecord(fmLayout, (body as any).recordId)
          
        case 'list':
          if (!fmLayout) throw new Error('Layout required for list')
          return client.listRecords(fmLayout, (body as any).limit || 100, (body as any).offset || 1)
          
        case 'script':
          if (!fmLayout) throw new Error('Layout required for script')
          if (!fmScript) throw new Error('Script name required')
          const param = typeof body === 'object' ? JSON.stringify(body) : String(body)
          return client.runScript(fmLayout, fmScript, param)
          
        default:
          throw new Error(`Unsupported handler type: ${fmMethod}`)
      }
    })

    const duration = Date.now() - startTime
    
    // Save execution history
    await db.toolExecution.create({
      data: {
        toolId,
        requestBody,
        responseStatus: 200,
        responseBody: JSON.stringify(result),
        duration,
        status: 'success'
      }
    }).catch(e => console.error('[Execution History] Failed to save', e))

    return NextResponse.json({
      success: true,
      status: 200,
      duration,
      data: result
    })

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error('[Tool Execution Failed]', error)
    
    try {
      const { toolId } = await params
      await db.toolExecution.create({
        data: {
          toolId,
          requestBody,
          responseStatus: 500,
          error: error.message,
          duration,
          status: 'error'
        }
      })
    } catch(e) {
      console.error('[Execution History] Failed to save error', e)
    }

    return NextResponse.json({ 
      success: false,
      status: 500, 
      duration, 
      error: error.message || 'Execution failed',
      code: 'FM_EXECUTION_ERROR'
    }, { status: 500 })
  }
}
