import assert from 'assert'
import { resolveMcpBypass, emitBypassWarningIfNeeded, _resetBypassWarning } from './auth-bypass'
import { logger } from '../logger'

// Spy on logger.warn (pino) instead of console.warn so we intercept structured log calls
let warnCalls: Array<{ obj: any; msg: string }> = []
const originalLoggerWarn = logger.warn.bind(logger)
function captureWarn() {
  warnCalls = []
  ;(logger as any).warn = (obj: any, msg: string) => { warnCalls.push({ obj, msg }) }
}
function restoreWarn() { ;(logger as any).warn = originalLoggerWarn }

async function runTests() {
  console.log('🚀 Starting MCP Auth Bypass Tests...\n')

  // ── 1. Production: bypass is ALWAYS false ─────────────────────────────────
  console.log('Testing: production mode — all bypass paths are hard-blocked')
  {
    // internal_secret match in production → still blocked
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'production', internalSecret: 'secret123', configuredSecret: 'secret123', bearerToken: null, devBypassEnabled: false }),
      { bypass: false, reason: 'none' },
      'production + matching internal secret → blocked',
    )
    // dev bypass enabled in production → still blocked
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'production', internalSecret: null, configuredSecret: undefined, bearerToken: null, devBypassEnabled: true }),
      { bypass: false, reason: 'none' },
      'production + devBypassEnabled → blocked',
    )
    // both paths enabled in production → still blocked
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'production', internalSecret: 'secret', configuredSecret: 'secret', bearerToken: null, devBypassEnabled: true }),
      { bypass: false, reason: 'none' },
      'production + both bypasses → blocked',
    )
    console.log('  ✓ production blocks all bypass paths unconditionally')
  }

  // ── 2. Production: hardcoded fallback cannot bypass auth ──────────────────
  console.log('\nTesting: old hardcoded "mcp-self-test-secret" cannot bypass auth')
  {
    const OLD_HARDCODED = 'mcp-self-test-secret'
    // In production — blocked regardless
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'production', internalSecret: OLD_HARDCODED, configuredSecret: OLD_HARDCODED, bearerToken: null, devBypassEnabled: false }),
      { bypass: false, reason: 'none' },
      'production: hardcoded secret → blocked',
    )
    // In development WITHOUT configuredSecret set → blocked (no fallback)
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'development', internalSecret: OLD_HARDCODED, configuredSecret: undefined, bearerToken: null, devBypassEnabled: false }),
      { bypass: false, reason: 'none' },
      'dev: hardcoded secret but no configured secret → blocked',
    )
    // In development WITH empty-string configuredSecret → blocked (empty treated as unset)
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'development', internalSecret: OLD_HARDCODED, configuredSecret: '', bearerToken: null, devBypassEnabled: false }),
      { bypass: false, reason: 'none' },
      'dev: empty-string configuredSecret → blocked',
    )
    console.log('  ✓ hardcoded fallback secret never grants bypass (no fallback path exists)')
  }

  // ── 3. internal_secret: works only in non-production when correctly configured ─
  console.log('\nTesting: INTERNAL_TEST_SECRET bypass — dev/test only, explicit config required')
  {
    const SECRET = 'random-secret-abc123xyz'
    // development: configured + matching → bypass
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'development', internalSecret: SECRET, configuredSecret: SECRET, bearerToken: null, devBypassEnabled: false }),
      { bypass: true, reason: 'internal_secret' },
      'dev: matching configured secret → bypass',
    )
    // test env: configured + matching → bypass
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'test', internalSecret: SECRET, configuredSecret: SECRET, bearerToken: null, devBypassEnabled: false }),
      { bypass: true, reason: 'internal_secret' },
      'test: matching configured secret → bypass',
    )
    // development: wrong header value → no bypass
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'development', internalSecret: 'wrong-secret', configuredSecret: SECRET, bearerToken: null, devBypassEnabled: false }),
      { bypass: false, reason: 'none' },
      'dev: wrong internalSecret → no bypass',
    )
    // development: correct value but configuredSecret not set → no bypass
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'development', internalSecret: SECRET, configuredSecret: undefined, bearerToken: null, devBypassEnabled: false }),
      { bypass: false, reason: 'none' },
      'dev: matching value but configuredSecret undefined → no bypass',
    )
    console.log('  ✓ internal_secret bypass requires explicit configuration and correct match')
  }

  // ── 4. dev_bypass: requires explicit opt-in AND no bearer token ──────────
  console.log('\nTesting: MCP_DEV_BYPASS — requires explicit opt-in')
  {
    // development + devBypassEnabled + no bearer → bypass
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'development', internalSecret: null, configuredSecret: undefined, bearerToken: null, devBypassEnabled: true }),
      { bypass: true, reason: 'dev_bypass' },
      'dev + devBypassEnabled + no token → bypass',
    )
    // development + devBypassEnabled=false (default) + no bearer → NO bypass
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'development', internalSecret: null, configuredSecret: undefined, bearerToken: null, devBypassEnabled: false }),
      { bypass: false, reason: 'none' },
      'dev + devBypassEnabled=false + no token → no bypass (opt-in required)',
    )
    // development + devBypassEnabled + bearer present → NO bypass (bearer token takes precedence)
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'development', internalSecret: null, configuredSecret: undefined, bearerToken: 'mcp_sometoken', devBypassEnabled: true }),
      { bypass: false, reason: 'none' },
      'dev + devBypassEnabled + bearer present → no bypass',
    )
    // non-development env + devBypassEnabled → NO bypass (must be exactly development)
    assert.deepStrictEqual(
      resolveMcpBypass({ nodeEnv: 'test', internalSecret: null, configuredSecret: undefined, bearerToken: null, devBypassEnabled: true }),
      { bypass: false, reason: 'none' },
      'test env + devBypassEnabled → no bypass (dev_bypass is development-only)',
    )
    console.log('  ✓ dev_bypass requires NODE_ENV=development AND MCP_DEV_BYPASS=true AND no bearer')
  }

  // ── 5. internal_secret takes priority over dev_bypass ────────────────────
  console.log('\nTesting: internal_secret takes priority over dev_bypass when both could apply')
  {
    const SECRET = 'abc123'
    const result = resolveMcpBypass({
      nodeEnv: 'development',
      internalSecret: SECRET,
      configuredSecret: SECRET,
      bearerToken: null,
      devBypassEnabled: true,
    })
    assert.deepStrictEqual(result, { bypass: true, reason: 'internal_secret' })
    console.log('  ✓ internal_secret reason returned when both paths could apply')
  }

  // ── 6. Bearer token present → no dev bypass even in dev ──────────────────
  console.log('\nTesting: bearer token present disables dev_bypass (normal auth path)')
  {
    const result = resolveMcpBypass({
      nodeEnv: 'development',
      internalSecret: null,
      configuredSecret: undefined,
      bearerToken: 'mcp_some_actual_token_here',
      devBypassEnabled: true,
    })
    assert.deepStrictEqual(result, { bypass: false, reason: 'none' })
    console.log('  ✓ bearer token present → no bypass (auth proceeds normally)')
  }

  // ── 7. Startup warning: emits when bypass is active in non-production ─────
  console.log('\nTesting: emitBypassWarningIfNeeded emits when active bypass is configured')
  {
    _resetBypassWarning()
    captureWarn()
    const orig = process.env.MCP_DEV_BYPASS
    process.env.MCP_DEV_BYPASS = 'true'
    try {
      emitBypassWarningIfNeeded()
      assert.strictEqual(warnCalls.length, 1, 'one warn message expected')
      assert.ok(
        JSON.stringify(warnCalls[0]).includes('MCP_DEV_BYPASS'),
        'warn must mention MCP_DEV_BYPASS',
      )
      // Second call must not double-warn (memoized)
      emitBypassWarningIfNeeded()
      assert.strictEqual(warnCalls.length, 1, 'second call must be a no-op')
    } finally {
      process.env.MCP_DEV_BYPASS = orig
      restoreWarn()
    }
    console.log('  ✓ startup warning emitted once, not repeated')
  }

  // ── 8. Startup warning: silent when no bypass is configured ───────────────
  console.log('\nTesting: emitBypassWarningIfNeeded is silent when no bypass is configured')
  {
    _resetBypassWarning()
    captureWarn()
    const origBypass = process.env.MCP_DEV_BYPASS
    const origSecret = process.env.INTERNAL_TEST_SECRET
    delete process.env.MCP_DEV_BYPASS
    delete process.env.INTERNAL_TEST_SECRET
    try {
      emitBypassWarningIfNeeded()
      assert.strictEqual(warnCalls.length, 0, 'no warning expected when nothing is configured')
    } finally {
      if (origBypass !== undefined) process.env.MCP_DEV_BYPASS = origBypass
      if (origSecret !== undefined) process.env.INTERNAL_TEST_SECRET = origSecret
      restoreWarn()
    }
    console.log('  ✓ no warning emitted when no bypass env vars are set')
  }

  // ── 9. Startup warning: silent in production ──────────────────────────────
  console.log('\nTesting: emitBypassWarningIfNeeded is silent in production (unrelated to bypass guard)')
  {
    _resetBypassWarning()
    captureWarn()
    const origEnv = process.env.NODE_ENV
    const origBypass = process.env.MCP_DEV_BYPASS
    ;(process.env as any).NODE_ENV = 'production'
    process.env.MCP_DEV_BYPASS = 'true'
    try {
      emitBypassWarningIfNeeded()
      assert.strictEqual(warnCalls.length, 0, 'no warning in production')
    } finally {
      ;(process.env as any).NODE_ENV = origEnv
      process.env.MCP_DEV_BYPASS = origBypass
      restoreWarn()
    }
    console.log('  ✓ warning suppressed in production')
  }

  console.log('\n🎉 ALL MCP AUTH BYPASS TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ MCP AUTH BYPASS TESTS FAILED:', err)
  process.exit(1)
})
