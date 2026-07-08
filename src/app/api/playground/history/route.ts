import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from "@/lib/auth/api-guard";
import { apiSuccess, apiServerError } from '@/lib/utils/api-response';
import { logger } from '@/lib/logger'

// GET /api/playground/history - Get recent tool executions
export const GET = withAuth(async (request, { params, userId }) => {
    try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
    const cursor = searchParams.get('cursor') ?? undefined
    const toolId = searchParams.get('toolId')

    const raw = await db.toolExecution.findMany({
      where: {
        tool: {
          serverId: { not: '' },
          server: { userId }
        },
        ...(toolId ? { toolId } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        tool: {
          select: { name: true, fmMethod: true, fmLayout: true }
        }
      }
    })

    const hasMore = raw.length > limit
    const history = hasMore ? raw.slice(0, limit) : raw
    const nextCursor = hasMore ? history[history.length - 1].id : null

    return NextResponse.json({ success: true, data: history, pagination: { hasMore, nextCursor, limit } })
    } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Internal server error')
    }
    });
