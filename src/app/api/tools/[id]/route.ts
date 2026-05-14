import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const tool = await db.tool.findUnique({ where: { id } })
    
    if (!tool) {
      return NextResponse.json({ success: false, error: 'Tool not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true, data: tool })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateToolSchema.parse(body)
    
    const existing = await db.tool.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Tool not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    
    const updated = await db.tool.update({
      where: { id },
      data: parsed
    })
    
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      }, { status: 400 })
    }
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.tool.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Tool not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    
    await db.tool.delete({ where: { id } })
    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
