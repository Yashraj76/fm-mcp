import assert from 'assert'
import { detectRelationships, relDedupKey } from './detect-relationships'

// ── relDedupKey ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Detect-Relationships Tests...\n')

  // ── 1. relDedupKey is direction-normalized ────────────────────────────────────
  console.log('Testing: relDedupKey treats A→B and B→A as the same pair')
  {
    const k1 = relDedupKey('Customers', 'Orders', 'CustomerID')
    const k2 = relDedupKey('Orders', 'Customers', 'CustomerID')
    assert.strictEqual(k1, k2, 'Reversed direction should produce same dedup key')
    console.log('  ✓ A→B and B→A produce identical dedup key')
  }

  // ── 2. Cross-table same-key: different pairs are NOT collapsed ────────────────
  console.log('\nTesting: cross-table same-key (Customers→Orders::ID vs Products→Orders::ID) are distinct')
  {
    const k1 = relDedupKey('Customers', 'Orders', 'ID')
    const k2 = relDedupKey('Products', 'Orders', 'ID')
    assert.notStrictEqual(k1, k2, 'Different table pairs with same key must NOT collide')
    console.log('  ✓ Customers↔Orders::ID ≠ Products↔Orders::ID')
  }

  // ── 3. detectRelationships — cross-table same-key produces two suggestions ────
  console.log('\nTesting: detectRelationships emits separate suggestions for cross-table same-key')
  {
    const meta = {
      Customers: { fields: ['CustomerID', 'Name'], portals: [] },
      Orders:    { fields: ['OrderID', 'CustomerID', 'ProductID'], portals: [] },
      Products:  { fields: ['ProductID', 'ProductName'], portals: [] },
    }
    const suggestions = detectRelationships(['Customers', 'Orders', 'Products'], meta)

    // Customers↔Orders via CustomerID
    const custOrders = suggestions.filter(
      s => (s.from === 'Customers' && s.to === 'Orders') ||
           (s.from === 'Orders' && s.to === 'Customers')
    ).filter(s => s.key === 'CustomerID')
    assert.strictEqual(custOrders.length, 1, 'Customers↔Orders::CustomerID should appear once')

    // Orders↔Products via ProductID
    const ordProds = suggestions.filter(
      s => (s.from === 'Orders' && s.to === 'Products') ||
           (s.from === 'Products' && s.to === 'Orders')
    ).filter(s => s.key === 'ProductID')
    assert.strictEqual(ordProds.length, 1, 'Orders↔Products::ProductID should appear once')

    // There should be no collapsed duplicate that loses one pair
    assert.ok(custOrders.length + ordProds.length >= 2, 'Both FK relationships must be present')
    console.log('  ✓ Customers↔Orders::CustomerID and Orders↔Products::ProductID both present')
  }

  // ── 4. No cross-pair collision when three tables share the same key name ───────
  console.log('\nTesting: three tables sharing "RecordID" produce 3 distinct suggestions (not 1)')
  {
    const meta = {
      TableA: { fields: ['RecordID', 'Data'], portals: [] },
      TableB: { fields: ['RecordID', 'Info'], portals: [] },
      TableC: { fields: ['RecordID', 'Value'], portals: [] },
    }
    const suggestions = detectRelationships(['TableA', 'TableB', 'TableC'], meta)
    const recordIdRels = suggestions.filter(s => s.key === 'RecordID')
    // A↔B, A↔C, B↔C → 3 unique pairs
    assert.strictEqual(recordIdRels.length, 3, 'Three layouts sharing RecordID → 3 pairs, not 1')
    const keys = new Set(recordIdRels.map(s => relDedupKey(s.from, s.to, s.key)))
    assert.strictEqual(keys.size, 3, 'All three pairs must have distinct dedup keys')
    console.log('  ✓ 3 unique RecordID relationships produced for 3 tables')
  }

  // ── 5. No duplicate within detectRelationships output itself ──────────────────
  console.log('\nTesting: detectRelationships never emits duplicate entries')
  {
    const meta = {
      Contacts: { fields: ['ContactID', 'AccountID', 'Name'], portals: ['Orders'] },
      Orders:   { fields: ['OrderID', 'ContactID', 'AccountID'], portals: [] },
    }
    const suggestions = detectRelationships(['Contacts', 'Orders'], meta)

    // Check for internal duplicates using the dedup key
    const keys = suggestions.map(s => relDedupKey(s.from, s.to, s.key))
    const uniqueKeys = new Set(keys)
    assert.strictEqual(keys.length, uniqueKeys.size, 'No duplicate suggestions in output')
    console.log('  ✓ No duplicate suggestions emitted')
  }

  // ── 6. Portal relationships are detected and not collapsed with FK heuristics ──
  console.log('\nTesting: portal relationship between Customers→Orders is detected correctly')
  {
    const meta = {
      Customers: {
        fields: ['CustomerID', 'Name'],
        portals: ['Orders'],
      },
      Orders: {
        fields: ['OrderID', 'CustomerID'],
        portals: [],
      },
    }
    const suggestions = detectRelationships(['Customers', 'Orders'], meta)

    const portal = suggestions.find(s => s.key === 'portal')
    assert.ok(portal, 'Portal relationship should be detected')
    assert.strictEqual(portal?.from, 'Customers')
    assert.strictEqual(portal?.to, 'Orders')
    assert.strictEqual(portal?.confidence, 'high')

    const fk = suggestions.find(s => s.key === 'CustomerID')
    assert.ok(fk, 'FK field relationship should also be detected')
    console.log('  ✓ Portal and FK detected as separate suggestions')
  }

  // ── 7. AI dedup merging: existingRelKeys correctly blocks same cross-table key ─
  console.log('\nTesting: AI merge dedup using relDedupKey blocks same-direction but not cross-table')
  {
    // Simulate the rule-based set
    const ruleBased = [
      { from: 'Customers', to: 'Orders', key: 'CustomerID' },
    ]
    const existingKeys = new Set(ruleBased.map(s => relDedupKey(s.from, s.to, s.key)))

    // AI returns: same as rule-based (should be blocked) + a new cross-table one (should pass)
    const aiResults = [
      { from: 'Orders', to: 'Customers', key: 'CustomerID' }, // reversed direction — same dedup key
      { from: 'Products', to: 'Orders', key: 'ProductID' },   // new pair — should NOT be blocked
    ]

    const merged: typeof ruleBased = [...ruleBased]
    for (const aiRel of aiResults) {
      const dk = relDedupKey(aiRel.from, aiRel.to, aiRel.key)
      if (!existingKeys.has(dk)) {
        merged.push(aiRel)
        existingKeys.add(dk)
      }
    }

    // Should have 2: rule-based CustomerID + AI ProductID
    assert.strictEqual(merged.length, 2, 'Reversed-direction duplicate blocked; new cross-table pair added')
    assert.ok(merged.some(r => r.key === 'ProductID'), 'Products↔Orders::ProductID should be in merged')
    assert.ok(!merged.some(r => r.from === 'Orders' && r.to === 'Customers'), 'Reversed duplicate must not appear')
    console.log('  ✓ AI merge dedup: reverse duplicate blocked, cross-table pair added')
  }

  // ── 8. Empty layout fields — detectRelationships returns empty (no crash) ──────
  console.log('\nTesting: layouts with no fields produce no FK suggestions')
  {
    const meta = {
      Empty1: { fields: [], portals: [] },
      Empty2: { fields: [], portals: [] },
    }
    const suggestions = detectRelationships(['Empty1', 'Empty2'], meta)
    assert.strictEqual(suggestions.length, 0, 'No suggestions expected for empty layouts')
    console.log('  ✓ Empty layouts → 0 suggestions, no crash')
  }

  // ── 9. Layout not in meta is silently skipped ─────────────────────────────────
  console.log('\nTesting: layout with no metadata entry is skipped gracefully')
  {
    const meta = {
      Customers: { fields: ['CustomerID'], portals: [] },
      // 'Orders' intentionally omitted from meta (unloaded layout)
    }
    const suggestions = detectRelationships(['Customers', 'Orders'], meta)
    // Only Customers has meta → no pairs, no crash
    assert.strictEqual(suggestions.length, 0)
    console.log('  ✓ Unloaded layout skipped gracefully, no crash')
  }

  console.log('\n🎉 ALL DETECT-RELATIONSHIPS TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ DETECT-RELATIONSHIPS TESTS FAILED:', err)
  process.exit(1)
})
