import { apiSuccess, apiNotFound, apiError, apiServerError, apiValidationFailed } from '@/lib/utils/api-response'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { getFMServerConnection } from '@/lib/db/user-scoped';
import { logger } from '@/lib/logger'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  adminUsername: z.string().min(1).optional(),
  adminPassword: z.string().optional(),
  sslVerify: z.boolean().optional(),
})

const serverConnectionSelect = {
  select: {
    id: true,
    name: true,
    host: true,
    port: true,
    adminUsername: true,
    sslVerify: true,
    status: true,
    lastTestedAt: true,
    lastError: true,
    createdAt: true,
    updatedAt: true,
  }
}

// GET /api/server-connections/[id] - Get a single server connection with databases details
export const GET = withAuth(async (_req, { params, userId }) => {
  try {
    const { id } = await params
    const server = await getFMServerConnection(id, userId, {
      select: {
        ...serverConnectionSelect.select,
        connections: {
          select: { id: true, name: true, database: true, status: true },
        },
      }
    })

    if (!server) {
      return apiNotFound('Not found')
    }

    return apiSuccess(server)
  } catch (e) {
    logger.error({ err: e }, '[server-connections/[id] GET]')
    return apiServerError('Internal server error')
  }
})

// PUT /api/server-connections/[id] - Update a server connection
export const PUT = withAuth(async (req, { params, userId }) => {
  try {
    const { id } = await params
    const server = await getFMServerConnection(id, userId)
    if (!server) {
      return apiNotFound('Not found')
    }

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
      ...serverConnectionSelect
    })

    return apiSuccess(updated)
  } catch (e) {
    if (e instanceof ZodError) {
      return apiValidationFailed(e.issues)
    }
    logger.error({ err: e }, '[server-connections/[id] PUT]')
    return apiServerError('Internal server error')
  }
})

// DELETE /api/server-connections/[id] - Delete a server connection
export const DELETE = withAuth(async (_req, { params, userId }) => {
  try {
    const { id } = await params
    const server = await getFMServerConnection(id, userId, {
      include: { _count: { select: { connections: true } } },
    })

    if (!server) {
      return apiNotFound('Not found')
    }

    if ((server as any)._count.connections > 0) {
      return apiError('Cannot delete server with active connections. Remove connections first.', 'HAS_CONNECTIONS', 400)
    }

    await db.fMServerConnection.delete({ where: { id } })
    return apiSuccess({ deleted: true })
  } catch (e) {
    logger.error({ err: e }, '[server-connections/[id] DELETE]')
    return apiServerError('Internal server error')
  }
})
