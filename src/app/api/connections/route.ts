import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { z, ZodError } from 'zod'
import { encrypt } from '@/lib/crypto'
import { withAuth } from "@/lib/auth/api-guard";
import { logger } from '@/lib/logger'
import { assertPublicHost } from '@/lib/net/ssrf-guard'

const createConnectionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  // SSRF guard: reject loopback/private/link-local/metadata hosts, checked
  // again after DNS resolution. Requires parseAsync.
  host: z.string().min(1, 'Host is required').superRefine(async (host, ctx) => {
    try {
      await assertPublicHost(host)
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: e instanceof Error ? e.message : 'Host is not allowed' })
    }
  }),
  port: z.number().int().min(1).max(65535).default(443),
  database: z.string().min(1, 'Database name is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  // Basic is the only auth type FileMakerClient.login() implements. Widen this
  // (and the update schema + connection-dialog Select) only alongside real
  // OAuth/Claris ID login flows.
  authType: z.literal('basic', 'Only Basic authentication is supported').default('basic'),
  sslVerify: z.boolean().default(true),
  serverConnectionId: z.string().optional(), // FK to FMServerConnection
})
export const GET = withAuth(async (req, { params, userId }) => {
    try {
    const searchParams = req.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)
    const cursor = searchParams.get('cursor') ?? undefined

    const raw = await db.fMConnection.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
        browsedSchema: { select: { connectionId: true, selectedLayouts: true, selectedTables: true } },
      },
    })

    const hasMore = raw.length > limit
    const items = hasMore ? raw.slice(0, limit) : raw
    const nextCursor = hasMore ? items[items.length - 1].id : null

    const payload = items.map(({ browsedSchema, ...conn }) => {
      let schemaLayoutCount = 0
      let schemaTableCount = 0
      if (browsedSchema) {
        try { schemaLayoutCount = JSON.parse(browsedSchema.selectedLayouts || '[]').length } catch {}
        try { schemaTableCount = JSON.parse(browsedSchema.selectedTables || '[]').length } catch {}
      }
      return {
        ...conn,
        hasBrowsedSchema: browsedSchema !== null,
        schemaLayoutCount,
        schemaTableCount,
      }
    })

    return NextResponse.json({ success: true, data: payload, pagination: { hasMore, nextCursor, limit } })
    } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
    }
    });
export const POST = withAuth(async (request, { params, userId }) => {
    try {
    const body = await request.json()
    const parsed = await createConnectionSchema.parseAsync(body)

    // Verify serverConnectionId belongs to user
    if (parsed.serverConnectionId) {
      const sc = await db.fMServerConnection.findFirst({
        where: { id: parsed.serverConnectionId, userId }
      });
      if (!sc) {
        return NextResponse.json({ success: false, error: 'Server connection not found', code: 'NOT_FOUND' }, { status: 404 });
      }
    }

    // Encrypt the password before storing
    const encryptedPassword = encrypt(parsed.password)

    const connection = await db.fMConnection.create({
      data: {
          userId: userId,
        name: parsed.name,
        host: parsed.host,
        port: parsed.port,
        database: parsed.database,
        username: parsed.username,
        password: encryptedPassword,
        authType: parsed.authType,
        sslVerify: parsed.sslVerify,
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
    logger.error({ err: error }, '[API Error]')
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
    }
    });
