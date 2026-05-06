import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const executeToolSchema = z.object({
  inputs: z.record(z.string(), z.unknown()).optional(),
  testMode: z.boolean().default(true),
})

// POST /api/servers/[id]/tools/[toolId]/execute - Execute a tool
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  try {
    const { id, toolId } = await params
    const tool = await db.tool.findFirst({
      where: { id: toolId, serverId: id },
      include: {
        branch: { select: { name: true, isDefault: true } },
        server: { select: { name: true, connections: { include: { connection: true } } } },
      },
    })

    if (!tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 })
    }

    if (!tool.isEnabled) {
      return NextResponse.json({ error: 'Tool is disabled' }, { status: 400 })
    }

    const body = await request.json()
    const parsed = executeToolSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const inputs = parsed.data.inputs || JSON.parse(tool.testConfig || '{}')
    const startTime = Date.now()

    // Create execution log as pending
    const execution = await db.toolExecution.create({
      data: {
        toolId,
        requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        requestBody: JSON.stringify(inputs),
        status: 'pending',
      },
    })

    // Simulate tool execution
    const simulatedLatency = 100 + Math.floor(Math.random() * 900)
    await new Promise((resolve) => setTimeout(resolve, simulatedLatency))

    const duration = Date.now() - startTime

    // Generate realistic mock response based on fmMethod
    let mockResponse: Record<string, unknown>
    const method = tool.fmMethod || 'find'

    switch (method) {
      case 'create':
        mockResponse = {
          success: true,
          action: 'create',
          recordId: `rec_${Date.now().toString(36)}`,
          modId: Math.floor(Math.random() * 1000),
          layout: tool.fmLayout || 'Unknown',
          createdTimestamp: new Date().toISOString(),
          data: inputs,
        }
        break

      case 'read':
        mockResponse = {
          success: true,
          action: 'read',
          layout: tool.fmLayout || 'Unknown',
          recordId: (inputs as Record<string, unknown>)?.recordId || 'rec_default',
          modId: Math.floor(Math.random() * 1000),
          data: {
            id: (inputs as Record<string, unknown>)?.recordId || 'rec_default',
            name: 'Sample Record',
            createdAt: '2024-12-15T10:30:00Z',
            modifiedAt: new Date().toISOString(),
            status: 'Active',
            ...inputs,
          },
        }
        break

      case 'update':
        mockResponse = {
          success: true,
          action: 'update',
          recordId: (inputs as Record<string, unknown>)?.recordId || 'rec_default',
          modId: Math.floor(Math.random() * 1000),
          layout: tool.fmLayout || 'Unknown',
          updatedFields: Object.keys(inputs).filter((k) => k !== 'recordId'),
          updatedTimestamp: new Date().toISOString(),
        }
        break

      case 'delete':
        mockResponse = {
          success: true,
          action: 'delete',
          recordId: (inputs as Record<string, unknown>)?.recordId || 'rec_default',
          layout: tool.fmLayout || 'Unknown',
          deletedTimestamp: new Date().toISOString(),
        }
        break

      case 'find':
        const totalFound = Math.floor(Math.random() * 100) + 1
        mockResponse = {
          success: true,
          action: 'find',
          layout: tool.fmLayout || 'Unknown',
          query: inputs,
          totalRecordCount: totalFound,
          foundCount: Math.min(totalFound, 20),
          data: Array.from({ length: Math.min(totalFound, 5) }, (_, i) => ({
            recordId: `rec_${(Date.now() + i).toString(36)}`,
            modId: Math.floor(Math.random() * 1000),
            fieldData: {
              id: i + 1,
              name: `Sample Record ${i + 1}`,
              createdAt: '2024-12-15T10:30:00Z',
              status: ['Active', 'Pending', 'Completed'][i % 3],
            },
          })),
        }
        break

      case 'script':
        mockResponse = {
          success: true,
          action: 'script',
          script: tool.fmScript || 'Unknown',
          scriptResult: 0,
          scriptError: null,
          executionTime: `${(duration / 1000).toFixed(2)}s`,
          output: {
            message: `Script "${tool.fmScript}" completed successfully`,
            recordsAffected: Math.floor(Math.random() * 50),
          },
        }
        break

      default:
        mockResponse = {
          success: true,
          action: 'custom',
          tool: tool.name,
          inputs,
          output: {
            message: 'Custom tool executed successfully',
            result: { processed: true, timestamp: new Date().toISOString() },
          },
        }
    }

    // Determine success/failure (90% success)
    const isSuccess = Math.random() > 0.1

    const executionResult = await db.toolExecution.update({
      where: { id: execution.id },
      data: {
        responseStatus: isSuccess ? 200 : 500,
        responseBody: JSON.stringify(isSuccess ? mockResponse : { success: false, error: 'Simulated execution error' }),
        duration,
        error: isSuccess ? null : 'Simulated execution error: FM Data API returned an error',
        status: isSuccess ? 'success' : 'error',
      },
    })

    return NextResponse.json({
      executionId: executionResult.id,
      requestId: executionResult.requestId,
      status: executionResult.status,
      duration: executionResult.duration,
      responseStatus: executionResult.responseStatus,
      result: isSuccess ? mockResponse : { success: false, error: 'Simulated execution error' },
    })
  } catch (error) {
    console.error('Error executing tool:', error)
    return NextResponse.json({ error: 'Failed to execute tool' }, { status: 500 })
  }
}
