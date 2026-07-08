import assert from 'assert'
import { replaceServerConnections } from './replace-server-connections'

// ── in-memory store + transaction simulation ───────────────────────────────

interface StoredRow {
  connectionId: string
  serverId: string
  fileNames: string
}

/**
 * Builds a stateful mock that simulates Postgres transaction semantics:
 * - deleteMany / createMany mutate an in-memory store.
 * - withTransaction() snapshots before the callback and restores on error,
 *   matching what prisma.$transaction does against a real DB.
 */
function makeStore(initial: StoredRow[]) {
  let rows = [...initial]

  function tx(overrides: { createManyShouldFail?: boolean } = {}) {
    return {
      fMConnectionServer: {
        deleteMany: async ({ where }: { where: { serverId: string } }) => {
          rows = rows.filter(r => r.serverId !== where.serverId)
        },
        createMany: async ({ data }: { data: StoredRow[] }) => {
          if (overrides.createManyShouldFail) {
            throw new Error('DB error: unique constraint violation')
          }
          rows.push(...data)
        },
      },
    }
  }

  async function withTransaction(
    fn: (t: ReturnType<typeof tx>) => Promise<void>,
    overrides?: { createManyShouldFail?: boolean },
  ) {
    const snapshot = [...rows]
    try {
      await fn(tx(overrides))
    } catch (err) {
      rows = snapshot   // simulate Postgres rollback
      throw err
    }
  }

  return {
    withTransaction,
    getRows: () => rows,
    getConnectionIds: (serverId: string) =>
      rows.filter(r => r.serverId === serverId).map(r => r.connectionId).sort(),
  }
}

// ── tests ──────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting replaceServerConnections Atomicity Tests...\n')

  // ── 1. Happy path: connections replaced ────────────────────────────────────
  console.log('Testing: happy path — connections replaced successfully')
  {
    const store = makeStore([
      { connectionId: 'conn-A', serverId: 'srv-1', fileNames: '[]' },
      { connectionId: 'conn-B', serverId: 'srv-1', fileNames: '[]' },
    ])

    await store.withTransaction((t) =>
      replaceServerConnections(t, 'srv-1', ['conn-C', 'conn-D']),
    )

    assert.deepStrictEqual(store.getConnectionIds('srv-1'), ['conn-C', 'conn-D'])
    console.log('  ✓ Old connections removed; new connections present')
  }

  // ── 2. Partial failure: server keeps original connections ──────────────────
  console.log('\nTesting: createMany failure — original connections survive')
  {
    const store = makeStore([
      { connectionId: 'conn-A', serverId: 'srv-1', fileNames: '[]' },
      { connectionId: 'conn-B', serverId: 'srv-1', fileNames: '[]' },
    ])

    let threw = false
    try {
      await store.withTransaction(
        (t) => replaceServerConnections(t, 'srv-1', ['conn-C', 'conn-D']),
        { createManyShouldFail: true },
      )
    } catch {
      threw = true
    }

    assert.ok(threw, 'Should propagate the createMany error')
    assert.deepStrictEqual(
      store.getConnectionIds('srv-1'),
      ['conn-A', 'conn-B'],
      'Connections must be intact after rollback — server must not have zero connections',
    )
    console.log('  ✓ Error propagated; deleteMany rolled back; server still has conn-A, conn-B')
  }

  // ── 3. Clear all connections (empty array) ─────────────────────────────────
  console.log('\nTesting: empty connectionIds clears all connections')
  {
    const store = makeStore([
      { connectionId: 'conn-A', serverId: 'srv-1', fileNames: '[]' },
    ])

    await store.withTransaction((t) =>
      replaceServerConnections(t, 'srv-1', []),
    )

    assert.deepStrictEqual(store.getConnectionIds('srv-1'), [])
    console.log('  ✓ All connections removed when connectionIds is []')
  }

  // ── 4. fileNames are JSON-serialised per connection ────────────────────────
  console.log('\nTesting: fileNames are serialised correctly per connection')
  {
    const captured: StoredRow[] = []
    const mockTx = {
      fMConnectionServer: {
        deleteMany: async () => undefined,
        createMany: async ({ data }: { data: StoredRow[] }) => {
          captured.push(...data)
        },
      },
    }

    await replaceServerConnections(mockTx, 'srv-1', ['conn-A', 'conn-B'], ['FileA, FileB', 'FileC'])

    assert.strictEqual(captured[0].connectionId, 'conn-A')
    assert.deepStrictEqual(JSON.parse(captured[0].fileNames), ['FileA', 'FileB'])
    assert.strictEqual(captured[1].connectionId, 'conn-B')
    assert.deepStrictEqual(JSON.parse(captured[1].fileNames), ['FileC'])
    console.log('  ✓ fileNames parsed, trimmed, and JSON-serialised per connection')
  }

  // ── 5. Other servers are unaffected during replacement ────────────────────
  console.log('\nTesting: replacement scoped to target server; other servers unaffected')
  {
    const store = makeStore([
      { connectionId: 'conn-A', serverId: 'srv-1', fileNames: '[]' },
      { connectionId: 'conn-X', serverId: 'srv-2', fileNames: '[]' },
    ])

    await store.withTransaction((t) =>
      replaceServerConnections(t, 'srv-1', ['conn-B']),
    )

    assert.deepStrictEqual(store.getConnectionIds('srv-1'), ['conn-B'])
    assert.deepStrictEqual(store.getConnectionIds('srv-2'), ['conn-X'],
      'srv-2 connections must be untouched')
    console.log('  ✓ srv-2 connections unaffected by srv-1 replacement')
  }

  console.log('\n🎉 ALL ATOMICITY TESTS PASSED! (5/5)')
}

runTests().catch((err) => {
  console.error('\n❌ ATOMICITY TESTS FAILED:', err)
  process.exit(1)
})
