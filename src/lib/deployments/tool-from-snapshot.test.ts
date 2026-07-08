import assert from 'assert'
import { toolCreateDataFromSnapshot } from './tool-from-snapshot'

// ── fixtures ──────────────────────────────────────────────────────────────────

/** A full prisma.Tool row for a layout-based find tool, as stored in a snapshot. */
const LAYOUT_TOOL_SNAPSHOT = {
  id: 'old-tool-1',
  serverId: 'srv-1',
  name: 'find_contacts',
  description: 'Search contacts by name',
  category: 'Find',
  inputSchema: '{"type":"object","properties":{"query":{"type":"string"}}}',
  outputSchema: '{"type":"object","properties":{"records":{"type":"array"}}}',
  handlerConfig: '{"connectionId":"conn-1","layout":"Contacts","method":"find"}',
  fmMethod: 'find',
  fmLayout: 'Contacts',
  fmScript: null,
  isEnabled: true,
  version: 3,
  isAiGenerated: true,
  testConfig: '{"query":"Smith"}',
  sortOrder: 2,
  deletedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
}

/** A full prisma.Tool row for a script-based tool. */
const SCRIPT_TOOL_SNAPSHOT = {
  id: 'old-tool-2',
  serverId: 'srv-1',
  name: 'run_invoice_script',
  description: 'Runs the invoice generation script',
  category: 'Script',
  inputSchema: '{"type":"object","properties":{"invoiceId":{"type":"string"}}}',
  outputSchema: '{"type":"object","properties":{"result":{"type":"string"}}}',
  handlerConfig: '{"connectionId":"conn-1","scriptName":"GenerateInvoice","method":"script"}',
  fmMethod: 'script',
  fmLayout: null,
  fmScript: 'GenerateInvoice',
  isEnabled: true,
  version: 5,
  isAiGenerated: false,
  testConfig: '{"invoiceId":"INV-001"}',
  sortOrder: 7,
  deletedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
}

// ── tests ──────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting tool-from-snapshot Rollback Field Tests...\n')

  // ── 1. Layout-based tool: all execution fields restored ────────────────────
  console.log('Testing: layout-based tool — all execution fields restored')
  {
    const data = toolCreateDataFromSnapshot(LAYOUT_TOOL_SNAPSHOT)

    assert.strictEqual(data.name,          'find_contacts')
    assert.strictEqual(data.description,   'Search contacts by name')
    assert.strictEqual(data.fmMethod,      'find',      'fmMethod must be restored')
    assert.strictEqual(data.fmLayout,      'Contacts',  'fmLayout must be restored')
    assert.strictEqual(data.fmScript,      null,        'fmScript must be null for layout tool')
    assert.strictEqual(data.isEnabled,     true)
    assert.strictEqual(data.category,      'Find')
    assert.strictEqual(data.inputSchema,   LAYOUT_TOOL_SNAPSHOT.inputSchema)
    assert.strictEqual(data.outputSchema,  LAYOUT_TOOL_SNAPSHOT.outputSchema,  'outputSchema must be restored')
    assert.strictEqual(data.handlerConfig, LAYOUT_TOOL_SNAPSHOT.handlerConfig)
    assert.strictEqual(data.version,       3,   'version must be restored')
    assert.strictEqual(data.sortOrder,     2,   'sortOrder must be restored')
    assert.strictEqual(data.isAiGenerated, true,'isAiGenerated must be restored')
    assert.strictEqual(data.testConfig,    '{"query":"Smith"}', 'testConfig must be restored')
    console.log('  ✓ fmMethod, fmLayout, outputSchema, version, sortOrder, isAiGenerated, testConfig all present')
  }

  // ── 2. Script-based tool: all execution fields restored ────────────────────
  console.log('\nTesting: script-based tool — all execution fields restored')
  {
    const data = toolCreateDataFromSnapshot(SCRIPT_TOOL_SNAPSHOT)

    assert.strictEqual(data.name,          'run_invoice_script')
    assert.strictEqual(data.fmMethod,      'script',            'fmMethod must be "script"')
    assert.strictEqual(data.fmScript,      'GenerateInvoice',   'fmScript must be restored')
    assert.strictEqual(data.fmLayout,      null,                'fmLayout must be null for script tool')
    assert.strictEqual(data.outputSchema,  SCRIPT_TOOL_SNAPSHOT.outputSchema, 'outputSchema must be restored')
    assert.strictEqual(data.version,       5,  'version must be restored')
    assert.strictEqual(data.sortOrder,     7,  'sortOrder must be restored')
    assert.strictEqual(data.isAiGenerated, false)
    assert.strictEqual(data.testConfig,    '{"invoiceId":"INV-001"}')
    console.log('  ✓ fmMethod="script", fmScript, fmLayout=null, outputSchema, version, sortOrder all correct')
  }

  // ── 3. No execution-critical field is undefined in the output ─────────────
  console.log('\nTesting: no execution-critical field is undefined in output')
  {
    for (const snapshot of [LAYOUT_TOOL_SNAPSHOT, SCRIPT_TOOL_SNAPSHOT]) {
      const data = toolCreateDataFromSnapshot(snapshot)
      const criticalFields = [
        'name', 'description', 'inputSchema', 'outputSchema',
        'handlerConfig', 'fmMethod', 'fmLayout', 'fmScript',
        'isEnabled', 'category', 'version', 'sortOrder',
        'isAiGenerated', 'testConfig',
      ]
      for (const field of criticalFields) {
        // null is acceptable (optional FK); undefined is not — it means the
        // field was silently dropped and Prisma would use its default instead
        // of the snapshot value.
        assert.ok(
          (data as Record<string, unknown>)[field] !== undefined,
          `Field "${field}" must not be undefined in the create payload for tool "${snapshot.name}"`,
        )
      }
    }
    console.log('  ✓ All 14 critical fields are present (not undefined) in both tool snapshots')
  }

  // ── 4. String / object coercion for JSON fields ────────────────────────────
  console.log('\nTesting: JSON fields coerced to strings when stored as objects')
  {
    const withObjectFields = {
      ...LAYOUT_TOOL_SNAPSHOT,
      inputSchema:   { type: 'object', properties: {} },
      outputSchema:  { type: 'object', properties: { id: { type: 'string' } } },
      handlerConfig: { connectionId: 'conn-1', layout: 'Contacts', method: 'find' },
      testConfig:    { query: 'Jones' },
    }
    const data = toolCreateDataFromSnapshot(withObjectFields)

    assert.strictEqual(typeof data.inputSchema,   'string', 'inputSchema must be stringified')
    assert.strictEqual(typeof data.outputSchema,  'string', 'outputSchema must be stringified')
    assert.strictEqual(typeof data.handlerConfig, 'string', 'handlerConfig must be stringified')
    assert.strictEqual(typeof data.testConfig,    'string', 'testConfig must be stringified')

    // Round-trip check
    assert.deepStrictEqual(JSON.parse(data.inputSchema!),  { type: 'object', properties: {} })
    assert.deepStrictEqual(JSON.parse(data.handlerConfig), { connectionId: 'conn-1', layout: 'Contacts', method: 'find' })
    console.log('  ✓ Object fields stringified; round-trips correctly')
  }

  // ── 5. Missing optional fields fall back to safe defaults ─────────────────
  console.log('\nTesting: missing optional fields fall back to safe defaults')
  {
    const minimal = {
      name:          'minimal_tool',
      description:   'Minimal',
      inputSchema:   '{}',
      handlerConfig: '{}',
    }
    const data = toolCreateDataFromSnapshot(minimal)

    assert.strictEqual(data.fmMethod,      null)
    assert.strictEqual(data.fmLayout,      null)
    assert.strictEqual(data.fmScript,      null)
    assert.strictEqual(data.outputSchema,  null)
    assert.strictEqual(data.testConfig,    null)
    assert.strictEqual(data.isEnabled,     true,  'isEnabled defaults to true')
    assert.strictEqual(data.version,       1,     'version defaults to 1')
    assert.strictEqual(data.sortOrder,     0,     'sortOrder defaults to 0')
    assert.strictEqual(data.isAiGenerated, false, 'isAiGenerated defaults to false')
    console.log('  ✓ All optional fields have safe, non-undefined defaults')
  }

  // ── 6. Legacy snapshot: "enabled" field (old name) is honoured ────────────
  console.log('\nTesting: legacy "enabled" field is read when isEnabled is absent')
  {
    const legacy = { ...LAYOUT_TOOL_SNAPSHOT, isEnabled: undefined, enabled: false }
    const data = toolCreateDataFromSnapshot(legacy as unknown as Record<string, unknown>)
    assert.strictEqual(data.isEnabled, false, 'Legacy "enabled" field must be respected')
    console.log('  ✓ toolData.enabled used as fallback when isEnabled is undefined')
  }

  console.log('\n🎉 ALL ROLLBACK FIELD TESTS PASSED! (6/6)')
}

runTests().catch((err) => {
  console.error('\n❌ ROLLBACK FIELD TESTS FAILED:', err)
  process.exit(1)
})
