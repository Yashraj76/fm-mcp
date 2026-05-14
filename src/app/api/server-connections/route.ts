import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { z, ZodError } from 'zod'

const createSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(443),
  adminUsername: z.string().min(1),
  adminPassword: z.string().min(1),
  sslVerify: z.boolean().default(true),
})

export async function GET() {
  try {
    const servers = await db.fMServerConnection.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, host: true, port: true,
        adminUsername: true, sslVerify: true, status: true,
        lastTestedAt: true, lastError: true, createdAt: true, updatedAt: true,
        _count: { select: { connections: true } },
      },
    })
    return NextResponse.json({ success: true, data: servers })
  } catch (e) {
    console.error('[server-connections GET]', e)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = createSchema.parse(body)
    const server = await db.fMServerConnection.create({
      data: {
        name: parsed.name,
        host: parsed.host,
        port: parsed.port,
        adminUsername: parsed.adminUsername,
        adminPasswordEncrypted: encrypt(parsed.adminPassword),
        sslVerify: parsed.sslVerify,
      },
      select: {
        id: true, name: true, host: true, port: true,
        adminUsername: true, sslVerify: true, status: true,
        lastTestedAt: true, lastError: true, createdAt: true, updatedAt: true,
      },
    })
    return NextResponse.json({ success: true, data: server }, { status: 201 })
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: e.issues }, { status: 400 })
    }
    console.error('[server-connections POST]', e)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
