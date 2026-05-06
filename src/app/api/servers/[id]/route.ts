import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

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
        },
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        tools: {
          where: { branch: { isDefault: true, status: 'active' } },
          orderBy: { sortOrder: 'asc' },
        },
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
        { error: 'Server not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(server)
  } catch (error) {
    console.error('Error fetching server:', error)
    return NextResponse.json(
      { error: 'Failed to fetch server' },
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
        { error: 'Server not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const parsed = updateServerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { connectionIds, fileNamesPerConnection, ...updateData } = parsed.data

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

    return NextResponse.json(server)
  } catch (error) {
    console.error('Error updating server:', error)
    return NextResponse.json(
      { error: 'Failed to update server' },
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
        { error: 'Server not found' },
        { status: 404 }
      )
    }

    await db.mcpServer.delete({ where: { id } })

    return NextResponse.json({ message: 'Server deleted successfully' })
  } catch (error) {
    console.error('Error deleting server:', error)
    return NextResponse.json(
      { error: 'Failed to delete server' },
      { status: 500 }
    )
  }
}
