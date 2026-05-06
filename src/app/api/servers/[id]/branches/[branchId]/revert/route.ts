import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  try {
    const { id, branchId } = await params

    const branch = await db.branch.findFirst({
      where: { id: branchId, serverId: id },
      include: { tools: true }
    })

    if (!branch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    }

    // Restore branch state from snapshot
    const snapshot = JSON.parse(branch.snapshot)
    
    await db.tool.deleteMany({ where: { branchId } })

    if (snapshot.tools && snapshot.tools.length > 0) {
      await db.tool.createMany({
        data: snapshot.tools.map((tool: Record<string, unknown>) => ({
          branchId,
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

    const updated = await db.branch.update({
      where: { id: branchId },
      data: { status: 'active' },
      include: { tools: true }
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Failed to revert branch:', error)
    return NextResponse.json({ error: 'Failed to revert branch' }, { status: 500 })
  }
}
