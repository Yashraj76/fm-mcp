import type { QueryClient } from '@tanstack/react-query'

/**
 * Central TanStack Query keys for tool lists.
 *
 * The three tool endpoints return DIFFERENT payload shapes, so each gets its
 * own key — never share a key across endpoints (a shared key means whichever
 * fetch resolves first poisons the cache for the other reader):
 *
 *   GET /api/branches/{branchId}/tools           → branch-effective tools
 *       plus branch metadata (_branchAction, _branchToolId)
 *   GET /api/servers/{serverId}/tools            → base tools with _count.executions
 *   GET /api/servers/{serverId}/tools?branchId=  → branch-effective tools,
 *       no branch metadata
 */
export const toolKeys = {
  /** Branch-effective tools with branch metadata — GET /api/branches/{branchId}/tools */
  branch: (branchId: string) => ['branch-tools', branchId] as const,

  /** Server-scoped tool list — GET /api/servers/{serverId}/tools[?branchId=] */
  server: (serverId: string, branchId: string | null = null) =>
    ['server-tools', serverId, branchId] as const,

  /**
   * Key for the "tools of the current view" pattern (tools-page,
   * server-detail-page): the branch endpoint when a branch is selected,
   * otherwise the bare server list. Callers gate fetching on serverId being
   * present, so the '' placeholder never reaches the network.
   */
  view: (serverId: string | null, branchId: string | null) =>
    branchId ? toolKeys.branch(branchId) : toolKeys.server(serverId ?? '', null),
}

/**
 * Invalidate every cached tool list that could display tools for this
 * server/branch — call after any mutation that creates, edits, toggles, or
 * deletes a tool so all views (tools page, server detail, playground) refresh.
 * The bare ['server-tools', serverId] prefix matches every branchId variant.
 */
export function invalidateToolLists(
  queryClient: QueryClient,
  serverId?: string | null,
  branchId?: string | null,
): void {
  if (branchId) queryClient.invalidateQueries({ queryKey: toolKeys.branch(branchId) })
  if (serverId) queryClient.invalidateQueries({ queryKey: ['server-tools', serverId] })
}
