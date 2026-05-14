import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/branches
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const serverId = searchParams.get('serverId')
    
    const branches = await db.branch.findMany({
      where: serverId ? { serverId } : undefined,
      orderBy: { createdAt: 'desc' }
    })
    
    return NextResponse.json({ success: true, data: branches })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

// POST /api/branches
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { serverId, name, commitMessage, snapshot } = body
    
    const commitHash = `sha_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

    const branch = await db.branch.create({
      data: {
        serverId,
        name,
        commitMessage,
        commitHash,
        snapshot: JSON.stringify(snapshot || {}),
        status: 'active',
        isDefault: false
      }
    })
    
    return NextResponse.json({ success: true, data: branch }, { status: 201 })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
