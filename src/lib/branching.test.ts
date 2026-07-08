import assert from 'assert'
import { prisma } from './prisma'
import { resolveServerBranch, getEffectiveTools, applyOverride } from './branching'

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

const MAIN_BRANCH = { id: 'branch-main', name: 'main', serverId: 'server-1', isDefault: true }
const FEAT_BRANCH = { id: 'branch-feat', name: 'feature/new-tools', serverId: 'server-1', isDefault: false }

// A minimal BranchTool row with a base Tool and no override
function branchTool(overrides: Partial<{
  id: string
  branchId: string
  action: string
  overrideData: string
  toolName: string
  toolDescription: string
  toolDeletedAt: Date | null
  toolInputSchema: string
  toolHandlerConfig: string
}> = {}) {
  const {
    id = 'bt-1',
    branchId = MAIN_BRANCH.id,
    action = 'inherited',
    overrideData = '{}',
    toolName = 'search_contacts',
    toolDescription = 'Find contacts',
    toolDeletedAt = null,
    toolInputSchema = '{"type":"object","properties":{}}',
    toolHandlerConfig = '{}',
  } = overrides
  return {
    id,
    branchId,
    action,
    overrideData,
    createdAt: new Date(),
    tool: {
      id: `tool-${id}`,
      name: toolName,
      description: toolDescription,
      deletedAt: toolDeletedAt,
      fmMethod: 'find',
      isEnabled: true,
      inputSchema: toolInputSchema,
      handlerConfig: toolHandlerConfig,
      server: { connections: [] },
    },
  }
}

// ── resolveServerBranch tests ─────────────────────────────────────────────────

async function testResolveServerBranch() {
  console.log('Testing resolveServerBranch...')

  // 1. Preferred branch belongs to server → return it
  {
    mockPrismaMethod('branch', 'findFirst', (opts: any) => {
      if (opts.where.id === FEAT_BRANCH.id) return Promise.resolve(FEAT_BRANCH)
      return Promise.resolve(null)
    })

    const result = await resolveServerBranch('server-1', 'branch-feat')
    assert.ok(result, 'Should find preferred branch')
    assert.strictEqual(result.id, FEAT_BRANCH.id, 'Should return the preferred branch')
    assert.strictEqual(result.isDefault, false, 'Returned branch should be non-default')
    console.log('  ✓ Preferred branch found → returns it')
  }

  // 2. Preferred branch not found (wrong server / wrong id) → falls back to default
  {
    let callCount = 0
    mockPrismaMethod('branch', 'findFirst', (opts: any) => {
      callCount++
      if (opts.where.id) return Promise.resolve(null) // preferred not found
      return Promise.resolve(MAIN_BRANCH)              // default lookup
    })

    const result = await resolveServerBranch('server-1', 'branch-nonexistent')
    assert.ok(result, 'Should fall back to default branch')
    assert.strictEqual(result.id, MAIN_BRANCH.id, 'Should return main branch as fallback')
    assert.strictEqual(callCount, 2, 'Should have made two DB calls (preferred + default)')
    console.log('  ✓ Preferred branch not found → falls back to default')
  }

  // 3. No preferred branch given → returns default immediately
  {
    let callCount = 0
    mockPrismaMethod('branch', 'findFirst', (opts: any) => {
      callCount++
      assert.ok(!opts.where.id, 'Should query by isDefault, not by id')
      return Promise.resolve(MAIN_BRANCH)
    })

    const result = await resolveServerBranch('server-1', null)
    assert.ok(result, 'Should return default branch')
    assert.strictEqual(result.id, MAIN_BRANCH.id)
    assert.strictEqual(callCount, 1, 'Should make exactly one DB call')
    console.log('  ✓ No preferred branch → returns default in one DB call')
  }

  // 4. No branches at all → returns null
  {
    mockPrismaMethod('branch', 'findFirst', () => Promise.resolve(null))

    const result = await resolveServerBranch('server-empty', null)
    assert.strictEqual(result, null, 'Should return null when no branches exist')
    console.log('  ✓ No branches → returns null gracefully')
  }
}

// ── getEffectiveTools tests ───────────────────────────────────────────────────

async function testGetEffectiveTools() {
  console.log('\nTesting getEffectiveTools...')

  // 1. Main branch: inherited tools, no overrides → base tool returned as-is
  {
    const bt = branchTool({ action: 'inherited', overrideData: '{}' })
    mockPrismaMethod('branchTool', 'findMany', () => Promise.resolve([bt]))

    const tools = await getEffectiveTools(MAIN_BRANCH.id)
    assert.strictEqual(tools.length, 1, 'Should return one tool')
    assert.strictEqual(tools[0].name, 'search_contacts', 'Name should be from base tool')
    assert.strictEqual(tools[0].description, 'Find contacts', 'Description should be from base tool')
    console.log('  ✓ Main branch: inherited tool returned with base data')
  }

  // 2. Feature branch: modified tool → override fields merged over base
  {
    const bt = branchTool({
      action: 'modified',
      overrideData: JSON.stringify({ description: 'Updated description', isEnabled: false }),
    })
    mockPrismaMethod('branchTool', 'findMany', () => Promise.resolve([bt]))

    const tools = await getEffectiveTools(FEAT_BRANCH.id)
    assert.strictEqual(tools.length, 1)
    assert.strictEqual(tools[0].name, 'search_contacts', 'Name unchanged (not in override)')
    assert.strictEqual(tools[0].description, 'Updated description', 'Description overridden')
    assert.strictEqual(tools[0].isEnabled, false, 'isEnabled overridden')
    console.log('  ✓ Feature branch: override fields applied on top of base')
  }

  // 3. Deleted tool excluded from results
  {
    const bt = branchTool({ action: 'deleted' })
    // The query filters action != 'deleted' at DB level; simulate that filter
    mockPrismaMethod('branchTool', 'findMany', (opts: any) => {
      const actionFilter = opts?.where?.action
      if (actionFilter?.not === 'deleted') return Promise.resolve([]) // deleted excluded
      return Promise.resolve([bt])
    })

    const tools = await getEffectiveTools(FEAT_BRANCH.id)
    assert.strictEqual(tools.length, 0, 'Deleted tool should not appear')
    console.log('  ✓ Deleted tool excluded from effective tool list')
  }

  // 4. Multiple tools: mix of inherited and modified
  {
    const bt1 = branchTool({ id: 'bt-1', toolName: 'find_contacts', action: 'inherited', overrideData: '{}' })
    const bt2 = branchTool({
      id: 'bt-2',
      toolName: 'create_contact',
      action: 'modified',
      overrideData: JSON.stringify({ description: 'Branch-specific create' }),
    })
    mockPrismaMethod('branchTool', 'findMany', () => Promise.resolve([bt1, bt2]))

    const tools = await getEffectiveTools(FEAT_BRANCH.id)
    assert.strictEqual(tools.length, 2)
    assert.strictEqual(tools[0].name, 'find_contacts')
    assert.strictEqual(tools[0].description, 'Find contacts')
    assert.strictEqual(tools[1].name, 'create_contact')
    assert.strictEqual(tools[1].description, 'Branch-specific create', 'Override applied to second tool')
    console.log('  ✓ Mixed inherited + modified tools resolved correctly')
  }

  // 5. Invalid overrideData JSON → treated as empty override, base tool intact
  {
    const bt = branchTool({ action: 'modified', overrideData: 'NOT VALID JSON {{{' })
    mockPrismaMethod('branchTool', 'findMany', () => Promise.resolve([bt]))

    const tools = await getEffectiveTools(FEAT_BRANCH.id)
    assert.strictEqual(tools.length, 1)
    assert.strictEqual(tools[0].name, 'search_contacts', 'Base tool name preserved on bad JSON')
    console.log('  ✓ Malformed overrideData falls back to base tool unchanged')
  }

  // 6. Re-added soft-deleted tool: visible on feature branch (pre-merge)
  //    The DB query must use an OR clause so action='added' BranchTools bypass the
  //    deletedAt: null filter. This test verifies the OR clause is present in the
  //    WHERE args and that the re-added tool reaches getEffectiveTools output.
  {
    const softDeletedTool = branchTool({
      id: 'bt-readd',
      action: 'added',
      toolName: 'restored_tool',
      toolDeletedAt: new Date(), // soft-deleted on main
    })

    mockPrismaMethod('branchTool', 'findMany', (opts: any) => {
      const orClauses: any[] | undefined = opts?.where?.OR
      // Regression guard: verify the query has an OR clause that includes action='added'.
      // Without it, the old query had tool:{deletedAt:null} as a flat condition and would
      // exclude the re-added tool at the DB level.
      const hasAddedBypass = orClauses?.some((c: any) => c.action === 'added')
      assert.ok(
        hasAddedBypass,
        'getEffectiveTools query must have OR[{action:"added"}, {tool:{deletedAt:null}}] so re-added soft-deleted tools are not filtered out'
      )
      // Simulate DB returning the re-added tool (action='added' matches the OR clause)
      return Promise.resolve([softDeletedTool])
    })

    const tools = await getEffectiveTools(FEAT_BRANCH.id)
    assert.strictEqual(tools.length, 1, 'Re-added soft-deleted tool should be visible on feature branch')
    assert.strictEqual(tools[0].name, 'restored_tool')
    console.log('  ✓ Re-added soft-deleted tool is visible on feature branch (OR clause present, deletedAt bypassed)')
  }

  // 7. Post-merge: after deletedAt is cleared the tool is visible as inherited on main
  //    After merge, the merge route sets deletedAt=null and the BranchTool on main
  //    gets action='inherited'. getEffectiveTools should include it via the
  //    {tool:{deletedAt:null}} branch of the OR.
  {
    const restoredTool = branchTool({
      id: 'bt-post-merge',
      branchId: MAIN_BRANCH.id,
      action: 'inherited',
      toolName: 'restored_tool',
      toolDeletedAt: null, // cleared by merge route
    })

    mockPrismaMethod('branchTool', 'findMany', (opts: any) => {
      // Simulate DB returning the tool because deletedAt is now null
      return Promise.resolve([restoredTool])
    })

    const tools = await getEffectiveTools(MAIN_BRANCH.id)
    assert.strictEqual(tools.length, 1, 'Tool should be visible on main after merge clears deletedAt')
    assert.strictEqual(tools[0].name, 'restored_tool')
    assert.strictEqual(tools[0].deletedAt, null, 'deletedAt should be null post-merge')
    console.log('  ✓ Post-merge: restored tool visible on main (deletedAt cleared, action=inherited)')
  }

  // ── applyOverride / deep-merge tests ─────────────────────────────────────

  // 8. Partial inputSchema override preserves base schema properties
  //    Base has name + email properties; override adds phone only.
  //    All three properties must survive in the merged result.
  {
    const baseInputSchema = JSON.stringify({
      type: 'object',
      properties: {
        name:  { type: 'string' },
        email: { type: 'string' },
      },
      required: ['name'],
    })
    const partialOverrideSchema = JSON.stringify({
      properties: {
        phone: { type: 'string' },
      },
    })

    const bt = branchTool({
      id: 'bt-schema',
      action: 'modified',
      toolInputSchema: baseInputSchema,
      overrideData: JSON.stringify({ inputSchema: partialOverrideSchema }),
    })
    mockPrismaMethod('branchTool', 'findMany', () => Promise.resolve([bt]))

    const tools = await getEffectiveTools(FEAT_BRANCH.id)
    assert.strictEqual(tools.length, 1)
    const schema = JSON.parse(tools[0].inputSchema as string)
    assert.ok(schema.properties.name,  'base property "name" preserved')
    assert.ok(schema.properties.email, 'base property "email" preserved')
    assert.ok(schema.properties.phone, 'override property "phone" added')
    assert.deepStrictEqual(schema.required, ['name'], '"required" from base preserved (no union for arrays)')
    console.log('  ✓ Partial inputSchema override: base properties preserved, override property added')
  }

  // 9. Partial handlerConfig override preserves connectionId
  //    Base carries connectionId + layout + method; override changes only layout.
  {
    const baseHandlerConfig = JSON.stringify({
      connectionId: 'conn_abc',
      layout: 'Contacts',
      method: 'find',
    })
    const partialOverrideConfig = JSON.stringify({ layout: 'New Layouts' })

    const bt = branchTool({
      id: 'bt-hconfig',
      action: 'modified',
      toolHandlerConfig: baseHandlerConfig,
      overrideData: JSON.stringify({ handlerConfig: partialOverrideConfig }),
    })
    mockPrismaMethod('branchTool', 'findMany', () => Promise.resolve([bt]))

    const tools = await getEffectiveTools(FEAT_BRANCH.id)
    const config = JSON.parse(tools[0].handlerConfig as string)
    assert.strictEqual(config.connectionId, 'conn_abc', 'connectionId preserved from base')
    assert.strictEqual(config.layout, 'New Layouts', 'layout replaced by override')
    assert.strictEqual(config.method, 'find', 'method preserved from base')
    console.log('  ✓ Partial handlerConfig override: connectionId and method preserved, layout overridden')
  }

  // 10. Invalid JSON in override field → getEffectiveTools rejects visibly
  //     A corrupt inner field (valid outer JSON, invalid field value) must fail
  //     loudly rather than silently serving truncated tool data to AI agents.
  {
    const bt = branchTool({
      id: 'bt-corrupt-field',
      action: 'modified',
      overrideData: JSON.stringify({ inputSchema: 'NOT VALID JSON {{{' }),
    })
    mockPrismaMethod('branchTool', 'findMany', () => Promise.resolve([bt]))

    await assert.rejects(
      () => getEffectiveTools(FEAT_BRANCH.id),
      (err: Error) => {
        assert.ok(
          err.message.includes('inputSchema'),
          `Error should name the bad field; got: ${err.message}`,
        )
        return true
      },
      'Should throw for invalid JSON in an override JSON-merge field',
    )
    console.log('  ✓ Invalid JSON inside override field throws visibly (not silently broken)')
  }

  // 11. Scalar fields (name, description) are still fully replaced, not merged
  {
    const result = applyOverride(
      { name: 'old_name', description: 'original', fmMethod: 'find' },
      { name: 'new_name' },
    )
    assert.strictEqual(result.name, 'new_name',   'name replaced by override')
    assert.strictEqual(result.description, 'original', 'description from base kept (not in override)')
    assert.strictEqual(result.fmMethod, 'find',   'fmMethod from base kept (not in override)')
    console.log('  ✓ Scalar fields replaced; non-overridden base fields preserved')
  }
}

// ── runner ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Branching Logic Tests...\n')

  try {
    await testResolveServerBranch()
    await testGetEffectiveTools()
    console.log('\n🎉 ALL BRANCHING TESTS PASSED! 🎉')
  } finally {
    restorePrismaMocks()
  }
}

runTests().catch((err) => {
  console.error('\n❌ BRANCHING TESTS FAILED:', err)
  process.exit(1)
})
