import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { executeTool } from '@/lib/filemaker/executor'
import { executeODataTool } from '@/lib/filemaker/odata-executor'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { getTool } from '@/lib/db/user-scoped'

const executeSchema = z.object({
  params: z.record(z.string(), z.any()).optional().default({}),
})

// POST /api/tools/[id]/execute — Execute a tool against its linked FM connection
export const POST = withAuth(async (request, { params, userId }) => {
  const startTime = Date.now()
  try {
    const { id } = await params

    const tool = await getTool(id, userId, { include: { server: true } })
    if (!tool) {
      return NextResponse.json(
        { success: false, error: 'Tool not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    if (!tool.isEnabled) {
      return NextResponse.json(
        { success: false, error: 'Tool is disabled', code: 'TOOL_DISABLED' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { params: inputParams } = executeSchema.parse(body)

    const result = await (() => {
      // Detect OData tools by fmMethod or handlerConfig type
      const handlerType = safeParseJSON(tool.handlerConfig, {}).type ?? '';
      const method = tool.fmMethod || ''
      const isOData = method.startsWith('odata-') || handlerType.startsWith('odata-')
      return isOData ? executeODataTool(id, inputParams, userId) : executeTool(id, inputParams, userId)
    })()

    const duration = Date.now() - startTime

    // Persist execution record (fire-and-forget per conventions)
    db.toolExecution.create({
      data: {
        toolId: id,
        requestBody: JSON.stringify(inputParams),
        responseBody: JSON.stringify(result),
        status: 'success',
        duration,
      },
    }).catch((err: Error) => console.error('[execute] Failed to save execution record:', err.message))

    return NextResponse.json({ success: true, status: 200, data: result, duration })
  } catch (error: any) {
    const duration = Date.now() - startTime
    const { id: toolId } = await params.catch(() => ({ id: 'unknown' }))

    console.error('[API Error] /api/tools/[id]/execute', error)

    // Best-effort: save failed execution
    if (toolId !== 'unknown') {
      db.toolExecution.create({
        data: {
          toolId,
          requestBody: '{}',
          error: error.message ?? 'Unknown error',
          status: 'error',
          duration,
        },
      }).catch(() => { })
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Execution failed', code: 'FM_EXECUTION_ERROR' },
      { status: 500 }
    )
  }
});
