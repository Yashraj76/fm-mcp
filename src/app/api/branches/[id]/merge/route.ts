import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/branches/[id]/merge
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const branch = await db.branch.findUnique({ where: { id } })
    
    if (!branch) {
      return NextResponse.json({ success: false, error: 'Branch not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const defaultBranch = await db.branch.findFirst({
      where: { serverId: branch.serverId, isDefault: true }
    })

    if (!defaultBranch) {
      return NextResponse.json({ success: false, error: 'Default branch not found', code: 'SERVER_ERROR' }, { status: 500 })
    }

    // Update the default branch to match this branch's snapshot
    await db.branch.update({
      where: { id: defaultBranch.id },
      data: {
        snapshot: branch.snapshot,
        commitMessage: `Merged from ${branch.name}`,
        commitHash: `sha_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      }
    })
    
    // Optionally close the merged branch
    await db.branch.update({
      where: { id },
      data: { status: 'archived' }
    })

    return NextResponse.json({ success: true, data: { message: 'Merge successful' } })
  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
