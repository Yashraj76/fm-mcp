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
        { success: false, error: 'Server not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const toolDefinitions = server.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: JSON.parse(tool.inputSchema || '{}'),
    }))

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const mcpBase = `${baseUrl}/api/mcp/${server.id}`

    // Fetch API key metadata (prefix only — never the raw key)
    const apiKeyRecord = await db.mcpApiKey.findUnique({ where: { serverId: server.id } }).catch(() => null)
    const authNote = apiKeyRecord
      ? `Bearer <your-api-key>  (prefix: ${apiKeyRecord.keyPrefix}…)`
      : `No API key generated yet — POST /api/servers/${server.id}/api-key to create one`

    // Streamable HTTP — Cursor, VS Code, ChatGPT, Claude Code
    const streamableHttpConfig = {
      mcpServers: {
        [server.name]: {
          url: `${mcpBase}/mcp`,
          headers: { Authorization: 'Bearer <your-api-key>' },
        },
      },
      _authNote: authNote,
    }

    // SSE — Claude Desktop, Claude.ai (requires REDIS_URL on server)
    const sseConfig = {
      mcpServers: {
        [server.name]: {
          url: `${mcpBase}/sse`,
          headers: { Authorization: 'Bearer <your-api-key>' },
        },
      },
      _authNote: authNote,
      _note: 'SSE requires REDIS_URL configured on the server',
    }

    // mcp-remote proxy — stdio clients that cannot use HTTP transport
    const mcpRemoteConfig = {
      mcpServers: {
        [server.name]: {
          command: 'npx',
          args: ['-y', 'mcp-remote', `${mcpBase}/mcp`, '--header', 'Authorization: Bearer <your-api-key>'],
        },
      },
    }

    // Legacy proxy config (backward compat)
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
    }

    return NextResponse.json({
      success: true,
      data: {
        serverId: server.id,
        serverName: server.name,
        serverVersion: server.version,
        endpoints: {
          streamableHttp: `${mcpBase}/mcp`,
          sse: `${mcpBase}/sse`,
        },
        hasApiKey: !!apiKeyRecord,
        streamableHttp: streamableHttpConfig,
        sse: sseConfig,
        mcpRemote: mcpRemoteConfig,
        proxy: proxyConfig,
        // Kept for backward compat
        claudeDesktop: sseConfig,
        toolCount: toolDefinitions.length,
        tools: toolDefinitions,
        connectedDatabases: server.connections.map((c) => ({
          connectionId: c.connectionId,
          databaseName: c.connection.database,
          host: c.connection.host,
          isActive: c.isActive,
        })),
      },
    })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate configuration', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
