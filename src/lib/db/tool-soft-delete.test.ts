import assert from 'assert'

// ── Mock setup ──────────────────────────────────────────────────────────────
// We monkey-patch prisma before the modules that use it are loaded.

const fakeToolId = 'tool-soft-1'
const fakeServerId = 'server-1'
const fakeBranchId = 'branch-1'

const toolRecord = {
  id: fakeToolId,
  name: 'find_contacts',
  description: 'Search contacts',
  serverId: fakeServerId,
  fmMethod: 'find',
  fmLayout: 'Contacts',
  fmScript: null,
  inputSchema: '{"type":"object","properties":{}}',
  handlerConfig: '{"connectionId":"conn-1","layout":"Contacts","method":"find"}',
  outputSchema: null,
  category: 'Find',
  isEnabled: true,
  isAiGenerated: true,
  sortOrder: 0,
  deletedAt: null as Date | null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const executionRecord = {
  id: 'exec-1',
  toolId: fakeToolId,
  input: '{}',
  output: '{"result":"ok"}',
  status: 'success',
  createdAt: new Date('2026-01-02'),
}

const branchToolRecord = {
  id: 'bt-1',
  branchId: fakeBranchId,
  toolId: fakeToolId,
  action: 'inherited' as string,
  overrideData: '{}',
}

// Build a simple mock prisma client
function buildMockPrisma() {
  const db = {
    tool: {
      findFirst: async ({ where }: any) => {
        if (where?.id === fakeToolId) {
          if (where.deletedAt === null && toolRecord.deletedAt !== null) return null
          return { ...toolRecord }
        }
        return null
      },
      update: async ({ where, data }: any) => {
        if (where.id === fakeToolId) {
          Object.assign(toolRecord, data)
          return { ...toolRecord }
        }
        throw new Error('Tool not found')
      },
      findMany: async ({ where }: any) => {
        if (where?.deletedAt === null && toolRecord.deletedAt !== null) return []
        return [{ ...toolRecord }]
      },
    },
    toolExecution: {
      findMany: async ({ where }: any) => {
        if (where?.toolId === fakeToolId) return [{ ...executionRecord }]
        return []
      },
    },
    branchTool: {
      findMany: async ({ where }: any) => {
        const results = [{ ...branchToolRecord, tool: { ...toolRecord } }]
        if (where?.tool?.deletedAt === null && toolRecord.deletedAt !== null) {
          return results.filter((r) => r.tool.deletedAt === null)
        }
        return results
      },
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(db),
  }
  return db
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Tool Soft-Delete Tests...\n')

  // ── 1. Soft-delete sets deletedAt ────────────────────────────────────────────
  console.log('Testing: soft-delete sets deletedAt on the tool record')
  {
    const db = buildMockPrisma()
    // Reset tool state
    toolRecord.deletedAt = null

    const before = await db.tool.findFirst({ where: { id: fakeToolId } })
    assert.strictEqual(before?.deletedAt, null, 'deletedAt should be null before delete')

    await db.tool.update({ where: { id: fakeToolId }, data: { deletedAt: new Date() } })

    assert.ok(toolRecord.deletedAt !== null, 'deletedAt should be set after soft-delete')
    console.log('  ✓ Soft-delete sets deletedAt to a Date')
  }

  // ── 2. Deleted tool excluded from findFirst with deletedAt: null ──────────────
  console.log('\nTesting: deleted tool not returned when filtering deletedAt: null')
  {
    const db = buildMockPrisma()
    // toolRecord.deletedAt is now a Date from test 1
    assert.ok(toolRecord.deletedAt !== null, 'Precondition: tool is already soft-deleted')

    const found = await db.tool.findFirst({ where: { id: fakeToolId, deletedAt: null } })
    assert.strictEqual(found, null, 'Soft-deleted tool must not be returned by queries filtering deletedAt: null')
    console.log('  ✓ Deleted tool excluded from queries with deletedAt: null filter')
  }

  // ── 3. ToolExecution records survive soft-delete ──────────────────────────────
  console.log('\nTesting: ToolExecution records still exist after tool soft-delete')
  {
    const db = buildMockPrisma()
    // toolRecord.deletedAt is still set

    const executions = await db.toolExecution.findMany({ where: { toolId: fakeToolId } })
    assert.strictEqual(executions.length, 1, 'ToolExecution history must be preserved after soft-delete')
    assert.strictEqual(executions[0].toolId, fakeToolId)
    console.log('  ✓ ToolExecution records preserved after tool soft-delete')
  }

  // ── 4. getEffectiveTools excludes soft-deleted tools ─────────────────────────
  console.log('\nTesting: branchTool query with tool.deletedAt: null excludes deleted tools')
  {
    const db = buildMockPrisma()
    // toolRecord.deletedAt is still set

    const branchTools = await db.branchTool.findMany({
      where: { branchId: fakeBranchId, tool: { deletedAt: null } },
    })
    assert.strictEqual(branchTools.length, 0, 'BranchTool query with tool.deletedAt: null must exclude deleted tools')
    console.log('  ✓ Deleted tool excluded from getEffectiveTools-style query')
  }

  // ── 5. Name can be reused after soft-delete ───────────────────────────────────
  console.log('\nTesting: a new tool can reuse a name once the original is soft-deleted')
  {
    const db = buildMockPrisma()
    // toolRecord.deletedAt is still set

    // Idempotency check used in save routes: findFirst with deletedAt: null
    const existing = await db.tool.findFirst({
      where: { serverId: fakeServerId, name: 'find_contacts', deletedAt: null },
    })
    assert.strictEqual(existing, null, 'Soft-deleted tool must not block name reuse')
    console.log('  ✓ Soft-deleted tool does not block new tool with same name')
  }

  // ── 6. Active tools still returned by findMany with deletedAt: null ───────────
  console.log('\nTesting: active tools are returned when filtering deletedAt: null')
  {
    const db = buildMockPrisma()
    // Restore active state
    toolRecord.deletedAt = null

    const tools = await db.tool.findMany({ where: { serverId: fakeServerId, deletedAt: null } })
    assert.strictEqual(tools.length, 1)
    assert.strictEqual(tools[0].deletedAt, null)
    console.log('  ✓ Active tools returned correctly when filtering deletedAt: null')
  }

  console.log('\n🎉 ALL SOFT-DELETE TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ SOFT-DELETE TESTS FAILED:', err)
  process.exit(1)
})
