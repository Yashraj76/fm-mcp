import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { z, ZodError } from 'zod'

type Params = { params: Promise<{ id: string }> }

async function getServer(id: string) {
  return db.fMServerConnection.findUnique({ where: { id } })
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const server = await db.fMServerConnection.findUnique({
      where: { id },
      select: {
        id: true, name: true, host: true, port: true,
        adminUsername: true, sslVerify: true, status: true,
        lastTestedAt: true, lastError: true, createdAt: true, updatedAt: true,
        connections: {
          select: { id: true, name: true, database: true, status: true },
        },
      },
    })
    if (!server) return NextResponse.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ success: true, data: server })
  } catch (e) {
    console.error('[server-connections/[id] GET]', e)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  adminUsername: z.string().min(1).optional(),
  adminPassword: z.string().optional(),
  sslVerify: z.boolean().optional(),
})

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const server = await getServer(id)
    if (!server) return NextResponse.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const body = await req.json()
    const parsed = updateSchema.parse(body)

    const updated = await db.fMServerConnection.update({
      where: { id },
      data: {
        ...(parsed.name && { name: parsed.name }),
        ...(parsed.host && { host: parsed.host }),
        ...(parsed.port && { port: parsed.port }),
        ...(parsed.adminUsername && { adminUsername: parsed.adminUsername }),
        ...(parsed.adminPassword && { adminPasswordEncrypted: encrypt(parsed.adminPassword) }),
        ...(parsed.sslVerify !== undefined && { sslVerify: parsed.sslVerify }),
      },
      select: {
        id: true, name: true, host: true, port: true,
        adminUsername: true, sslVerify: true, status: true,
        lastTestedAt: true, lastError: true, createdAt: true, updatedAt: true,
      },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: e.errors }, { status: 400 })
    }
    console.error('[server-connections/[id] PUT]', e)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const server = await db.fMServerConnection.findUnique({
      where: { id },
      include: { _count: { select: { connections: true } } },
    })
    if (!server) return NextResponse.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    if ((server as any)._count.connections > 0) {
      return NextResponse.json({
        success: false, error: 'Cannot delete server with active connections. Remove connections first.',
        code: 'HAS_CONNECTIONS',
      }, { status: 400 })
    }
    await db.fMServerConnection.delete({ where: { id } })
    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (e) {
    console.error('[server-connections/[id] DELETE]', e)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
