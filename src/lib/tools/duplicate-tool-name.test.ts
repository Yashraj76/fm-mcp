import assert from 'assert'
import { checkDuplicateToolName, duplicateToolNameMessage, DUPLICATE_TOOL_NAME_CODE } from './duplicate-tool-name'

// ── Minimal mock DB client ────────────────────────────────────────────────────

function makeMockDb(result: { id: string; name: string } | null) {
  return {
    tool: {
      findFirst: async (_args: any) => result,
    },
  }
}

async function runTests() {
  console.log('🚀 Starting Duplicate Tool Name Tests...\n')

  // ── 1. No conflict ────────────────────────────────────────────────────────
  console.log('Testing: no conflict → isDuplicate false')
  {
    const db = makeMockDb(null)
    const result = await checkDuplicateToolName(db, 'server-1', 'my_tool')
    assert.strictEqual(result.isDuplicate, false)
    assert.strictEqual(result.conflictingName, null)
    console.log('  ✓ no existing tool → no conflict')
  }

  // ── 2. Active duplicate ───────────────────────────────────────────────────
  console.log('\nTesting: active duplicate → isDuplicate true')
  {
    const db = makeMockDb({ id: 'tool-abc', name: 'my_tool' })
    const result = await checkDuplicateToolName(db, 'server-1', 'my_tool')
    assert.strictEqual(result.isDuplicate, true)
    assert.strictEqual(result.conflictingName, 'my_tool')
    console.log('  ✓ existing active tool → conflict returned')
  }

  // ── 3. Soft-deleted tools are not counted ─────────────────────────────────
  // The query passes `deletedAt: null` in the where clause; the mock simulates
  // the DB returning null (as it would for a soft-deleted record).
  console.log('\nTesting: soft-deleted tool is not a conflict')
  {
    // Mock simulates DB behaviour: deletedAt:null filter excludes the soft-deleted tool
    const db = makeMockDb(null)
    const result = await checkDuplicateToolName(db, 'server-1', 'deleted_tool')
    assert.strictEqual(result.isDuplicate, false)
    assert.strictEqual(result.conflictingName, null)
    console.log('  ✓ soft-deleted tool excluded → name is free to reuse')
  }

  // ── 4. excludeToolId: self-edit doesn't conflict ──────────────────────────
  // When editing tool-abc and the DB returns null (because id!=tool-abc filter applied)
  console.log('\nTesting: excludeToolId prevents self-conflict on update')
  {
    // Mock simulates DB returning null because of the `id: { not: excludeToolId }` filter
    const db = makeMockDb(null)
    const result = await checkDuplicateToolName(db, 'server-1', 'my_tool', 'tool-abc')
    assert.strictEqual(result.isDuplicate, false)
    assert.strictEqual(result.conflictingName, null)
    console.log('  ✓ excludeToolId matches self → no conflict (self-edit allowed)')
  }

  // ── 5. excludeToolId: different tool with same name IS a conflict ─────────
  console.log('\nTesting: excludeToolId does not skip a different conflicting tool')
  {
    // Mock simulates DB returning a different tool with same name (exclude didn't filter it out)
    const db = makeMockDb({ id: 'tool-xyz', name: 'my_tool' })
    const result = await checkDuplicateToolName(db, 'server-1', 'my_tool', 'tool-abc')
    assert.strictEqual(result.isDuplicate, true)
    assert.strictEqual(result.conflictingName, 'my_tool')
    console.log('  ✓ different tool with same name → conflict detected')
  }

  // ── 6. where clause structure includes required fields ────────────────────
  console.log('\nTesting: where clause includes serverId, name, deletedAt:null')
  {
    let capturedWhere: any = null
    const db = {
      tool: {
        findFirst: async (args: any) => {
          capturedWhere = args.where
          return null
        },
      },
    }
    await checkDuplicateToolName(db, 'server-99', 'the_tool', 'excluded-id')
    assert.strictEqual(capturedWhere.serverId, 'server-99')
    assert.strictEqual(capturedWhere.name, 'the_tool')
    assert.strictEqual(capturedWhere.deletedAt, null)
    assert.deepStrictEqual(capturedWhere.id, { not: 'excluded-id' })
    console.log('  ✓ where clause contains serverId, name, deletedAt:null, id.not exclusion')
  }

  // ── 7. where clause without excludeToolId has no id filter ────────────────
  console.log('\nTesting: no excludeToolId → no id filter in where clause')
  {
    let capturedWhere: any = null
    const db = {
      tool: {
        findFirst: async (args: any) => {
          capturedWhere = args.where
          return null
        },
      },
    }
    await checkDuplicateToolName(db, 'server-1', 'tool_a')
    assert.ok(!('id' in capturedWhere), 'id key must be absent when no excludeToolId')
    console.log('  ✓ no excludeToolId → id filter absent from where clause')
  }

  // ── 8. duplicateToolNameMessage format ────────────────────────────────────
  console.log('\nTesting: duplicateToolNameMessage format')
  {
    const msg = duplicateToolNameMessage('search_contacts')
    assert.ok(msg.includes('search_contacts'), 'message includes the name')
    assert.ok(msg.includes('already exists'), 'message mentions existing')
    console.log(`  ✓ message: "${msg}"`)
  }

  // ── 9. DUPLICATE_TOOL_NAME_CODE constant ─────────────────────────────────
  console.log('\nTesting: DUPLICATE_TOOL_NAME_CODE constant value')
  {
    assert.strictEqual(DUPLICATE_TOOL_NAME_CODE, 'DUPLICATE_TOOL_NAME')
    console.log(`  ✓ code: "${DUPLICATE_TOOL_NAME_CODE}"`)
  }

  // ── 10. Scenario: duplicate create is rejected ────────────────────────────
  // Simulates: tool "get_contacts" already exists (first create succeeded).
  // The DB (with partial unique index) would return the existing tool; the
  // pre-check catches it before even attempting the insert.
  console.log('\nTesting scenario: duplicate create is blocked')
  {
    // Simulate: first create succeeded, DB now has get_contacts active
    const dbWithExisting = makeMockDb({ id: 'tool-001', name: 'get_contacts' })
    const result = await checkDuplicateToolName(dbWithExisting, 'server-1', 'get_contacts')
    assert.strictEqual(result.isDuplicate, true, 'second create for same name should be a duplicate')
    assert.strictEqual(result.conflictingName, 'get_contacts')
    const msg = duplicateToolNameMessage('get_contacts')
    assert.ok(msg.includes('get_contacts'))
    console.log(`  ✓ duplicate create blocked: "${msg}"`)
  }

  // ── 11. Scenario: name reuse after soft-delete is allowed ────────────────
  // Simulates: tool "get_contacts" was soft-deleted (deletedAt != null).
  // The partial unique index WHERE deletedAt IS NULL means the old row is
  // invisible to uniqueness checks; the new create should succeed.
  // The mock returns null because the DB's WHERE filter excludes the deleted row.
  console.log('\nTesting scenario: name reuse after soft-delete is allowed')
  {
    // Simulate: deleted tool excluded by WHERE deletedAt IS NULL → findFirst → null
    const dbWithDeletedOnly = makeMockDb(null)
    const result = await checkDuplicateToolName(dbWithDeletedOnly, 'server-1', 'get_contacts')
    assert.strictEqual(result.isDuplicate, false, 'soft-deleted name should be reusable')
    assert.strictEqual(result.conflictingName, null)
    console.log('  ✓ name reuse after soft-delete allowed (deleted row excluded by partial index)')
  }

  console.log('\n🎉 ALL DUPLICATE TOOL NAME TESTS PASSED! 🎉')
}

runTests().catch(err => {
  console.error('\n❌ DUPLICATE TOOL NAME TESTS FAILED:', err)
  process.exit(1)
})
