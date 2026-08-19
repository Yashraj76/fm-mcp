// NOTE: Do NOT import pino/logger here. rate-limit.ts is pulled into middleware.ts,
// which runs in Vercel's Edge runtime where Node.js-only packages (pino) are unavailable.

// ── Tier classification ───────────────────────────────────────────────────────

export type LimitTier = 'auth' | 'mcp' | 'mutation' | 'read' | 'none';

/**
 * Classify a request into a rate-limit tier based on pathname and HTTP method.
 *
 * 'none' → not rate-limited (static, non-API routes)
 * 'auth' → auth endpoints — strictest limit
 * 'mcp'  → MCP transport — AI agents can be chatty, higher limit
 * 'mutation' → state-changing API calls
 * 'read' → safe API reads
 */
export function classifyRequest(pathname: string, method: string): LimitTier {
  // Supabase auth callback and kilink auth API routes
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/auth')) {
    return 'auth';
  }
  // MCP transport endpoint consumed by AI agents
  if (pathname.startsWith('/api/mcp')) {
    return 'mcp';
  }
  // All other non-API paths (pages, assets already excluded by matcher)
  if (!pathname.startsWith('/api')) {
    return 'none';
  }
  // State-changing API mutations
  const m = method.toUpperCase();
  if (m === 'POST' || m === 'PUT' || m === 'DELETE' || m === 'PATCH') {
    return 'mutation';
  }
  return 'read';
}

// ── Client IP extraction ──────────────────────────────────────────────────────

// Loose shape check so header garbage ("unknown", injection attempts) is never
// used as a rate-limit key. Not full IP validation — node:net's isIP is
// unavailable in the Edge runtime where this module runs.
const IP_CHARS_RE = /^[0-9a-fA-F.:%]+$/;

function sanitizeIpCandidate(value: string | null | undefined): string {
  const s = (value ?? '').trim();
  return s && IP_CHARS_RE.test(s) ? s : '';
}

/** Parse TRUSTED_PROXY_COUNT (number of proxies we control in front of the app). Default 1 (Vercel / the Caddy proxy). 0 = trust no forwarding headers. */
export function parseTrustedProxyCount(raw: string | undefined): number {
  const s = (raw ?? '').trim();
  if (!s) return 1; // unset/blank → default (Number('') is 0, which would silently distrust headers)
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

/**
 * Derive the client IP from a trusted position.
 *
 * Preference order:
 *  1. Platform-provided IP (`req.ip` on Vercel) — set by the platform, not spoofable.
 *  2. X-Forwarded-For, taking the entry contributed by our own proxy: each
 *     trusted proxy APPENDS the address of the peer it received the request
 *     from, so with N trusted proxies the client is the Nth entry from the
 *     RIGHT. Everything left of that is client-controlled and ignored —
 *     never the leftmost entry, which any client can spoof.
 *  3. X-Real-Ip — set by our proxy (Caddy) when present.
 *
 * With trustedProxyCount = 0 (app directly exposed), forwarding headers are
 * not trusted at all. Returns '' when no trustworthy IP can be determined;
 * callers skip rate limiting in that case.
 */
export function extractClientIp(input: {
  platformIp?: string;
  forwardedFor?: string | null;
  realIp?: string | null;
  trustedProxyCount?: number;
}): string {
  const platform = sanitizeIpCandidate(input.platformIp);
  if (platform) return platform;

  const count = input.trustedProxyCount ?? 1;
  if (count === 0) return '';

  if (input.forwardedFor) {
    const entries = input.forwardedFor.split(',').map(e => e.trim()).filter(Boolean);
    if (entries.length > 0) {
      // Nth from the right. If there are fewer entries than trusted hops,
      // every entry was added by our own proxies — take the leftmost.
      const idx = Math.max(0, entries.length - count);
      const candidate = sanitizeIpCandidate(entries[idx]);
      if (candidate) return candidate;
    }
  }

  return sanitizeIpCandidate(input.realIp);
}

// ── Limits per tier ───────────────────────────────────────────────────────────

interface TierConfig { limit: number; windowMs: number; windowLabel: string }

export const TIER_CONFIG: Record<Exclude<LimitTier, 'none'>, TierConfig> = {
  auth:     { limit: 10,  windowMs: 60_000, windowLabel: '60 s' },
  mcp:      { limit: 120, windowMs: 60_000, windowLabel: '60 s' },
  mutation: { limit: 30,  windowMs: 60_000, windowLabel: '60 s' },
  read:     { limit: 120, windowMs: 60_000, windowLabel: '60 s' },
};

// ── In-memory sliding-window limiter (the only backend) ───────────────────────
//
// Deliberate decision (2026-07-17): the optional Upstash Redis backend was
// removed to cut dependencies — in-memory limiting is sufficient at current
// traffic. KNOWN LIMITATION on serverless: each instance has its own Map, so
// the effective limit is multiplied by concurrent instance count and counters
// reset on every deploy/cold start. If traffic grows to where distributed
// limiting matters, reintroduce a Redis-backed limiter here (see git history
// for the previous @upstash/ratelimit implementation).

export class InMemoryLimiter {
  private windows = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const prev = this.windows.get(key) ?? [];
    const fresh = prev.filter(t => t > cutoff);

    if (fresh.length >= this.limit) {
      this.windows.set(key, fresh);
      return false;  // blocked
    }

    fresh.push(now);
    this.windows.set(key, fresh);
    return true;  // allowed
  }
}

// ── Module-level initialization ───────────────────────────────────────────────

function buildMemLimiters() {
  const limiters: Partial<Record<Exclude<LimitTier, 'none'>, InMemoryLimiter>> = {};
  for (const [tier, cfg] of Object.entries(TIER_CONFIG) as [Exclude<LimitTier, 'none'>, TierConfig][]) {
    limiters[tier] = new InMemoryLimiter(cfg.limit, cfg.windowMs);
  }
  return limiters as Record<Exclude<LimitTier, 'none'>, InMemoryLimiter>;
}

// Singleton — created once per process / cold-start.
const memLimiters = buildMemLimiters();

// ── Public API ────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Result to use when the rate-limit backend errors. The auth tier fails
 * CLOSED — silently losing brute-force protection is worse than briefly
 * denying logins — while every other tier fails open so a limiter outage
 * can't take down the whole app.
 */
export function rateLimitFailureResult(tier: LimitTier): RateLimitResult {
  if (tier === 'auth') {
    return { allowed: false, retryAfterSeconds: Math.ceil(TIER_CONFIG.auth.windowMs / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Check whether `ip` is within the rate limit for the given `tier`, using the
 * per-process in-memory sliding window (see the limitation note above). Never
 * throws in normal operation; if it ever does, middleware applies
 * `rateLimitFailureResult` (auth fails closed, other tiers fail open).
 */
export async function checkRateLimit(
  ip: string,
  tier: LimitTier,
): Promise<RateLimitResult> {
  if (tier === 'none' || !ip) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const effectiveTier = tier as Exclude<LimitTier, 'none'>;
  const allowed = memLimiters[effectiveTier].check(ip);
  return { allowed, retryAfterSeconds: allowed ? 0 : Math.ceil(TIER_CONFIG[effectiveTier].windowMs / 1000) };
}
