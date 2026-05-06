import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/servers/[id]/config - Generate MCP configuration
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const server = await db.mcpServer.findUnique({
      where: { id },
      include: {
        tools: {
          where: { isEnabled: true, branch: { isDefault: true, status: 'active' } },
          orderBy: { sortOrder: 'asc' },
        },
        connections: {
          include: { connection: true },
        },
      },
    })

    if (!server) {
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      )
    }

    const toolDefinitions = server.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: JSON.parse(tool.inputSchema || '{}'),
    }))

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // SSE Configuration Format
    const sseConfig = {
      mcpServers: {
        [server.name]: {
          transport: {
            type: 'sse',
            url: `${baseUrl}/api/mcp/sse?serverId=${server.id}&token=${server.sseToken}`,
            headers: {
              Authorization: `Bearer ${server.sseToken}`,
            },
          },
        },
      },
      tools: toolDefinitions,
      metadata: {
        serverName: server.name,
        serverVersion: server.version,
        toolCount: toolDefinitions.length,
        generatedAt: new Date().toISOString(),
      },
    }

    // Proxy/stdio Configuration Format
    const proxyConfig = {
      mcpServers: {
        [server.name]: {
          command: 'node',
          args: [
            `${baseUrl}/api/mcp/proxy?serverId=${server.id}`,
            '--token',
            server.sseToken || '',
          ],
          env: {
            MCP_SERVER_URL: server.serverUrl || baseUrl,
            MCP_SERVER_TOKEN: server.sseToken || '',
            MCP_PROXY_URL: `${baseUrl}${server.proxyUrl || `/mcp/${server.id}`}`,
          },
        },
      },
      tools: toolDefinitions,
      metadata: {
        serverName: server.name,
        serverVersion: server.version,
        toolCount: toolDefinitions.length,
        generatedAt: new Date().toISOString(),
      },
    }

    // Claude Desktop compatible configuration
    const claudeConfig = {
      mcpServers: {
        [server.name]: {
          url: `${baseUrl}/api/mcp/sse?serverId=${server.id}&token=${server.sseToken}`,
          headers: {
            'Authorization': `Bearer ${server.sseToken}`,
          },
        },
      },
    }

    return NextResponse.json({
      serverId: server.id,
      serverName: server.name,
      serverVersion: server.version,
      sse: sseConfig,
      proxy: proxyConfig,
      claudeDesktop: claudeConfig,
      toolCount: toolDefinitions.length,
      connectedDatabases: server.connections.map((c) => ({
        connectionId: c.connectionId,
        databaseName: c.connection.database,
        host: c.connection.host,
        isActive: c.isActive,
      })),
    })
  } catch (error) {
    console.error('Error generating config:', error)
    return NextResponse.json(
      { error: 'Failed to generate configuration' },
      { status: 500 }
    )
  }
}
