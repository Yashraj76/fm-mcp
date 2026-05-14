import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { z, ZodError } from 'zod'
import { encrypt } from '@/lib/crypto'

const createConnectionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().min(1).max(65535).default(443),
  database: z.string().min(1, 'Database name is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  authType: z.string().default('basic'),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  sslVerify: z.boolean().default(true),
  serverConnectionId: z.string().optional(), // FK to FMServerConnection
})


export async function GET() {
  try {
    const connections = await db.fMConnection.findMany({
      orderBy: { createdAt: 'desc' },
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
      },
    })

    return NextResponse.json({ success: true, data: connections })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createConnectionSchema.parse(body)

    // Encrypt the password before storing
    const encryptedPassword = encrypt(parsed.password)

    const connection = await db.fMConnection.create({
      data: {
        name: parsed.name,
        host: parsed.host,
        port: parsed.port,
        database: parsed.database,
        username: parsed.username,
        password: encryptedPassword,
        authType: parsed.authType,
        sslVerify: parsed.sslVerify,
        clientId: parsed.clientId ?? null,
        clientSecret: parsed.clientSecret ? encrypt(parsed.clientSecret) : null,
        ...(parsed.serverConnectionId ? { serverConnectionId: parsed.serverConnectionId } : {}),
      },
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

    return NextResponse.json({ success: true, data: connection }, { status: 201 })
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
