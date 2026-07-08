/**
 * MCP endpoint pipeline — auth, server load, branch resolution, and tool loading.
 *
 * Extracted from the route handler so that the critical gating logic can be
 * tested without a running Next.js server, a real database, or the mcp-handler
 * library.  The route passes its actual DB operations as `deps`; tests pass mocks.
 */

import { checkTransport } from './transport-guard'
import { resolveMcpBypass, BypassInput } from './auth-bypass'
import { verifyMcpApiKey } from '@/lib/auth/verify-mcp-api-key'

// ─── Public types ──────────────────────────────────────────────────────────────

export interface McpGatewayDeps {
  /** Look up the API-key record for this server (for bcrypt verification). */
  findApiKey: (serverId: string) => Promise<{ keyHash: string } | null>
  /** Fire-and-forget: stamp lastUsedAt after a successful auth. */
  touchApiKeyLastUsed: (serverId: string) => void
  /** Load the McpServer row — returns null when the server doesn't exist. */
  findServer: (serverId: string) => Promise<{ id: string; name: string; version: string } | null>
  /** Resolve the target branch (preferred → default → null). */
  resolveServerBranch: (serverId: string, preferredBranchId: string | null) => Promise<{ id: string } | null>
  /** Return all non-deleted BranchTool rows with their base Tool merged in. */
  getEffectiveTools: (branchId: string) => Promise<any[]>
}

export interface McpGatewayParams {
  serverId: string
  transport: string
  bearerToken: string | null
  internalSecret: string | null
  /** Pre-populated env snapshot (so callers — and tests — control it explicitly). */
  bypassInput: BypassInput
  preferredBranchId: string | null
  hasRedis: boolean
}

export type McpGatewayOutcome =
  | { ok: false; status: number; message: string }
  | {
      ok: true
      server: { id: string; name: string; version: string }
      branch: { id: string } | null
      tools: any[]
    }

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function mcpGateway(
  params: McpGatewayParams,
  deps: McpGatewayDeps,
): Promise<McpGatewayOutcome> {
  const { serverId, transport, bearerToken, internalSecret, bypassInput, preferredBranchId, hasRedis } = params

  // ── 1. Transport validation ──────────────────────────────────────────────────
  const transportCheck = checkTransport(transport, hasRedis)
  if (!transportCheck.ok) return { ok: false, status: transportCheck.status, message: transportCheck.message }

  // ── 2. Auth ──────────────────────────────────────────────────────────────────
  const { bypass } = resolveMcpBypass(bypassInput)

  if (!bypass) {
    if (!bearerToken) return { ok: false, status: 401, message: 'Authorization required' }

    const apiKeyRecord = await deps.findApiKey(serverId)
    const valid = await verifyMcpApiKey(bearerToken, apiKeyRecord)
    if (!valid) return { ok: false, status: 401, message: 'Invalid API key' }

    deps.touchApiKeyLastUsed(serverId)
  }

  // ── 3. Server lookup ─────────────────────────────────────────────────────────
  const server = await deps.findServer(serverId)
  if (!server) return { ok: false, status: 404, message: 'Server not found' }

  // ── 4. Branch + tools ────────────────────────────────────────────────────────
  const branch = await deps.resolveServerBranch(serverId, preferredBranchId)
  let tools: any[] = []
  if (branch) {
    tools = await deps.getEffectiveTools(branch.id)
    tools = tools.filter((t: any) => t.isEnabled)
  }

  return { ok: true, server, branch, tools }
}
