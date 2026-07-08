import assert from 'assert'
import { resolveSaveConnectionId } from './resolve-save-connection'

function makeConn(id: string) {
  return { connectionId: id }
}

const connA = makeConn('conn-a')
const connB = makeConn('conn-b')
const connC = makeConn('conn-c')

async function runTests() {
  console.log('🚀 Starting Save-Connection Resolution Tests...\n')

  // ── 1. Zero connections → throws with actionable message ────────────────────
  console.log('Testing: zero connections → throws')
  {
    assert.throws(
      () => resolveSaveConnectionId('my_tool', null, []),
      (err: Error) => {
        assert.ok(err.message.includes('my_tool'), `Tool name missing from: ${err.message}`)
        assert.ok(
          err.message.toLowerCase().includes('no filemaker connection'),
          `Expected "no FileMaker connection" in: ${err.message}`,
        )
        return true
      },
    )
    console.log('  ✓ Throws with tool name and "no FileMaker connections" guidance')
  }

  // ── 2. Single connection, no connectionId → auto-defaults ───────────────────
  console.log('\nTesting: single connection, no connectionId → auto-defaults to conn-a')
  {
    const result = resolveSaveConnectionId('find_contacts', null, [connA])
    assert.strictEqual(result, 'conn-a')
    console.log('  ✓ Returns conn-a (the only connection)')
  }

  // ── 3. Single connection, no connectionId (undefined) → auto-defaults ───────
  console.log('\nTesting: single connection, undefined connectionId → auto-defaults')
  {
    const result = resolveSaveConnectionId('list_orders', undefined, [connA])
    assert.strictEqual(result, 'conn-a')
    console.log('  ✓ undefined connectionId treated same as null on single-connection server')
  }

  // ── 4. Single connection, matching connectionId → returns it ─────────────────
  console.log('\nTesting: single connection, matching connectionId → returns it')
  {
    const result = resolveSaveConnectionId('find_contacts', 'conn-a', [connA])
    assert.strictEqual(result, 'conn-a')
    console.log('  ✓ Explicit match on single-connection server accepted')
  }

  // ── 5. Single connection, mismatched connectionId → throws ───────────────────
  console.log('\nTesting: single connection, wrong connectionId → throws')
  {
    assert.throws(
      () => resolveSaveConnectionId('find_contacts', 'conn-z', [connA]),
      (err: Error) => {
        assert.ok(err.message.includes('conn-z'), `Expected conn-z in: ${err.message}`)
        assert.ok(err.message.includes('find_contacts'), `Expected tool name in: ${err.message}`)
        return true
      },
    )
    console.log('  ✓ Throws — does not fall back to the one existing connection')
  }

  // ── 6. Multiple connections, valid connectionId → returns correct one ────────
  console.log('\nTesting: multiple connections, connectionId set → returns matching (not connections[0])')
  {
    const result = resolveSaveConnectionId('create_invoice', 'conn-c', [connA, connB, connC])
    assert.strictEqual(result, 'conn-c', 'Should return conn-c, not conn-a (connections[0])')
    console.log('  ✓ conn-c returned even though conn-a is connections[0]')
  }

  // ── 7. Multiple connections, unlinked connectionId → throws, no fallback ─────
  console.log('\nTesting: multiple connections, unlinked connectionId → throws without fallback')
  {
    assert.throws(
      () => resolveSaveConnectionId('update_record', 'conn-missing', [connA, connB]),
      (err: Error) => {
        assert.ok(err.message.includes('conn-missing'), `Expected conn-missing in: ${err.message}`)
        assert.ok(err.message.includes('update_record'), `Expected tool name in: ${err.message}`)
        return true
      },
    )
    console.log('  ✓ Throws — does not silently fall back to connections[0]')
  }

  // ── 8. Multiple connections, no connectionId → throws with count ─────────────
  console.log('\nTesting: multiple connections, null connectionId → throws requiring explicit selection')
  {
    assert.throws(
      () => resolveSaveConnectionId('run_script', null, [connA, connB, connC]),
      (err: Error) => {
        assert.ok(err.message.includes('run_script'), `Expected tool name in: ${err.message}`)
        assert.ok(
          err.message.includes('3'),
          `Expected connection count in: ${err.message}`,
        )
        return true
      },
    )
    assert.throws(
      () => resolveSaveConnectionId('run_script', null, [connA, connB]),
      (err: Error) => {
        assert.ok(err.message.includes('2'), `Expected connection count in: ${err.message}`)
        return true
      },
    )
    console.log('  ✓ Throws with connection count — requires explicit connectionId selection')
  }

  // ── 9. Empty-string connectionId treated as absent ───────────────────────────
  console.log('\nTesting: empty-string connectionId on single-connection server → auto-defaults')
  {
    // empty string is falsy — treated the same as null/undefined
    const result = resolveSaveConnectionId('find_records', '', [connA])
    assert.strictEqual(result, 'conn-a')
    console.log('  ✓ Empty string connectionId treated as absent → auto-defaults on single-conn server')
  }

  console.log('\n🎉 ALL SAVE-CONNECTION RESOLUTION TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ SAVE-CONNECTION RESOLUTION TESTS FAILED:', err)
  process.exit(1)
})
