import assert from 'assert'
import { createToolWithBranch } from './create-tool-with-branch'

// ── fixtures ──────────────────────────────────────────────────────────────────

const toolData = {
  name: 'find_contacts',
  description: 'Search contacts',
  inputSchema: '{"type":"object","properties":{}}',
  handlerConfig: '{"connectionId":"conn-1","layout":"Contacts","method":"find"}',
  fmMethod: 'find',
  fmLayout: 'Contacts',
  fmScript: null,
  outputSchema: '{"type":"object"}',
  category: 'Find',
  isEnabled: true,
  isAiGenerated: true,
  serverId: 'server-1',
}

const mockTool = { id: 'tool-1', ...toolData }
const mockBranchTool = { id: 'bt-1', branchId: 'branch-1', toolId: 'tool-1', action: 'added', overrideData: '{}' }

// Helper that builds a mock prisma client running the tx callback in-process
function mockClient(toolCreate: (arg?: any) => Promise<any>, branchToolCreate: (arg?: any) => Promise<any>) {
  return {
    $transaction: async (fn: (tx: any) => Promise<any>) =>
      fn({
        tool: { create: toolCreate },
        branchTool: { create: branchToolCreate },
      }),
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting createToolWithBranch Transaction Tests...\n')

  // ── 1. Happy path: both records returned ─────────────────────────────────────
  console.log('Testing: happy path — tool and branchTool both created')
  {
    const client = mockClient(async () => mockTool, async () => mockBranchTool)
    const result = await createToolWithBranch(client, toolData, 'branch-1')
    assert.strictEqual(result.tool.id, 'tool-1')
    assert.strictEqual(result.branchTool.id, 'bt-1')
    assert.strictEqual(result.branchTool.toolId, result.tool.id)
    console.log('  ✓ Returns { tool, branchTool } on success')
  }

  // ── 2. BranchTool failure rolls back (error propagates) ───────────────────────
  console.log('\nTesting: branchTool.create failure propagates — no orphaned Tool in real DB')
  {
    const client = mockClient(
      async () => mockTool,
      async () => { throw new Error('unique constraint on branchTool') },
    )
    let threw = false
    try {
      await createToolWithBranch(client, toolData, 'branch-1')
    } catch (e: any) {
      threw = true
      assert.ok(e.message.includes('unique constraint'), `Unexpected error: ${e.message}`)
    }
    assert.ok(threw, 'Should throw when branchTool.create fails')
    console.log('  ✓ Error from branchTool.create propagates — $transaction rolls back Tool in real DB')
  }

  // ── 3. Tool failure propagates before branchTool is attempted ─────────────────
  console.log('\nTesting: tool.create failure propagates before branchTool is attempted')
  {
    let branchToolCalled = false
    const client = mockClient(
      async () => { throw new Error('tool name conflict') },
      async () => { branchToolCalled = true; return mockBranchTool },
    )
    let threw = false
    try {
      await createToolWithBranch(client, toolData, 'branch-1')
    } catch (e: any) {
      threw = true
      assert.ok(e.message.includes('tool name conflict'))
    }
    assert.ok(threw, 'Should throw when tool.create fails')
    assert.strictEqual(branchToolCalled, false, 'branchTool.create must not be called when tool.create throws')
    console.log('  ✓ Error from tool.create propagates; branchTool.create never called')
  }

  // ── 4. Default action is "added", overrideData is "{}" ───────────────────────
  console.log('\nTesting: default action is "added" and overrideData is "{}"')
  {
    let capturedBranchToolData: any = null
    const client = mockClient(
      async () => mockTool,
      async ({ data }: any) => { capturedBranchToolData = data; return mockBranchTool },
    )
    await createToolWithBranch(client, toolData, 'branch-1')
    assert.strictEqual(capturedBranchToolData.action, 'added')
    assert.strictEqual(capturedBranchToolData.overrideData, '{}')
    assert.strictEqual(capturedBranchToolData.branchId, 'branch-1')
    assert.strictEqual(capturedBranchToolData.toolId, mockTool.id)
    console.log('  ✓ Default action "added", overrideData "{}", branchId and toolId correct')
  }

  // ── 5. Custom action and overrideData are forwarded ───────────────────────────
  console.log('\nTesting: custom action and overrideData forwarded to branchTool.create')
  {
    let capturedBranchToolData: any = null
    const client = mockClient(
      async () => mockTool,
      async ({ data }: any) => { capturedBranchToolData = data; return mockBranchTool },
    )
    const override = JSON.stringify({ fmMethod: 'list', fmLayout: 'ContactsV2' })
    await createToolWithBranch(client, toolData, 'branch-2', { action: 'modified', overrideData: override })
    assert.strictEqual(capturedBranchToolData.action, 'modified')
    assert.strictEqual(capturedBranchToolData.overrideData, override)
    assert.strictEqual(capturedBranchToolData.branchId, 'branch-2')
    console.log('  ✓ Custom action and overrideData forwarded correctly')
  }

  // ── 6. toolId in BranchTool matches created tool id ───────────────────────────
  console.log('\nTesting: branchTool.toolId always matches the just-created tool.id')
  {
    const dynamicTool = { ...mockTool, id: 'tool-xyz-999' }
    let capturedToolId: string | null = null
    const client = mockClient(
      async () => dynamicTool,
      async ({ data }: any) => { capturedToolId = data.toolId; return { ...mockBranchTool, toolId: data.toolId } },
    )
    const result = await createToolWithBranch(client, toolData, 'branch-1')
    assert.strictEqual(capturedToolId, 'tool-xyz-999')
    assert.strictEqual(result.branchTool.toolId, result.tool.id)
    console.log('  ✓ branchTool.toolId is always the freshly-created tool.id')
  }

  // ── 7. Partial failure: branchTool error → caller receives no tool reference ───
  // Regression test: proves no orphaned Tool escapes to the caller when
  // branchTool.create fails. The transaction must throw, not return { tool, null }.
  console.log('\nTesting: branchTool failure → result is an error, not { tool, branchTool: null }')
  {
    let toolCreatedInsideTx: any = null
    const client = mockClient(
      async () => { toolCreatedInsideTx = mockTool; return mockTool },
      async () => { throw new Error('branchTool FK violation') },
    )
    let caughtError: Error | null = null
    let result: any = undefined
    try {
      result = await createToolWithBranch(client, toolData, 'branch-1')
    } catch (e: any) {
      caughtError = e
    }
    // tool.create ran inside the tx (mock tracks this)
    assert.ok(toolCreatedInsideTx, 'tool.create was called inside the tx')
    // but the error escaped — the caller has no result
    assert.ok(caughtError !== null, 'Error must propagate — no partial result returned')
    assert.strictEqual(result, undefined, 'result must be undefined — caller must not see the Tool')
    assert.ok(caughtError!.message.includes('branchTool FK violation'))
    console.log('  ✓ Partial failure: caller receives error, not orphaned tool reference')
  }

  // ── 8. Both ops run inside a single $transaction callback ────────────────────
  // Regression test: proves tool.create and branchTool.create are called within
  // the same tx callback, not in separate transactions.
  console.log('\nTesting: both creates run inside one $transaction callback')
  {
    let txCallCount = 0
    let toolCalledInTx = false
    let branchToolCalledInTx = false
    const client = {
      $transaction: async (fn: (tx: any) => Promise<any>) => {
        txCallCount++
        return fn({
          tool: { create: async () => { toolCalledInTx = true; return mockTool } },
          branchTool: { create: async () => { branchToolCalledInTx = true; return mockBranchTool } },
        })
      },
    }
    await createToolWithBranch(client, toolData, 'branch-1')
    assert.strictEqual(txCallCount, 1, '$transaction must be called exactly once')
    assert.ok(toolCalledInTx, 'tool.create must be called inside the transaction')
    assert.ok(branchToolCalledInTx, 'branchTool.create must be called inside the same transaction')
    console.log('  ✓ Both creates happen inside a single $transaction callback')
  }

  // ── 9. Tool failure: caller receives no BranchTool either ────────────────────
  // Regression test: when tool.create fails, branchTool.create is never attempted,
  // and the caller receives an error (not a partial { null, branchTool } tuple).
  console.log('\nTesting: tool.create failure → branchTool.create never runs, caller gets error')
  {
    let branchToolAttempted = false
    const client = mockClient(
      async () => { throw new Error('tool unique constraint') },
      async () => { branchToolAttempted = true; return mockBranchTool },
    )
    let caughtError: Error | null = null
    let result: any = undefined
    try {
      result = await createToolWithBranch(client, toolData, 'branch-1')
    } catch (e: any) {
      caughtError = e
    }
    assert.ok(caughtError !== null, 'Error must propagate')
    assert.strictEqual(result, undefined, 'caller must not see any result')
    assert.strictEqual(branchToolAttempted, false, 'branchTool.create must never run — no orphaned BranchTool')
    console.log('  ✓ Tool failure → zero DB writes attempted for BranchTool, caller gets error')
  }

  // ── 10. Concurrent-create regression: P2002 propagates with code intact ────────
  // When two concurrent POSTs race past the (now-removed) pre-check and both
  // reach tool.create, the DB unique constraint fires a Prisma P2002 on the
  // second write. The route handler catches `error?.code === 'P2002'` and
  // returns 409. This test verifies that createToolWithBranch does NOT swallow
  // the error and that the P2002 code survives the transaction boundary.
  console.log('\nTesting: P2002 from tool.create propagates with code intact (concurrent-create regression)')
  {
    const p2002 = Object.assign(new Error('Unique constraint failed on: (serverId, name)'), { code: 'P2002' })
    const client = mockClient(
      async () => { throw p2002 },
      async () => mockBranchTool,
    )
    let caughtError: any = null
    try {
      await createToolWithBranch(client, toolData, 'branch-1')
    } catch (e: any) {
      caughtError = e
    }
    assert.ok(caughtError !== null, 'Error must propagate out of createToolWithBranch')
    assert.strictEqual(caughtError.code, 'P2002', 'error.code must be P2002 so route handler can catch it')
    console.log('  ✓ P2002 from tool.create propagates with code intact — route handler catches it correctly')
  }

  console.log('\n🎉 ALL CREATE-TOOL-WITH-BRANCH TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ CREATE-TOOL-WITH-BRANCH TESTS FAILED:', err)
  process.exit(1)
})
