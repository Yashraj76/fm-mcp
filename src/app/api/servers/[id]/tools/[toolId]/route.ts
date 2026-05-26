import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeTool } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse'

const updateToolSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  inputSchema: z.string().optional(),
  outputSchema: z.string().nullable().optional(),
  handlerConfig: z.string().optional(),
  fmLayout: z.string().nullable().optional(),
  fmScript: z.string().nullable().optional(),
  fmMethod: z.enum(['create', 'read', 'update', 'delete', 'find', 'script', 'custom']).nullable().optional(),
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
    console.error('[API Error]', error)
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

    if (parsed.data.handlerConfig) {
      let handlerConfigObj: any = safeParseJSON(parsed.data.handlerConfig, {})
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
    console.error('[API Error]', error)
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
        server: { userId }
      }
    })
    if (!tool) {
      return apiNotFound('Tool not found')
    }

    await db.tool.delete({
      where: {
        id: toolId }
    })
    return apiSuccess(null)
    } catch (error) {
    console.error('[API Error]', error)
    return apiServerError('Failed to delete tool')
    }
    });
