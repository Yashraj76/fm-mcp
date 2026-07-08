import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import { validateToolForSave } from '@/lib/tools/validate-tool'
import { fmMethodSchema } from '@/lib/tools/fm-methods'
import { logger } from '@/lib/logger'

const updateToolSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  inputSchema: z.string().optional(),
  outputSchema: z.string().nullable().optional(),
  handlerConfig: z.string().optional(),
  fmLayout: z.string().nullable().optional(),
  fmScript: z.string().nullable().optional(),
  fmMethod: fmMethodSchema.nullable().optional(),
  isEnabled: z.boolean().optional(),
  testConfig: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

// GET /api/servers/[id]/tools/[toolId] - Get a single tool
// PUT /api/servers/[id]/tools/[toolId] - Update a tool
// DELETE /api/servers/[id]/tools/[toolId] - Delete a tool
export const GET = withAuth(async (_request, { params, userId }) => {
    try {
    const { id, toolId } = await params
    const tool = await db.tool.findFirst({
      where: {
        id: toolId,
        serverId: id,
        deletedAt: null,
        server: { userId }
      },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!tool) {
      return apiNotFound('Tool not found')
    }

    return apiSuccess(toSafeTool(tool))
    } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Failed to fetch tool')
    }
    });

export const PUT = withAuth(async (request, { params, userId }) => {
    try {
    const { id, toolId } = await params
    const tool = await db.tool.findFirst({
      where: {
        id: toolId,
        serverId: id,
        deletedAt: null,
        server: { userId }
      }
    })
    if (!tool) {
      return apiNotFound('Tool not found')
    }

    const body = await request.json()
    const parsed = updateToolSchema.safeParse(body)

    if (!parsed.success) {
      return apiValidationFailed(parsed.error.flatten())
    }

    // Run semantic validation when shape-changing fields are included in the update.
    // We merge the incoming partial update over the existing tool so validation has
    // full context (e.g. confirming recordId is present in inputSchema for update/delete).
    const SHAPE_FIELDS = ['name', 'description', 'fmMethod', 'category', 'handlerConfig', 'inputSchema', 'fmLayout'] as const
    const hasShapeChange = SHAPE_FIELDS.some(f => parsed.data[f] !== undefined)
    if (hasShapeChange) {
      const merged = {
        name: parsed.data.name ?? tool.name,
        description: parsed.data.description ?? tool.description,
        fmMethod: parsed.data.fmMethod ?? tool.fmMethod,
        category: parsed.data.category ?? tool.category,
        handlerConfig: parsed.data.handlerConfig ?? tool.handlerConfig,
        inputSchema: parsed.data.inputSchema ?? tool.inputSchema,
        fmLayout: parsed.data.fmLayout ?? tool.fmLayout,
      }
      const toolValidationErrors = validateToolForSave(merged)
      if (toolValidationErrors.length > 0) {
        return apiValidationFailed(toolValidationErrors)
      }
    }

    if (parsed.data.handlerConfig) {
      let handlerConfigObj: any = safeParseJSON<Record<string, any>>(parsed.data.handlerConfig, {})
      if (handlerConfigObj.connectionId) {
        const isLinked = await db.fMConnectionServer.findFirst({
          where: {
            connectionId: handlerConfigObj.connectionId,
            serverId: id,
          }
        })
        if (!isLinked) {
          return apiError('The connection specified in handlerConfig is not linked to this server', 'VALIDATION_ERROR', 400)
        }
      }
    }

    const updateData: Record<string, unknown> = { ...parsed.data }
    // Auto-increment version if significant changes
    if (parsed.data.inputSchema || parsed.data.handlerConfig || parsed.data.fmLayout) {
      updateData.version = { increment: 1 }
    }

    const updatedTool = await db.tool.update({
      where: {
        id: toolId },
      data: updateData,
    })

    return apiSuccess(toSafeTool(updatedTool))
    } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Failed to update tool')
    }
    });

export const DELETE = withAuth(async (_request, { params, userId }) => {
    try {
    const { id, toolId } = await params
    const tool = await db.tool.findFirst({
      where: {
        id: toolId,
        serverId: id,
        deletedAt: null,
        server: { userId }
      }
    })
    if (!tool) {
      return apiNotFound('Tool not found')
    }

    await db.tool.update({
      where: { id: toolId },
      data: { deletedAt: new Date() },
    })
    return apiSuccess(null)
    } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Failed to delete tool')
    }
    });
