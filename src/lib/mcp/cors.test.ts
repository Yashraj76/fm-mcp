import assert from 'assert'
import { parseAllowedOrigins, resolveCorsHeaders } from './cors'

async function runTests() {
  console.log('🚀 Starting MCP CORS Tests...\n')

  // ── 1. parseAllowedOrigins ────────────────────────────────────────────────
  console.log('Testing: parseAllowedOrigins')
  {
    assert.deepStrictEqual(parseAllowedOrigins(undefined), [], 'undefined → empty')
    assert.deepStrictEqual(parseAllowedOrigins(''), [], 'empty string → empty')
    assert.deepStrictEqual(
      parseAllowedOrigins('https://claude.ai'),
      ['https://claude.ai'],
      'single origin',
    )
    assert.deepStrictEqual(
      parseAllowedOrigins('https://a.com,https://b.com'),
      ['https://a.com', 'https://b.com'],
      'comma-separated list',
    )
    assert.deepStrictEqual(
      parseAllowedOrigins('  https://a.com ,  https://b.com  '),
      ['https://a.com', 'https://b.com'],
      'extra spaces stripped',
    )
    assert.deepStrictEqual(
      parseAllowedOrigins('https://a.com/'),
      ['https://a.com'],
      'trailing slash stripped',
    )
    assert.deepStrictEqual(
      parseAllowedOrigins('https://a.com///'),
      ['https://a.com'],
      'multiple trailing slashes stripped',
    )
    console.log('  ✓ parseAllowedOrigins handles all edge cases')
  }

  // ── 2. No Origin header → no CORS headers regardless of env ──────────────
  console.log('\nTesting: no Origin header → no CORS headers (native MCP clients unaffected)')
  {
    const dev = resolveCorsHeaders(null, 'development', [])
    assert.deepStrictEqual(dev, { headers: {}, blocked: false }, 'dev: null origin → empty headers')

    const prod = resolveCorsHeaders(null, 'production', ['https://a.com'])
    assert.deepStrictEqual(prod, { headers: {}, blocked: false }, 'prod: null origin → empty headers')
    console.log('  ✓ null Origin → no headers, not blocked (native clients unaffected)')
  }

  // ── 3. Development, no allowed list → wildcard ────────────────────────────
  console.log('\nTesting: development without MCP_ALLOWED_ORIGINS → wildcard')
  {
    const result = resolveCorsHeaders('https://anything.example.com', 'development', [])
    assert.strictEqual(result.blocked, false)
    assert.strictEqual(result.headers['Access-Control-Allow-Origin'], '*')
    assert.ok(!result.headers['Vary'], 'wildcard must not set Vary (not needed)')
    assert.ok(result.headers['Access-Control-Allow-Methods'], 'methods header present')
    assert.ok(result.headers['Access-Control-Allow-Headers'], 'allow-headers present')
    assert.ok(result.headers['Access-Control-Expose-Headers'], 'expose-headers present')
    console.log('  ✓ dev + no list → wildcard with full CORS headers')
  }

  // ── 4. Development with explicit list → exact match ───────────────────────
  console.log('\nTesting: development with MCP_ALLOWED_ORIGINS → exact match')
  {
    const allowed = ['https://claude.ai', 'https://app.example.com']

    const hit = resolveCorsHeaders('https://claude.ai', 'development', allowed)
    assert.strictEqual(hit.blocked, false)
    assert.strictEqual(hit.headers['Access-Control-Allow-Origin'], 'https://claude.ai')
    assert.strictEqual(hit.headers['Vary'], 'Origin')

    const miss = resolveCorsHeaders('https://evil.example.com', 'development', allowed)
    assert.strictEqual(miss.blocked, true)
    assert.ok(!miss.headers['Access-Control-Allow-Origin'], 'blocked → no ACAO header')
    console.log('  ✓ dev + explicit list → match allowed, block others')
  }

  // ── 5. Production, no allowed list → all browser origins blocked ─────────
  console.log('\nTesting: production without MCP_ALLOWED_ORIGINS → all origins blocked')
  {
    const result = resolveCorsHeaders('https://any-site.com', 'production', [])
    assert.strictEqual(result.blocked, true, 'prod + no list → blocked')
    assert.ok(!result.headers['Access-Control-Allow-Origin'], 'no ACAO header')
    assert.strictEqual(Object.keys(result.headers).length, 0, 'empty headers object')
    console.log('  ✓ production + no list → blocked (zero CORS headers)')
  }

  // ── 6. Production with explicit list → only listed origins allowed ────────
  console.log('\nTesting: production with MCP_ALLOWED_ORIGINS → only listed origins allowed')
  {
    const allowed = ['https://claude.ai']

    const hit = resolveCorsHeaders('https://claude.ai', 'production', allowed)
    assert.strictEqual(hit.blocked, false)
    assert.strictEqual(hit.headers['Access-Control-Allow-Origin'], 'https://claude.ai')
    assert.strictEqual(hit.headers['Vary'], 'Origin')

    const miss = resolveCorsHeaders('https://not-allowed.com', 'production', allowed)
    assert.strictEqual(miss.blocked, true)
    assert.ok(!miss.headers['Access-Control-Allow-Origin'])

    const wildcard = resolveCorsHeaders('*', 'production', allowed)
    assert.strictEqual(wildcard.blocked, true, '"*" as literal origin value → blocked')

    console.log('  ✓ production + explicit list → only exact matches allowed')
  }

  // ── 7. Vary: Origin is set for specific-origin responses ─────────────────
  console.log('\nTesting: Vary: Origin is set for specific-origin, not for wildcard')
  {
    const wildcardResult = resolveCorsHeaders('https://any.com', 'development', [])
    assert.ok(!wildcardResult.headers['Vary'], 'wildcard → no Vary header')

    const specificResult = resolveCorsHeaders('https://a.com', 'production', ['https://a.com'])
    assert.strictEqual(specificResult.headers['Vary'], 'Origin', 'specific origin → Vary: Origin')
    console.log('  ✓ Vary: Origin set for specific origins, not for wildcard')
  }

  // ── 8. Trailing slash normalisation in request origin ────────────────────
  console.log('\nTesting: trailing slash in request Origin is normalised before matching')
  {
    const allowed = ['https://a.com']

    const withSlash = resolveCorsHeaders('https://a.com/', 'production', allowed)
    assert.strictEqual(withSlash.blocked, false, 'origin with trailing slash matches')
    assert.strictEqual(withSlash.headers['Access-Control-Allow-Origin'], 'https://a.com')

    const withSlash2 = resolveCorsHeaders('https://a.com//', 'production', allowed)
    assert.strictEqual(withSlash2.blocked, false, 'origin with multiple trailing slashes matches')
    console.log('  ✓ trailing slashes normalised in request origin before matching')
  }

  // ── 9. Multiple allowed origins: first match wins ─────────────────────────
  console.log('\nTesting: multiple origins in the allowed list')
  {
    const allowed = ['https://a.com', 'https://b.com', 'https://c.com']

    for (const origin of allowed) {
      const result = resolveCorsHeaders(origin, 'production', allowed)
      assert.strictEqual(result.blocked, false, `${origin} should be allowed`)
      assert.strictEqual(result.headers['Access-Control-Allow-Origin'], origin)
    }

    const blocked = resolveCorsHeaders('https://d.com', 'production', allowed)
    assert.strictEqual(blocked.blocked, true, 'unlisted origin blocked')
    console.log('  ✓ each listed origin matches, unlisted blocked')
  }

  // ── 10. Fixed CORS headers (methods, allow, expose) are present ───────────
  console.log('\nTesting: fixed CORS headers are present whenever origin is allowed')
  {
    const wildcard = resolveCorsHeaders('https://any.com', 'development', [])
    assert.ok(wildcard.headers['Access-Control-Allow-Methods']?.includes('POST'))
    assert.ok(wildcard.headers['Access-Control-Allow-Headers']?.includes('Authorization'))
    assert.ok(wildcard.headers['Access-Control-Expose-Headers']?.includes('Mcp-Session-Id'))

    const specific = resolveCorsHeaders('https://a.com', 'production', ['https://a.com'])
    assert.ok(specific.headers['Access-Control-Allow-Methods']?.includes('POST'))
    assert.ok(specific.headers['Access-Control-Allow-Headers']?.includes('Mcp-Session-Id'))
    assert.ok(specific.headers['Access-Control-Expose-Headers']?.includes('Mcp-Session-Id'))
    console.log('  ✓ allow-methods, allow-headers, expose-headers present when allowed')
  }

  // ── 11. Blocked response has zero headers (no partial leakage) ────────────
  console.log('\nTesting: blocked origins return empty headers (no partial leakage)')
  {
    const blocked = resolveCorsHeaders('https://evil.com', 'production', ['https://good.com'])
    assert.strictEqual(Object.keys(blocked.headers).length, 0,
      'blocked response must have zero CORS headers — no partial info leakage')
    console.log('  ✓ blocked origin → zero headers returned')
  }

  // ── 12. Development localhost auto-allowed via wildcard ───────────────────
  console.log('\nTesting: development localhost origins allowed via wildcard when no list set')
  {
    const localhostOrigins = [
      'http://localhost:3000',
      'http://localhost:4000',
      'http://localhost:5173',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
    ]
    for (const origin of localhostOrigins) {
      const result = resolveCorsHeaders(origin, 'development', [])
      assert.strictEqual(result.blocked, false, `${origin} must not be blocked in dev`)
      assert.strictEqual(result.headers['Access-Control-Allow-Origin'], '*',
        `${origin} in dev+no-list should return wildcard`)
    }
    console.log('  ✓ localhost:* and 127.0.0.1:* all allowed via wildcard in development')
  }

  // ── 13. Production localhost always blocked unless explicitly listed ───────
  console.log('\nTesting: production localhost is blocked when not in the allowed list')
  {
    const result = resolveCorsHeaders('http://localhost:3000', 'production', ['https://app.example.com'])
    assert.strictEqual(result.blocked, true, 'localhost not in allowed list → blocked in prod')
    assert.ok(!result.headers['Access-Control-Allow-Origin'], 'no ACAO header for blocked origin')

    const noListResult = resolveCorsHeaders('http://localhost:3000', 'production', [])
    assert.strictEqual(noListResult.blocked, true, 'localhost blocked in prod with no list')
    console.log('  ✓ localhost blocked in production unless explicitly in MCP_ALLOWED_ORIGINS')
  }

  // ── 14. Localhost in explicit allowed list → exact match ─────────────────
  console.log('\nTesting: localhost explicitly in MCP_ALLOWED_ORIGINS → matched exactly')
  {
    const allowed = ['http://localhost:3000', 'https://app.example.com']

    const devHit = resolveCorsHeaders('http://localhost:3000', 'development', allowed)
    assert.strictEqual(devHit.blocked, false)
    assert.strictEqual(devHit.headers['Access-Control-Allow-Origin'], 'http://localhost:3000')
    assert.strictEqual(devHit.headers['Vary'], 'Origin')

    const prodHit = resolveCorsHeaders('http://localhost:3000', 'production', allowed)
    assert.strictEqual(prodHit.blocked, false, 'localhost allowed in prod when explicitly listed')
    assert.strictEqual(prodHit.headers['Access-Control-Allow-Origin'], 'http://localhost:3000')

    const wrongPort = resolveCorsHeaders('http://localhost:4000', 'production', allowed)
    assert.strictEqual(wrongPort.blocked, true, 'different localhost port not in list → blocked')
    console.log('  ✓ Explicit localhost in allowed list matched exactly, wrong port blocked')
  }

  console.log('\n🎉 ALL MCP CORS TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ MCP CORS TESTS FAILED:', err)
  process.exit(1)
})
