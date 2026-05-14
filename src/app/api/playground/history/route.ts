import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/playground/history - Get recent tool executions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const toolId = searchParams.get('toolId')
    
    const history = await db.toolExecution.findMany({
      where: toolId ? { toolId } : undefined,
      orderBy: { executedAt: 'desc' },
      take: limit,
      include: {
        tool: {
          select: { name: true, fmMethod: true, fmLayout: true }
        }
      }
    })
    
    return NextResponse.json({ success: true, data: history })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
