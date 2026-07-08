import assert from 'assert'
import { prisma } from '../prisma'
import { connectionUpdateAffectsSchema, invalidateConnectionSchemaCache } from './schema-cache'

// ── mock helpers (same pattern as user-scoped.test.ts) ────────────────────────

const originalMethods: Record<string, any> = {}

function mockPrismaMethod(modelName: string, methodName: string, mockImpl: (...args: any[]) => any) {
  const model = (prisma as any)[modelName]
  const key = `${modelName}.${methodName}`
  if (!originalMethods[key]) {
    originalMethods[key] = model[methodName]
  }
  model[methodName] = mockImpl
}

function restorePrismaMocks() {
  for (const [key, original] of Object.entries(originalMethods)) {
    const [modelName, methodName] = key.split('.')
    ;(prisma as any)[modelName][methodName] = original
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Schema Cache Invalidation Tests...\n')

  try {
    // ── 1. connectionUpdateAffectsSchema ────────────────────────────────────
    console.log('Testing connectionUpdateAffectsSchema...')
    {
      // Schema-affecting fields
      const affectingCases: Record<string, unknown>[] = [
        { host: 'new.host.com' },
        { port: 443 },
        { database: 'new_db' },
        { username: 'admin' },
        { password: 's3cr3t' },
        { authType: 'oauth' },
        { clientId: 'abc' },
        { clientSecret: 'xyz' },
        { sslVerify: false },
        { host: 'new.host.com', name: 'renamed' }, // mixed — host triggers invalidation
      ]
      for (const update of affectingCases) {
        assert.strictEqual(
          connectionUpdateAffectsSchema(update),
          true,
          `Expected true for update: ${JSON.stringify(update)}`,
        )
      }
      console.log('  ✓ Schema-affecting fields correctly detected (9 field types)')
    }
    {
      // Name-only change should NOT trigger cache invalidation
      const nonAffectingCases: Record<string, unknown>[] = [
        { name: 'My Renamed Connection' },
        { name: 'Renamed', someUnknownField: 'value' },
        {},
      ]
      for (const update of nonAffectingCases) {
        assert.strictEqual(
          connectionUpdateAffectsSchema(update),
          false,
          `Expected false for update: ${JSON.stringify(update)}`,
        )
      }
      console.log('  ✓ Name-only update does not trigger cache invalidation')
    }

    // ── 2. invalidateConnectionSchemaCache — deletes all three models ────────
    console.log('\nTesting invalidateConnectionSchemaCache...')
    {
      const calls: string[] = []

      mockPrismaMethod('browsedSchema', 'deleteMany', (opts: any) => {
        assert.deepStrictEqual(opts, { where: { connectionId: 'conn-123' } })
        calls.push('browsedSchema.deleteMany')
        return Promise.resolve({ count: 1 })
      })
      mockPrismaMethod('fMSchemaCache', 'deleteMany', (opts: any) => {
        assert.deepStrictEqual(opts, { where: { connectionId: 'conn-123' } })
        calls.push('fMSchemaCache.deleteMany')
        return Promise.resolve({ count: 3 })
      })
      mockPrismaMethod('relationshipGraph', 'deleteMany', (opts: any) => {
        assert.deepStrictEqual(opts, { where: { connectionId: 'conn-123' } })
        calls.push('relationshipGraph.deleteMany')
        return Promise.resolve({ count: 1 })
      })

      const counts = await invalidateConnectionSchemaCache('conn-123')

      assert.strictEqual(counts.browsedSchema, 1, 'browsedSchema count mismatch')
      assert.strictEqual(counts.schemaCache, 3, 'schemaCache count mismatch')
      assert.strictEqual(counts.relationshipGraph, 1, 'relationshipGraph count mismatch')
      assert.strictEqual(calls.length, 3, 'Expected exactly 3 deleteMany calls')
      assert.ok(calls.includes('browsedSchema.deleteMany'), 'Missing browsedSchema.deleteMany')
      assert.ok(calls.includes('fMSchemaCache.deleteMany'), 'Missing fMSchemaCache.deleteMany')
      assert.ok(calls.includes('relationshipGraph.deleteMany'), 'Missing relationshipGraph.deleteMany')

      console.log('  ✓ Deletes BrowsedSchema, FMSchemaCache, and RelationshipGraph')
      console.log('  ✓ Each deleteMany called with correct connectionId filter')
      console.log('  ✓ Returns delete counts for all three models')
    }

    // ── 3. invalidateConnectionSchemaCache — uses supplied tx client ─────────
    console.log('\nTesting invalidateConnectionSchemaCache with tx client...')
    {
      const txCalls: string[] = []

      // Simulate a Prisma transaction client (duck-typed)
      const fakeTx = {
        browsedSchema: {
          deleteMany: (opts: any) => {
            assert.deepStrictEqual(opts, { where: { connectionId: 'conn-tx-456' } })
            txCalls.push('tx.browsedSchema.deleteMany')
            return Promise.resolve({ count: 0 })
          },
        },
        fMSchemaCache: {
          deleteMany: (opts: any) => {
            assert.deepStrictEqual(opts, { where: { connectionId: 'conn-tx-456' } })
            txCalls.push('tx.fMSchemaCache.deleteMany')
            return Promise.resolve({ count: 2 })
          },
        },
        relationshipGraph: {
          deleteMany: (opts: any) => {
            assert.deepStrictEqual(opts, { where: { connectionId: 'conn-tx-456' } })
            txCalls.push('tx.relationshipGraph.deleteMany')
            return Promise.resolve({ count: 1 })
          },
        },
      }

      const counts = await invalidateConnectionSchemaCache('conn-tx-456', fakeTx)

      assert.strictEqual(counts.browsedSchema, 0)
      assert.strictEqual(counts.schemaCache, 2)
      assert.strictEqual(counts.relationshipGraph, 1)
      assert.strictEqual(txCalls.length, 3, 'Expected 3 tx calls')
      console.log('  ✓ Uses the supplied transaction client instead of the default db client')
    }

    // ── 4. invalidateConnectionSchemaCache — handles zero rows gracefully ────
    console.log('\nTesting invalidateConnectionSchemaCache with no existing cache rows...')
    {
      mockPrismaMethod('browsedSchema', 'deleteMany', () => Promise.resolve({ count: 0 }))
      mockPrismaMethod('fMSchemaCache', 'deleteMany', () => Promise.resolve({ count: 0 }))
      mockPrismaMethod('relationshipGraph', 'deleteMany', () => Promise.resolve({ count: 0 }))

      const counts = await invalidateConnectionSchemaCache('conn-nocache')
      assert.strictEqual(counts.browsedSchema, 0)
      assert.strictEqual(counts.schemaCache, 0)
      assert.strictEqual(counts.relationshipGraph, 0)
      console.log('  ✓ Zero-row deletion does not throw')
    }

    console.log('\n🎉 ALL SCHEMA CACHE INVALIDATION TESTS PASSED! 🎉')
  } finally {
    restorePrismaMocks()
  }
}

runTests().catch((err) => {
  console.error('\n❌ SCHEMA CACHE TESTS FAILED:', err)
  process.exit(1)
})
