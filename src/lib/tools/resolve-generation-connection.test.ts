import assert from 'assert'
import { resolveGenerationConnection } from './resolve-generation-connection'

// Helpers
function makeConn(id: string, name: string, database: string) {
  return { connectionId: id, connection: { id, name, database } }
}

async function runTests() {
  console.log('🚀 Starting resolveGenerationConnection Tests...\n')

  // ── 1. Zero connections → no-connections ────────────────────────────────────
  console.log('Testing: 0 connections → no-connections error')
  {
    const result = resolveGenerationConnection(undefined, [])
    assert.strictEqual(result.ok, false)
    assert.ok(!result.ok && result.reason === 'no-connections')
    console.log('  ✓ 0 connections → { ok: false, reason: "no-connections" }')
  }

  // ── 2. Single connection → auto-select ────────────────────────────────────
  console.log('\nTesting: 1 connection → auto-selects (no requestedId needed)')
  {
    const conns = [makeConn('conn-a', 'My DB', 'Contacts')]
    // No requestedId
    const r1 = resolveGenerationConnection(undefined, conns)
    assert.ok(r1.ok)
    assert.ok(r1.ok && r1.connectionId === 'conn-a', 'auto-selects the only connection')

    // requestedId ignored — only 1 connection
    const r2 = resolveGenerationConnection('conn-a', conns)
    assert.ok(r2.ok && r2.connectionId === 'conn-a')

    // Even a wrong requestedId still auto-selects on single-connection server
    const r3 = resolveGenerationConnection('anything', conns)
    assert.ok(r3.ok && r3.connectionId === 'conn-a', 'single-conn: auto-selects regardless of requestedId')
    console.log('  ✓ single connection always auto-selects')
  }

  // ── 3. Multiple connections, no requestedId → connection-required ─────────
  console.log('\nTesting: multiple connections + no requestedId → connection-required with list')
  {
    const conns = [
      makeConn('conn-a', 'Contacts DB', 'Contacts'),
      makeConn('conn-b', 'Inventory DB', 'Inventory'),
    ]
    const result = resolveGenerationConnection(undefined, conns)
    assert.ok(!result.ok)
    assert.ok(!result.ok && result.reason === 'connection-required')
    if (!result.ok && result.reason === 'connection-required') {
      assert.strictEqual(result.connections.length, 2)
      assert.strictEqual(result.connections[0].id, 'conn-a')
      assert.strictEqual(result.connections[0].name, 'Contacts DB')
      assert.strictEqual(result.connections[0].database, 'Contacts')
      assert.strictEqual(result.connections[1].id, 'conn-b')
    }
    console.log('  ✓ multiple connections + no requestedId → connection-required with full list')
  }

  // ── 4. Multiple connections, empty-string requestedId → connection-required
  console.log('\nTesting: multiple connections + empty string requestedId → connection-required')
  {
    const conns = [makeConn('a', 'A', 'db-a'), makeConn('b', 'B', 'db-b')]
    const result = resolveGenerationConnection('', conns)
    assert.ok(!result.ok && result.reason === 'connection-required', 'empty string treated as "not provided"')
    console.log('  ✓ empty string treated as not provided')
  }

  // ── 5. Multiple connections, whitespace-only requestedId → connection-required
  console.log('\nTesting: whitespace-only requestedId → connection-required')
  {
    const conns = [makeConn('a', 'A', 'db-a'), makeConn('b', 'B', 'db-b')]
    const result = resolveGenerationConnection('   ', conns)
    assert.ok(!result.ok && result.reason === 'connection-required', 'whitespace treated as not provided')
    console.log('  ✓ whitespace-only treated as not provided')
  }

  // ── 6. Multiple connections, valid requestedId → resolves ─────────────────
  console.log('\nTesting: multiple connections + valid requestedId → resolves')
  {
    const conns = [
      makeConn('conn-a', 'A', 'db-a'),
      makeConn('conn-b', 'B', 'db-b'),
      makeConn('conn-c', 'C', 'db-c'),
    ]
    for (const id of ['conn-a', 'conn-b', 'conn-c']) {
      const result = resolveGenerationConnection(id, conns)
      assert.ok(result.ok)
      assert.ok(result.ok && result.connectionId === id, `resolved to ${id}`)
    }
    console.log('  ✓ each valid requestedId resolves correctly')
  }

  // ── 7. Multiple connections, unknown requestedId → invalid-connection ──────
  console.log('\nTesting: multiple connections + unknown requestedId → invalid-connection')
  {
    const conns = [makeConn('conn-a', 'A', 'db-a'), makeConn('conn-b', 'B', 'db-b')]
    const result = resolveGenerationConnection('conn-not-on-server', conns)
    assert.ok(!result.ok)
    assert.ok(!result.ok && result.reason === 'invalid-connection')
    assert.ok(!result.ok && result.reason === 'invalid-connection' && result.requested === 'conn-not-on-server')
    console.log('  ✓ unknown requestedId → { ok: false, reason: "invalid-connection" }')
  }

  // ── 8. ConnectionOption shape is correct ──────────────────────────────────
  console.log('\nTesting: connection-required returns correct ConnectionOption shape')
  {
    const conns = [
      makeConn('id-1', 'Name One', 'Database One'),
      makeConn('id-2', 'Name Two', 'Database Two'),
    ]
    const result = resolveGenerationConnection(null, conns)
    assert.ok(!result.ok && result.reason === 'connection-required')
    if (!result.ok && result.reason === 'connection-required') {
      const [first, second] = result.connections
      assert.deepStrictEqual(first,  { id: 'id-1', name: 'Name One',  database: 'Database One'  })
      assert.deepStrictEqual(second, { id: 'id-2', name: 'Name Two',  database: 'Database Two'  })
    }
    console.log('  ✓ ConnectionOption has { id, name, database } with correct values')
  }

  console.log('\n🎉 ALL resolveGenerationConnection TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ resolveGenerationConnection TESTS FAILED:', err)
  process.exit(1)
})
