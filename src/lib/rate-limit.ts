import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
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

// ── Limits per tier ───────────────────────────────────────────────────────────

interface TierConfig { limit: number; windowMs: number; windowLabel: string }

export const TIER_CONFIG: Record<Exclude<LimitTier, 'none'>, TierConfig> = {
  auth:     { limit: 10,  windowMs: 60_000, windowLabel: '60 s' },
  mcp:      { limit: 120, windowMs: 60_000, windowLabel: '60 s' },
  mutation: { limit: 30,  windowMs: 60_000, windowLabel: '60 s' },
  read:     { limit: 120, windowMs: 60_000, windowLabel: '60 s' },
};

// ── In-memory sliding-window limiter (TEMPORARY fallback, all environments) ───
//
// TEMPORARY: used whenever Upstash Redis env vars are not configured — this
// currently includes Vercel production, since Redis is optional (see the
// module-level warning below). Each serverless instance has its own Map, so
// the effective rate limit is multiplied by instance count and counters reset
// on every deploy/cold start. This is NOT distributed across Vercel instances
// or regions. Acceptable for beta/low-traffic use only — configure
// UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN and re-enable distributed
// Redis rate limiting before a public/large-scale launch.

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

// ── Redis configuration (optional) ────────────────────────────────────────────

export type RateLimitMode = 'redis' | 'memory';

/**
 * Decide which rate-limiting backend to use based on env vars. Never throws —
 * Redis is optional in every environment, including production. When both
 * Upstash env vars are present, Redis (distributed) is used; otherwise the
 * TEMPORARY in-memory fallback is used.
 *
 * Exported as a pure function (accepts env as a parameter) so it can be tested
 * in isolation without reloading the module.
 */
export function resolveRateLimitMode(env: {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}): RateLimitMode {
  return env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? 'redis' : 'memory';
}

// ── Module-level initialization ───────────────────────────────────────────────

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const IS_PROD = process.env.NODE_ENV === 'production';

function buildRedisLimiters() {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  const redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
  return {
    auth:     new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10,  '60 s'), prefix: 'rl_auth' }),
    mcp:      new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '60 s'), prefix: 'rl_mcp'  }),
    mutation: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30,  '60 s'), prefix: 'rl_mut'  }),
    read:     new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '60 s'), prefix: 'rl_read' }),
  } as const;
}

function buildMemLimiters() {
  const limiters: Partial<Record<Exclude<LimitTier, 'none'>, InMemoryLimiter>> = {};
  for (const [tier, cfg] of Object.entries(TIER_CONFIG) as [Exclude<LimitTier, 'none'>, TierConfig][]) {
    limiters[tier] = new InMemoryLimiter(cfg.limit, cfg.windowMs);
  }
  return limiters as Record<Exclude<LimitTier, 'none'>, InMemoryLimiter>;
}

// Singletons — created once per process / cold-start.
const redisLimiters = buildRedisLimiters();
const memLimiters   = buildMemLimiters();

// Log the active mode once at module load rather than per-request. Redis is
// optional in every environment — see resolveRateLimitMode above.
if (!redisLimiters) {
  console.warn(
    IS_PROD
      ? '[kilink] RATE_LIMIT: Upstash Redis not configured — using TEMPORARY per-instance ' +
        'in-memory rate limiting in production. Not distributed across Vercel instances/regions ' +
        'and resets on every deploy. Acceptable for beta/low-traffic only; configure ' +
        'UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN before public/large-scale launch.'
      : '[kilink] RATE_LIMIT: Upstash not configured, using in-memory limits (dev/test).',
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Check whether `ip` is within the rate limit for the given `tier`. Never
 * throws on a missing Redis configuration — Redis is optional in every
 * environment, including production.
 *
 * Preference order:
 *  1. Upstash Redis (distributed) — when UPSTASH_REDIS_REST_* env vars are set
 *  2. In-memory sliding window (per-process) — TEMPORARY fallback used
 *     whenever Redis is not configured, including in production
 */
export async function checkRateLimit(
  ip: string,
  tier: LimitTier,
): Promise<RateLimitResult> {
  if (tier === 'none' || !ip) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const effectiveTier = tier as Exclude<LimitTier, 'none'>;

  // ── Redis path (optional, distributed) ───────────────────────────────────
  if (redisLimiters) {
    try {
      const res = await redisLimiters[effectiveTier].limit(ip);
      const retryAfterSeconds = res.reset > 0
        ? Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
        : 60;
      return { allowed: res.success, retryAfterSeconds };
    } catch (err) {
      console.error('[kilink] rate-limit redis error:', err);
      // Redis is configured but transiently unreachable. Fail open rather than
      // switching to the in-memory limiter mid-request, which would silently
      // change rate-limiting semantics (distributed vs per-process) for an
      // indeterminate window.
      console.warn('[kilink] rate-limit: Redis error, allowing request through');
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }

  // ── In-memory fallback (TEMPORARY — see module-load warning above) ───────
  const allowed = memLimiters[effectiveTier].check(ip);
  return { allowed, retryAfterSeconds: allowed ? 0 : Math.ceil(TIER_CONFIG[effectiveTier].windowMs / 1000) };
}
