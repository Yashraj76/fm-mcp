import { NextRequest } from 'next/server'
import { apiSuccess, apiNotFound, apiServerError, apiError } from '@/lib/utils/api-response'
import { db } from '@/lib/db'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import { getEffectiveTools, resolveServerBranch } from '@/lib/branching'
import { withAuth } from "@/lib/auth/api-guard";
import { getPublicAppUrl, AppUrlConfigError } from '@/lib/utils/app-url'
import { parseAllowedOrigins } from '@/lib/mcp/cors'
import { logger } from '@/lib/logger'

// GET /api/servers/[id]/config - Generate MCP configuration
export const GET = withAuth(async (_request: NextRequest, { params, userId }) => {
    try {
    const { id } = params
    const server = await db.mcpServer.findFirst({
      where: { id, userId },
      include: {
        connections: {
          include: { connection: true },
        },
      },
    })

    if (!server) {
      return apiNotFound('Server not found')
    }

    const reqBranchId = _request.nextUrl.searchParams.get('branchId') || null
    const targetBranch = await resolveServerBranch(id, reqBranchId)

    let tools: any[] = []
    if (targetBranch) {
      tools = await getEffectiveTools(targetBranch.id)
      tools = tools.filter(t => t.isEnabled)
    }

    const toolDefinitions = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: safeParseJSON<Record<string, any>>(tool.inputSchema, {}),
    }))

    const baseUrl = getPublicAppUrl()
    const mcpBase = `${baseUrl}/api/mcp/${server.id}`

    // When serving a non-default branch, append ?branchId so AI clients hitting
    // this URL also see branch tools, not the main branch.
    const isDefaultBranch = !targetBranch || !!targetBranch.isDefault
    const branchSuffix = !isDefaultBranch && targetBranch
      ? `?branchId=${targetBranch.id}`
      : ''

    // Sanitize server name → valid MCP identifier (mcp-remote prefixes tool names with it)
    const safeName = server.name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 32)
      || `server_${server.id.slice(0, 8)}`

    // Fetch API key metadata (prefix only — never the raw key)
    const apiKeyRecord = await db.mcpApiKey.findUnique({
      where: { serverId: server.id }
    }).catch(() => null)
    const authNote = apiKeyRecord
      ? `Bearer <your-api-key>  (prefix: ${apiKeyRecord.keyPrefix}…)`
      : `No API key generated yet — POST /api/servers/${server.id}/api-key to create one`

    // Streamable HTTP — Cursor, VS Code, ChatGPT, Claude Code
    const streamableHttpConfig = {
      mcpServers: {
        [safeName]: {
          url: `${mcpBase}/mcp${branchSuffix}`,
          headers: { Authorization: 'Bearer <your-api-key>' },
        },
      },
      _authNote: authNote,
    }

    // SSE — Claude Desktop, Claude.ai (requires REDIS_URL on server)
    const sseConfig = {
      mcpServers: {
        [safeName]: {
          url: `${mcpBase}/sse${branchSuffix}`,
          headers: { Authorization: 'Bearer <your-api-key>' },
        },
      },
      _authNote: authNote,
      _note: 'SSE requires REDIS_URL configured on the server',
    }

    // mcp-remote proxy — stdio clients that cannot use HTTP transport
    const mcpRemoteConfig = {
      mcpServers: {
        [safeName]: {
          command: 'npx',
          args: ['-y', 'mcp-remote', `${mcpBase}/mcp${branchSuffix}`, '--header', 'Authorization: Bearer <your-api-key>'],
        },
      },
    }

    // Legacy proxy config (backward compat)
    const proxyConfig = {
      mcpServers: {
        [safeName]: {
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

    // CORS setup info — useful for browser-based MCP clients (claude.ai web, etc.)
    // The allowed origins list is public (it's what browsers are told to allow),
    // so exposing it to the authenticated user is safe.
    const corsAllowedOrigins = parseAllowedOrigins(process.env.MCP_ALLOWED_ORIGINS)
    const isProduction = process.env.NODE_ENV === 'production'
    const corsConfig = {
      allowedOrigins: corsAllowedOrigins,
      isConfigured: corsAllowedOrigins.length > 0,
      // In production with no list, browser-based clients are blocked by default.
      browserClientsBlocked: isProduction && corsAllowedOrigins.length === 0,
      setupNote: corsAllowedOrigins.length === 0
        ? 'Browser-based MCP clients (e.g. claude.ai) are blocked in production. Set the MCP_ALLOWED_ORIGINS environment variable to allow them.'
        : null,
      envVar: 'MCP_ALLOWED_ORIGINS',
      exampleValue: 'https://claude.ai,https://your-app.example.com',
    }

    return apiSuccess({
      serverId: server.id,
      serverName: server.name,
      serverVersion: server.version,
      activeBranchId: targetBranch?.id ?? null,
      activeBranchName: targetBranch?.name ?? null,
      isDefaultBranch,
      endpoints: {
        streamableHttp: `${mcpBase}/mcp${branchSuffix}`,
        sse: `${mcpBase}/sse${branchSuffix}`,
      },
      hasApiKey: !!apiKeyRecord,
      sseAvailable: !!process.env.REDIS_URL,
      corsConfig,
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
    })
  } catch (error) {
    if (error instanceof AppUrlConfigError) {
      return apiError(error.message, 'CONFIG_ERROR', 500)
    }
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Failed to generate configuration')
  }
    });
