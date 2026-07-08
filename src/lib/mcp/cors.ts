/**
 * MCP endpoint CORS resolution.
 *
 * MCP native clients (Claude Desktop, mcp-remote, CLI tools) never send an
 * `Origin` header and are not subject to browser CORS enforcement.  All logic
 * here is a no-op for them.
 *
 * For browser-based callers the policy is:
 *
 *   development + no MCP_ALLOWED_ORIGINS  →  wildcard (*), convenient
 *   any env    + MCP_ALLOWED_ORIGINS set  →  exact match against the list
 *   production + no MCP_ALLOWED_ORIGINS  →  blocked (no ACAO header)
 *
 * "Blocked" means we simply omit `Access-Control-Allow-Origin` from the
 * response — the browser enforces the block.  We never send an explicit
 * "deny" status for CORS (that would break the OPTIONS preflight contract).
 *
 * --- Configuration ---
 *
 * MCP_ALLOWED_ORIGINS  Comma-separated list of allowed origins.
 *                       Example: https://claude.ai,https://app.example.com
 *                       Trailing slashes and extra spaces are stripped.
 *
 * --- Vary: Origin ---
 *
 * When responding with a specific origin (not wildcard) the `Vary: Origin`
 * header is always included so CDNs and shared caches don't serve the wrong
 * ACAO header to a different origin.
 */

const FIXED_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
} as const

export type CorsHeaders = Record<string, string>

export interface CorsResolution {
  /** Headers to merge into the response.  Empty when origin is blocked or absent. */
  headers: CorsHeaders
  /** True when an Origin was present but not in the allowed list. */
  blocked: boolean
}

/**
 * Parse a comma-separated origin list from an env-var value.
 * Returns an empty array when `raw` is undefined/empty.
 * Each entry has trailing slashes stripped so https://a.com/ equals https://a.com.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

/**
 * Resolves the CORS headers for a single request.
 *
 * @param requestOrigin  Value of the `Origin` request header, or null if absent.
 * @param nodeEnv        Value of `process.env.NODE_ENV`.
 * @param allowedOrigins Pre-parsed list from `MCP_ALLOWED_ORIGINS`.
 */
export function resolveCorsHeaders(
  requestOrigin: string | null,
  nodeEnv: string,
  allowedOrigins: string[],
): CorsResolution {
  // No Origin header → not a cross-origin browser request → no CORS headers
  if (!requestOrigin) return { headers: {}, blocked: false }

  const isProduction = nodeEnv === 'production'

  // Development without an explicit list → wildcard (no Vary needed for *)
  if (!isProduction && allowedOrigins.length === 0) {
    return {
      headers: { 'Access-Control-Allow-Origin': '*', ...FIXED_CORS_HEADERS },
      blocked: false,
    }
  }

  // Explicit list configured (any env) OR production with no list
  const normalizedOrigin = requestOrigin.replace(/\/+$/, '')
  if (allowedOrigins.includes(normalizedOrigin)) {
    return {
      headers: {
        'Access-Control-Allow-Origin': normalizedOrigin,
        Vary: 'Origin',
        ...FIXED_CORS_HEADERS,
      },
      blocked: false,
    }
  }

  // Origin present but not allowed → omit ACAO header (browser enforces block)
  return { headers: {}, blocked: true }
}

/**
 * Reads the CORS configuration from the current process environment.
 * Returns the three values needed by `resolveCorsHeaders`.
 */
export function readCorsEnv(): { nodeEnv: string; allowedOrigins: string[] } {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    allowedOrigins: parseAllowedOrigins(process.env.MCP_ALLOWED_ORIGINS),
  }
}
