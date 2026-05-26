import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from "@/lib/auth/api-guard";
import { apiSuccess, apiServerError } from '@/lib/utils/api-response';

// GET /api/playground/history - Get recent tool executions
export const GET = withAuth(async (request, { params, userId }) => {
    try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const toolId = searchParams.get('toolId')

    const history = await db.toolExecution.findMany({
      where: {
        tool: {
          serverId: { not: '' },
          server: { userId }
        },
        ...(toolId ? { toolId } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        tool: {
          select: { name: true, fmMethod: true, fmLayout: true }
        }
      }
    })

    return apiSuccess(history)
    } catch (error) {
    console.error('[API Error]', error)
    return apiServerError('Internal server error')
    }
    });
