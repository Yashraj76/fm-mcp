import { apiSuccess, apiServerError, apiValidationFailed } from '@/lib/utils/api-response'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { logger } from '@/lib/logger'

const createSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(443),
  adminUsername: z.string().min(1),
  adminPassword: z.string().min(1),
  sslVerify: z.boolean().default(true),
})
export const GET = withAuth(async (req, { params, userId }) => {
    try {
    const servers = await db.fMServerConnection.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, host: true, port: true,
        adminUsername: true, sslVerify: true, status: true,
        lastTestedAt: true, lastError: true, createdAt: true, updatedAt: true,
        _count: { select: { connections: true } },
      },
    })
    return apiSuccess(servers)
  } catch (e) {
    logger.error({ err: e }, '[server-connections GET]')
    return apiServerError('Internal server error')
  }
})
export const POST = withAuth(async (req, { params, userId }) => {
    try {
    const body = await req.json()
    const parsed = createSchema.parse(body)
    const server = await db.fMServerConnection.create({
      data: {
          userId: userId,
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
    return apiSuccess(server, 201)
  } catch (e) {
    if (e instanceof ZodError) {
      return apiValidationFailed(e.issues)
    }
    logger.error({ err: e }, '[server-connections POST]')
    return apiServerError('Internal server error')
  }
})
