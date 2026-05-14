export const runtime = 'nodejs'
export const maxDuration = 60

import { createMcpHandler } from 'mcp-handler'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { executeMcpTool } from '@/lib/mcp/execute-tool'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

function corsWrap(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)
  return new Response(response.body, { status: response.status, headers })
}

function errResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

async function handleMcpRequest(
  req: NextRequest,
  paramsPromise: Promise<{ serverId: string; transport: string }>
) {
  const { serverId } = await paramsPromise

  // ── API key auth ──
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!bearerToken) return errResponse('Authorization required', 401)

  const apiKeyRecord = await db.mcpApiKey.findUnique({ where: { serverId } })
  if (!apiKeyRecord || !(await bcrypt.compare(bearerToken, apiKeyRecord.keyHash))) {
    return errResponse('Invalid API key', 401)
  }

  // Non-blocking last-used update
  db.mcpApiKey.update({ where: { serverId }, data: { lastUsedAt: new Date() } }).catch(() => {})

  // ── Load server ──
  const server = await db.mcpServer.findUnique({ where: { id: serverId } })
  if (!server) return errResponse('Server not found', 404)

  const handler = createMcpHandler(
    async (mcpServer) => {
      const tools = await db.tool.findMany({
        where: {
          serverId,
          isEnabled: true,
          branch: { isDefault: true, status: 'active' },
        },
        include: {
          server: {
            include: {
              connections: { include: { connection: true } },
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      })

      for (const tool of tools) {
        try {
          const rawSchema = JSON.parse(tool.inputSchema || '{}')
          const properties: Record<string, any> = rawSchema.properties || {}
          const requiredSet = new Set<string>(rawSchema.required || [])

          // Build ZodRawShape from stored JSON Schema properties
          const zodShape: Record<string, z.ZodTypeAny> = {}
          for (const [key, prop] of Object.entries(properties) as [string, any][]) {
            let zodType: z.ZodTypeAny
            switch (prop.type) {
              case 'string':
                zodType = z.string()
                break
              case 'number':
              case 'integer':
                zodType = z.number()
                break
              case 'boolean':
                zodType = z.boolean()
                break
              case 'array':
                zodType = z.array(z.any())
                break
              case 'object':
                zodType = z.record(z.string(), z.any())
                break
              default:
                zodType = z.any()
            }
            if (!requiredSet.has(key)) zodType = zodType.optional() as z.ZodTypeAny
            zodShape[key] = zodType
          }

          mcpServer.registerTool(
            tool.name,
            {
              description: tool.description,
              inputSchema: zodShape,
            },
            async (toolParams) => {
              try {
                const result = await executeMcpTool(tool, toolParams as Record<string, any>)
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
          console.error(`[MCP] Failed to register tool "${tool.name}":`, err)
        }
      }
    },
    { serverInfo: { name: server.name, version: server.version } },
    {
      basePath: `/api/mcp/${serverId}`,
      maxDuration: 60,
      redisUrl: process.env.REDIS_URL || undefined,
      disableSse: !process.env.REDIS_URL,
    }
  )

  const response = await handler(req)
  return corsWrap(response)
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
