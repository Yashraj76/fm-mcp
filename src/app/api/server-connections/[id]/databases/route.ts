import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAdminSession } from '@/lib/admin/client'
import { withAuth } from "@/lib/auth/api-guard";
import { logger } from '@/lib/logger'

type Params = { params: Promise<{ id: string }> }
export const GET = withAuth(async (_req, { params, userId }) => {
    try {
    const { id } = await params
    const server = await db.fMServerConnection.findFirst({
      where: { id, userId }
    })
    if (!server) return NextResponse.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const databases = await withAdminSession(server, async (client) => {
      return client.getDatabases()
    })

    // Mark which databases already have a Connection
    const existing = await db.fMConnection.findMany({
      where: {
          userId: userId,
        serverConnectionId: id },
      select: { database: true },
    })
    const existingNames = new Set(existing.map((c) => c.database))

    const enriched = databases.map((db) => ({
      ...db,
      hasConnection: existingNames.has(db.name),
    }))

    return NextResponse.json({ success: true, data: enriched })
    } catch (e: any) {
    logger.error({ err: e }, '[server-connections/databases]')
    return NextResponse.json({
      success: false,
      error: e.message || 'Failed to list databases',
      code: 'CONNECTION_FAILED',
    }, { status: 500 })
    }
    });
