import assert from 'assert'
import { prisma } from '../prisma'
import { logMcpToolActivity, McpToolActivityArgs } from './activity'

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

const baseTool = {
  id: 'tool-abc',
  name: 'search_contacts',
  serverId: 'server-xyz',
  fmMethod: 'find',
  category: 'Find',
}

function makeArgs(overrides: Partial<McpToolActivityArgs> = {}): McpToolActivityArgs {
  return {
    tool: baseTool,
    branchId: null,
    status: 'success',
    durationMs: 120,
    ...overrides,
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting MCP ActivityLog Tests...\n')

  try {
    // ── 1. Success: correct action and fields ─────────────────────────────
    console.log('Testing successful execution log...')
    {
      let captured: any = null
      mockPrismaMethod('activityLog', 'create', (opts: any) => {
        captured = opts.data
        return Promise.resolve({ id: 'log-1' })
      })

      await logMcpToolActivity(makeArgs({ status: 'success', durationMs: 230 }))

      assert.ok(captured, 'activityLog.create should be called')
      assert.strictEqual(captured.action, 'tool.executed')
      assert.strictEqual(captured.entityType, 'tool')
      assert.strictEqual(captured.entityId, 'tool-abc')
      assert.strictEqual(captured.entityName, 'search_contacts')
      assert.strictEqual(captured.serverId, 'server-xyz')
      assert.strictEqual(captured.branchId, null)

      const meta = JSON.parse(captured.meta)
      assert.strictEqual(meta.source, 'mcp')
      assert.strictEqual(meta.duration, 230)
      assert.strictEqual(meta.fmMethod, 'find')
      assert.strictEqual(meta.category, 'Find')
      assert.ok(!('error' in meta), 'meta should not contain error on success')

      console.log('  ✓ action = tool.executed')
      console.log('  ✓ entityType/entityId/entityName/serverId populated correctly')
      console.log('  ✓ meta contains source, duration, fmMethod, category')
      console.log('  ✓ meta does NOT contain error field on success')
    }

    // ── 2. Failure: correct action and error in meta ───────────────────────
    console.log('\nTesting failed execution log...')
    {
      let captured: any = null
      mockPrismaMethod('activityLog', 'create', (opts: any) => {
        captured = opts.data
        return Promise.resolve({ id: 'log-2' })
      })

      await logMcpToolActivity(makeArgs({
        status: 'error',
        durationMs: 45,
        errorMessage: 'FileMaker error 401: No records found',
      }))

      assert.strictEqual(captured.action, 'tool.execution_failed')

      const meta = JSON.parse(captured.meta)
      assert.strictEqual(meta.duration, 45)
      assert.strictEqual(meta.error, 'FileMaker error 401: No records found')

      console.log('  ✓ action = tool.execution_failed')
      console.log('  ✓ meta.error contains the sanitized error message')
    }

    // ── 3. branchId written when provided ─────────────────────────────────
    console.log('\nTesting branchId is written when provided...')
    {
      let captured: any = null
      mockPrismaMethod('activityLog', 'create', (opts: any) => {
        captured = opts.data
        return Promise.resolve({ id: 'log-3' })
      })

      await logMcpToolActivity(makeArgs({ branchId: 'branch-feat-123' }))

      assert.strictEqual(captured.branchId, 'branch-feat-123')
      console.log('  ✓ branchId persisted when present')
    }

    // ── 4. branchId is null when not provided ─────────────────────────────
    console.log('\nTesting branchId is null when not provided...')
    {
      let captured: any = null
      mockPrismaMethod('activityLog', 'create', (opts: any) => {
        captured = opts.data
        return Promise.resolve({ id: 'log-4' })
      })

      await logMcpToolActivity(makeArgs({ branchId: undefined }))

      assert.strictEqual(captured.branchId, null, 'branchId should be null when not provided')
      console.log('  ✓ branchId is null when omitted')
    }

    // ── 5. Long error message is truncated to 500 chars ───────────────────
    console.log('\nTesting long error message truncation...')
    {
      let captured: any = null
      mockPrismaMethod('activityLog', 'create', (opts: any) => {
        captured = opts.data
        return Promise.resolve({ id: 'log-5' })
      })

      const longError = 'E'.repeat(1000)
      await logMcpToolActivity(makeArgs({ status: 'error', errorMessage: longError }))

      const meta = JSON.parse(captured.meta)
      assert.strictEqual(meta.error.length, 500, 'Error message truncated to 500 chars')
      console.log('  ✓ Error message exceeding 500 chars is truncated')
    }

    // ── 6. Null fmMethod and category stored as null ───────────────────────
    console.log('\nTesting null fmMethod and category...')
    {
      let captured: any = null
      mockPrismaMethod('activityLog', 'create', (opts: any) => {
        captured = opts.data
        return Promise.resolve({ id: 'log-6' })
      })

      await logMcpToolActivity(makeArgs({
        tool: { ...baseTool, fmMethod: null, category: null },
      }))

      const meta = JSON.parse(captured.meta)
      assert.strictEqual(meta.fmMethod, null)
      assert.strictEqual(meta.category, null)
      console.log('  ✓ null fmMethod and category stored as null (not undefined)')
    }

    // ── 7. DB failure does not propagate (caller's .catch() responsibility) ─
    console.log('\nTesting that DB errors propagate as rejected promise...')
    {
      mockPrismaMethod('activityLog', 'create', () =>
        Promise.reject(new Error('Connection timeout'))
      )

      let threw = false
      try {
        await logMcpToolActivity(makeArgs())
        // logMcpToolActivity itself propagates the rejection —
        // callers are responsible for .catch()
        threw = false
      } catch {
        threw = true
      }
      assert.strictEqual(threw, true, 'DB error should propagate so callers can catch it')
      console.log('  ✓ DB error propagates — callers must .catch() to suppress')
    }

    console.log('\n🎉 ALL MCP ACTIVITYLOG TESTS PASSED! 🎉')
  } finally {
    restorePrismaMocks()
  }
}

runTests().catch((err) => {
  console.error('\n❌ MCP ACTIVITYLOG TESTS FAILED:', err)
  process.exit(1)
})
