/**
 * MCP endpoint auth-bypass decision logic.
 *
 * All production guards live here. The route handler calls `resolveMcpBypass`
 * and acts on the result — it never inspects env vars directly for auth
 * decisions, which makes the production-block easy to test without a real HTTP
 * request or a running Next.js server.
 *
 * --- Bypass mechanisms ---
 *
 * 1. INTERNAL_TEST_SECRET (dev / test only)
 *    Set INTERNAL_TEST_SECRET to a random value (never use the old hardcoded
 *    fallback "mcp-self-test-secret"). When the `x-internal-test-secret` header
 *    matches this value the auth check is skipped. This is used exclusively by
 *    the `/api/servers/[id]/test-mcp-endpoint` self-test route so authenticated
 *    users can verify their MCP setup without needing to provision an API key
 *    first. It is NEVER active in production regardless of env var value.
 *
 * 2. MCP_DEV_BYPASS (development only, requires explicit opt-in)
 *    Set MCP_DEV_BYPASS=true during local development to allow unauthenticated
 *    access when no Bearer token is provided. This is off by default — not
 *    having the env var is the correct state for most dev work. It is NEVER
 *    active in production.
 */

import { logger } from '../logger'

export type BypassReason = 'internal_secret' | 'dev_bypass' | 'none'

export interface BypassResult {
  bypass: boolean
  reason: BypassReason
}

export interface BypassInput {
  /** Value of process.env.NODE_ENV at call time. */
  nodeEnv: string
  /** Value of the `x-internal-test-secret` request header, or null if absent. */
  internalSecret: string | null
  /**
   * Value of process.env.INTERNAL_TEST_SECRET.
   * `undefined` means the env var is not set — bypass is inactive.
   * An empty string is also treated as unset.
   */
  configuredSecret: string | undefined
  /** Bearer token extracted from the Authorization header, or null. */
  bearerToken: string | null
  /**
   * True when process.env.MCP_DEV_BYPASS === 'true'.
   * False for any other value (including 'false', '1', unset).
   */
  devBypassEnabled: boolean
}

/**
 * Decides whether the MCP auth check should be skipped.
 *
 * Production is an unconditional hard block — no bypass path ever fires.
 * In non-production, each mechanism requires explicit configuration.
 */
export function resolveMcpBypass(input: BypassInput): BypassResult {
  const { nodeEnv, internalSecret, configuredSecret, bearerToken, devBypassEnabled } = input

  // ── Hard block in production: zero bypass paths ────────────────────────────
  if (nodeEnv === 'production') {
    return { bypass: false, reason: 'none' }
  }

  // ── Internal-secret bypass (dev / test environments only) ─────────────────
  // Requires INTERNAL_TEST_SECRET to be explicitly configured AND non-empty.
  // The old hardcoded fallback 'mcp-self-test-secret' is intentionally removed —
  // if the env var is not set, this path is simply inactive.
  if (configuredSecret && configuredSecret.length > 0 && internalSecret === configuredSecret) {
    return { bypass: true, reason: 'internal_secret' }
  }

  // ── Dev bypass (development with explicit opt-in only) ────────────────────
  // Requires BOTH: NODE_ENV=development AND MCP_DEV_BYPASS=true.
  // Having one without the other keeps the bypass off.
  if (nodeEnv === 'development' && devBypassEnabled && !bearerToken) {
    return { bypass: true, reason: 'dev_bypass' }
  }

  return { bypass: false, reason: 'none' }
}

/**
 * Reads the current process env and returns a fully-populated BypassInput.
 * Separated from `resolveMcpBypass` so the decision logic can be tested
 * without mutating process.env.
 */
export function readBypassEnv(
  internalSecret: string | null,
  bearerToken: string | null,
): BypassInput {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    internalSecret,
    configuredSecret: process.env.INTERNAL_TEST_SECRET || undefined,
    bearerToken,
    devBypassEnabled: process.env.MCP_DEV_BYPASS === 'true',
  }
}

// ── Startup warning (emitted once per process when bypass is active) ────────

let _bypassWarningEmitted = false

/**
 * Emits a one-shot console.warn when any bypass mechanism is active in a
 * non-production environment. Call this at module load time (top of route.ts).
 */
export function emitBypassWarningIfNeeded(): void {
  if (_bypassWarningEmitted) return
  const nodeEnv = process.env.NODE_ENV ?? 'development'
  if (nodeEnv === 'production') return

  const lines: string[] = []

  if (process.env.INTERNAL_TEST_SECRET) {
    lines.push('  · INTERNAL_TEST_SECRET is set — internal test bypass is active')
  }
  if (process.env.MCP_DEV_BYPASS === 'true') {
    lines.push('  · MCP_DEV_BYPASS=true — unauthenticated access is allowed in development')
  }

  if (lines.length > 0) {
    logger.warn({ mode: nodeEnv, bypasses: lines }, '[MCP Auth] bypass mechanisms active — disabled in production')
    _bypassWarningEmitted = true
  }
}

/** Reset the warning flag — for use in tests only. */
export function _resetBypassWarning(): void {
  _bypassWarningEmitted = false
}
