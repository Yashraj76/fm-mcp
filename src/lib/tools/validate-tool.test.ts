import assert from 'assert'
import { validateToolForSave } from './validate-tool'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid Data API tool — used as a base for mutation tests */
function validTool(overrides: Record<string, any> = {}) {
  return {
    name: 'search_contacts',
    description: 'Search contacts by name or email',
    fmMethod: 'find',
    category: 'search',
    handlerConfig: JSON.stringify({
      connectionId: 'conn_abc',
      method: 'find',
      layout: 'Contacts',
    }),
    inputSchema: JSON.stringify({
      type: 'object',
      properties: { name: { type: 'string' } },
    }),
    ...overrides,
  }
}

function assertFieldError(errors: any[], field: string) {
  const match = errors.find((e) => e.field === field)
  assert.ok(match, `Expected an error for field "${field}", got: ${JSON.stringify(errors)}`)
}

function assertNoFieldError(errors: any[], field: string) {
  const match = errors.find((e) => e.field === field)
  assert.ok(!match, `Expected no error for field "${field}", but got one: ${JSON.stringify(match)}`)
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting validateToolForSave Tests...\n')

  // ── 1. Valid tool passes with no errors ──────────────────────────────────

  console.log('Testing valid tool...')
  {
    const errors = validateToolForSave(validTool())
    assert.strictEqual(errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(errors)}`)
    console.log('  ✓ Valid tool returns no errors')
  }

  // ── 2. Required top-level fields ─────────────────────────────────────────

  console.log('\nTesting required top-level fields...')
  {
    const errors = validateToolForSave(validTool({ name: '' }))
    assertFieldError(errors, 'name')
    console.log('  ✓ Empty name produces name error')
  }
  {
    const errors = validateToolForSave(validTool({ name: '   ' }))
    assertFieldError(errors, 'name')
    console.log('  ✓ Whitespace-only name produces name error')
  }
  {
    const errors = validateToolForSave(validTool({ name: 'unnamed_tool' }))
    assertFieldError(errors, 'name')
    console.log('  ✓ Sentinel "unnamed_tool" placeholder is rejected')
  }
  {
    const errors = validateToolForSave(validTool({ description: '' }))
    assertFieldError(errors, 'description')
    console.log('  ✓ Empty description produces description error')
  }
  {
    const errors = validateToolForSave(validTool({ fmMethod: '' }))
    assertFieldError(errors, 'fmMethod')
    console.log('  ✓ Empty fmMethod produces fmMethod error')
  }
  {
    const errors = validateToolForSave(validTool({ fmMethod: undefined }))
    assertFieldError(errors, 'fmMethod')
    console.log('  ✓ Missing fmMethod produces fmMethod error')
  }
  {
    const errors = validateToolForSave(validTool({ category: '' }))
    assertFieldError(errors, 'category')
    console.log('  ✓ Empty category produces category error')
  }
  {
    const errors = validateToolForSave(validTool({ category: undefined }))
    assertFieldError(errors, 'category')
    console.log('  ✓ Missing category produces category error')
  }

  // ── 3. handlerConfig validation ──────────────────────────────────────────

  console.log('\nTesting handlerConfig validation...')
  {
    const errors = validateToolForSave(validTool({ handlerConfig: 'not json {{{' }))
    assertFieldError(errors, 'handlerConfig')
    console.log('  ✓ Invalid handlerConfig JSON produces handlerConfig error')
  }
  {
    const errors = validateToolForSave(validTool({
      handlerConfig: JSON.stringify({ method: 'find', layout: 'Contacts' }), // missing connectionId
    }))
    assertFieldError(errors, 'handlerConfig.connectionId')
    console.log('  ✓ Missing connectionId in handlerConfig produces error for non-system tool')
  }
  {
    const errors = validateToolForSave(validTool({
      handlerConfig: JSON.stringify({ connectionId: 'conn_abc', layout: 'Contacts' }), // missing method
    }))
    assertFieldError(errors, 'handlerConfig.method')
    console.log('  ✓ Missing method in handlerConfig produces error')
  }
  {
    // Data API tool without a layout
    const errors = validateToolForSave(validTool({
      fmMethod: 'find',
      handlerConfig: JSON.stringify({ connectionId: 'conn_abc', method: 'find' }),
    }))
    assertFieldError(errors, 'handlerConfig.layout')
    console.log('  ✓ Missing layout for Data API tool produces layout error')
  }
  {
    // Multi-table tool — layout comes from steps[0].layout, not top-level
    const errors = validateToolForSave(validTool({
      fmMethod: 'find',
      handlerConfig: JSON.stringify({
        connectionId: 'conn_abc',
        method: 'find',
        steps: [{ layout: 'Contacts' }],
      }),
    }))
    assertNoFieldError(errors, 'handlerConfig.layout')
    console.log('  ✓ Multi-table tool with steps[0].layout does not produce layout error')
  }

  // ── 4. System tool exemptions ────────────────────────────────────────────

  console.log('\nTesting system tool exemptions...')
  {
    const errors = validateToolForSave({
      name: 'calculate_total',
      description: 'Adds values',
      fmMethod: 'system',
      category: 'math',
      handlerConfig: JSON.stringify({ method: 'add' }), // no connectionId — allowed for system
      inputSchema: JSON.stringify({ type: 'object', properties: {} }),
    })
    assertNoFieldError(errors, 'handlerConfig.connectionId')
    console.log('  ✓ System tool without connectionId does not produce connectionId error')
  }

  // ── 5. recordId required for update / delete / get ───────────────────────

  console.log('\nTesting recordId requirement...')
  for (const method of ['update', 'delete', 'get'] as const) {
    {
      const errors = validateToolForSave(validTool({
        fmMethod: method,
        handlerConfig: JSON.stringify({ connectionId: 'conn_abc', method, layout: 'Contacts' }),
        inputSchema: JSON.stringify({ type: 'object', properties: { name: { type: 'string' } } }),
      }))
      assertFieldError(errors, 'inputSchema')
      console.log(`  ✓ ${method} without recordId produces inputSchema error`)
    }
    {
      const errors = validateToolForSave(validTool({
        fmMethod: method,
        handlerConfig: JSON.stringify({ connectionId: 'conn_abc', method, layout: 'Contacts' }),
        inputSchema: JSON.stringify({
          type: 'object',
          properties: { recordId: { type: 'string' }, name: { type: 'string' } },
        }),
      }))
      assertNoFieldError(errors, 'inputSchema')
      console.log(`  ✓ ${method} with recordId passes inputSchema check`)
    }
  }

  // ── 5b. recordId required for multi-step tools with update/delete/get ────
  console.log('\nTesting recordId requirement for multi-step tools...')
  {
    // fmMethod is 'sequential-multi-table' at the top level — the update
    // operation only shows up inside steps[0].operation.
    const errors = validateToolForSave(validTool({
      fmMethod: 'sequential-multi-table',
      handlerConfig: JSON.stringify({
        connectionId: 'conn_abc',
        method: 'sequential-multi-table',
        steps: [{ stepIndex: 0, api: 'data-api', operation: 'update', layout: 'Contacts', fieldMappings: {} }],
      }),
      inputSchema: JSON.stringify({ type: 'object', properties: {} }),
    }))
    assertFieldError(errors, 'inputSchema')
    console.log('  ✓ Multi-step update without recordId produces inputSchema error')
  }
  {
    const errors = validateToolForSave(validTool({
      fmMethod: 'sequential-multi-table',
      handlerConfig: JSON.stringify({
        connectionId: 'conn_abc',
        method: 'sequential-multi-table',
        steps: [{ stepIndex: 0, api: 'data-api', operation: 'update', layout: 'Contacts', fieldMappings: {} }],
      }),
      inputSchema: JSON.stringify({ type: 'object', properties: { recordId: { type: 'string' } } }),
    }))
    assertNoFieldError(errors, 'inputSchema')
    console.log('  ✓ Multi-step update with recordId passes inputSchema check')
  }

  // ── 5c. fieldMappings keys must exist in inputSchema.properties ──────────
  console.log('\nTesting fieldMappings ↔ inputSchema cross-check...')
  {
    const errors = validateToolForSave(validTool({
      handlerConfig: JSON.stringify({
        connectionId: 'conn_abc',
        method: 'find',
        layout: 'Contacts',
        fieldMappings: { email: 'Email_FM' },
      }),
      inputSchema: JSON.stringify({ type: 'object', properties: { name: { type: 'string' } } }), // no "email"
    }))
    assertFieldError(errors, 'inputSchema')
    console.log('  ✓ fieldMappings key missing from inputSchema produces inputSchema error')
  }
  {
    const errors = validateToolForSave(validTool({
      handlerConfig: JSON.stringify({
        connectionId: 'conn_abc',
        method: 'find',
        layout: 'Contacts',
        fieldMappings: { email: 'Email_FM' },
      }),
      inputSchema: JSON.stringify({ type: 'object', properties: { email: { type: 'string' } } }),
    }))
    assertNoFieldError(errors, 'inputSchema')
    console.log('  ✓ fieldMappings key present in inputSchema passes')
  }
  {
    // Per-step fieldMappings (multi-table shape) are checked too.
    const errors = validateToolForSave(validTool({
      fmMethod: 'sequential-multi-table',
      handlerConfig: JSON.stringify({
        connectionId: 'conn_abc',
        method: 'sequential-multi-table',
        steps: [{ stepIndex: 0, api: 'data-api', operation: 'find', layout: 'Contacts', fieldMappings: { email: 'Email_FM' } }],
      }),
      inputSchema: JSON.stringify({ type: 'object', properties: {} }),
    }))
    assertFieldError(errors, 'inputSchema')
    console.log('  ✓ per-step fieldMappings key missing from inputSchema produces inputSchema error')
  }

  // ── 6. Multiple errors returned at once ──────────────────────────────────

  console.log('\nTesting multiple simultaneous errors...')
  {
    const errors = validateToolForSave({
      name: '',
      description: '',
      fmMethod: '',
      category: '',
      handlerConfig: '{}',
      inputSchema: '{}',
    })
    assert.ok(errors.length >= 4, `Expected at least 4 errors, got ${errors.length}: ${JSON.stringify(errors)}`)
    assertFieldError(errors, 'name')
    assertFieldError(errors, 'description')
    assertFieldError(errors, 'fmMethod')
    assertFieldError(errors, 'category')
    console.log('  ✓ Multiple missing fields all reported in one call')
  }

  // ── 7. handlerConfig passed as object (not string) ───────────────────────

  console.log('\nTesting handlerConfig as plain object...')
  {
    const errors = validateToolForSave(validTool({
      handlerConfig: { connectionId: 'conn_abc', method: 'find', layout: 'Contacts' },
    }))
    assert.strictEqual(errors.length, 0, `Expected 0 errors with object handlerConfig, got: ${JSON.stringify(errors)}`)
    console.log('  ✓ handlerConfig passed as plain object is accepted')
  }

  console.log('\n🎉 ALL VALIDATE-TOOL TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err)
  process.exit(1)
})
