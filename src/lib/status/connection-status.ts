/**
 * Pure badge-state derivation for connection and server health.
 *
 * All functions are side-effect-free so they can be tested directly without
 * rendering React components or mocking DB calls.
 */

// ── Connection badge states ────────────────────────────────────────────────

export type ConnectionBadgeState =
  | 'healthy'
  | 'disconnected'
  | 'auth_failed'
  | 'schema_missing'
  | 'error'

export interface ConnectionBadgeConfig {
  label: string
  badge: string
  color: string
}

export const CONNECTION_BADGE: Record<ConnectionBadgeState, ConnectionBadgeConfig> = {
  healthy: {
    label: 'Connected',
    badge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
    color: 'text-emerald-500',
  },
  disconnected: {
    label: 'Disconnected',
    badge: 'bg-muted text-muted-foreground border-border',
    color: 'text-muted-foreground',
  },
  auth_failed: {
    label: 'Auth Failed',
    badge: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
    color: 'text-amber-500',
  },
  schema_missing: {
    label: 'No Schema',
    badge: 'bg-sky-500/15 text-sky-500 border-sky-500/25',
    color: 'text-sky-500',
  },
  error: {
    label: 'Error',
    badge: 'bg-red-500/15 text-red-500 border-red-500/25',
    color: 'text-red-500',
  },
}

/**
 * Derives the effective display state for a file connection badge.
 *
 * Priority: auth_failed > error > disconnected > schema_missing > healthy
 *
 * `schema_missing` only applies when the connection is otherwise healthy —
 * there is no point telling users to browse a schema they can't reach.
 */
export function deriveConnectionBadgeState(
  status: string,
  hasBrowsedSchema: boolean,
): ConnectionBadgeState {
  if (status === 'auth_failed') return 'auth_failed'
  if (status === 'error') return 'error'
  if (status === 'disconnected' || status === 'pending' || !status) return 'disconnected'
  if (status === 'connected') {
    if (!hasBrowsedSchema) return 'schema_missing'
    return 'healthy'
  }
  // Any other stored status (e.g. legacy values) → treat as disconnected
  return 'disconnected'
}

// ── FM Server (admin API) badge states ───────────────────────────────────

export type FMServerBadgeState = 'online' | 'unreachable' | 'auth_failed' | 'error'

export interface FMServerBadgeConfig {
  label: string
  dot: string
  badge: string
}

export const FM_SERVER_BADGE: Record<FMServerBadgeState, FMServerBadgeConfig> = {
  online: {
    label: 'Online',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  },
  unreachable: {
    label: 'Unreachable',
    dot: 'bg-muted-foreground/50',
    badge: 'bg-muted text-muted-foreground border-border',
  },
  auth_failed: {
    label: 'Auth Failed',
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  },
  error: {
    label: 'Error',
    dot: 'bg-red-500',
    badge: 'bg-red-500/15 text-red-400 border-red-500/25',
  },
}

/**
 * Maps a raw FM server status string to a specific displayable state.
 * Never returns 'unknown' — always resolves to a concrete state.
 */
export function deriveFMServerBadgeState(status: string): FMServerBadgeState {
  if (status === 'online') return 'online'
  if (status === 'auth_failed') return 'auth_failed'
  if (status === 'error') return 'error'
  // 'unknown', missing, or any unrecognised value → unreachable
  return 'unreachable'
}

// ── MCP Server health indicators ─────────────────────────────────────────

export type ServerHealthFlag =
  | 'no_connections'
  | 'no_enabled_tools'
  | 'not_deployed'

/**
 * Returns a list of health flags for an MCP server card.
 *
 * These are distinct from deployment status (`server.status`) — they describe
 * the server's readiness to serve AI agents, not whether it has been deployed.
 */
export function deriveServerHealthFlags(server: {
  connections: { isActive: boolean }[]
  tools: { isEnabled: boolean }[]
  deployments: { status: string }[]
}): ServerHealthFlag[] {
  const flags: ServerHealthFlag[] = []

  const hasActiveConnection = server.connections.some((c) => c.isActive)
  if (!hasActiveConnection) flags.push('no_connections')

  const hasEnabledTool = server.tools.some((t) => t.isEnabled)
  if (!hasEnabledTool) flags.push('no_enabled_tools')

  const hasDeployment = server.deployments.length > 0
  if (!hasDeployment) flags.push('not_deployed')

  return flags
}

export const SERVER_HEALTH_BADGE: Record<ServerHealthFlag, { label: string; className: string }> = {
  no_connections: {
    label: 'No Connections',
    className: 'bg-muted text-muted-foreground border-border',
  },
  no_enabled_tools: {
    label: 'No Active Tools',
    className: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  },
  not_deployed: {
    label: 'Not Deployed',
    className: 'bg-muted text-muted-foreground border-border',
  },
}
