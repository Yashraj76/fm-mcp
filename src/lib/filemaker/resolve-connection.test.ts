import assert from 'assert'
import { resolveToolConnection } from './resolve-connection'

function makeConn(id: string) {
  return {
    id: `cs-${id}`,
    connectionId: id,
    serverId: 'server-1',
    fileNames: '',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    connection: {
      id,
      name: `Connection ${id}`,
      host: 'fm.example.com',
      database: 'TestDB',
      username: 'admin',
      password: 'enc:iv:cipher',
      port: 443,
      protocol: 'https',
      userId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    } as any,
  }
}

const connA = makeConn('conn-a')
const connB = makeConn('conn-b')
const connC = makeConn('conn-c')

async function runTests() {
  console.log('🚀 Starting Connection Routing Tests...\n')

  // ── 1. Correct connection used when connectionId matches ─────────────────────
  console.log('Testing: connectionId set and found → returns matching connection')
  {
    const result = resolveToolConnection('conn-b', [connA, connB, connC], 'my_tool')
    assert.strictEqual(result.id, 'conn-b', 'Should return connection with id conn-b')
    console.log('  ✓ Returns the connection whose id matches handlerConfig.connectionId')
  }

  // ── 2. Error when connectionId is set but not linked ────────────────────────
  console.log('\nTesting: connectionId set but not in server connections → throws')
  {
    assert.throws(
      () => resolveToolConnection('conn-z', [connA, connB], 'my_tool'),
      (err: Error) => {
        assert.ok(err.message.includes('conn-z'), `Expected conn-z in message, got: ${err.message}`)
        assert.ok(err.message.includes('my_tool'))
        return true
      }
    )
    console.log('  ✓ Throws with the unlinked connectionId and tool name in the error message')
  }

  // ── 3. Single-connection server with no connectionId → uses the only one ────
  console.log('\nTesting: no connectionId, server has 1 connection → uses it (unambiguous)')
  {
    const result = resolveToolConnection(undefined, [connA], 'my_tool')
    assert.strictEqual(result.id, 'conn-a')
    console.log('  ✓ Returns the sole connection when no connectionId is set')
  }

  // ── 4. Null connectionId on single-connection server ────────────────────────
  console.log('\nTesting: null connectionId, server has 1 connection → uses it')
  {
    const result = resolveToolConnection(null, [connA], 'my_tool')
    assert.strictEqual(result.id, 'conn-a')
    console.log('  ✓ Null connectionId treated same as undefined on single-connection server')
  }

  // ── 5. Multi-connection server with no connectionId → throws ─────────────────
  console.log('\nTesting: no connectionId, server has 2+ connections → throws')
  {
    assert.throws(
      () => resolveToolConnection(undefined, [connA, connB], 'search_tool'),
      (err: Error) => {
        assert.ok(err.message.includes('search_tool'))
        assert.ok(err.message.includes('2'), `Expected connection count in message, got: ${err.message}`)
        return true
      }
    )
    assert.throws(
      () => resolveToolConnection(null, [connA, connB, connC], 'list_tool'),
      (err: Error) => {
        assert.ok(err.message.includes('3'))
        return true
      }
    )
    console.log('  ✓ Throws with connection count when connectionId is absent on multi-connection server')
  }

  // ── 6. Server with no connections → throws ──────────────────────────────────
  console.log('\nTesting: no connectionId, server has 0 connections → throws')
  {
    assert.throws(
      () => resolveToolConnection(undefined, [], 'find_records'),
      (err: Error) => {
        assert.ok(err.message.includes('find_records'))
        return true
      }
    )
    console.log('  ✓ Throws when server has no connections at all')
  }

  // ── 7. Empty string connectionId treated as absent ──────────────────────────
  console.log('\nTesting: empty string connectionId on single-connection server → uses it')
  {
    // empty string is falsy → same as undefined → single-connection path
    const result = resolveToolConnection('', [connA], 'my_tool')
    assert.strictEqual(result.id, 'conn-a')
    console.log('  ✓ Empty string connectionId treated as absent (falls through to single-conn path)')
  }

  // ── 8. connectionId points to non-first connection → returns correct one ────
  console.log('\nTesting: connectionId targets non-first connection → returns it, NOT connections[0]')
  {
    const result = resolveToolConnection('conn-c', [connA, connB, connC], 'odata_tool')
    assert.strictEqual(result.id, 'conn-c', 'Should return conn-c, not conn-a (first in list)')
    console.log('  ✓ conn-c returned even though conn-a is connections[0]')
  }

  // ── 9. connectionId set but not in server list → throws, no fallback ─────────
  console.log('\nTesting: connectionId not linked to server → throws without falling back to connections[0]')
  {
    assert.throws(
      () => resolveToolConnection('conn-missing', [connA, connB], 'odata_find'),
      (err: Error) => {
        assert.ok(err.message.includes('conn-missing'), `Expected conn-missing in: ${err.message}`)
        assert.ok(err.message.includes('odata_find'), `Expected tool name in: ${err.message}`)
        return true
      },
    )
    console.log('  ✓ Throws — does not silently fall back to connections[0]')
  }

  // ── 10. No connectionId, multiple connections → throws, no connections[0] ───
  console.log('\nTesting: null connectionId on multi-connection server → throws, no fallback')
  {
    assert.throws(
      () => resolveToolConnection(null, [connA, connB, connC], 'odata_batch'),
      (err: Error) => {
        assert.ok(err.message.includes('odata_batch'))
        assert.ok(err.message.includes('3'), `Expected connection count in: ${err.message}`)
        return true
      },
    )
    console.log('  ✓ Throws with connection count — does not silently use connections[0]')
  }

  // ── 11. No connectionId, zero connections → throws ───────────────────────────
  console.log('\nTesting: null connectionId on server with no connections → throws')
  {
    assert.throws(
      () => resolveToolConnection(null, [], 'odata_expand'),
      (err: Error) => {
        assert.ok(err.message.includes('odata_expand'))
        return true
      },
    )
    console.log('  ✓ Throws when server has no connections at all')
  }

  console.log('\n🎉 ALL CONNECTION ROUTING TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ CONNECTION ROUTING TESTS FAILED:', err)
  process.exit(1)
})
