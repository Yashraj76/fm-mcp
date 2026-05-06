import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const saveVersionSchema = z.object({
  changeLog: z.string().optional(),
  message: z.string().optional(),
})

// GET /api/servers/[id]/tools/[toolId]/versions - Get version history
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  try {
    const { id, toolId } = await params
    const tool = await db.tool.findFirst({ where: { id: toolId, serverId: id } })
    if (!tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 })
    }

    const versions = await db.toolVersion.findMany({
      where: { toolId },
      orderBy: { version: 'desc' },
    })

    return NextResponse.json({
      toolId,
      toolName: tool.name,
      currentVersion: tool.version,
      versions,
    })
  } catch (error) {
    console.error('Error fetching tool versions:', error)
    return NextResponse.json({ error: 'Failed to fetch tool versions' }, { status: 500 })
  }
}

// POST /api/servers/[id]/tools/[toolId]/versions - Save a new version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; toolId: string }> }
) {
  try {
    const { id, toolId } = await params
    const tool = await db.tool.findFirst({ where: { id: toolId, serverId: id } })
    if (!tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = saveVersionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const newVersion = tool.version + 1

    // Create version snapshot
    const toolVersion = await db.toolVersion.create({
      data: {
        toolId,
        version: newVersion,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        handlerConfig: tool.handlerConfig,
        snapshot: JSON.stringify({
          name: tool.name,
          description: tool.description,
          category: tool.category,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          handlerConfig: tool.handlerConfig,
          fmLayout: tool.fmLayout,
          fmScript: tool.fmScript,
          fmMethod: tool.fmMethod,
          isEnabled: tool.isEnabled,
          testConfig: tool.testConfig,
        }),
        changeLog: parsed.data.changeLog || parsed.data.message || `Version ${newVersion} saved`,
      },
    })

    // Update tool version
    const updatedTool = await db.tool.update({
      where: { id: toolId },
      data: { version: newVersion },
    })

    return NextResponse.json({
      version: toolVersion,
      tool: updatedTool,
      message: `Version ${newVersion} saved successfully`,
    }, { status: 201 })
  } catch (error) {
    console.error('Error saving tool version:', error)
    return NextResponse.json({ error: 'Failed to save tool version' }, { status: 500 })
  }
}
