import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const createServerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  version: z.string().optional().default('1.0.0'),
  connectionIds: z.array(z.string()).optional(),
  fileNamesPerConnection: z.array(z.string()).optional(),
})

// GET /api/servers - List all MCP servers
export async function GET() {
  try {
    const servers = await db.mcpServer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        connections: {
          include: {
            connection: {
              select: { id: true, name: true, host: true, status: true, database: true },
            },
          },
        },
        branches: {
          where: { status: 'active' },
          orderBy: { isDefault: 'desc' },
        },
        tools: {
          where: { isEnabled: true },
        },
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: {
            tools: true,
            deployments: true,
            branches: true,
          },
        },
      },
    })

    return NextResponse.json(servers)
  } catch (error) {
    console.error('Error fetching servers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch servers' },
      { status: 500 }
    )
  }
}

// POST /api/servers - Create a new MCP server
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createServerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { name, description, version, connectionIds, fileNamesPerConnection } = parsed.data

    // Auto-generate config from connections
    const config = JSON.stringify({
      name,
      description,
      version,
      connections: connectionIds || [],
      fileNames: fileNamesPerConnection || [],
      createdAt: new Date().toISOString(),
    })

    const server = await db.mcpServer.create({
      data: {
        name,
        description,
        version: version || '1.0.0',
        config,
        sseToken: `fmcp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        proxyUrl: `/mcp/${name.toLowerCase().replace(/\s+/g, '-')}`,
      },
    })

    // Create junction records for connections
    if (connectionIds && connectionIds.length > 0) {
      await db.fMConnectionServer.createMany({
        data: connectionIds.map((connId, index) => ({
          connectionId: connId,
          serverId: server.id,
          fileNames: JSON.stringify((fileNamesPerConnection?.[index] || '').split(',').map(f => f.trim()).filter(Boolean)),
        })),
      })
    }

    // Create default branch
    const commitHash = `sha_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    await db.branch.create({
      data: {
        serverId: server.id,
        name: 'main',
        isDefault: true,
        status: 'active',
        commitMessage: 'Initial commit',
        commitHash,
        snapshot: JSON.stringify({ tools: [], connections: connectionIds || [], config }),
      },
    })

    return NextResponse.json(server, { status: 201 })
  } catch (error) {
    console.error('Error creating server:', error)
    return NextResponse.json(
      { error: 'Failed to create server' },
      { status: 500 }
    )
  }
}
