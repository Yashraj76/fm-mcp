import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// POST /api/servers/[id]/api-key — generate (or rotate) API key
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serverId } = await params

    const server = await db.mcpServer.findUnique({ where: { id: serverId } })
    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 })
    }

    const rawKey = `mcp_${randomBytes(24).toString('hex')}`
    const keyPrefix = rawKey.slice(0, 12)
    const keyHash = await bcrypt.hash(rawKey, 10)

    await db.mcpApiKey.upsert({
      where: { serverId },
      create: { serverId, keyHash, keyPrefix },
      update: { keyHash, keyPrefix, createdAt: new Date(), lastUsedAt: null },
    })

    return NextResponse.json({
      success: true,
      data: {
        apiKey: rawKey,
        keyPrefix,
        message: 'Store this key now — it will not be shown again.',
      },
    })
  } catch (error) {
    console.error('[API Key] Generate error:', error)
    return NextResponse.json({ success: false, error: 'Failed to generate API key' }, { status: 500 })
  }
}

// GET /api/servers/[id]/api-key — get key metadata (never returns the raw key)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serverId } = await params

    const apiKey = await db.mcpApiKey.findUnique({ where: { serverId } })
    if (!apiKey) {
      return NextResponse.json({ success: true, data: null })
    }

    return NextResponse.json({
      success: true,
      data: {
        keyPrefix: apiKey.keyPrefix,
        createdAt: apiKey.createdAt,
        lastUsedAt: apiKey.lastUsedAt,
      },
    })
  } catch (error) {
    console.error('[API Key] Fetch error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch API key info' }, { status: 500 })
  }
}

// DELETE /api/servers/[id]/api-key — revoke API key
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serverId } = await params

    const existing = await db.mcpApiKey.findUnique({ where: { serverId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'No API key found' }, { status: 404 })
    }

    await db.mcpApiKey.delete({ where: { serverId } })
    return NextResponse.json({ success: true, message: 'API key revoked' })
  } catch (error) {
    console.error('[API Key] Delete error:', error)
    return NextResponse.json({ success: false, error: 'Failed to revoke API key' }, { status: 500 })
  }
}
