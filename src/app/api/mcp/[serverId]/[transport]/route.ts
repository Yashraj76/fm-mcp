export const runtime = 'nodejs'
export const maxDuration = 60

import { createMcpHandler } from 'mcp-handler'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { executeMcpTool } from '@/lib/mcp/execute-tool'
import { safeParseJSON } from '@/lib/utils/safe-parse'

import { getEffectiveTools, resolveServerBranch } from '@/lib/branching'
import { jsonSchemaToZod } from '@/lib/tools/json-schema-to-zod'
import { readBypassEnv, emitBypassWarningIfNeeded } from '@/lib/mcp/auth-bypass'
import { resolveCorsHeaders, readCorsEnv } from '@/lib/mcp/cors'
import { mcpGateway } from '@/lib/mcp/mcp-pipeline'
import { logger } from '@/lib/logger'

// Emit a one-time warning at startup when any bypass mechanism is active.
// The guard inside emitBypassWarningIfNeeded ensures it is silent in production.
emitBypassWarningIfNeeded()

export async function OPTIONS(req: NextRequest) {
  const requestOrigin = req.headers.get('Origin')
  const { nodeEnv, allowedOrigins } = readCorsEnv()
  const { headers: corsHeaders } = resolveCorsHeaders(requestOrigin, nodeEnv, allowedOrigins)
  return new Response(null, { status: 204, headers: corsHeaders })
}

function corsWrap(response: Response, corsHeaders: Record<string, string>): Response {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
  return new Response(response.body, { status: response.status, headers })
}

function errResponse(message: string, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

async function handleMcpRequest(
  req: NextRequest,
  paramsPromise: Promise<{ serverId: string; transport: string }>
) {
  const { serverId, transport } = await paramsPromise

  // ── CORS: resolve per-request (must be first — used in all error responses) ──
  const requestOrigin = req.headers.get('Origin')
  const { nodeEnv, allowedOrigins } = readCorsEnv()
  const { headers: corsHeaders } = resolveCorsHeaders(requestOrigin, nodeEnv, allowedOrigins)

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  const internalSecret = req.headers.get('x-internal-test-secret')
  const preferredBranchId = req.nextUrl.searchParams.get('branchId') || null

  const outcome = await mcpGateway(
    {
      serverId,
      transport,
      bearerToken,
      internalSecret,
      bypassInput: readBypassEnv(internalSecret, bearerToken),
      preferredBranchId,
      hasRedis: !!process.env.REDIS_URL,
    },
    {
      findApiKey: (sid) => db.mcpApiKey.findUnique({ where: { serverId: sid } }),
      touchApiKeyLastUsed: (sid) => {
        db.mcpApiKey.update({ where: { serverId: sid }, data: { lastUsedAt: new Date() } }).catch(() => {})
      },
      findServer: (sid) => db.mcpServer.findUnique({ where: { id: sid } }),
      resolveServerBranch,
      getEffectiveTools,
    },
  )

  if (!outcome.ok) return errResponse(outcome.message, outcome.status, corsHeaders)

  const { server, tools, branch: targetBranch } = outcome

  // Sanitize server name → valid MCP identifier (no spaces, special chars)
  // mcp-remote prefixes tool names with this value: "mcp_{serverName}_{toolName}"
  const safeName = server.name
    .toLowerCase()
    .replace(/\s+/g, '_')          // spaces → underscores
    .replace(/[^a-z0-9_-]/g, '')   // strip anything else
    .slice(0, 32)                   // max 32 chars (leaves room for tool name in 64-char limit)
    || `server_${serverId.slice(0, 8)}`  // fallback if name is empty after sanitize

  const handler = createMcpHandler(
    async (mcpServer) => {

      for (const tool of tools) {
        try {
          const rawSchema = safeParseJSON<Record<string, any>>(tool.inputSchema, {})
          // Convert the full JSON Schema recursively to Zod and extract the
          // property shape that registerTool expects. Top-level tool inputSchemas
          // are always objects; the shape is the inner properties map.
          const converted = jsonSchemaToZod(rawSchema, tool.name)
          const zodShape: Record<string, z.ZodTypeAny> =
            'shape' in converted ? (converted as z.ZodObject<any>).shape : {}

          mcpServer.registerTool(
            tool.name,
            {
              description: tool.description,
              inputSchema: zodShape,
            },
            async (toolParams) => {
              try {
                const result = await executeMcpTool(tool, toolParams as Record<string, any>, {
                  branchId: targetBranch?.id ?? null,
                })
                return {
                  content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
                }
              } catch (err: any) {
                return {
                  content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
                  isError: true,
                }
              }
            }
          )
        } catch (err) {
          logger.error({ err: err }, `[MCP] Failed to register tool "${tool.name}":`)
        }
      }
    },
    { serverInfo: { name: safeName, version: server.version } },
    {
      basePath: `/api/mcp/${serverId}`,
      maxDuration: 60,
      redisUrl: process.env.REDIS_URL || undefined,
      disableSse: !process.env.REDIS_URL,
    }
  )

  const response = await handler(req)
  return corsWrap(response, corsHeaders)
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ serverId: string; transport: string }> }
) {
  return handleMcpRequest(req, ctx.params)
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ serverId: string; transport: string }> }
) {
  return handleMcpRequest(req, ctx.params)
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ serverId: string; transport: string }> }
) {
  return handleMcpRequest(req, ctx.params)
}
