import assert from 'assert'
import bcrypt from 'bcryptjs'
import { verifyMcpApiKey, getDummyHash } from './verify-mcp-api-key'

async function runTests() {
  console.log('🚀 Starting verifyMcpApiKey Tests...\n')

  const CORRECT_TOKEN = 'mcp_abc123def456correct000000000000000000000000000000'
  const WRONG_TOKEN   = 'mcp_wrongtoken0000000000000000000000000000000000000'

  // Pre-compute a valid hash once — shared across multiple tests
  const validHash = await bcrypt.hash(CORRECT_TOKEN, 10)

  // ── 1. No record → always false ──────────────────────────────────────────────
  console.log('Testing: null record → always returns false')
  {
    const result = await verifyMcpApiKey(CORRECT_TOKEN, null)
    assert.strictEqual(result, false, 'null record must return false even for a correct-looking token')
    console.log('  ✓ null record → false')
  }

  // ── 2. Null record: bcrypt.compare STILL runs (timing oracle prevention) ─────
  // This is the core security guarantee: the fast path (no DB record) must not
  // be measurably faster than the slow path (record exists, key wrong).
  console.log('\nTesting: bcrypt.compare is called even when no record exists (no timing oracle)')
  {
    let compareCallCount = 0
    const origCompare = (bcrypt as any).compare.bind(bcrypt)
    ;(bcrypt as any).compare = async (...args: any[]) => {
      compareCallCount++
      return origCompare(...args)
    }

    try {
      await verifyMcpApiKey(WRONG_TOKEN, null)
      assert.strictEqual(compareCallCount, 1,
        'bcrypt.compare must be called exactly once even with no API key record')
      console.log('  ✓ bcrypt.compare called once for null record — no fast-path short-circuit')
    } finally {
      ;(bcrypt as any).compare = origCompare
    }
  }

  // ── 3. bcrypt.compare is ALSO called when record exists but key is wrong ─────
  console.log('\nTesting: bcrypt.compare is called for an existing record with wrong token')
  {
    let compareCallCount = 0
    const origCompare = (bcrypt as any).compare.bind(bcrypt)
    ;(bcrypt as any).compare = async (...args: any[]) => {
      compareCallCount++
      return origCompare(...args)
    }

    try {
      await verifyMcpApiKey(WRONG_TOKEN, { keyHash: validHash })
      assert.strictEqual(compareCallCount, 1, 'bcrypt.compare called once for wrong-token path')
      console.log('  ✓ bcrypt.compare called once for wrong token (consistent with null-record path)')
    } finally {
      ;(bcrypt as any).compare = origCompare
    }
  }

  // ── 4. Valid record + matching token → true ───────────────────────────────────
  console.log('\nTesting: valid record + matching token → true')
  {
    const result = await verifyMcpApiKey(CORRECT_TOKEN, { keyHash: validHash })
    assert.strictEqual(result, true, 'Must return true for correct token')
    console.log('  ✓ matching token → true')
  }

  // ── 5. Valid record + wrong token → false ─────────────────────────────────────
  console.log('\nTesting: valid record + wrong token → false')
  {
    const result = await verifyMcpApiKey(WRONG_TOKEN, { keyHash: validHash })
    assert.strictEqual(result, false, 'Must return false for wrong token')
    console.log('  ✓ wrong token → false')
  }

  // ── 6. Null record + empty string token → false ───────────────────────────────
  console.log('\nTesting: null record + empty string token → false')
  {
    const result = await verifyMcpApiKey('', null)
    assert.strictEqual(result, false)
    console.log('  ✓ empty token, null record → false')
  }

  // ── 7. Dummy hash is a valid bcrypt hash (bcrypt won't short-circuit it) ──────
  console.log('\nTesting: getDummyHash returns a valid bcrypt hash')
  {
    const dummy = await getDummyHash()
    assert.ok(dummy.startsWith('$2'), `Dummy hash must start with $2, got: ${dummy.slice(0, 5)}`)
    assert.ok(dummy.length >= 59, 'Dummy hash must be full bcrypt length')
    console.log('  ✓ Dummy hash is a valid bcrypt hash')
  }

  // ── 8. Dummy hash is memoized ─────────────────────────────────────────────────
  console.log('\nTesting: getDummyHash is memoized across multiple calls')
  {
    const h1 = await getDummyHash()
    const h2 = await getDummyHash()
    assert.strictEqual(h1, h2, 'getDummyHash must return the same hash on every call')
    console.log('  ✓ getDummyHash memoized — same value returned on every call')
  }

  // ── 9. Dummy hash cannot grant access (null record stays false) ────────────────
  // Guard against a bug where the dummy hash accidentally matches a real token.
  console.log('\nTesting: null record always returns false even after dummy hash is initialized')
  {
    // getDummyHash is already initialized from test 7; re-verify the guard holds
    const result = await verifyMcpApiKey(WRONG_TOKEN, null)
    assert.strictEqual(result, false,
      'null record must always return false — dummy hash must never grant access')
    console.log('  ✓ null record → false even when dummy hash is already cached')
  }

  console.log('\n🎉 ALL verifyMcpApiKey TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ verifyMcpApiKey TESTS FAILED:', err)
  process.exit(1)
})
