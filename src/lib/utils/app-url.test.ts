import assert from 'assert'
import { getPublicAppUrl, AppUrlConfigError } from './app-url'

// Save and clear NEXT_PUBLIC_APP_URL before each group; restore after.
function withoutAppUrl<T>(fn: () => T): T {
  const saved = process.env.NEXT_PUBLIC_APP_URL
  delete (process.env as any).NEXT_PUBLIC_APP_URL
  try {
    return fn()
  } finally {
    if (saved !== undefined) process.env.NEXT_PUBLIC_APP_URL = saved
    else delete (process.env as any).NEXT_PUBLIC_APP_URL
  }
}

async function runTests() {
  console.log('🚀 Starting App URL Tests...\n')

  // ── 1. Env var set → returned in all environments ───────────────────────────
  console.log('Testing: returns NEXT_PUBLIC_APP_URL when set (any NODE_ENV)')
  {
    const saved = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://my-app.vercel.app'
    try {
      assert.strictEqual(getPublicAppUrl('production'), 'https://my-app.vercel.app')
      assert.strictEqual(getPublicAppUrl('development'), 'https://my-app.vercel.app')
      assert.strictEqual(getPublicAppUrl('test'), 'https://my-app.vercel.app')
    } finally {
      if (saved !== undefined) process.env.NEXT_PUBLIC_APP_URL = saved
      else delete (process.env as any).NEXT_PUBLIC_APP_URL
    }
    console.log('  ✓ Configured URL returned regardless of NODE_ENV')
  }

  // ── 2. Unset in development → localhost fallback ─────────────────────────────
  console.log('\nTesting: falls back to localhost in development when unset')
  {
    const result = withoutAppUrl(() => getPublicAppUrl('development'))
    assert.strictEqual(result, 'http://localhost:3000')
    console.log('  ✓ Development fallback is http://localhost:3000')
  }

  // ── 3. Unset in test → localhost fallback ────────────────────────────────────
  console.log('\nTesting: falls back to localhost in test environment when unset')
  {
    const result = withoutAppUrl(() => getPublicAppUrl('test'))
    assert.strictEqual(result, 'http://localhost:3000')
    console.log('  ✓ Test fallback is http://localhost:3000')
  }

  // ── 4. Unset in production → throws AppUrlConfigError ───────────────────────
  console.log('\nTesting: throws AppUrlConfigError in production when unset')
  {
    let threw = false
    let caughtErr: unknown
    withoutAppUrl(() => {
      try {
        getPublicAppUrl('production')
      } catch (err) {
        threw = true
        caughtErr = err
      }
    })
    assert.ok(threw, 'getPublicAppUrl must throw when called in production without env var')
    assert.ok(caughtErr instanceof AppUrlConfigError,
      `Expected AppUrlConfigError, got: ${caughtErr}`)
    console.log('  ✓ Throws AppUrlConfigError in production')
  }

  // ── 5. Error message names the env var ───────────────────────────────────────
  console.log('\nTesting: error message mentions NEXT_PUBLIC_APP_URL')
  {
    let message = ''
    withoutAppUrl(() => {
      try {
        getPublicAppUrl('production')
      } catch (err) {
        message = (err as Error).message
      }
    })
    assert.ok(
      message.includes('NEXT_PUBLIC_APP_URL'),
      `Error message should include "NEXT_PUBLIC_APP_URL", got: "${message}"`
    )
    console.log('  ✓ Error message includes NEXT_PUBLIC_APP_URL')
  }

  // ── 6. Error message includes deployment URL example ────────────────────────
  console.log('\nTesting: error message includes actionable example URL')
  {
    let message = ''
    withoutAppUrl(() => {
      try {
        getPublicAppUrl('production')
      } catch (err) {
        message = (err as Error).message
      }
    })
    assert.ok(
      message.includes('vercel.app') || message.includes('https://'),
      `Error message should include an example URL, got: "${message}"`
    )
    console.log('  ✓ Error message includes deployment URL example')
  }

  // ── 7. AppUrlConfigError has correct name ───────────────────────────────────
  console.log('\nTesting: AppUrlConfigError.name is set correctly')
  {
    const err = new AppUrlConfigError()
    assert.strictEqual(err.name, 'AppUrlConfigError')
    assert.ok(err instanceof Error)
    assert.ok(err instanceof AppUrlConfigError)
    console.log('  ✓ AppUrlConfigError name and instanceof chain correct')
  }

  // ── 8. Default nodeEnv reads from process.env.NODE_ENV ──────────────────────
  console.log('\nTesting: default nodeEnv parameter reads process.env.NODE_ENV')
  {
    // We're running under tsx which sets NODE_ENV=test, so no arg → localhost
    const result = withoutAppUrl(() => getPublicAppUrl())
    assert.strictEqual(result, 'http://localhost:3000',
      'No nodeEnv arg uses process.env.NODE_ENV (test/development) → localhost fallback')
    console.log('  ✓ Default nodeEnv uses process.env.NODE_ENV')
  }

  console.log('\n🎉 ALL APP URL TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ APP URL TESTS FAILED:', err)
  process.exit(1)
})
