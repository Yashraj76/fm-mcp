import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse'

const createToolSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case'),
  description: z.string().min(1),
  inputSchema: z.string(), // Must be JSON string
  handlerConfig: z.string(), // Must be JSON string
  serverId: z.string().min(1),
  branchId: z.string().min(1),
  category: z.string().optional(),
  fmLayout: z.string().optional().nullable(),
  fmScript: z.string().optional().nullable(),
  fmMethod: z.string().optional().nullable(),
  isEnabled: z.boolean().default(true),
})

export const GET = withAuth(async (request, { params, userId }) => {
    try {
    const { searchParams } = new URL(request.url)
    const serverId = searchParams.get('serverId')

    const tools = await db.tool.findMany({
      where: serverId 
        ? { serverId, server: { userId } }
        : { server: { userId } },
      orderBy: { createdAt: 'desc' }
    })

    return apiSuccess(tools.map(toSafeTool))
    } catch (error) {
    console.error('[API Error]', error)
    return apiServerError('Internal server error')
    }
    });

export const POST = withAuth(async (request, { params, userId }) => {
    try {
    const body = await request.json()
    const parsed = createToolSchema.parse(body)

    // Verify server ownership
    const server = await db.mcpServer.findFirst({
      where: { id: parsed.serverId, userId }
    })
    if (!server) {
      return apiNotFound('Server not found')
    }

    // Verify branch belongs to this server
    const branch = await db.branch.findFirst({
      where: { id: parsed.branchId, serverId: parsed.serverId }
    })
    if (!branch) {
      return apiNotFound('Branch not found for this server')
    }

    let handlerConfigObj: any = safeParseJSON(parsed.handlerConfig, {})
    if (handlerConfigObj.connectionId) {
      const isLinked = await db.fMConnectionServer.findFirst({
        where: {
          connectionId: handlerConfigObj.connectionId,
          serverId: parsed.serverId,
        }
      })
      if (!isLinked) {
        return apiError('The connection specified in handlerConfig is not linked to this server', 'VALIDATION_ERROR', 400)
      }
    }

    const tool = await db.tool.create({
      data: parsed
    })

    return apiSuccess(toSafeTool(tool), 201)
    } catch (error) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues)
    }
    console.error('[API Error]', error)
    return apiServerError('Internal server error')
    }
    });
