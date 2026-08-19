import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withFMSession } from '@/lib/filemaker/session'
import { FileMakerError } from '@/lib/filemaker/client'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { logger } from '@/lib/logger'

const executeSchema = z.object({
  connectionId: z.string(),
  type: z.string(),
  layout: z.string(),
  script: z.string().optional(),
  input: z.any()
})

// POST /api/playground/execute - Ad-hoc tool execution
export const POST = withAuth(async (request, { params, userId }) => {
    const startTime = Date.now()
    try {
    const bodyText = await request.text()
    const requestBody = safeParseJSON<Record<string, any>>(bodyText, {})
    const parsed = executeSchema.parse(requestBody)

    const connection = await db.fMConnection.findFirst({ where: {
        userId: userId,
        id: parsed.connectionId }})

    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Validate request shape up front so these stay clear 400s — the generic
    // catch below deliberately hides non-FileMaker error messages.
    const SUPPORTED_TYPES = ['find', 'create', 'get', 'update', 'delete', 'list', 'script']
    if (!SUPPORTED_TYPES.includes(parsed.type)) {
      return NextResponse.json({
        success: false, status: 400, duration: Date.now() - startTime,
        error: `Unsupported handler type: ${parsed.type}`, code: 'VALIDATION_ERROR',
      }, { status: 400 })
    }
    if (parsed.type === 'script' && !parsed.script) {
      return NextResponse.json({
        success: false, status: 400, duration: Date.now() - startTime,
        error: 'Script name required', code: 'VALIDATION_ERROR',
      }, { status: 400 })
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
        case 'script': {
          const param = typeof parsed.input === 'object' ? JSON.stringify(parsed.input) : String(parsed.input)
          return client.runScript(parsed.layout, parsed.script!, param)
        }
        default:
          // Unreachable — type validated above.
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
    logger.error({ err: error }, '[Playground Execution Failed]')
    if (error instanceof ZodError) {
      return NextResponse.json({
        success: false, status: 400, duration: Date.now() - startTime,
        error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.issues,
      }, { status: 400 })
    }
    // FileMakerError messages are crafted to be user-safe (see client.ts).
    // Anything else may carry internals (stack fragments, hostnames, driver
    // errors) — return a generic message; the detail is in the server log above.
    const message = error instanceof FileMakerError
      ? error.message
      : 'Execution failed due to an internal error.'
    return NextResponse.json({
      success: false,
      status: 500,
      duration: Date.now() - startTime,
      error: message,
      code: 'FM_EXECUTION_ERROR'
    }, { status: 500 })
    }
    });
