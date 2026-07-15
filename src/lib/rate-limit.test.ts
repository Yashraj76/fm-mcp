import assert from 'assert';
import { classifyRequest, InMemoryLimiter, TIER_CONFIG, type LimitTier, resolveRateLimitMode, checkRateLimit } from './rate-limit';

// ── classifyRequest ───────────────────────────────────────────────────────────

async function testClassifyRequest() {
  console.log('Testing classifyRequest...\n');

  const cases: [string, string, LimitTier][] = [
    // Auth routes
    ['/api/auth/callback',        'GET',    'auth'],
    ['/api/auth/confirm',         'POST',   'auth'],
    ['/auth/callback',            'GET',    'auth'],
    ['/auth/confirm',             'POST',   'auth'],
    // MCP transport
    ['/api/mcp/srv123/sse',       'GET',    'mcp'],
    ['/api/mcp/srv123/http',      'POST',   'mcp'],
    ['/api/mcp/srv123/http',      'GET',    'mcp'],
    // Mutations (POST/PUT/DELETE/PATCH on /api/*)
    ['/api/branches/b1/merge',    'POST',   'mutation'],
    ['/api/connections/c1',       'PUT',    'mutation'],
    ['/api/tools/t1',             'DELETE', 'mutation'],
    ['/api/servers/s1/config',    'PATCH',  'mutation'],
    // Reads (GET on /api/*)
    ['/api/servers',              'GET',    'read'],
    ['/api/connections',          'GET',    'read'],
    ['/api/branches/b1/tools',    'GET',    'read'],
    // Non-API paths — should not be rate-limited
    ['/login',                    'GET',    'none'],
    ['/signup',                   'POST',   'none'],
    ['/',                         'GET',    'none'],
    ['/servers',                  'GET',    'none'],
  ];

  for (const [pathname, method, expected] of cases) {
    const result = classifyRequest(pathname, method);
    assert.strictEqual(
      result,
      expected,
      `classifyRequest('${pathname}', '${method}') → expected '${expected}', got '${result}'`
    );
    console.log(`  ✓ ${method.padEnd(6)} ${pathname} → '${result}'`);
  }
}

// ── InMemoryLimiter ───────────────────────────────────────────────────────────

async function testInMemoryLimiter() {
  console.log('\nTesting InMemoryLimiter...\n');

  // 1. Allows requests up to the limit
  {
    const limiter = new InMemoryLimiter(3, 60_000);
    assert.strictEqual(limiter.check('ip1'), true,  '1st request allowed');
    assert.strictEqual(limiter.check('ip1'), true,  '2nd request allowed');
    assert.strictEqual(limiter.check('ip1'), true,  '3rd request allowed');
    assert.strictEqual(limiter.check('ip1'), false, '4th request blocked (at limit)');
    console.log('  ✓ Blocks at exact limit');
  }

  // 2. Different IPs have independent buckets
  {
    const limiter = new InMemoryLimiter(2, 60_000);
    assert.strictEqual(limiter.check('a'), true);
    assert.strictEqual(limiter.check('a'), true);
    assert.strictEqual(limiter.check('a'), false, 'a blocked');
    assert.strictEqual(limiter.check('b'), true,  'b still allowed');
    assert.strictEqual(limiter.check('b'), true,  'b still allowed');
    assert.strictEqual(limiter.check('b'), false, 'b blocked');
    console.log('  ✓ Different IPs have independent counters');
  }

  // 3. Window resets after windowMs elapses
  {
    const windowMs = 50; // short window so we can sleep briefly
    const limiter = new InMemoryLimiter(2, windowMs);
    assert.strictEqual(limiter.check('c'), true);
    assert.strictEqual(limiter.check('c'), true);
    assert.strictEqual(limiter.check('c'), false, 'blocked before window expires');

    // Wait for the window to pass
    await new Promise(resolve => setTimeout(resolve, windowMs + 10));

    assert.strictEqual(limiter.check('c'), true,  'allowed after window reset');
    assert.strictEqual(limiter.check('c'), true,  'second allowed');
    assert.strictEqual(limiter.check('c'), false, 'blocked again at new limit');
    console.log('  ✓ Window resets after windowMs');
  }

  // 4. Limit of 1 blocks second request immediately
  {
    const limiter = new InMemoryLimiter(1, 60_000);
    assert.strictEqual(limiter.check('d'), true,  'first allowed');
    assert.strictEqual(limiter.check('d'), false, 'second blocked');
    console.log('  ✓ Limit of 1 blocks second request');
  }

  // 5. High-volume: only N requests pass within the window
  {
    const limiter = new InMemoryLimiter(10, 60_000);
    let passed = 0;
    for (let i = 0; i < 25; i++) {
      if (limiter.check('e')) passed++;
    }
    assert.strictEqual(passed, 10, `Expected exactly 10 to pass, got ${passed}`);
    console.log('  ✓ Exactly N requests pass out of a larger burst');
  }

  // 6. TIER_CONFIG limits match documented values
  {
    assert.strictEqual(TIER_CONFIG.auth.limit,     10);
    assert.strictEqual(TIER_CONFIG.mcp.limit,      120);
    assert.strictEqual(TIER_CONFIG.mutation.limit, 30);
    assert.strictEqual(TIER_CONFIG.read.limit,     120);
    console.log('  ✓ TIER_CONFIG has expected limit values');
  }
}

// ── resolveRateLimitMode ──────────────────────────────────────────────────────
//
// Redis is optional in every environment, including production. These tests
// cover the pure decision function directly (rather than the module's
// process.env-derived singletons, which are fixed for the life of this
// process) since NODE_ENV/Upstash env vars can't be swapped per-test without
// reloading the module.

async function testResolveRateLimitMode() {
  console.log('\nTesting resolveRateLimitMode...\n');

  // 1. Production without any Redis env vars → 'memory' (never throws)
  {
    const mode = resolveRateLimitMode({ });
    assert.strictEqual(mode, 'memory');
    console.log('  ✓ no Redis env → memory (does not throw, even conceptually "in production")');
  }

  // 2. URL present but token missing → still 'memory' (partial config is not enough)
  {
    const mode = resolveRateLimitMode({ UPSTASH_REDIS_REST_URL: 'https://example.upstash.io' });
    assert.strictEqual(mode, 'memory');
    console.log('  ✓ URL only (no token) → memory');
  }

  // 3. Both Redis env vars present → 'redis'
  {
    const mode = resolveRateLimitMode({
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'AQIjtoken',
    });
    assert.strictEqual(mode, 'redis');
    console.log('  ✓ both Redis env vars → redis');
  }
}

// ── checkRateLimit ────────────────────────────────────────────────────────────

async function testCheckRateLimit() {
  console.log('\nTesting checkRateLimit...\n');

  // This test process has no UPSTASH_REDIS_REST_* env vars set, so the module
  // singleton falls back to the in-memory limiter regardless of NODE_ENV.
  // The key behavior under test: it must not throw a config error just
  // because Redis is absent — API routes should never fail for this reason.
  {
    let threw = false;
    let result: { allowed: boolean; retryAfterSeconds: number } | undefined;
    try {
      result = await checkRateLimit('203.0.113.5', 'read');
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'checkRateLimit must not throw when Redis env vars are absent');
    assert.strictEqual(result?.allowed, true, 'first request for a fresh IP should be allowed');
    console.log('  ✓ checkRateLimit without Redis configured → uses in-memory limiter, does not throw');
  }

  // 'none' tier always passes through regardless of backend.
  {
    const result = await checkRateLimit('203.0.113.6', 'none');
    assert.strictEqual(result.allowed, true);
    console.log('  ✓ tier "none" is never rate-limited');
  }
}

// ── runner ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Rate-Limit Tests...\n');
  await testClassifyRequest();
  await testInMemoryLimiter();
  await testResolveRateLimitMode();
  await testCheckRateLimit();
  console.log('\n🎉 ALL RATE-LIMIT TESTS PASSED! 🎉\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
