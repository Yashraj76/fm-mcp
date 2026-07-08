import assert from 'assert'
import { incrementVersion, incrementMinorVersion } from './version'

async function runTests() {
  console.log('🚀 Starting Version Utility Tests...\n')

  // ── 1. incrementVersion: normal semver ────────────────────────────────────
  console.log('Testing: incrementVersion — normal semver strings')
  {
    assert.strictEqual(incrementVersion('1.0.0'), '1.0.1')
    assert.strictEqual(incrementVersion('1.0.9'), '1.0.10')
    assert.strictEqual(incrementVersion('2.3.7'), '2.3.8')
    console.log('  ✓ Normal semver patch incremented correctly')
  }

  // ── 2. incrementVersion: pre-release suffixes must not produce NaN ────────
  console.log('\nTesting: incrementVersion — pre-release strings (must not produce NaN)')
  {
    const result = incrementVersion('1.0.0-beta')
    assert.ok(!result.includes('NaN'), `Expected no NaN in result, got: "${result}"`)
    assert.strictEqual(result, '1.0.1')
    console.log('  ✓ 1.0.0-beta → 1.0.1 (no NaN)')
  }
  {
    const result = incrementVersion('2.1.0-alpha.1')
    assert.ok(!result.includes('NaN'), `Expected no NaN in result, got: "${result}"`)
    assert.strictEqual(result, '2.1.1')
    console.log('  ✓ 2.1.0-alpha.1 → 2.1.1 (no NaN)')
  }
  {
    const result = incrementVersion('1.0.0-rc.3')
    assert.ok(!result.includes('NaN'), `Expected no NaN in result, got: "${result}"`)
    assert.strictEqual(result, '1.0.1')
    console.log('  ✓ 1.0.0-rc.3 → 1.0.1 (no NaN)')
  }

  // ── 3. incrementVersion: null/undefined fallback ─────────────────────────
  console.log('\nTesting: incrementVersion — null/undefined version falls back safely')
  {
    assert.strictEqual(incrementVersion(null as any), '1.0.1')
    assert.strictEqual(incrementVersion(undefined as any), '1.0.1')
    console.log('  ✓ null/undefined falls back to 1.0.0 then increments to 1.0.1')
  }

  // ── 4. incrementMinorVersion: normal semver ───────────────────────────────
  console.log('\nTesting: incrementMinorVersion — normal semver strings')
  {
    assert.strictEqual(incrementMinorVersion('1.0.0'), '1.1.0')
    assert.strictEqual(incrementMinorVersion('1.2.5'), '1.3.0')
    assert.strictEqual(incrementMinorVersion('3.9.1'), '3.10.0')
    console.log('  ✓ Normal semver minor incremented, patch zeroed')
  }

  // ── 5. incrementMinorVersion: pre-release suffixes must not produce NaN ───
  console.log('\nTesting: incrementMinorVersion — pre-release strings (must not produce NaN)')
  {
    const result = incrementMinorVersion('1.0.0-beta')
    assert.ok(!result.includes('NaN'), `Expected no NaN in result, got: "${result}"`)
    assert.strictEqual(result, '1.1.0')
    console.log('  ✓ 1.0.0-beta → 1.1.0 (no NaN)')
  }
  {
    const result = incrementMinorVersion('2.3.0-alpha.1')
    assert.ok(!result.includes('NaN'), `Expected no NaN in result, got: "${result}"`)
    assert.strictEqual(result, '2.4.0')
    console.log('  ✓ 2.3.0-alpha.1 → 2.4.0 (no NaN)')
  }

  console.log('\n🎉 ALL VERSION UTILITY TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ VERSION UTILITY TESTS FAILED:', err)
  process.exit(1)
})
