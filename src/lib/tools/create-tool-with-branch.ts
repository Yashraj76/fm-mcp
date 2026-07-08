export interface ToolCreateData {
  name: string
  description: string
  inputSchema: string
  outputSchema?: string | null
  handlerConfig: string
  fmMethod?: string | null
  fmLayout?: string | null
  fmScript?: string | null
  category?: string | null
  isEnabled: boolean
  isAiGenerated: boolean
  sortOrder?: number
  serverId: string
}

/**
 * Atomically create a Tool and its corresponding BranchTool record.
 * Rolls back both writes if either fails — callers never receive a Tool
 * that is invisible to getEffectiveTools, and never receive a BranchTool
 * that points at a non-existent Tool.
 */
export async function createToolWithBranch(
  client: any,
  toolData: ToolCreateData,
  branchId: string,
  opts?: { action?: string; overrideData?: string }
): Promise<{ tool: any; branchTool: any }> {
  return client.$transaction(async (tx: any) => {
    const tool = await tx.tool.create({ data: toolData })
    const branchTool = await tx.branchTool.create({
      data: {
        branchId,
        toolId: tool.id,
        action: opts?.action ?? 'added',
        overrideData: opts?.overrideData ?? '{}',
      },
    })
    return { tool, branchTool }
  })
}
