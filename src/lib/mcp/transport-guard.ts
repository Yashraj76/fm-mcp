export type KnownTransport = 'mcp' | 'sse'

export const KNOWN_TRANSPORTS: ReadonlySet<string> = new Set(['mcp', 'sse'])

export type TransportCheckResult =
  | { ok: true; transport: KnownTransport }
  | { ok: false; status: 400 | 503; message: string }

/**
 * Validate the transport segment from the MCP endpoint URL.
 *
 * Returns ok:true for supported transports (accounting for whether SSE is
 * available), or ok:false with an HTTP status and a descriptive error message.
 *
 * Supported transports:
 *   mcp  — Streamable HTTP (MCP 2025-03-26 spec, always available)
 *   sse  — Server-Sent Events (legacy, requires REDIS_URL on the server)
 */
export function checkTransport(
  transport: string,
  sseAvailable: boolean,
): TransportCheckResult {
  if (!KNOWN_TRANSPORTS.has(transport)) {
    return {
      ok: false,
      status: 400,
      message: `Unknown transport '${transport}'. Supported: mcp (Streamable HTTP) and sse (Server-Sent Events, requires REDIS_URL).`,
    }
  }
  if (transport === 'sse' && !sseAvailable) {
    return {
      ok: false,
      status: 503,
      message:
        'SSE transport is not available — REDIS_URL is not configured on this server. ' +
        'Use the /mcp endpoint for Streamable HTTP transport instead.',
    }
  }
  return { ok: true, transport: transport as KnownTransport }
}
