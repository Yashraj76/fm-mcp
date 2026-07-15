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

// ── In-memory sliding-window limiter (dev / test only) ────────────────────────
//
// Works correctly in `next dev` (single process). Must NOT be used in Vercel
// multi-instance production — each instance has its own Map, so the effective
// rate limit is multiplied by instance count. Use Upstash Redis for production.

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

// ── Configuration guard ───────────────────────────────────────────────────────

/** Thrown when rate limiting is misconfigured for the current environment. */
export class RateLimitConfigError extends Error {
  readonly code = 'RATE_LIMIT_CONFIG_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitConfigError';
  }
}

/**
 * Throws `RateLimitConfigError` if `env.NODE_ENV === 'production'` and either
 * Upstash env var is absent.
 *
 * Exported as a pure function (accepts env as a parameter) so it can be tested
 * in isolation without reloading the module.
 */
export function assertRedisConfiguredForProduction(env: {
  NODE_ENV?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}): void {
  if (
    env.NODE_ENV === 'production' &&
    (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN)
  ) {
    throw new RateLimitConfigError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production. ' +
      'In-memory rate limiting is per-process and must not be used in a multi-instance deployment.',
    );
  }
}

// ── Module-level initialization ───────────────────────────────────────────────

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const IS_PROD = process.env.NODE_ENV === 'production';

// Detect misconfiguration once at module load. checkRateLimit throws on every
// request if this is set, so middleware returns 500 instead of silently
// degrading to per-process memory limits.
let productionConfigError: RateLimitConfigError | null = null;
try {
  assertRedisConfiguredForProduction(process.env);
} catch (err) {
  if (err instanceof RateLimitConfigError) {
    productionConfigError = err;
    console.error(`[kilink] FATAL CONFIG [${err.code}]: ${err.message}`);
  }
}

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
// memLimiters is only used in dev/test; in production checkRateLimit throws
// before reaching the in-memory path if Redis is not configured.
const redisLimiters = buildRedisLimiters();
const memLimiters   = buildMemLimiters();

let warnedOnce = false;

// ── Public API ────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Check whether `ip` is within the rate limit for the given `tier`.
 *
 * Preference order:
 *  1. Upstash Redis (distributed) — when UPSTASH_REDIS_REST_* env vars are set
 *  2. In-memory sliding window (per-process) — dev/test only
 *
 * In production without Redis env vars configured, throws `RateLimitConfigError`
 * so that middleware can return a clear 500 rather than silently degrading to
 * per-process limits. In development, in-memory is used with a logged warning.
 */
export async function checkRateLimit(
  ip: string,
  tier: LimitTier,
): Promise<RateLimitResult> {
  if (tier === 'none' || !ip) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // Production guard: Redis env vars not set → fail closed.
  if (productionConfigError) {
    throw productionConfigError;
  }

  const effectiveTier = tier as Exclude<LimitTier, 'none'>;

  // ── Redis path ────────────────────────────────────────────────────────────
  if (redisLimiters) {
    try {
      const res = await redisLimiters[effectiveTier].limit(ip);
      const retryAfterSeconds = res.reset > 0
        ? Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
        : 60;
      return { allowed: res.success, retryAfterSeconds };
    } catch (err) {
      console.error('[kilink] rate-limit redis error:', err);
      if (IS_PROD) {
        // In production there is no memory fallback — fail open on transient
        // Redis errors rather than returning 500 for every request. The rate
        // limit gap is brief and preferable to an outage. This path is only
        // reached when Redis is configured but transiently unreachable; the
        // misconfiguration case (missing env vars) is caught above.
        console.warn('[kilink] rate-limit: Redis error in production, allowing request through');
        return { allowed: true, retryAfterSeconds: 0 };
      }
      // Dev: fall through to in-memory
    }
  }

  // ── In-memory path (dev/test only) ───────────────────────────────────────
  if (!warnedOnce) {
    console.warn('[kilink] RATE_LIMIT: Upstash not configured, using in-memory limits (dev/test only)');
    warnedOnce = true;
  }

  const allowed = memLimiters[effectiveTier].check(ip);
  return { allowed, retryAfterSeconds: allowed ? 0 : Math.ceil(TIER_CONFIG[effectiveTier].windowMs / 1000) };
}
