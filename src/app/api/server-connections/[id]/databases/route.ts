import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAdminSession } from '@/lib/admin/client'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const server = await db.fMServerConnection.findUnique({ where: { id } })
    if (!server) return NextResponse.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })

    const databases = await withAdminSession(server, async (client) => {
      return client.getDatabases()
    })

    // Mark which databases already have a Connection
    const existing = await db.fMConnection.findMany({
      where: { serverConnectionId: id },
      select: { database: true },
    })
    const existingNames = new Set(existing.map((c) => c.database))

    const enriched = databases.map((db) => ({
      ...db,
      hasConnection: existingNames.has(db.name),
    }))

    return NextResponse.json({ success: true, data: enriched })
  } catch (e: any) {
    console.error('[server-connections/databases]', e)
    return NextResponse.json({
      success: false,
      error: e.message || 'Failed to list databases',
      code: 'CONNECTION_FAILED',
    }, { status: 500 })
  }
}
