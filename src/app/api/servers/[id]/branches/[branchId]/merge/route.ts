import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  try {
    const { id, branchId } = await params

    const sourceBranch = await db.branch.findFirst({
      where: { id: branchId, serverId: id },
      include: { tools: true }
    })

    if (!sourceBranch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    const defaultBranch = await db.branch.findFirst({
      where: { serverId: id, isDefault: true },
      include: { tools: true }
    })

    if (!defaultBranch) {
      return NextResponse.json({ error: 'Default branch not found' }, { status: 404 })
    }

    // Delete existing tools on default branch and copy from source
    await db.tool.deleteMany({ where: { branchId: defaultBranch.id } })

    if (sourceBranch.tools.length > 0) {
      await db.tool.createMany({
        data: sourceBranch.tools.map(tool => ({
          branchId: defaultBranch.id,
          serverId: id,
          name: tool.name,
          description: tool.description,
          category: tool.category,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          handlerConfig: tool.handlerConfig,
          fmLayout: tool.fmLayout,
          fmScript: tool.fmScript,
          fmMethod: tool.fmMethod,
          isEnabled: tool.isEnabled,
          isAiGenerated: tool.isAiGenerated,
          sortOrder: tool.sortOrder
        }))
      })
    }

    // Mark source as merged
    await db.branch.update({
      where: { id: branchId },
      data: { status: 'merged' }
    })

    // Update default branch snapshot
    await db.branch.update({
      where: { id: defaultBranch.id },
      data: {
        snapshot: JSON.stringify({ tools: sourceBranch.tools }),
        commitMessage: `Merge from ${sourceBranch.name}`
      }
    })

    return NextResponse.json({ success: true, message: `Merged ${sourceBranch.name} into ${defaultBranch.name}` })
  } catch (error) {
    console.error('Failed to merge branch:', error)
    return NextResponse.json({ error: 'Failed to merge branch' }, { status: 500 })
  }
}
