import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'

const updateServerSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  version: z.string().optional(),
  status: z.enum(['draft', 'staging', 'deployed']).optional(),
  serverUrl: z.string().nullable().optional(),
  sseToken: z.string().nullable().optional(),
  proxyUrl: z.string().nullable().optional(),
  config: z.string().optional(),
  connectionIds: z.array(z.string()).optional(),
  fileNamesPerConnection: z.array(z.string()).optional(),
})

// GET /api/servers/[id] - Get a single MCP server with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const server = await db.mcpServer.findUnique({
      where: { id },
      include: {
        connections: {
          include: {
            connection: true,
          },
        },
        branches: {
          orderBy: { isDefault: 'desc' },
          include: {
            tools: {
              include: { tool: true }
            },
          },
        },
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        tools: {
          orderBy: { sortOrder: 'asc' },
        },
        apiKey: true,
        _count: {
          select: {
            tools: true,
            deployments: true,
            branches: true,
            connections: true,
          },
        },
      },

    })

    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: server })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch server', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}

// PUT /api/servers/[id] - Update a server
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.mcpServer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Server not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const parsed = updateServerSchema.parse(body)

    const { connectionIds, fileNamesPerConnection, ...updateData } = parsed

    // If connection IDs are provided, update junction records
    if (connectionIds !== undefined) {
      // Delete existing connections
      await db.fMConnectionServer.deleteMany({
        where: { serverId: id },
      })

      // Create new junction records
      if (connectionIds.length > 0) {
        await db.fMConnectionServer.createMany({
          data: connectionIds.map((connId, index) => ({
            connectionId: connId,
            serverId: id,
            fileNames: JSON.stringify(
              (fileNamesPerConnection?.[index] || '')
                .split(',')
                .map(f => f.trim())
                .filter(Boolean)
            ),
          })),
        })
      }

      // Update config
      const currentConfig = JSON.parse(existing.config || '{}')
      currentConfig.connections = connectionIds
      currentConfig.fileNames = fileNamesPerConnection || []
      currentConfig.updatedAt = new Date().toISOString()
      updateData.config = JSON.stringify(currentConfig)
    }

    const server = await db.mcpServer.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, data: server })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.issues,
      }, { status: 400 })
    }
    console.error('[API Error]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update server', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}

// DELETE /api/servers/[id] - Delete a server and all associated data
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.mcpServer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Server not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    await db.mcpServer.delete({ where: { id } })

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete server', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
