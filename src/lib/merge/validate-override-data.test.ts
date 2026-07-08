import assert from 'assert';
import { validateModifiedOverrides } from './validate-override-data';
import type { BranchToolForValidation } from './validate-override-data';

// ── helpers ──────────────────────────────────────────────────────────────────

function entry(overrides: Partial<BranchToolForValidation> = {}): BranchToolForValidation {
  return {
    id: 'bt_1',
    toolId: 'tool_1',
    overrideData: JSON.stringify({ name: 'find_contacts' }),
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting validateModifiedOverrides Tests...\n');

  // ── 1. Empty input ───────────────────────────────────────────────────────
  console.log('Testing: empty input array');
  {
    const result = validateModifiedOverrides([]);
    assert.strictEqual(result.ok, true, 'Expected ok for empty input');
    console.log('  ✓ Empty input → ok');
  }

  // ── 2. Single valid JSON object ─────────────────────────────────────────
  console.log('\nTesting: single valid JSON object');
  {
    const result = validateModifiedOverrides([entry()]);
    assert.strictEqual(result.ok, true);
    console.log('  ✓ Valid JSON object → ok');
  }

  // ── 3. null overrideData → skipped (not an error) ───────────────────────
  console.log('\nTesting: null overrideData');
  {
    const result = validateModifiedOverrides([entry({ overrideData: null })]);
    assert.strictEqual(result.ok, true, 'null overrideData should be ok (nothing to apply)');
    console.log('  ✓ null overrideData → ok (treated as no-op)');
  }

  // ── 4. Empty string overrideData → skipped ──────────────────────────────
  console.log('\nTesting: empty string overrideData');
  {
    const result = validateModifiedOverrides([entry({ overrideData: '' })]);
    assert.strictEqual(result.ok, true, 'Empty string overrideData should be ok');
    console.log('  ✓ Empty string overrideData → ok (treated as no-op)');
  }

  // ── 5. Truncated / invalid JSON ──────────────────────────────────────────
  console.log('\nTesting: truncated JSON');
  {
    const result = validateModifiedOverrides([
      entry({ id: 'bt_bad', toolId: 'tool_bad', overrideData: '{"name": "oops"' }),
    ]);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.corrupt.length, 1);
      assert.strictEqual(result.corrupt[0].branchToolId, 'bt_bad');
      assert.strictEqual(result.corrupt[0].toolId, 'tool_bad');
      assert.ok(result.corrupt[0].error.length > 0, 'Should include parse error message');
    }
    console.log('  ✓ Truncated JSON → corrupt with toolId + branchToolId');
  }

  // ── 6. Completely unparseable string ────────────────────────────────────
  console.log('\nTesting: completely unparseable string');
  {
    const result = validateModifiedOverrides([
      entry({ overrideData: 'not json at all' }),
    ]);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.corrupt.length, 1);
    }
    console.log('  ✓ Unparseable string → corrupt');
  }

  // ── 7. Valid JSON but an array (not an object) ───────────────────────────
  console.log('\nTesting: valid JSON array (wrong shape)');
  {
    const result = validateModifiedOverrides([
      entry({ overrideData: '[{"name": "oops"}]' }),
    ]);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.corrupt.length, 1);
      assert.ok(result.corrupt[0].error.includes('array'), 'Error should mention array');
    }
    console.log('  ✓ JSON array → corrupt (must be a plain object)');
  }

  // ── 8. Valid JSON but a primitive string ─────────────────────────────────
  console.log('\nTesting: valid JSON primitive string');
  {
    const result = validateModifiedOverrides([
      entry({ overrideData: '"just a string"' }),
    ]);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.corrupt[0].error.includes('string'));
    }
    console.log('  ✓ JSON primitive string → corrupt');
  }

  // ── 9. Valid JSON null literal ───────────────────────────────────────────
  console.log('\nTesting: JSON null literal');
  {
    const result = validateModifiedOverrides([
      entry({ overrideData: 'null' }),
    ]);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.corrupt.length, 1);
    }
    console.log('  ✓ JSON null literal → corrupt');
  }

  // ── 10. Mixed: valid and corrupt entries ─────────────────────────────────
  console.log('\nTesting: mixed valid and corrupt entries');
  {
    const result = validateModifiedOverrides([
      entry({ id: 'bt_1', toolId: 'tool_1', overrideData: '{"name":"good"}' }),
      entry({ id: 'bt_2', toolId: 'tool_2', overrideData: 'BROKEN JSON' }),
      entry({ id: 'bt_3', toolId: 'tool_3', overrideData: null }),
      entry({ id: 'bt_4', toolId: 'tool_4', overrideData: '[1,2,3]' }),
    ]);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.corrupt.length, 2, 'Should flag bt_2 and bt_4, not bt_1 or bt_3');
      const ids = result.corrupt.map(c => c.branchToolId).sort();
      assert.deepStrictEqual(ids, ['bt_2', 'bt_4']);
    }
    console.log('  ✓ Mixed input → lists only corrupt entries (bt_2, bt_4)');
  }

  // ── 11. All entries corrupt → all listed ────────────────────────────────
  console.log('\nTesting: all entries corrupt');
  {
    const result = validateModifiedOverrides([
      entry({ id: 'bt_a', toolId: 'tool_a', overrideData: '{bad' }),
      entry({ id: 'bt_b', toolId: 'tool_b', overrideData: '[1]' }),
    ]);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.corrupt.length, 2);
    }
    console.log('  ✓ All corrupt → all 2 listed');
  }

  // ── 12. Multiple valid entries ───────────────────────────────────────────
  console.log('\nTesting: multiple valid entries');
  {
    const result = validateModifiedOverrides([
      entry({ id: 'bt_1', toolId: 'tool_1', overrideData: '{"name":"a"}' }),
      entry({ id: 'bt_2', toolId: 'tool_2', overrideData: '{"description":"b"}' }),
      entry({ id: 'bt_3', toolId: 'tool_3', overrideData: null }),
      entry({ id: 'bt_4', toolId: 'tool_4', overrideData: '' }),
    ]);
    assert.strictEqual(result.ok, true);
    console.log('  ✓ Multiple valid/null/empty entries → ok');
  }

  console.log('\n🎉 ALL validateModifiedOverrides TESTS PASSED! 🎉\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
