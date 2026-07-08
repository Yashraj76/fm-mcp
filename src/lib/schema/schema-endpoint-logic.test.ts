import assert from 'assert'
import {
  buildBrowsedSchemaPayload,
  buildCompiledSchemaPayload,
  SchemaEndpointError,
  type BrowsedSchemaRow,
} from './schema-endpoint-logic'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<BrowsedSchemaRow> = {}): BrowsedSchemaRow {
  return {
    rawLayouts: JSON.stringify(['Customers', 'Orders']),
    rawScripts: JSON.stringify(['ExportCSV', 'SendEmail']),
    rawODataTables: JSON.stringify(['Customers', 'Products']),
    rawLayoutMeta: JSON.stringify({
      Customers: { fields: ['CustomerID', 'Name'], portals: ['Orders'] },
      Orders: { fields: ['OrderID', 'CustomerID'], portals: [] },
    }),
    rawODataMeta: JSON.stringify({
      Customers: { fields: [{ name: 'CustomerID', type: 'Edm.Int32' }] },
    }),
    compiledSchema: JSON.stringify({
      layouts: [
        { name: 'Customers', fields: ['CustomerID', 'Name'], portals: [] },
      ],
      tables: [],
      scripts: ['ExportCSV'],
      relationships: [],
    }),
    selectedLayouts: JSON.stringify(['Customers']),
    selectedTables: JSON.stringify([]),
    selectedScripts: JSON.stringify(['ExportCSV']),
    fetchedAt: new Date('2026-06-30T00:00:00Z'),
    updatedAt: new Date('2026-06-30T01:00:00Z'),
    ...overrides,
  }
}

async function runTests() {
  console.log('🚀 Starting Schema Endpoint Logic Tests...\n')

  // ── POST /browse-schema vs GET /schema vs GET /schema/compiled ────────────
  // These tests validate that each endpoint has a distinct, non-overlapping role.

  // ── 1. buildBrowsedSchemaPayload: null row → NOT_BROWSED_YET ─────────────
  console.log('Testing: GET /schema — null row throws NOT_BROWSED_YET')
  {
    let threw: SchemaEndpointError | null = null
    try {
      buildBrowsedSchemaPayload(null)
    } catch (e: any) {
      threw = e
    }
    assert.ok(threw instanceof SchemaEndpointError, 'Must throw SchemaEndpointError')
    assert.strictEqual(threw!.code, 'NOT_BROWSED_YET')
    assert.strictEqual(threw!.httpStatus, 404)
    console.log('  ✓ null row → NOT_BROWSED_YET (404)')
  }

  // ── 2. buildBrowsedSchemaPayload: returns raw browse data ─────────────────
  console.log('\nTesting: GET /schema — returns raw browse data (never calls FileMaker)')
  {
    const payload = buildBrowsedSchemaPayload(makeRow())

    assert.deepStrictEqual(payload.layouts, ['Customers', 'Orders'])
    assert.deepStrictEqual(payload.scripts, ['ExportCSV', 'SendEmail'])
    assert.deepStrictEqual(payload.odataTables, ['Customers', 'Products'])
    assert.ok(payload.layoutMeta.Customers, 'layoutMeta.Customers must be present')
    assert.deepStrictEqual(payload.layoutMeta.Customers.fields, ['CustomerID', 'Name'])
    assert.deepStrictEqual(payload.layoutMeta.Customers.portals, ['Orders'])
    assert.ok(payload.odataMeta.Customers, 'odataMeta.Customers must be present')
    assert.ok(payload.fetchedAt instanceof Date, 'fetchedAt must be a Date')
    assert.ok(payload.updatedAt instanceof Date, 'updatedAt must be a Date')
    console.log('  ✓ returns layouts, scripts, odataTables, layoutMeta, odataMeta, fetchedAt, updatedAt')
  }

  // ── 3. buildBrowsedSchemaPayload: malformed JSON falls back gracefully ────
  console.log('\nTesting: GET /schema — malformed JSON fields fall back to empty')
  {
    const row = makeRow({
      rawLayouts: 'not-valid-json',
      rawScripts: 'also-bad',
      rawODataTables: '',
    })
    const payload = buildBrowsedSchemaPayload(row)

    assert.deepStrictEqual(payload.layouts, [], 'malformed rawLayouts → []')
    assert.deepStrictEqual(payload.scripts, [], 'malformed rawScripts → []')
    assert.deepStrictEqual(payload.odataTables, [], 'empty rawODataTables → []')
    console.log('  ✓ malformed JSON falls back to empty arrays/objects')
  }

  // ── 4. buildCompiledSchemaPayload: null row → NOT_BROWSED_YET ─────────────
  console.log('\nTesting: GET /schema/compiled — null row throws NOT_BROWSED_YET')
  {
    let threw: SchemaEndpointError | null = null
    try {
      buildCompiledSchemaPayload(null, 'conn-1')
    } catch (e: any) {
      threw = e
    }
    assert.ok(threw instanceof SchemaEndpointError)
    assert.strictEqual(threw!.code, 'NOT_BROWSED_YET')
    assert.strictEqual(threw!.httpStatus, 404)
    console.log('  ✓ null row → NOT_BROWSED_YET (distinct from SCHEMA_NOT_SAVED)')
  }

  // ── 5. buildCompiledSchemaPayload: browsed but no selections → SCHEMA_NOT_SAVED
  console.log('\nTesting: GET /schema/compiled — empty selections throw SCHEMA_NOT_SAVED')
  {
    const row = makeRow({
      compiledSchema: JSON.stringify({ layouts: [], tables: [], scripts: [], relationships: [] }),
    })
    let threw: SchemaEndpointError | null = null
    try {
      buildCompiledSchemaPayload(row, 'conn-1')
    } catch (e: any) {
      threw = e
    }
    assert.ok(threw instanceof SchemaEndpointError)
    assert.strictEqual(threw!.code, 'SCHEMA_NOT_SAVED', 'Must be SCHEMA_NOT_SAVED, not NOT_BROWSED_YET')
    console.log('  ✓ browsed but no selections → SCHEMA_NOT_SAVED (distinct from NOT_BROWSED_YET)')
  }

  // ── 6. buildCompiledSchemaPayload: injects connectionId into layouts ───────
  console.log('\nTesting: GET /schema/compiled — connectionId injected into layouts and tables')
  {
    const payload = buildCompiledSchemaPayload(makeRow(), 'conn-abc')

    const layout = payload.compiledSchema.layouts[0]
    assert.strictEqual(layout.connectionId, 'conn-abc', 'connectionId must be injected into layout')
    assert.strictEqual(layout.name, 'Customers', 'original name must be preserved')
    console.log('  ✓ connectionId injected into layouts; original fields preserved')
  }

  // ── 7. buildCompiledSchemaPayload: connectionId injected into tables ───────
  console.log('\nTesting: GET /schema/compiled — connectionId injected into tables too')
  {
    const row = makeRow({
      compiledSchema: JSON.stringify({
        layouts: [],
        tables: [{ name: 'Products', fields: ['ProductID'] }],
        scripts: [],
        relationships: [],
      }),
    })
    const payload = buildCompiledSchemaPayload(row, 'conn-xyz')

    const table = payload.compiledSchema.tables[0]
    assert.strictEqual(table.connectionId, 'conn-xyz')
    assert.strictEqual(table.name, 'Products')
    console.log('  ✓ connectionId injected into tables')
  }

  // ── 8. buildCompiledSchemaPayload: returns selections separately ──────────
  console.log('\nTesting: GET /schema/compiled — selected arrays returned as separate fields')
  {
    const payload = buildCompiledSchemaPayload(makeRow(), 'conn-1')

    assert.deepStrictEqual(payload.selectedLayouts, ['Customers'])
    assert.deepStrictEqual(payload.selectedTables, [])
    assert.deepStrictEqual(payload.selectedScripts, ['ExportCSV'])
    console.log('  ✓ selectedLayouts, selectedTables, selectedScripts returned correctly')
  }

  // ── 9. Endpoints have distinct roles: browse payload ≠ compiled payload ───
  console.log('\nTesting: GET /schema and GET /schema/compiled return different data shapes')
  {
    const row = makeRow()
    const browsed = buildBrowsedSchemaPayload(row)
    const compiled = buildCompiledSchemaPayload(row, 'conn-1')

    // browsed payload has raw field counts (all layouts)
    assert.strictEqual(browsed.layouts.length, 2, 'browse returns ALL layouts found in FileMaker')

    // compiled payload has only user-selected layouts (compiled schema)
    assert.strictEqual(
      compiled.compiledSchema.layouts.length,
      1,
      'compiled returns ONLY the layouts the user selected'
    )

    // browse payload has odataTables; compiled payload has them inside compiledSchema
    assert.ok('odataTables' in browsed, 'browse has odataTables at top level')
    assert.ok(!('odataTables' in compiled), 'compiled does NOT have odataTables at top level')

    console.log('  ✓ browse returns all discovered resources; compiled returns only saved selections')
  }

  // ── 10. SchemaEndpointError is distinct from generic Error ─────────────────
  console.log('\nTesting: SchemaEndpointError is identifiable and not a generic Error')
  {
    const err = new SchemaEndpointError('NOT_BROWSED_YET', 'test')
    assert.ok(err instanceof SchemaEndpointError, 'instanceof SchemaEndpointError')
    assert.ok(err instanceof Error, 'instanceof Error (base class)')
    assert.strictEqual(err.name, 'SchemaEndpointError')
    assert.strictEqual(err.code, 'NOT_BROWSED_YET')
    assert.strictEqual(err.httpStatus, 404)
    console.log('  ✓ SchemaEndpointError is identifiable via instanceof and .code')
  }

  console.log('\n🎉 ALL SCHEMA ENDPOINT LOGIC TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ SCHEMA ENDPOINT LOGIC TESTS FAILED:', err)
  process.exit(1)
})
