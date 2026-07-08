import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import { getTool } from '@/lib/db/user-scoped'
import { checkDuplicateToolName, duplicateToolNameMessage, DUPLICATE_TOOL_NAME_CODE } from '@/lib/tools/duplicate-tool-name'
import { logger } from '@/lib/logger'

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
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Internal server error')
  }
});

// PUT /api/tools/[id] - Update a tool
export const PUT = withAuth(async (request, { params, userId }) => {
  let newName = ''
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateToolSchema.parse(body)
    newName = parsed.name ?? ''

    const existing = await getTool(id, userId, { include: { server: true } })
    if (!existing) {
      return apiNotFound('Tool not found')
    }

    // If the name is being changed, check for a duplicate among active tools on
    // this server (excluding the tool being updated from the check).
    if (parsed.name && parsed.name !== existing.name) {
      const dupCheck = await checkDuplicateToolName(db, existing.serverId, parsed.name, id)
      if (dupCheck.isDuplicate) {
        return apiError(duplicateToolNameMessage(parsed.name), DUPLICATE_TOOL_NAME_CODE, 409)
      }
    }

    if (parsed.handlerConfig) {
      let handlerConfigObj: any = safeParseJSON<Record<string, any>>(parsed.handlerConfig, {})
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
  } catch (error: any) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues)
    }
    if (error?.code === 'P2002') {
      return apiError(duplicateToolNameMessage(newName), DUPLICATE_TOOL_NAME_CODE, 409)
    }
    logger.error({ err: error }, '[API Error]')
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

    await db.tool.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return apiSuccess(null)
  } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Internal server error')
  }
});
