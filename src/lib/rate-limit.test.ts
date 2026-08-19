import assert from 'assert';
import {
  classifyRequest,
  InMemoryLimiter,
  TIER_CONFIG,
  type LimitTier,
  checkRateLimit,
  extractClientIp,
  parseTrustedProxyCount,
  rateLimitFailureResult,
} from './rate-limit';

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

// ── checkRateLimit ────────────────────────────────────────────────────────────

async function testCheckRateLimit() {
  console.log('\nTesting checkRateLimit...\n');

  // In-memory is the only backend (Redis support was deliberately removed
  // 2026-07-17). checkRateLimit must never throw in normal operation.
  {
    let threw = false;
    let result: { allowed: boolean; retryAfterSeconds: number } | undefined;
    try {
      result = await checkRateLimit('203.0.113.5', 'read');
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'checkRateLimit must not throw');
    assert.strictEqual(result?.allowed, true, 'first request for a fresh IP should be allowed');
    console.log('  ✓ checkRateLimit uses the in-memory limiter and does not throw');
  }

  // 'none' tier always passes through regardless of backend.
  {
    const result = await checkRateLimit('203.0.113.6', 'none');
    assert.strictEqual(result.allowed, true);
    console.log('  ✓ tier "none" is never rate-limited');
  }
}

// ── extractClientIp ───────────────────────────────────────────────────────────

async function testExtractClientIp() {
  console.log('\nTesting extractClientIp...\n');

  // 1. Platform-provided IP wins over all headers
  {
    const ip = extractClientIp({
      platformIp: '198.51.100.7',
      forwardedFor: '1.2.3.4, 5.6.7.8',
      realIp: '9.9.9.9',
    });
    assert.strictEqual(ip, '198.51.100.7');
    console.log('  ✓ platform IP (req.ip) preferred over headers');
  }

  // 2. Spoofed left-most XFF entry is ignored — right-most (our proxy's
  //    contribution) is used with the default trusted hop count of 1.
  {
    const ip = extractClientIp({ forwardedFor: '6.6.6.6, 203.0.113.9' });
    assert.strictEqual(ip, '203.0.113.9', 'must take right-most entry, not client-spoofable left-most');
    console.log('  ✓ XFF: takes right-most entry (trusted hop), not spoofable left-most');
  }

  // 3. Single XFF entry (proxy appended the only value)
  {
    const ip = extractClientIp({ forwardedFor: '203.0.113.9' });
    assert.strictEqual(ip, '203.0.113.9');
    console.log('  ✓ XFF: single entry used as-is');
  }

  // 4. trustedProxyCount = 2 → second entry from the right
  {
    const ip = extractClientIp({
      forwardedFor: 'spoofed.example, 203.0.113.9, 10.0.0.2',
      trustedProxyCount: 2,
    });
    assert.strictEqual(ip, '203.0.113.9', '2 trusted hops → 2nd entry from the right');
    console.log('  ✓ XFF: trustedProxyCount=2 takes 2nd entry from the right');
  }

  // 5. Fewer entries than trusted hops → left-most (everything was added by our proxies)
  {
    const ip = extractClientIp({ forwardedFor: '203.0.113.9', trustedProxyCount: 3 });
    assert.strictEqual(ip, '203.0.113.9');
    console.log('  ✓ XFF: fewer entries than trusted hops → left-most trusted entry');
  }

  // 6. trustedProxyCount = 0 → forwarding headers not trusted at all
  {
    const ip = extractClientIp({
      forwardedFor: '6.6.6.6',
      realIp: '7.7.7.7',
      trustedProxyCount: 0,
    });
    assert.strictEqual(ip, '', 'no trusted proxies → headers ignored');
    const withPlatform = extractClientIp({
      platformIp: '198.51.100.7',
      forwardedFor: '6.6.6.6',
      trustedProxyCount: 0,
    });
    assert.strictEqual(withPlatform, '198.51.100.7', 'platform IP still used');
    console.log('  ✓ trustedProxyCount=0 ignores headers, platform IP still works');
  }

  // 7. x-real-ip fallback when XFF absent
  {
    const ip = extractClientIp({ realIp: '203.0.113.5' });
    assert.strictEqual(ip, '203.0.113.5');
    console.log('  ✓ x-real-ip used when XFF is absent');
  }

  // 8. Garbage / non-IP-shaped values are rejected, not used as limiter keys
  {
    assert.strictEqual(extractClientIp({ forwardedFor: 'unknown' }), '');
    assert.strictEqual(extractClientIp({ forwardedFor: '<script>, ' }), '');
    assert.strictEqual(extractClientIp({}), '');
    console.log('  ✓ garbage header values → empty string (rate limiting skipped safely)');
  }

  // 9. IPv6 and whitespace handling
  {
    assert.strictEqual(extractClientIp({ forwardedFor: ' 2001:db8::1 , 2001:db8::2 ' }), '2001:db8::2');
    console.log('  ✓ IPv6 entries and surrounding whitespace handled');
  }
}

// ── parseTrustedProxyCount ────────────────────────────────────────────────────

async function testParseTrustedProxyCount() {
  console.log('\nTesting parseTrustedProxyCount...\n');

  assert.strictEqual(parseTrustedProxyCount(undefined), 1);
  assert.strictEqual(parseTrustedProxyCount(''), 1);
  assert.strictEqual(parseTrustedProxyCount('garbage'), 1);
  assert.strictEqual(parseTrustedProxyCount('-2'), 1);
  assert.strictEqual(parseTrustedProxyCount('1.5'), 1);
  console.log('  ✓ missing/invalid values default to 1');

  assert.strictEqual(parseTrustedProxyCount('0'), 0);
  assert.strictEqual(parseTrustedProxyCount('2'), 2);
  console.log('  ✓ valid integer counts (including 0) are honored');
}

// ── rateLimitFailureResult (limiter backend error policy) ────────────────────

async function testRateLimitFailureResult() {
  console.log('\nTesting rateLimitFailureResult...\n');

  // Auth fails CLOSED: a limiter outage must not disable brute-force protection.
  {
    const result = rateLimitFailureResult('auth');
    assert.strictEqual(result.allowed, false, 'auth tier must fail closed on limiter error');
    assert.ok(result.retryAfterSeconds >= 1, 'denied result carries a Retry-After');
    console.log('  ✓ auth tier fails closed (denied) on limiter error');
  }

  // Every other tier fails OPEN: a limiter outage must not take down the app.
  {
    for (const tier of ['mcp', 'mutation', 'read', 'none'] as LimitTier[]) {
      const result = rateLimitFailureResult(tier);
      assert.strictEqual(result.allowed, true, `${tier} tier must fail open on limiter error`);
    }
    console.log('  ✓ mcp/mutation/read/none tiers fail open (allowed) on limiter error');
  }
}

// ── runner ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Rate-Limit Tests...\n');
  await testClassifyRequest();
  await testInMemoryLimiter();
  await testCheckRateLimit();
  await testExtractClientIp();
  await testParseTrustedProxyCount();
  await testRateLimitFailureResult();
  console.log('\n🎉 ALL RATE-LIMIT TESTS PASSED! 🎉\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
