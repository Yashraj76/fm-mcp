import assert from 'assert'
import { buildConnectionUpdatePayload } from './connection-update-payload'

// Test encrypt function — returns a tagged string so assertions can verify
// the value was encrypted without depending on real AES-256-CBC.
const enc = (v: string) => `encrypted:${v}`

async function runTests() {
  console.log('🚀 Starting Connection Update Payload Tests...\n')

  // ── 1. Blank password → not in payload (existing value preserved) ─────────────
  console.log('Testing: blank password is excluded from update payload')
  {
    const payload = buildConnectionUpdatePayload({ name: 'Test', password: '' }, enc)
    assert.ok(!('password' in payload),
      'password must not be present in payload when submitted as empty string')
    assert.ok(!('clientSecret' in payload),
      'clientSecret must not be present when not submitted')
    console.log('  ✓ blank password → excluded; existing encrypted value preserved')
  }

  // ── 2. New password → encrypted in payload ───────────────────────────────────
  console.log('\nTesting: new password is encrypted and included in payload')
  {
    const payload = buildConnectionUpdatePayload({ name: 'Test', password: 'secret123' }, enc)
    assert.ok('password' in payload, 'password must be present in payload')
    assert.strictEqual(payload.password, 'encrypted:secret123',
      'password must be passed through encryptFn')
    console.log('  ✓ new password → encrypted and included')
  }

  // ── 3. Blank clientSecret → not in payload ───────────────────────────────────
  console.log('\nTesting: blank clientSecret is excluded from update payload')
  {
    const payload = buildConnectionUpdatePayload({ clientSecret: '' }, enc)
    assert.ok(!('clientSecret' in payload),
      'clientSecret must not be present when submitted as empty string')
    console.log('  ✓ blank clientSecret → excluded; existing encrypted value preserved')
  }

  // ── 4. Null clientSecret → not in payload ────────────────────────────────────
  console.log('\nTesting: null clientSecret is excluded from update payload')
  {
    const payload = buildConnectionUpdatePayload({ clientSecret: null }, enc)
    assert.ok(!('clientSecret' in payload),
      'clientSecret must not be present when submitted as null')
    console.log('  ✓ null clientSecret → excluded')
  }

  // ── 5. New clientSecret → encrypted in payload ───────────────────────────────
  console.log('\nTesting: new clientSecret is encrypted and included in payload')
  {
    const payload = buildConnectionUpdatePayload({ clientSecret: 'oauth-secret' }, enc)
    assert.ok('clientSecret' in payload, 'clientSecret must be present in payload')
    assert.strictEqual(payload.clientSecret, 'encrypted:oauth-secret')
    console.log('  ✓ new clientSecret → encrypted and included')
  }

  // ── 6. Non-credential fields are passed through unchanged ─────────────────────
  console.log('\nTesting: non-credential fields are included in payload as-is')
  {
    const payload = buildConnectionUpdatePayload(
      { name: 'Prod DB', host: 'fm.example.com', port: 443, sslVerify: false },
      enc
    )
    assert.strictEqual(payload.name, 'Prod DB')
    assert.strictEqual(payload.host, 'fm.example.com')
    assert.strictEqual(payload.port, 443)
    assert.strictEqual(payload.sslVerify, false)
    console.log('  ✓ name, host, port, sslVerify all passed through unchanged')
  }

  // ── 7. Status is always set to 'disconnected' ─────────────────────────────────
  console.log('\nTesting: status is always set to disconnected')
  {
    const payload = buildConnectionUpdatePayload({ name: 'Test' }, enc)
    assert.strictEqual(payload.status, 'disconnected',
      'status must always be set to disconnected so connection is re-tested')
    console.log('  ✓ status is always "disconnected"')
  }

  // ── 8. Both credentials blank → neither in payload ───────────────────────────
  console.log('\nTesting: both blank credentials are excluded together')
  {
    const payload = buildConnectionUpdatePayload(
      { name: 'Test', host: 'x', password: '', clientSecret: '' },
      enc
    )
    assert.ok(!('password' in payload), 'password must not be present')
    assert.ok(!('clientSecret' in payload), 'clientSecret must not be present')
    assert.strictEqual(payload.name, 'Test')
    assert.strictEqual(payload.host, 'x')
    console.log('  ✓ both blank → both excluded; other fields intact')
  }

  // ── 9. Both credentials non-blank → both encrypted ───────────────────────────
  console.log('\nTesting: both credentials provided → both encrypted in payload')
  {
    const payload = buildConnectionUpdatePayload(
      { password: 'pw', clientSecret: 'cs' },
      enc
    )
    assert.strictEqual(payload.password, 'encrypted:pw')
    assert.strictEqual(payload.clientSecret, 'encrypted:cs')
    console.log('  ✓ both provided → both encrypted')
  }

  console.log('\n🎉 ALL CONNECTION UPDATE PAYLOAD TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ CONNECTION UPDATE PAYLOAD TESTS FAILED:', err)
  process.exit(1)
})
