import assert from 'assert'
import {
  deriveConnectionBadgeState,
  deriveFMServerBadgeState,
  deriveServerHealthFlags,
  CONNECTION_BADGE,
  FM_SERVER_BADGE,
  SERVER_HEALTH_BADGE,
} from './connection-status'

async function runTests() {
  console.log('🚀 Starting Connection Status Tests...\n')

  // ── 1. deriveConnectionBadgeState: connected + schema ────────────────────
  console.log('Testing: deriveConnectionBadgeState — healthy path')
  {
    assert.strictEqual(
      deriveConnectionBadgeState('connected', true),
      'healthy',
      'connected + has schema → healthy',
    )
    console.log('  ✓ connected + has schema → healthy')
  }

  // ── 2. deriveConnectionBadgeState: schema_missing ─────────────────────────
  console.log('\nTesting: deriveConnectionBadgeState — schema_missing when connected but no schema')
  {
    assert.strictEqual(
      deriveConnectionBadgeState('connected', false),
      'schema_missing',
      'connected + no schema → schema_missing',
    )
    console.log('  ✓ connected + no schema → schema_missing')
  }

  // ── 3. deriveConnectionBadgeState: auth_failed takes priority ────────────
  console.log('\nTesting: deriveConnectionBadgeState — auth_failed takes priority over schema_missing')
  {
    assert.strictEqual(
      deriveConnectionBadgeState('auth_failed', true),
      'auth_failed',
      'auth_failed + has schema → auth_failed',
    )
    assert.strictEqual(
      deriveConnectionBadgeState('auth_failed', false),
      'auth_failed',
      'auth_failed + no schema → auth_failed (not schema_missing)',
    )
    console.log('  ✓ auth_failed overrides schema_missing')
  }

  // ── 4. deriveConnectionBadgeState: error state ────────────────────────────
  console.log('\nTesting: deriveConnectionBadgeState — error state')
  {
    assert.strictEqual(
      deriveConnectionBadgeState('error', true),
      'error',
      'error + has schema → error',
    )
    assert.strictEqual(
      deriveConnectionBadgeState('error', false),
      'error',
      'error + no schema → error (not schema_missing)',
    )
    console.log('  ✓ error state correctly identified')
  }

  // ── 5. deriveConnectionBadgeState: disconnected variants ─────────────────
  console.log('\nTesting: deriveConnectionBadgeState — disconnected variants')
  {
    assert.strictEqual(deriveConnectionBadgeState('disconnected', true), 'disconnected')
    assert.strictEqual(deriveConnectionBadgeState('pending', false), 'disconnected')
    assert.strictEqual(deriveConnectionBadgeState('', false), 'disconnected')
    assert.strictEqual(deriveConnectionBadgeState('legacy_unknown', false), 'disconnected')
    console.log('  ✓ disconnected, pending, empty, unknown all → disconnected')
  }

  // ── 6. deriveFMServerBadgeState: known states ────────────────────────────
  console.log('\nTesting: deriveFMServerBadgeState — known states map correctly')
  {
    assert.strictEqual(deriveFMServerBadgeState('online'), 'online')
    assert.strictEqual(deriveFMServerBadgeState('auth_failed'), 'auth_failed')
    assert.strictEqual(deriveFMServerBadgeState('error'), 'error')
    console.log('  ✓ online, auth_failed, error map correctly')
  }

  // ── 7. deriveFMServerBadgeState: never returns "unknown" ─────────────────
  console.log('\nTesting: deriveFMServerBadgeState — never returns vague "unknown"')
  {
    assert.strictEqual(deriveFMServerBadgeState('unknown'), 'unreachable', '"unknown" → unreachable')
    assert.strictEqual(deriveFMServerBadgeState(''), 'unreachable', 'empty → unreachable')
    assert.strictEqual(deriveFMServerBadgeState('legacy'), 'unreachable', 'unrecognised → unreachable')
    console.log('  ✓ unknown/empty/legacy all → unreachable (never vague "unknown")')
  }

  // ── 8. deriveServerHealthFlags: all clear ────────────────────────────────
  console.log('\nTesting: deriveServerHealthFlags — no flags when server is healthy')
  {
    const flags = deriveServerHealthFlags({
      connections: [{ isActive: true }],
      tools: [{ isEnabled: true }],
      deployments: [{ status: 'deployed' }],
    })
    assert.deepStrictEqual(flags, [], 'healthy server → no flags')
    console.log('  ✓ healthy server → no flags')
  }

  // ── 9. deriveServerHealthFlags: no_connections ───────────────────────────
  console.log('\nTesting: deriveServerHealthFlags — no_connections when all inactive')
  {
    const flags = deriveServerHealthFlags({
      connections: [{ isActive: false }],
      tools: [{ isEnabled: true }],
      deployments: [{ status: 'deployed' }],
    })
    assert.ok(flags.includes('no_connections'), 'inactive connection → no_connections flag')
    assert.ok(!flags.includes('no_enabled_tools'), 'tool is enabled → no no_enabled_tools')
    console.log('  ✓ inactive connection → no_connections flag')
  }

  // ── 10. deriveServerHealthFlags: no_enabled_tools ────────────────────────
  console.log('\nTesting: deriveServerHealthFlags — no_enabled_tools flag')
  {
    const flags = deriveServerHealthFlags({
      connections: [{ isActive: true }],
      tools: [{ isEnabled: false }, { isEnabled: false }],
      deployments: [{ status: 'deployed' }],
    })
    assert.ok(flags.includes('no_enabled_tools'))
    assert.ok(!flags.includes('no_connections'))
    console.log('  ✓ all tools disabled → no_enabled_tools flag')
  }

  // ── 11. deriveServerHealthFlags: not_deployed ────────────────────────────
  console.log('\nTesting: deriveServerHealthFlags — not_deployed when no deployments')
  {
    const flags = deriveServerHealthFlags({
      connections: [{ isActive: true }],
      tools: [{ isEnabled: true }],
      deployments: [],
    })
    assert.ok(flags.includes('not_deployed'))
    assert.deepStrictEqual(flags, ['not_deployed'])
    console.log('  ✓ no deployments → not_deployed flag')
  }

  // ── 12. deriveServerHealthFlags: multiple flags ───────────────────────────
  console.log('\nTesting: deriveServerHealthFlags — multiple flags can coexist')
  {
    const flags = deriveServerHealthFlags({
      connections: [],
      tools: [],
      deployments: [],
    })
    assert.ok(flags.includes('no_connections'))
    assert.ok(flags.includes('no_enabled_tools'))
    assert.ok(flags.includes('not_deployed'))
    assert.strictEqual(flags.length, 3)
    console.log('  ✓ all three flags present for empty server')
  }

  // ── 13. Badge config objects are complete ────────────────────────────────
  console.log('\nTesting: badge config completeness')
  {
    const connStates = ['healthy', 'disconnected', 'auth_failed', 'schema_missing', 'error'] as const
    for (const state of connStates) {
      assert.ok(CONNECTION_BADGE[state]?.label, `CONNECTION_BADGE.${state}.label must exist`)
      assert.ok(CONNECTION_BADGE[state]?.badge, `CONNECTION_BADGE.${state}.badge must exist`)
    }

    const fmStates = ['online', 'unreachable', 'auth_failed', 'error'] as const
    for (const state of fmStates) {
      assert.ok(FM_SERVER_BADGE[state]?.label, `FM_SERVER_BADGE.${state}.label must exist`)
      assert.ok(FM_SERVER_BADGE[state]?.dot, `FM_SERVER_BADGE.${state}.dot must exist`)
    }

    const healthFlags = ['no_connections', 'no_enabled_tools', 'not_deployed'] as const
    for (const flag of healthFlags) {
      assert.ok(SERVER_HEALTH_BADGE[flag]?.label, `SERVER_HEALTH_BADGE.${flag}.label must exist`)
    }
    console.log('  ✓ all badge configs have required fields')
  }

  console.log('\n🎉 ALL CONNECTION STATUS TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ CONNECTION STATUS TESTS FAILED:', err)
  process.exit(1)
})
