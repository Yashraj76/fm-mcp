import { db } from '@/lib/db'

// ── API key lifecycle logging ──────────────────────────────────────────────────

export interface ApiKeyActivityArgs {
  serverId: string
  serverName: string
  action: 'api-key.generated' | 'api-key.rotated' | 'api-key.revoked'
  /** Key prefix (first ~12 chars). Never the raw key. */
  keyPrefix: string
  /** Supabase user UUID of the authenticated user who triggered the action. */
  actorUserId?: string
}

/**
 * Build the ActivityLog row data for an API key lifecycle event.
 * Exported as a pure function so it can be tested without a database connection.
 *
 * Only the keyPrefix is stored — never the raw key or its hash.
 */
export function buildApiKeyActivityData(args: ApiKeyActivityArgs) {
  const { serverId, serverName, action, keyPrefix, actorUserId } = args
  return {
    action,
    entityType: 'api-key',
    entityId: serverId,   // McpApiKey has no separate ID; serverId is the natural key
    entityName: serverName,
    serverId,
    meta: JSON.stringify({ keyPrefix }),
    actorUserId: actorUserId ?? null,
  }
}

/**
 * Write an ActivityLog entry for API key lifecycle events.
 *
 * Only the keyPrefix is stored — never the raw key or its hash.
 * Callers should `.catch()` so a DB failure never bubbles to the user.
 */
export async function logApiKeyActivity(args: ApiKeyActivityArgs): Promise<void> {
  await db.activityLog.create({
    data: buildApiKeyActivityData(args),
  })
}

// ── MCP tool execution logging ─────────────────────────────────────────────────

export interface McpToolActivityArgs {
  tool: {
    id: string
    name: string
    serverId: string
    fmMethod?: string | null
    category?: string | null
  }
  branchId?: string | null
  status: 'success' | 'error'
  durationMs: number
  /** Sanitized error message — must never contain credentials or full stack traces. */
  errorMessage?: string
}

/**
 * Write an ActivityLog entry for an MCP tool execution.
 *
 * Safe fields only — no params, no response bodies, no credentials.
 * Error messages are truncated to 500 chars so a runaway FM error string
 * can't fill the DB column.
 *
 * MCP executions are API-key authenticated — there is no Supabase user session,
 * so actorUserId is always null. The actor is identified by serverId + keyPrefix
 * recorded elsewhere in the request lifecycle.
 *
 * This function IS awaited by the caller so the log is committed before the
 * MCP response is sent. Callers must `.catch()` so a DB failure never surfaces
 * to the MCP client.
 */
export async function logMcpToolActivity(args: McpToolActivityArgs): Promise<void> {
  const { tool, branchId, status, durationMs, errorMessage } = args
  const action = status === 'success' ? 'tool.executed' : 'tool.execution_failed'

  const meta: Record<string, unknown> = {
    source: 'mcp',
    duration: durationMs,
    fmMethod: tool.fmMethod ?? null,
    category: tool.category ?? null,
  }
  if (errorMessage) {
    // Truncate — avoid persisting unbounded FM error strings or stack traces
    meta.error = errorMessage.slice(0, 500)
  }

  await db.activityLog.create({
    data: {
      action,
      entityType: 'tool',
      entityId: tool.id,
      entityName: tool.name,
      serverId: tool.serverId,
      branchId: branchId ?? null,
      meta: JSON.stringify(meta),
      actorUserId: null,  // MCP requests are API-key authenticated; no user session
    },
  })
}
