import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeApiKey } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/utils/api-response'

// POST /api/servers/[id]/api-key — generate (or rotate) API key
// GET /api/servers/[id]/api-key — get key metadata (never returns the raw key)
// DELETE /api/servers/[id]/api-key — revoke API key
export const POST = withAuth(async (_req, { params, userId }) => {
    try {
    const { id: serverId } = params

    const server = await db.mcpServer.findFirst({
      where: { id: serverId, userId }
    })
    if (!server) {
      return apiNotFound('Server not found')
    }

    const rawKey = `mcp_${randomBytes(24).toString('hex')}`
    const keyPrefix = rawKey.slice(0, 12)
    const keyHash = await bcrypt.hash(rawKey, 10)

    await db.mcpApiKey.upsert({
      where: { serverId },
      create: { serverId, keyHash, keyPrefix },
      update: { keyHash, keyPrefix, createdAt: new Date(), lastUsedAt: null },
    })

    return apiSuccess({
      apiKey: rawKey,
      keyPrefix,
      message: 'Store this key now — it will not be shown again.',
    })
    } catch (error) {
    console.error('[API Key] Generate error:', error)
    return apiServerError('Failed to generate API key')
    }
  });

export const GET = withAuth(async (_req, { params, userId }) => {
    try {
    const { id: serverId } = params

    const server = await db.mcpServer.findFirst({
      where: { id: serverId, userId }
    })
    if (!server) {
      return apiNotFound('Server not found')
    }

    const apiKey = await db.mcpApiKey.findUnique({
      where: { serverId }
    })
    if (!apiKey) {
      return apiSuccess(null)
    }

    return apiSuccess(toSafeApiKey(apiKey))
    } catch (error) {
    console.error('[API Key] Fetch error:', error)
    return apiServerError('Failed to fetch API key info')
    }
  });

export const DELETE = withAuth(async (_req, { params, userId }) => {
    try {
    const { id: serverId } = params

    const server = await db.mcpServer.findFirst({
      where: { id: serverId, userId }
    })
    if (!server) {
      return apiNotFound('Server not found')
    }

    const existing = await db.mcpApiKey.findUnique({
      where: { serverId }
    })
    if (!existing) {
      return apiNotFound('No API key found')
    }

    await db.mcpApiKey.delete({
      where: { serverId }
    })
    return apiSuccess({ message: 'API key revoked' })
    } catch (error) {
    console.error('[API Key] Delete error:', error)
    return apiServerError('Failed to revoke API key')
    }
  });
