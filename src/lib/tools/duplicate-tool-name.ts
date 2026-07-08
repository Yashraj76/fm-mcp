/**
 * Duplicate tool-name detection.
 *
 * Extracted as a pure utility so both the server-tools route and the
 * branch-tools route share identical logic, and so the check can be tested
 * without spinning up a real database.
 *
 * Soft-deleted tools (deletedAt != null) are ignored — a name previously used
 * by a deleted tool may be reclaimed by a new one.
 */

export interface DuplicateCheckResult {
  isDuplicate: boolean
  /** The name of the conflicting tool (same as the proposed name, but canonical from DB). */
  conflictingName: string | null
}

/** Minimal DB interface required — compatible with Prisma client and transaction clients. */
interface ToolFindFirstClient {
  tool: {
    findFirst(args: {
      where: Record<string, any>
      select: { id: boolean; name: boolean }
    }): Promise<{ id: string; name: string } | null>
  }
}

/**
 * Returns whether `name` is already used by a live (non-deleted) tool on `serverId`.
 *
 * Pass `excludeToolId` when handling an update — the tool being edited must
 * not conflict with itself.
 */
export async function checkDuplicateToolName(
  db: ToolFindFirstClient,
  serverId: string,
  name: string,
  excludeToolId?: string,
): Promise<DuplicateCheckResult> {
  const where: Record<string, any> = { serverId, name, deletedAt: null }
  if (excludeToolId) {
    where.id = { not: excludeToolId }
  }

  const existing = await db.tool.findFirst({ where, select: { id: true, name: true } })

  if (existing) {
    return { isDuplicate: true, conflictingName: existing.name }
  }
  return { isDuplicate: false, conflictingName: null }
}

/**
 * Builds the standard human-readable duplicate-name error message.
 * Used in both API responses and surfaced directly in the UI.
 */
export function duplicateToolNameMessage(name: string): string {
  return `A tool named '${name}' already exists on this server.`
}

/** The API error code used for this specific failure — lets the UI distinguish it from other errors. */
export const DUPLICATE_TOOL_NAME_CODE = 'DUPLICATE_TOOL_NAME' as const
