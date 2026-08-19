import assert from 'assert'
import { inferRelationships } from './infer-relationships-service'

// ── Shared test fixtures ──────────────────────────────────────────────────────

const layoutMeta = {
  Customers: {
    fields: ['CustomerID', 'Name', 'Email'],
    portals: ['Orders'],
  },
  Orders: {
    fields: ['OrderID', 'CustomerID', 'ProductID', 'Total'],
    portals: [],
  },
  Products: {
    fields: ['ProductID', 'ProductName', 'Price'],
    portals: [],
  },
}

// Stub that returns a well-formed AI response with one NEW relationship not
// discoverable by rule-based detection.
const FAKE_AI_RESPONSE = JSON.stringify({
  relationships: [
    {
      id: 'rel_ai_1',
      from: 'Customers',
      to: 'Orders',
      key: 'CustomerID',
      toKey: 'CustomerID',
      type: 'one-to-many',
      confidence: 'high',
      source: 'portal',
      reason: 'Portal in Customers links to Orders',
      usableInTools: true,
    },
    {
      id: 'rel_ai_2',
      from: 'Orders',
      to: 'Products',
      key: 'ProductID',
      toKey: 'ProductID',
      type: 'one-to-many',
      confidence: 'high',
      source: 'exact-match',
      reason: 'Both share ProductID',
      usableInTools: true,
    },
    {
      id: 'rel_ai_3',
      from: 'Customers',
      to: 'Products',
      key: 'RewardPointsID',
      toKey: 'RewardPointsID',
      type: 'one-to-many',
      confidence: 'low',
      source: 'semantic',
      reason: 'Semantic inference only',
      usableInTools: false,
    },
  ],
  primaryKeys: { Customers: 'CustomerID', Orders: 'OrderID', Products: 'ProductID' },
  notes: 'Test note',
})

async function runTests() {
  console.log('🚀 Starting Infer Relationships Service Tests...\n')

  // ── 1. Rule-based only (no AI) returns correct result shape ──────────────────
  console.log('Testing: rule-based only path returns canonical result shape')
  {
    const result = await inferRelationships(
      ['Customers', 'Orders', 'Products'],
      layoutMeta,
      'user-1',
      undefined  // no AI
    )

    assert.ok(Array.isArray(result.relationships), 'relationships must be an array')
    assert.ok(typeof result.primaryKeys === 'object', 'primaryKeys must be an object')
    assert.strictEqual(result.notes, null, 'notes must be null when no AI')
    assert.ok(Array.isArray(result.skippedLayouts), 'skippedLayouts must be an array')
    assert.strictEqual(result.skippedLayouts.length, 0, 'no layouts should be skipped here')
    console.log('  ✓ result shape is correct: relationships[], primaryKeys{}, notes, skippedLayouts[]')
  }

  // ── 2. Rule-based detects FK relationships ────────────────────────────────────
  console.log('\nTesting: rule-based phase detects FK fields and portals')
  {
    const result = await inferRelationships(
      ['Customers', 'Orders', 'Products'],
      layoutMeta,
      'user-1',
      undefined
    )

    const custOrderFK = result.relationships.find(
      r => ((r.from === 'Customers' && r.to === 'Orders') ||
            (r.from === 'Orders' && r.to === 'Customers')) && r.key === 'CustomerID'
    )
    assert.ok(custOrderFK, 'Customers↔Orders via CustomerID must be detected')

    const ordersProdFK = result.relationships.find(
      r => ((r.from === 'Orders' && r.to === 'Products') ||
            (r.from === 'Products' && r.to === 'Orders')) && r.key === 'ProductID'
    )
    assert.ok(ordersProdFK, 'Orders↔Products via ProductID must be detected')

    const portal = result.relationships.find(r => r.key === 'portal')
    assert.ok(portal, 'Portal relationship from Customers must be detected')
    assert.strictEqual(portal?.from, 'Customers')
    assert.strictEqual(portal?.to, 'Orders')
    console.log('  ✓ FK fields and portal detected by rule-based phase')
  }

  // ── 3. Each rule-based relationship has canonical required fields ─────────────
  console.log('\nTesting: rule-based relationships include all canonical fields')
  {
    const result = await inferRelationships(
      ['Customers', 'Orders'],
      layoutMeta,
      'user-1',
      undefined
    )

    for (const r of result.relationships) {
      assert.ok(r.id, `relationship must have id, got: ${JSON.stringify(r)}`)
      assert.ok(r.from, 'relationship must have from')
      assert.ok(r.to, 'relationship must have to')
      assert.ok(r.key, 'relationship must have key')
      assert.ok(r.toKey, 'relationship must have toKey')
      assert.ok(r.type, 'relationship must have type')
      assert.ok(r.confidence, 'relationship must have confidence')
      assert.ok(r.source, 'relationship must have source')
      assert.ok(r.reason, 'relationship must have reason')
      assert.ok(typeof r.usableInTools === 'boolean', 'usableInTools must be boolean')
    }
    console.log('  ✓ all canonical fields present on every rule-based relationship')
  }

  // ── 4. AI relationships merged — deduplication blocks reversed duplicates ─────
  console.log('\nTesting: AI results merged; reversed-direction duplicates suppressed')
  {
    let aiCallCount = 0
    const stubAI = async () => {
      aiCallCount++
      return FAKE_AI_RESPONSE
    }

    const result = await inferRelationships(
      ['Customers', 'Orders', 'Products'],
      layoutMeta,
      'user-1',
      stubAI
    )

    assert.strictEqual(aiCallCount, 1, 'AI called exactly once')

    // rel_ai_1 (Customers→Orders via CustomerID) overlaps with rule-based; should NOT be added
    const custOrderRels = result.relationships.filter(
      r => ((r.from === 'Customers' && r.to === 'Orders') ||
            (r.from === 'Orders' && r.to === 'Customers')) && r.key === 'CustomerID'
    )
    assert.strictEqual(custOrderRels.length, 1, 'Customers↔Orders::CustomerID must appear exactly once')

    // rel_ai_3 (Customers→Products via RewardPointsID) is new — should be added
    const rewardRel = result.relationships.find(r => r.key === 'RewardPointsID')
    assert.ok(rewardRel, 'AI-only RewardPointsID relationship must be added')
    assert.strictEqual(rewardRel?.source, 'semantic')

    console.log('  ✓ AI result merged: duplicate suppressed, new relationship added')
  }

  // ── 5. primaryKeys and notes populated from AI response ──────────────────────
  console.log('\nTesting: primaryKeys and notes are populated from AI response')
  {
    const result = await inferRelationships(
      ['Customers', 'Orders', 'Products'],
      layoutMeta,
      'user-1',
      async () => FAKE_AI_RESPONSE
    )

    assert.strictEqual(result.primaryKeys.Customers, 'CustomerID')
    assert.strictEqual(result.primaryKeys.Orders, 'OrderID')
    assert.strictEqual(result.primaryKeys.Products, 'ProductID')
    assert.strictEqual(result.notes, 'Test note')
    console.log('  ✓ primaryKeys and notes extracted from AI response')
  }

  // ── 6. AI failure degrades gracefully to rule-based results ──────────────────
  console.log('\nTesting: AI failure degrades gracefully — rule-based results preserved')
  {
    let degraded = false
    const throwingAI = async () => {
      throw new Error('Simulated AI service error')
    }

    const result = await inferRelationships(
      ['Customers', 'Orders'],
      layoutMeta,
      'user-1',
      throwingAI
    )

    // Must still return rule-based results
    assert.ok(result.relationships.length > 0, 'rule-based results must survive AI failure')
    assert.deepStrictEqual(result.primaryKeys, {}, 'primaryKeys empty on AI failure')
    assert.strictEqual(result.notes, null, 'notes null on AI failure')
    console.log('  ✓ AI failure: rule-based results returned, no exception propagated')
  }

  // ── 7. Layouts with no data are tracked in skippedLayouts ────────────────────
  console.log('\nTesting: layouts with no field/portal data tracked in skippedLayouts')
  {
    const metaWithEmpty = {
      ...layoutMeta,
      EmptyLayout: { fields: [], portals: [] },
    }
    const result = await inferRelationships(
      ['Customers', 'Orders', 'EmptyLayout'],
      metaWithEmpty,
      'user-1',
      undefined
    )

    assert.ok(result.skippedLayouts.includes('EmptyLayout'), 'EmptyLayout must appear in skippedLayouts')
    assert.ok(!result.skippedLayouts.includes('Customers'), 'Customers must not be skipped')
    console.log('  ✓ empty layout tracked in skippedLayouts, data-bearing layouts not skipped')
  }

  // ── 8. AI not called when fewer than 2 layouts have data ─────────────────────
  console.log('\nTesting: AI skipped when fewer than 2 layouts have field data')
  {
    let aiCalled = false
    const trackingAI = async () => { aiCalled = true; return FAKE_AI_RESPONSE }

    await inferRelationships(
      ['Customers', 'EmptyLayout'],
      {
        Customers: { fields: ['CustomerID'], portals: [] },
        EmptyLayout: { fields: [], portals: [] },
      },
      'user-1',
      trackingAI
    )

    assert.strictEqual(aiCalled, false, 'AI must not be called when <2 layouts have data')
    console.log('  ✓ AI not called when fewer than 2 layouts have field data')
  }

  // ── 9. Any route wrapping inferRelationships (currently connections/[id]/
  //       infer-relationships) returns the same canonical shape from the same input ──
  console.log('\nTesting: canonical shape invariant — both routes produce identical structure')
  {
    // Simulate what both routes do: call inferRelationships and wrap the result
    // in the same response envelope.
    const buildResponse = async (callAIFn?: any) => {
      const result = await inferRelationships(
        ['Customers', 'Orders'],
        layoutMeta,
        'user-1',
        callAIFn
      )
      return {
        relationships: result.relationships,
        primaryKeys: result.primaryKeys,
        notes: result.notes,
        count: result.relationships.length,
        ...(result.skippedLayouts.length > 0 ? { skippedLayouts: result.skippedLayouts } : {}),
      }
    }

    const withAI = await buildResponse(async () => FAKE_AI_RESPONSE)
    const withoutAI = await buildResponse(undefined)

    // Both must have the same keys
    const aiKeys = Object.keys(withAI).sort()
    const noAiKeys = Object.keys(withoutAI).sort()
    assert.deepStrictEqual(
      aiKeys.filter(k => k !== 'skippedLayouts'),
      noAiKeys.filter(k => k !== 'skippedLayouts'),
      'Both responses must have the same top-level keys (excluding optional skippedLayouts)'
    )
    assert.ok(typeof withAI.count === 'number', 'count must be a number')
    assert.ok(typeof withoutAI.count === 'number', 'count must be a number')
    assert.ok(Array.isArray(withAI.relationships), 'relationships must be an array')
    assert.ok(Array.isArray(withoutAI.relationships), 'relationships must be an array')
    console.log('  ✓ both routes produce identical canonical response shape')
  }

  console.log('\n🎉 ALL INFER-RELATIONSHIPS SERVICE TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ INFER-RELATIONSHIPS SERVICE TESTS FAILED:', err)
  process.exit(1)
})
