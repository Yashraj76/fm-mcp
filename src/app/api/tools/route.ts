import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const serverId = searchParams.get('serverId')
    
    const tools = await db.tool.findMany({
      where: serverId ? { serverId } : undefined,
      orderBy: { createdAt: 'desc' }
    })
    
    return NextResponse.json({ success: true, data: tools })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createToolSchema.parse(body)
    
    const tool = await db.tool.create({
      data: parsed
    })
    
    return NextResponse.json({ success: true, data: tool }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.issues,
      }, { status: 400 })
    }
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
