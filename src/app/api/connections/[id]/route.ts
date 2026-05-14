import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { z, ZodError } from 'zod'

const updateConnectionSchema = z.object({
  name: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  authType: z.string().optional(),
  clientId: z.string().optional().nullable(),
  clientSecret: z.string().optional().nullable(),
  sslVerify: z.boolean().optional(),
})

// GET /api/connections/[id] - Get a single connection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const connection = await db.fMConnection.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        database: true,
        username: true,
        status: true,
        authType: true,
        sslVerify: true,
        lastTested: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      }
    })

    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: connection })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// PUT /api/connections/[id] - Update a connection
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateConnectionSchema.parse(body)

    const connection = await db.fMConnection.findUnique({ where: { id } })
    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const dataToUpdate: any = { ...parsed, status: 'disconnected' }
    if (parsed.password) {
      dataToUpdate.password = encrypt(parsed.password)
    }
    if (parsed.clientSecret) {
      dataToUpdate.clientSecret = encrypt(parsed.clientSecret)
    }

    const updated = await db.fMConnection.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        database: true,
        username: true,
        status: true,
        authType: true,
        sslVerify: true,
        lastTested: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      }
    })

    return NextResponse.json({ success: true, data: updated })
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

// DELETE /api/connections/[id] - Delete a connection
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const connection = await db.fMConnection.findUnique({ where: { id } })
    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    await db.fMConnection.delete({ where: { id } })
    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
