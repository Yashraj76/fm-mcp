import assert from 'assert'
import { prisma } from '../prisma'
import { persistLayoutMeta, LayoutMetaEntry } from './layout-meta'

// ── mock helpers ──────────────────────────────────────────────────────────────

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

// ── fixtures ──────────────────────────────────────────────────────────────────

const contactsMeta: LayoutMetaEntry = {
  fields: ['recordId', 'FirstName', 'LastName', 'Email'],
  portals: ['Orders'],
  portalDetails: [{ table: 'Orders', fields: [{ name: 'OrderId', type: 'number' }] }],
}

const ordersMeta: LayoutMetaEntry = {
  fields: ['recordId', 'OrderDate', 'Amount'],
  portals: [],
  portalDetails: [],
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Layout Meta Persistence Tests...\n')

  try {
    // ── 1. Returns false when no BrowsedSchema row exists ─────────────────
    console.log('Testing: no BrowsedSchema row...')
    {
      mockPrismaMethod('browsedSchema', 'findUnique', () => Promise.resolve(null))
      const updateCalls: any[] = []
      mockPrismaMethod('browsedSchema', 'update', (opts: any) => {
        updateCalls.push(opts)
        return Promise.resolve({})
      })

      const result = await persistLayoutMeta('conn-none', 'Contacts', contactsMeta)

      assert.strictEqual(result, false, 'Should return false when no BrowsedSchema exists')
      assert.strictEqual(updateCalls.length, 0, 'update should NOT be called when no row exists')
      console.log('  ✓ Returns false and skips update when BrowsedSchema is absent')
    }

    // ── 2. Merges new layout into empty rawLayoutMeta ─────────────────────
    console.log('\nTesting: merge into empty rawLayoutMeta...')
    {
      mockPrismaMethod('browsedSchema', 'findUnique', () =>
        Promise.resolve({ connectionId: 'conn-a', rawLayoutMeta: '{}' }),
      )

      let capturedUpdate: any = null
      mockPrismaMethod('browsedSchema', 'update', (opts: any) => {
        capturedUpdate = opts
        return Promise.resolve({})
      })

      const result = await persistLayoutMeta('conn-a', 'Contacts', contactsMeta)

      assert.strictEqual(result, true, 'Should return true on success')
      assert.ok(capturedUpdate, 'update should be called')
      assert.deepStrictEqual(capturedUpdate.where, { connectionId: 'conn-a' })

      const written = JSON.parse(capturedUpdate.data.rawLayoutMeta)
      assert.ok('Contacts' in written, 'Contacts key should be in written meta')
      assert.deepStrictEqual(written['Contacts'].fields, contactsMeta.fields)
      assert.deepStrictEqual(written['Contacts'].portals, contactsMeta.portals)
      assert.deepStrictEqual(written['Contacts'].portalDetails, contactsMeta.portalDetails)
      console.log('  ✓ Returns true and persists layout entry into empty rawLayoutMeta')
    }

    // ── 3. Merges without clobbering existing layouts ─────────────────────
    console.log('\nTesting: merge preserves existing layouts...')
    {
      const existingMeta = { Orders: ordersMeta }
      mockPrismaMethod('browsedSchema', 'findUnique', () =>
        Promise.resolve({ connectionId: 'conn-b', rawLayoutMeta: JSON.stringify(existingMeta) }),
      )

      let capturedUpdate: any = null
      mockPrismaMethod('browsedSchema', 'update', (opts: any) => {
        capturedUpdate = opts
        return Promise.resolve({})
      })

      const result = await persistLayoutMeta('conn-b', 'Contacts', contactsMeta)

      assert.strictEqual(result, true)
      const written = JSON.parse(capturedUpdate.data.rawLayoutMeta)
      assert.ok('Orders' in written, 'Existing Orders layout should be preserved')
      assert.ok('Contacts' in written, 'New Contacts layout should be added')
      assert.deepStrictEqual(written['Orders'].fields, ordersMeta.fields)
      assert.deepStrictEqual(written['Contacts'].fields, contactsMeta.fields)
      console.log('  ✓ Existing layouts preserved when adding a new one')
    }

    // ── 4. Overwrites an existing layout entry (re-fetch refreshes cache) ─
    console.log('\nTesting: overwrite existing layout entry...')
    {
      const staleContacts: LayoutMetaEntry = { fields: ['OldField'], portals: [], portalDetails: [] }
      const existingMeta = { Contacts: staleContacts }
      mockPrismaMethod('browsedSchema', 'findUnique', () =>
        Promise.resolve({ connectionId: 'conn-c', rawLayoutMeta: JSON.stringify(existingMeta) }),
      )

      let capturedUpdate: any = null
      mockPrismaMethod('browsedSchema', 'update', (opts: any) => {
        capturedUpdate = opts
        return Promise.resolve({})
      })

      const result = await persistLayoutMeta('conn-c', 'Contacts', contactsMeta)

      assert.strictEqual(result, true)
      const written = JSON.parse(capturedUpdate.data.rawLayoutMeta)
      assert.deepStrictEqual(written['Contacts'].fields, contactsMeta.fields, 'Stale entry should be replaced')
      assert.ok(!written['Contacts'].fields.includes('OldField'), 'Old field should not appear')
      console.log('  ✓ Re-fetching a layout overwrites the stale cache entry')
    }

    // ── 5. Uses supplied tx client instead of default db ─────────────────
    console.log('\nTesting: tx client forwarding...')
    {
      const txCalls: string[] = []
      const fakeTx = {
        browsedSchema: {
          findUnique: (_opts: any) => {
            txCalls.push('tx.findUnique')
            return Promise.resolve({ connectionId: 'conn-tx', rawLayoutMeta: '{}' })
          },
          update: (_opts: any) => {
            txCalls.push('tx.update')
            return Promise.resolve({})
          },
        },
      }

      const result = await persistLayoutMeta('conn-tx', 'Contacts', contactsMeta, fakeTx)

      assert.strictEqual(result, true)
      assert.ok(txCalls.includes('tx.findUnique'), 'Should use tx for findUnique')
      assert.ok(txCalls.includes('tx.update'), 'Should use tx for update')
      console.log('  ✓ Uses the supplied transaction client for both read and write')
    }

    // ── 6. Handles malformed rawLayoutMeta gracefully ─────────────────────
    console.log('\nTesting: malformed rawLayoutMeta falls back to empty object...')
    {
      mockPrismaMethod('browsedSchema', 'findUnique', () =>
        Promise.resolve({ connectionId: 'conn-d', rawLayoutMeta: 'NOT VALID JSON {{{' }),
      )

      let capturedUpdate: any = null
      mockPrismaMethod('browsedSchema', 'update', (opts: any) => {
        capturedUpdate = opts
        return Promise.resolve({})
      })

      const result = await persistLayoutMeta('conn-d', 'Contacts', contactsMeta)

      assert.strictEqual(result, true, 'Should succeed even with malformed existing meta')
      const written = JSON.parse(capturedUpdate.data.rawLayoutMeta)
      assert.ok('Contacts' in written, 'Contacts should be written despite malformed existing meta')
      console.log('  ✓ Malformed existing rawLayoutMeta treated as empty object')
    }

    console.log('\n🎉 ALL LAYOUT META PERSISTENCE TESTS PASSED! 🎉')
  } finally {
    restorePrismaMocks()
  }
}

runTests().catch((err) => {
  console.error('\n❌ LAYOUT META TESTS FAILED:', err)
  process.exit(1)
})
