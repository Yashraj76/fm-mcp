import assert from 'assert';
import { classifyRequest, InMemoryLimiter, TIER_CONFIG, type LimitTier, assertRedisConfiguredForProduction, RateLimitConfigError } from './rate-limit';

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

// ── assertRedisConfiguredForProduction ───────────────────────────────────────

async function testAssertRedisConfiguredForProduction() {
  console.log('\nTesting assertRedisConfiguredForProduction...\n');

  // 1. Production without any Redis env vars → throws RateLimitConfigError
  {
    let threw = false;
    try {
      assertRedisConfiguredForProduction({ NODE_ENV: 'production' });
    } catch (err) {
      threw = true;
      assert.ok(err instanceof RateLimitConfigError, 'should be RateLimitConfigError');
      assert.strictEqual((err as RateLimitConfigError).code, 'RATE_LIMIT_CONFIG_ERROR');
      assert.ok((err as Error).message.includes('production'), 'message mentions production');
      assert.ok((err as Error).message.includes('UPSTASH_REDIS_REST_URL'), 'message names the missing var');
    }
    assert.ok(threw, 'should have thrown in production without Redis');
    console.log('  ✓ production + no Redis env → fails closed (RateLimitConfigError)');
  }

  // 2. Production with URL but missing token → still throws
  {
    let threw = false;
    try {
      assertRedisConfiguredForProduction({
        NODE_ENV: 'production',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      });
    } catch (err) {
      threw = true;
      assert.ok(err instanceof RateLimitConfigError);
    }
    assert.ok(threw, 'partial Redis config in production should throw');
    console.log('  ✓ production + URL only (no token) → throws');
  }

  // 3. Development without Redis env vars → does NOT throw (memory fallback allowed)
  {
    let threw = false;
    try {
      assertRedisConfiguredForProduction({ NODE_ENV: 'development' });
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'development without Redis should not throw');
    console.log('  ✓ development + no Redis env → uses in-memory fallback (no throw)');
  }

  // 4. Test environment without Redis env vars → does NOT throw
  {
    let threw = false;
    try {
      assertRedisConfiguredForProduction({ NODE_ENV: 'test' });
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'test env without Redis should not throw');
    console.log('  ✓ test env + no Redis env → does not throw');
  }

  // 5. Production with both Redis env vars → does NOT throw (initializes normally)
  {
    let threw = false;
    try {
      assertRedisConfiguredForProduction({
        NODE_ENV: 'production',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'AQIjtoken',
      });
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'production with Redis fully configured should not throw');
    console.log('  ✓ production + both Redis env vars → initializes normally (no throw)');
  }
}

// ── runner ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Rate-Limit Tests...\n');
  await testClassifyRequest();
  await testInMemoryLimiter();
  await testAssertRedisConfiguredForProduction();
  console.log('\n🎉 ALL RATE-LIMIT TESTS PASSED! 🎉\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
