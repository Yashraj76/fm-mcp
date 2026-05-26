import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import { getTool } from '@/lib/db/user-scoped'

const updateToolSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case').optional(),
  description: z.string().min(1).optional(),
  inputSchema: z.string().optional(),
  handlerConfig: z.string().optional(),
  category: z.string().optional().nullable(),
  fmLayout: z.string().optional().nullable(),
  fmScript: z.string().optional().nullable(),
  fmMethod: z.string().optional().nullable(),
  isEnabled: z.boolean().optional(),
})

// GET /api/tools/[id] - Get a single tool
export const GET = withAuth(async (request, { params, userId }) => {
  try {
    const { id } = await params
    const tool = await getTool(id, userId, { include: { server: true } })

    if (!tool) {
      return apiNotFound('Tool not found')
    }

    return apiSuccess(toSafeTool(tool))
  } catch (error) {
    console.error('[API Error]', error)
    return apiServerError('Internal server error')
  }
});

// PUT /api/tools/[id] - Update a tool
export const PUT = withAuth(async (request, { params, userId }) => {
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateToolSchema.parse(body)

    const existing = await getTool(id, userId, { include: { server: true } })
    if (!existing) {
      return apiNotFound('Tool not found')
    }

    if (parsed.handlerConfig) {
      let handlerConfigObj: any = safeParseJSON(parsed.handlerConfig, {})
      if (handlerConfigObj.connectionId) {
        const isLinked = await db.fMConnectionServer.findFirst({
          where: {
            connectionId: handlerConfigObj.connectionId,
            serverId: existing.serverId,
          }
        })
        if (!isLinked) {
          return apiError('The connection specified in handlerConfig is not linked to this server', 'VALIDATION_ERROR', 400)
        }
      }
    }

    const updated = await db.tool.update({
      where: { id },
      data: parsed
    })

    return apiSuccess(toSafeTool(updated))
  } catch (error) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues)
    }
    console.error('[API Error]', error)
    return apiServerError('Internal server error')
  }
});

// DELETE /api/tools/[id] - Delete a tool
export const DELETE = withAuth(async (request, { params, userId }) => {
  try {
    const { id } = await params
    const existing = await getTool(id, userId, { include: { server: true } })
    if (!existing) {
      return apiNotFound('Tool not found')
    }

    await db.tool.delete({
      where: { id }
    })
    return apiSuccess(null)
  } catch (error) {
    console.error('[API Error]', error)
    return apiServerError('Internal server error')
  }
});
