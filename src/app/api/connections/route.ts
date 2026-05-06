import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { z } from 'zod'

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

    return NextResponse.json(connections)
  } catch (error) {
    console.error('Failed to fetch connections:', error)
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
  }
}

const createConnectionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().min(1).max(65535).default(443),
  database: z.string().min(1, 'Database name is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  authType: z.enum(['basic', 'oauth', 'clamid']).default('basic'),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  sslVerify: z.boolean().default(true),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createConnectionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const connection = await db.fMConnection.create({
      data: parsed.data,
    })

    return NextResponse.json(connection, { status: 201 })
  } catch (error) {
    console.error('Failed to create connection:', error)
    return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 })
  }
}
