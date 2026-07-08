import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { getFMConnection } from '@/lib/db/user-scoped'
import { connectionUpdateAffectsSchema, invalidateConnectionSchemaCache } from '@/lib/db/schema-cache'
import { buildConnectionUpdatePayload } from '@/lib/db/connection-update-payload'
import { logger } from '@/lib/logger'

const updateConnectionSchema = z.object({
  name: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  // Empty string means "leave current password unchanged" — do not require min(1).
  password: z.string().optional(),
  authType: z.string().optional(),
  clientId: z.string().optional().nullable(),
  // Empty string means "leave current clientSecret unchanged".
  clientSecret: z.string().optional().nullable(),
  sslVerify: z.boolean().optional(),
})

const connectionSelect = {
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
}

// GET /api/connections/[id] - Get a single connection
export const GET = withAuth(async (request, { params, userId }) => {
  try {
    const { id } = await params
    const connection = await getFMConnection(id, userId, connectionSelect)

    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: connection })
  } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
});

// PUT /api/connections/[id] - Update a connection
export const PUT = withAuth(async (request, { params, userId }) => {
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateConnectionSchema.parse(body)

    const connection = await getFMConnection(id, userId)
    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // buildConnectionUpdatePayload excludes password/clientSecret when blank so
    // existing encrypted values are preserved when the user leaves those fields empty.
    const dataToUpdate = buildConnectionUpdatePayload(parsed, encrypt)

    const schemaAffected = connectionUpdateAffectsSchema(parsed)

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.fMConnection.update({
        where: { id },
        data: dataToUpdate,
        ...connectionSelect,
      })
      if (schemaAffected) {
        await invalidateConnectionSchemaCache(id, tx)
      }
      return result
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
    logger.error({ err: error }, '[API Error]')
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
});

// DELETE /api/connections/[id] - Delete a connection
export const DELETE = withAuth(async (request, { params, userId }) => {
  try {
    const { id } = await params
    const connection = await getFMConnection(id, userId)
    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    await db.fMConnection.delete({ where: { id } })
    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
});
