import assert from 'assert'
import { normalizeTool } from './normalize-tool'
import { validateToolForSave } from './validate-tool'
import { FM_METHODS } from './fm-methods'

async function runTests() {
  console.log('🚀 Starting AI Tool Normalization Tests...\n')

  // ── 1. executionStrategy maps to fmMethod ────────────────────────────────────
  console.log('Testing: executionStrategy fm-find → fmMethod find, category Find')
  {
    const result = normalizeTool({
      name: 'search_contacts',
      description: 'Find contacts',
      executionStrategy: 'fm-find',
      handlerConfig: { connectionId: 'conn-1', layout: 'Contacts', method: 'find' },
    })
    assert.strictEqual(result.fmMethod, 'find')
    assert.strictEqual(result.category, 'Find')
    console.log('  ✓ executionStrategy fm-find → fmMethod find, category Find')
  }

  // ── 2. Missing fmMethod defaults to custom ───────────────────────────────────
  console.log('\nTesting: missing fmMethod → custom, category Custom')
  {
    const result = normalizeTool({
      name: 'my_tool',
      description: 'Does something',
      handlerConfig: { connectionId: 'conn-1', method: 'custom' },
    })
    assert.strictEqual(result.fmMethod, 'custom')
    assert.strictEqual(result.category, 'Custom')
    console.log('  ✓ Missing fmMethod defaults to custom')
  }

  // ── 3. create → CRUD category ────────────────────────────────────────────────
  console.log('\nTesting: fmMethod create → category CRUD')
  {
    const result = normalizeTool({
      name: 'create_contact',
      description: 'Create a contact',
      fmMethod: 'create',
      handlerConfig: { connectionId: 'conn-1', layout: 'Contacts', method: 'create' },
    })
    assert.strictEqual(result.fmMethod, 'create')
    assert.strictEqual(result.category, 'CRUD')
    console.log('  ✓ fmMethod create → category CRUD')
  }

  // ── 4. update injects recordId into inputSchema ──────────────────────────────
  console.log('\nTesting: update with no recordId → recordId injected')
  {
    const result = normalizeTool({
      name: 'update_contact',
      description: 'Update a contact',
      fmMethod: 'update',
      fmLayout: 'Contacts',
      handlerConfig: { connectionId: 'conn-1', layout: 'Contacts', method: 'update' },
      inputSchema: {
        type: 'object',
        properties: { firstName: { type: 'string' } },
        required: [],
      },
    })
    const schema = JSON.parse(result.inputSchema)
    assert.ok(schema.properties.recordId, 'recordId should be injected')
    assert.ok(schema.required.includes('recordId'), 'recordId should be in required')
    console.log('  ✓ recordId injected for update method')
  }

  // ── 5. recordId already present → not duplicated ────────────────────────────
  console.log('\nTesting: recordId already in inputSchema → not duplicated')
  {
    const result = normalizeTool({
      name: 'delete_contact',
      description: 'Delete a contact',
      fmMethod: 'delete',
      handlerConfig: { connectionId: 'conn-1', layout: 'Contacts', method: 'delete' },
      inputSchema: {
        type: 'object',
        properties: {
          recordId: { type: 'string', description: 'Record to delete' },
        },
        required: ['recordId'],
      },
    })
    const schema = JSON.parse(result.inputSchema)
    const recordIdCount = Object.keys(schema.properties).filter(k => k === 'recordId').length
    assert.strictEqual(recordIdCount, 1, 'recordId should appear exactly once')
    assert.strictEqual(schema.required.filter((r: string) => r === 'recordId').length, 1)
    console.log('  ✓ recordId not duplicated when already present')
  }

  // ── 6. Missing description auto-generated ───────────────────────────────────
  console.log('\nTesting: missing description → auto-generated from method + layout')
  {
    const result = normalizeTool({
      name: 'list_orders',
      fmMethod: 'list',
      fmLayout: 'Orders',
      handlerConfig: { connectionId: 'conn-1', layout: 'Orders', method: 'list' },
    })
    assert.ok(result.description.length > 0, 'description should be auto-generated')
    assert.ok(result.description.toLowerCase().includes('orders') || result.description.toLowerCase().includes('list'))
    console.log(`  ✓ Auto-generated description: "${result.description}"`)
  }

  // ── 7. handlerConfig method auto-set ────────────────────────────────────────
  console.log('\nTesting: handlerConfig without method → method auto-set from fmMethod')
  {
    const result = normalizeTool({
      name: 'find_invoices',
      description: 'Find invoices',
      fmMethod: 'find',
      fmLayout: 'Invoices',
      handlerConfig: { connectionId: 'conn-1', layout: 'Invoices' },
    })
    const hc = JSON.parse(result.handlerConfig)
    assert.strictEqual(hc.method, 'find', 'method should be auto-set in handlerConfig')
    console.log('  ✓ handlerConfig.method auto-set from fmMethod')
  }

  // ── 8. validateToolForSave: valid find tool passes ───────────────────────────
  console.log('\nTesting: validateToolForSave — valid find tool passes')
  {
    const tool = normalizeTool({
      name: 'find_customers',
      description: 'Search for customers',
      fmMethod: 'find',
      fmLayout: 'Customers',
      handlerConfig: { connectionId: 'conn-1', layout: 'Customers', method: 'find' },
    })
    const errors = validateToolForSave(tool)
    assert.strictEqual(errors.length, 0, `Expected no errors, got: ${errors.map(e => e.message).join(', ')}`)
    console.log('  ✓ Valid find tool passes validation')
  }

  // ── 9. validateToolForSave: unknown fmMethod rejected ───────────────────────
  console.log('\nTesting: validateToolForSave — "read" fmMethod rejected as unknown')
  {
    const errors = validateToolForSave({
      name: 'read_data',
      description: 'Read some data',
      fmMethod: 'read',
      category: 'CRUD',
      handlerConfig: JSON.stringify({ connectionId: 'conn-1', method: 'read', layout: 'Data' }),
      inputSchema: JSON.stringify({ type: 'object', properties: {}, required: [] }),
    })
    const methodError = errors.find(e => e.field === 'fmMethod')
    assert.ok(methodError, '"read" fmMethod should produce a validation error')
    assert.ok(methodError!.message.includes('recognised'), `Expected "recognised" in error: ${methodError!.message}`)
    console.log(`  ✓ "read" fmMethod rejected: "${methodError!.message}"`)
  }

  // ── 10. validateToolForSave: missing connectionId rejected ──────────────────
  console.log('\nTesting: validateToolForSave — missing connectionId in handlerConfig rejected')
  {
    const tool = normalizeTool({
      name: 'find_products',
      description: 'Find products',
      fmMethod: 'find',
      fmLayout: 'Products',
      handlerConfig: { layout: 'Products', method: 'find' }, // no connectionId
    })
    const errors = validateToolForSave(tool)
    const connError = errors.find(e => e.field === 'handlerConfig.connectionId')
    assert.ok(connError, 'Should have connectionId error')
    console.log(`  ✓ Missing connectionId rejected: "${connError!.message}"`)
  }

  // ── 11. FM_METHODS constant has expected values ──────────────────────────────
  console.log('\nTesting: FM_METHODS constant contains expected user-facing methods')
  {
    const expected = ['find', 'create', 'update', 'delete', 'list', 'get', 'script', 'custom']
    for (const m of expected) {
      assert.ok(FM_METHODS.includes(m as any), `FM_METHODS should include "${m}"`)
    }
    assert.ok(!FM_METHODS.includes('read' as any), 'FM_METHODS must not include "read"')
    console.log(`  ✓ FM_METHODS = [${FM_METHODS.join(', ')}]`)
  }

  // ── 12. Malformed AI: string handlerConfig is parsed, passes validation ───────
  console.log('\nTesting: malformed AI — string handlerConfig is parsed and validated')
  {
    const result = normalizeTool({
      name: 'find_orders',
      description: 'Find orders',
      fmMethod: 'find',
      fmLayout: 'Orders',
      // AI sometimes serializes handlerConfig as a JSON string instead of an object
      handlerConfig: JSON.stringify({ connectionId: 'conn-1', layout: 'Orders', method: 'find' }),
    })
    const hc = JSON.parse(result.handlerConfig)
    assert.strictEqual(hc.connectionId, 'conn-1', 'connectionId should survive string-parse')
    assert.strictEqual(hc.layout, 'Orders')
    const errors = validateToolForSave(result)
    assert.strictEqual(errors.length, 0, `Expected 0 errors, got: ${errors.map((e) => e.message).join(', ')}`)
    console.log('  ✓ String handlerConfig parsed and validated successfully')
  }

  // ── 13. Malformed AI: category alias 'lookup' → 'Find' ───────────────────────
  console.log('\nTesting: malformed AI — category "lookup" normalized to "Find"')
  {
    const result = normalizeTool({
      name: 'find_contacts',
      description: 'Find contacts',
      fmMethod: 'find',
      fmLayout: 'Contacts',
      category: 'lookup',
      handlerConfig: { connectionId: 'conn-1', layout: 'Contacts', method: 'find' },
    })
    assert.strictEqual(result.category, 'Find', `Expected "Find", got "${result.category}"`)
    const errors = validateToolForSave(result)
    assert.strictEqual(errors.length, 0, `Unexpected validation errors: ${errors.map((e) => e.message).join(', ')}`)
    console.log('  ✓ category "lookup" normalized to "Find"')
  }

  // ── 14. Malformed AI: category alias 'multi-table' → 'Multi-Table' ───────────
  console.log('\nTesting: malformed AI — category "multi-table" normalized to "Multi-Table"')
  {
    const result = normalizeTool({
      name: 'get_customer_orders',
      description: 'Find customer and their orders',
      fmMethod: 'sequential-multi-table',
      category: 'multi-table',
      handlerConfig: {
        connectionId: 'conn-1',
        method: 'sequential-multi-table',
        steps: [{ layout: 'Customers' }],
      },
    })
    assert.strictEqual(result.category, 'Multi-Table', `Expected "Multi-Table", got "${result.category}"`)
    console.log('  ✓ category "multi-table" normalized to "Multi-Table"')
  }

  // ── 15. Malformed AI: `enabled` field (not `isEnabled`) → isEnabled=true ──────
  console.log('\nTesting: malformed AI — "enabled: true" maps to isEnabled=true')
  {
    const result = normalizeTool({
      name: 'list_invoices',
      description: 'List invoices',
      fmMethod: 'list',
      fmLayout: 'Invoices',
      enabled: true,         // AI often emits "enabled" not "isEnabled"
      isEnabled: undefined,
      handlerConfig: { connectionId: 'conn-1', layout: 'Invoices', method: 'list' },
    })
    assert.strictEqual(result.isEnabled, true, 'isEnabled should be true from "enabled" field')
    console.log('  ✓ "enabled: true" → isEnabled=true')
  }

  // ── 16. Malformed AI: completely missing inputSchema → defaults injected ───────
  console.log('\nTesting: malformed AI — no inputSchema at all → defaults injected')
  {
    const result = normalizeTool({
      name: 'find_products',
      description: 'Find products',
      fmMethod: 'find',
      fmLayout: 'Products',
      handlerConfig: { connectionId: 'conn-1', layout: 'Products', method: 'find' },
      // no inputSchema
    })
    const schema = JSON.parse(result.inputSchema)
    assert.strictEqual(schema.type, 'object', 'default type should be "object"')
    assert.ok(schema.properties !== undefined, 'default properties should exist')
    assert.ok(Array.isArray(schema.required), 'default required should be an array')
    const errors = validateToolForSave(result)
    assert.strictEqual(errors.length, 0, `Unexpected errors: ${errors.map((e) => e.message).join(', ')}`)
    console.log('  ✓ Missing inputSchema → defaults {type:object, properties:{}, required:[]} injected')
  }

  // ── 17. Malformed AI: unknown fmMethod → passes normalize, fails validation ────
  console.log('\nTesting: malformed AI — unknown fmMethod "read" rejected by validateToolForSave')
  {
    const result = normalizeTool({
      name: 'read_data',
      description: 'Read some data',
      fmMethod: 'read',   // not a recognised FM method
      fmLayout: 'Data',
      handlerConfig: { connectionId: 'conn-1', layout: 'Data', method: 'read' },
    })
    // normalizeTool preserves it as-is; validateToolForSave catches it
    assert.strictEqual(result.fmMethod, 'read')
    const errors = validateToolForSave(result)
    const methodErr = errors.find((e) => e.field === 'fmMethod')
    assert.ok(methodErr, 'Should get a fmMethod validation error for "read"')
    assert.ok(methodErr!.message.includes('recognised'), `Expected "recognised" in: ${methodErr!.message}`)
    console.log(`  ✓ fmMethod "read" passes normalize but fails validation: "${methodErr!.message}"`)
  }

  // ── 18. Malformed AI: no layout for Data API method → rejected ────────────────
  console.log('\nTesting: malformed AI — missing layout for find tool rejected by validateToolForSave')
  {
    const result = normalizeTool({
      name: 'find_records',
      description: 'Find records',
      fmMethod: 'find',
      handlerConfig: { connectionId: 'conn-1', method: 'find' },  // no layout
    })
    const errors = validateToolForSave(result)
    const layoutErr = errors.find((e) => e.field === 'handlerConfig.layout')
    assert.ok(layoutErr, 'Should get a layout validation error')
    console.log(`  ✓ Missing layout for find tool rejected: "${layoutErr!.message}"`)
  }

  // ── 19. Missing name → empty string, NOT the sentinel ────────────────────
  console.log('\nTesting: normalizeTool — missing name → empty string (not "unnamed_tool")')
  {
    const result = normalizeTool({
      description: 'Some tool',
      fmMethod: 'find',
      fmLayout: 'Contacts',
      handlerConfig: { connectionId: 'conn-1', layout: 'Contacts', method: 'find' },
    })
    assert.strictEqual(result.name, '', 'Missing name must produce "" not "unnamed_tool"')
    const errors = validateToolForSave(result)
    assert.ok(errors.some(e => e.field === 'name'), 'Empty name must fail validateToolForSave')
    console.log('  ✓ Missing name → empty string → fails validation (no silent sentinel)')
  }

  // ── 20. null/undefined name → same empty-string behaviour ─────────────────
  console.log('\nTesting: normalizeTool — null name → empty string')
  {
    const resultNull = normalizeTool({ name: null as any, fmMethod: 'find', handlerConfig: { connectionId: 'conn-1', layout: 'X', method: 'find' } })
    assert.strictEqual(resultNull.name, '')
    const resultUndef = normalizeTool({ name: undefined, fmMethod: 'find', handlerConfig: { connectionId: 'conn-1', layout: 'X', method: 'find' } })
    assert.strictEqual(resultUndef.name, '')
    console.log('  ✓ null and undefined names both produce empty string')
  }

  console.log('\n🎉 ALL NORMALIZE-TOOL TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ NORMALIZE-TOOL TESTS FAILED:', err)
  process.exit(1)
})
