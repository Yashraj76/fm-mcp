import { db } from '@/lib/db'
import { withFMSession } from '@/lib/filemaker/session'
import { executeSystemTool } from '@/lib/tools/system-executor'
import type { Tool, McpServer, FMConnectionServer, FMConnection } from '@prisma/client'

type ToolWithServer = Tool & {
  server: McpServer & {
    connections: (FMConnectionServer & { connection: FMConnection })[]
  }
}

export async function executeMcpTool(
  tool: ToolWithServer,
  params: Record<string, any>
): Promise<unknown> {
  const handlerConfig = JSON.parse(tool.handlerConfig || '{}')
  const fmMethod = tool.fmMethod || handlerConfig.type || handlerConfig.method
  const fmLayout = tool.fmLayout || handlerConfig.layout
  const fmScript = tool.fmScript || handlerConfig.script

  if (tool.category === 'system') {
    const operation = handlerConfig.operation || fmMethod
    return executeSystemTool(operation, params)
  }

  const connectionId = handlerConfig.connectionId || tool.server.connections[0]?.connectionId
  if (!connectionId) throw new Error('No FileMaker connection associated with this tool/server')

  const connection =
    tool.server.connections.find((c) => c.connectionId === connectionId)?.connection ??
    (await db.fMConnection.findUnique({ where: { id: connectionId } }))

  if (!connection) throw new Error('FileMaker connection not found')

  return withFMSession(connection, async (client) => {
    // ── MULTI-STEP ──
    if (fmMethod === 'multi-step' || handlerConfig.method === 'sequential-multi-table') {
      const steps = handlerConfig.steps
      if (!Array.isArray(steps) || steps.length === 0) {
        throw new Error('Multi-step handler requires a "steps" array in handlerConfig')
      }

      const stepResults: unknown[] = []
      const runtimeParams: Record<string, unknown> = { ...params }
      const year = new Date().getFullYear()

      for (const step of steps) {
        if (step.api !== 'data-api') throw new Error(`Unsupported step api: ${step.api}`)
        const layout = step.layout
        if (!layout) throw new Error(`Step ${step.stepIndex}: layout is required`)

        const fieldMappings: Record<string, string> = step.fieldMappings || {}
        const staticFilters: Record<string, string> = step.staticFilters || {}
        const stepLimit = Number(step.limit) || 500

        // JOIN MODE
        if (step.joinField && step.joinFrom && Array.isArray(runtimeParams[step.joinFrom])) {
          const ids = runtimeParams[step.joinFrom] as unknown[]
          if (ids.length === 0) {
            stepResults.push({
              response: { data: [], dataInfo: { foundCount: 0 } },
              _skipped: 'empty join set',
            })
            continue
          }

          const CHUNK_SIZE = 100
          let allData: any[] = []
          for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE)
            const orQuery = chunk.map((id) => ({ [step.joinField]: `=${String(id)}` }))
            try {
              const chunkResult = await client.find(layout, orQuery, stepLimit, 1, step.sort)
              allData = allData.concat((chunkResult as any)?.response?.data || [])
            } catch (err: any) {
              if (!err.message?.includes('No records match')) throw err
            }
          }

          const parseLocal = (s: string) => {
            const [m, d, y] = s.trim().split('/').map(Number)
            return new Date(y, m - 1, d).getTime()
          }

          const clientFiltered = allData.filter((record) => {
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
                  const ts = parseLocal(String(recVal))
                  if (ts < parseLocal(startStr) || ts > parseLocal(endStr)) return false
                } catch {
                  return false
                }
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
                layout,
              },
            },
          })
          continue
        }

        // STANDARD MODE
        const query: Record<string, unknown> = {}
        for (const [inputKey, fmField] of Object.entries(fieldMappings)) {
          if (runtimeParams[inputKey] !== undefined) query[fmField as string] = runtimeParams[inputKey]
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

        let stepResult: any
        if (Object.keys(query).length === 0) {
          stepResult = await client.listRecords(layout, stepLimit, 1)
        } else {
          stepResult = await client.find(layout, [query], stepLimit, 1)
        }
        stepResults.push(stepResult)

        // EXTRACTION
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
              return {
                stepResults,
                message: `Extract field "${step.extractField}" not found in step ${step.stepIndex}`,
              }
            }
          }
        }
      }

      return { stepResults, runtimeParams }
    }

    // ── SINGLE-TABLE ──
    switch (fmMethod) {
      case 'find': {
        if (!fmLayout) throw new Error('Layout required for find')
        const fieldMappings: Record<string, string> = handlerConfig.fieldMappings || {}
        const { limit: bodyLimit, offset: bodyOffset, ...fieldBody } = params
        const effectiveLimit = Number(bodyLimit) || Number(handlerConfig.limit) || 50
        const effectiveOffset = Number(bodyOffset) || 1
        const query: Record<string, unknown> = {}
        for (const [inputKey, inputVal] of Object.entries(fieldBody)) {
          const fmField = fieldMappings[inputKey] || inputKey
          query[fmField] = inputVal
        }
        if (Object.keys(query).length === 0) {
          return client.listRecords(fmLayout, effectiveLimit, effectiveOffset)
        }
        return client.find(fmLayout, [query], effectiveLimit, effectiveOffset)
      }

      case 'create':
        if (!fmLayout) throw new Error('Layout required for create')
        return client.createRecord(fmLayout, params)

      case 'get':
        if (!fmLayout) throw new Error('Layout required for get')
        if (!params.recordId) throw new Error('recordId required for get')
        return client.getRecord(fmLayout, params.recordId as string)

      case 'update': {
        if (!fmLayout) throw new Error('Layout required for update')
        if (!params.recordId) throw new Error('recordId required for update')
        const { recordId, ...updateData } = params
        return client.updateRecord(fmLayout, recordId as string, updateData)
      }

      case 'delete':
        if (!fmLayout) throw new Error('Layout required for delete')
        if (!params.recordId) throw new Error('recordId required for delete')
        return client.deleteRecord(fmLayout, params.recordId as string)

      case 'list':
        if (!fmLayout) throw new Error('Layout required for list')
        return client.listRecords(
          fmLayout,
          Number(params.limit) || 100,
          Number(params.offset) || 1
        )

      case 'script': {
        if (!fmLayout) throw new Error('Layout required for script')
        if (!fmScript) throw new Error('Script name required')
        const scriptParam =
          typeof params === 'object' ? JSON.stringify(params) : String(params)
        return client.runScript(fmLayout, fmScript, scriptParam)
      }

      default:
        throw new Error(`Unsupported handler type: ${fmMethod}`)
    }
  })
}
