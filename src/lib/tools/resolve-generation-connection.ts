/**
 * Resolves which FileMaker connection to use for AI tool generation.
 *
 * Rules:
 *   0 connections → fail with 'no-connections'
 *   1 connection  → auto-select; no explicit choice needed
 *   multiple + no requestedId → fail with 'connection-required' + list of choices for UI
 *   multiple + requestedId    → validate it belongs to this server; fail if not
 *
 * This is intentionally a pure function so it can be unit-tested without any
 * database calls.  The route calls it after fetching server.connections.
 */

export interface ConnectionOption {
  /** FMConnection.id — the value the caller passes back as connectionId */
  id: string
  name: string
  database: string
}

export type GenerationConnectionResult =
  | { ok: true; connectionId: string }
  | { ok: false; reason: 'no-connections' }
  | { ok: false; reason: 'connection-required'; connections: ConnectionOption[] }
  | { ok: false; reason: 'invalid-connection'; requested: string }

/**
 * @param requestedId   connectionId from the API request body (undefined/null = not supplied)
 * @param serverConns   server.connections — FMConnectionServer rows joined to FMConnection
 */
export function resolveGenerationConnection(
  requestedId: string | null | undefined,
  serverConns: ReadonlyArray<{
    connectionId: string
    connection: { id: string; name: string; database: string }
  }>,
): GenerationConnectionResult {
  if (serverConns.length === 0) {
    return { ok: false, reason: 'no-connections' }
  }

  if (serverConns.length === 1) {
    return { ok: true, connectionId: serverConns[0].connectionId }
  }

  // Multiple connections — require an explicit selection
  const normalized = requestedId?.trim() ?? ''
  if (!normalized) {
    return {
      ok: false,
      reason: 'connection-required',
      connections: serverConns.map((c) => ({
        id: c.connectionId,
        name: c.connection.name,
        database: c.connection.database,
      })),
    }
  }

  const linked = serverConns.some((c) => c.connectionId === normalized)
  if (!linked) {
    return { ok: false, reason: 'invalid-connection', requested: normalized }
  }

  return { ok: true, connectionId: normalized }
}
