import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withFMSession } from '@/lib/filemaker/session'
import { z } from 'zod'

const executeSchema = z.object({
  connectionId: z.string(),
  type: z.string(),
  layout: z.string(),
  script: z.string().optional(),
  input: z.any()
})

// POST /api/playground/execute - Ad-hoc tool execution
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const bodyText = await request.text()
    const requestBody = bodyText ? JSON.parse(bodyText) : {}
    const parsed = executeSchema.parse(requestBody)

    const connection = await db.fMConnection.findUnique({ where: { id: parsed.connectionId }})

    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Execute with session
    const result = await withFMSession(connection, async (client) => {
      switch (parsed.type) {
        case 'find':
          const query = Array.isArray(parsed.input) ? parsed.input : [parsed.input]
          return client.find(parsed.layout, query)
        case 'create':
          return client.createRecord(parsed.layout, parsed.input)
        case 'get':
          return client.getRecord(parsed.layout, parsed.input.recordId)
        case 'update':
          const { recordId, ...updateData } = parsed.input
          return client.updateRecord(parsed.layout, recordId, updateData)
        case 'delete':
          return client.deleteRecord(parsed.layout, parsed.input.recordId)
        case 'list':
          return client.listRecords(parsed.layout, parsed.input.limit || 100, parsed.input.offset || 1)
        case 'script':
          if (!parsed.script) throw new Error('Script name required')
          const param = typeof parsed.input === 'object' ? JSON.stringify(parsed.input) : String(parsed.input)
          return client.runScript(parsed.layout, parsed.script, param)
        default:
          throw new Error(`Unsupported handler type: ${parsed.type}`)
      }
    })

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      status: 200,
      duration,
      data: result
    })

  } catch (error: any) {
    console.error('[Playground Execution Failed]', error)
    return NextResponse.json({ 
      success: false,
      status: 500, 
      duration: Date.now() - startTime, 
      error: error.message || 'Execution failed',
      code: 'FM_EXECUTION_ERROR'
    }, { status: 500 })
  }
}
