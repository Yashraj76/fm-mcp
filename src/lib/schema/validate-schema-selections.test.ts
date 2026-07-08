import assert from 'assert'
import { validateSchemaSelections } from './validate-schema-selections'

const AVAILABLE = ['Customers', 'Orders', 'Products']

async function runTests() {
  console.log('🚀 Starting Schema Selection Validation Tests...\n')

  // ── 1. Both empty → NO_SELECTIONS ─────────────────────────────────────────
  console.log('Testing: both selectedLayouts and selectedTables empty → NO_SELECTIONS')
  {
    const r = validateSchemaSelections([], [], AVAILABLE)
    assert.strictEqual(r.valid, false)
    assert.strictEqual(r.errors.length, 1)
    assert.strictEqual(r.errors[0].code, 'NO_SELECTIONS')
    assert.strictEqual(r.errors[0].field, 'selectedLayouts')
    console.log('  ✓ both empty → NO_SELECTIONS error')
  }

  // ── 2. Only layouts selected → valid ──────────────────────────────────────
  console.log('\nTesting: only selectedLayouts selected → valid (tables are optional)')
  {
    const r = validateSchemaSelections(['Contacts', 'Orders'], [], AVAILABLE)
    assert.strictEqual(r.valid, true)
    assert.strictEqual(r.errors.length, 0)
    console.log('  ✓ layouts only → valid')
  }

  // ── 3. Only OData tables selected → valid ─────────────────────────────────
  console.log('\nTesting: only selectedTables selected → valid (layouts are optional)')
  {
    const r = validateSchemaSelections([], ['Customers', 'Orders'], AVAILABLE)
    assert.strictEqual(r.valid, true)
    assert.strictEqual(r.errors.length, 0)
    console.log('  ✓ tables only → valid when all tables are in available list')
  }

  // ── 4. Both selected → valid ──────────────────────────────────────────────
  console.log('\nTesting: both layouts and tables selected → valid')
  {
    const r = validateSchemaSelections(['Contacts'], ['Customers'], AVAILABLE)
    assert.strictEqual(r.valid, true)
    assert.strictEqual(r.errors.length, 0)
    console.log('  ✓ both selected → valid')
  }

  // ── 5. Selected table not in available list → INVALID_TABLE_NAMES ─────────
  console.log('\nTesting: selected table not in available list → INVALID_TABLE_NAMES')
  {
    const r = validateSchemaSelections([], ['Customers', 'NonExistentTable'], AVAILABLE)
    assert.strictEqual(r.valid, false)
    assert.strictEqual(r.errors.length, 1)
    assert.strictEqual(r.errors[0].code, 'INVALID_TABLE_NAMES')
    assert.strictEqual(r.errors[0].field, 'selectedTables')
    assert.deepStrictEqual(r.errors[0].invalidNames, ['NonExistentTable'])
    assert.ok(r.errors[0].message.includes('NonExistentTable'))
    console.log('  ✓ invalid table name → INVALID_TABLE_NAMES with name in error')
  }

  // ── 6. Multiple invalid tables → all listed in invalidNames ──────────────
  console.log('\nTesting: multiple invalid tables → all listed in invalidNames')
  {
    const r = validateSchemaSelections([], ['Customers', 'BadTable1', 'BadTable2'], AVAILABLE)
    assert.strictEqual(r.valid, false)
    assert.strictEqual(r.errors[0].code, 'INVALID_TABLE_NAMES')
    assert.deepStrictEqual(r.errors[0].invalidNames, ['BadTable1', 'BadTable2'])
    console.log('  ✓ multiple invalid tables → all listed')
  }

  // ── 7. All selected tables are valid → no error ───────────────────────────
  console.log('\nTesting: all selected tables are in available list → valid')
  {
    const r = validateSchemaSelections([], ['Customers', 'Products'], AVAILABLE)
    assert.strictEqual(r.valid, true)
    assert.strictEqual(r.errors.length, 0)
    console.log('  ✓ all valid tables → no errors')
  }

  // ── 8. availableODataTables is empty but tables are selected → invalid ────
  console.log('\nTesting: available list is empty, tables selected → INVALID_TABLE_NAMES')
  {
    const r = validateSchemaSelections([], ['Customers'], [])
    assert.strictEqual(r.valid, false)
    assert.strictEqual(r.errors[0].code, 'INVALID_TABLE_NAMES')
    assert.deepStrictEqual(r.errors[0].invalidNames, ['Customers'])
    console.log('  ✓ empty available list → any selected table is invalid')
  }

  // ── 9. availableODataTables is empty, no tables selected → no INVALID error
  console.log('\nTesting: available empty, no tables selected, has layouts → valid')
  {
    const r = validateSchemaSelections(['Contacts'], [], [])
    assert.strictEqual(r.valid, true)
    assert.strictEqual(r.errors.length, 0)
    console.log('  ✓ empty available + no tables + has layouts → valid (OData is optional)')
  }

  // ── 10. Both NO_SELECTIONS and INVALID_TABLE_NAMES cannot both appear ──────
  // If selectedTables has an invalid entry AND selectedLayouts is also empty,
  // NO_SELECTIONS fires but INVALID_TABLE_NAMES also fires (independently).
  console.log('\nTesting: empty layouts + invalid table name → both errors')
  {
    const r = validateSchemaSelections([], ['BadTable'], AVAILABLE)
    // NO_SELECTIONS does NOT fire because selectedTables is non-empty (1 item)
    // Only INVALID_TABLE_NAMES fires
    assert.strictEqual(r.errors.filter(e => e.code === 'NO_SELECTIONS').length, 0,
      'NO_SELECTIONS should not fire when selectedTables is non-empty')
    assert.strictEqual(r.errors.filter(e => e.code === 'INVALID_TABLE_NAMES').length, 1)
    assert.strictEqual(r.valid, false)
    console.log('  ✓ non-empty but invalid tables → only INVALID_TABLE_NAMES (not NO_SELECTIONS)')
  }

  // ── 11. Empty layouts + valid table → no NO_SELECTIONS ────────────────────
  console.log('\nTesting: empty layouts + valid table → no NO_SELECTIONS (tables satisfy requirement)')
  {
    const r = validateSchemaSelections([], ['Customers'], AVAILABLE)
    assert.strictEqual(r.valid, true)
    assert.ok(!r.errors.some(e => e.code === 'NO_SELECTIONS'))
    console.log('  ✓ valid table satisfies the at-least-one requirement')
  }

  // ── 12. Case-sensitive matching ────────────────────────────────────────────
  console.log('\nTesting: table name matching is case-sensitive')
  {
    const r = validateSchemaSelections([], ['customers'], AVAILABLE) // 'Customers' in available
    assert.strictEqual(r.valid, false)
    assert.strictEqual(r.errors[0].code, 'INVALID_TABLE_NAMES')
    assert.deepStrictEqual(r.errors[0].invalidNames, ['customers'])
    console.log('  ✓ case-sensitive: "customers" != "Customers"')
  }

  console.log('\n🎉 ALL SCHEMA SELECTION VALIDATION TESTS PASSED! 🎉')
}

runTests().catch(err => {
  console.error('\n❌ SCHEMA SELECTION VALIDATION TESTS FAILED:', err)
  process.exit(1)
})
