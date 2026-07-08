import assert from 'assert'
import { prisma } from '../prisma'
import { logApiKeyActivity } from './activity'

// ── mock helpers ──────────────────────────────────────────────────────────────

const savedMethods: Record<string, any> = {}

function mockMethod(model: string, method: string, impl: (...a: any[]) => any) {
  const m = (prisma as any)[model]
  const key = `${model}.${method}`
  if (!savedMethods[key]) savedMethods[key] = m[method]
  m[method] = impl
}

function restoreMocks() {
  for (const [key, original] of Object.entries(savedMethods)) {
    const [model, method] = key.split('.')
    ;(prisma as any)[model][method] = original
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting API Key ActivityLog Tests...\n')

  try {

    // ── 1. api-key.generated → correct fields ─────────────────────────────────
    console.log('Testing: api-key.generated writes correct ActivityLog fields')
    {
      let captured: any = null
      mockMethod('activityLog', 'create', (opts: any) => {
        captured = opts.data
        return Promise.resolve({ id: 'log-1' })
      })

      await logApiKeyActivity({
        serverId: 'server-abc',
        serverName: 'My CRM Server',
        action: 'api-key.generated',
        keyPrefix: 'mcp_a1b2c3',
      })

      assert.ok(captured, 'activityLog.create must be called')
      assert.strictEqual(captured.action, 'api-key.generated')
      assert.strictEqual(captured.entityType, 'api-key')
      assert.strictEqual(captured.entityId, 'server-abc')
      assert.strictEqual(captured.entityName, 'My CRM Server')
      assert.strictEqual(captured.serverId, 'server-abc')

      const meta = JSON.parse(captured.meta)
      assert.strictEqual(meta.keyPrefix, 'mcp_a1b2c3')
      console.log('  ✓ api-key.generated — action, entityType, entityId, entityName, serverId correct')
    }

    // ── 2. api-key.rotated → correct action ───────────────────────────────────
    console.log('\nTesting: api-key.rotated writes correct action')
    {
      let capturedAction = ''
      mockMethod('activityLog', 'create', (opts: any) => {
        capturedAction = opts.data.action
        return Promise.resolve({ id: 'log-2' })
      })

      await logApiKeyActivity({
        serverId: 'server-abc',
        serverName: 'My CRM Server',
        action: 'api-key.rotated',
        keyPrefix: 'mcp_d4e5f6',
      })

      assert.strictEqual(capturedAction, 'api-key.rotated')
      console.log('  ✓ api-key.rotated action persisted correctly')
    }

    // ── 3. api-key.revoked → correct action + keyPrefix ───────────────────────
    console.log('\nTesting: api-key.revoked writes correct action and keyPrefix')
    {
      let captured: any = null
      mockMethod('activityLog', 'create', (opts: any) => {
        captured = opts.data
        return Promise.resolve({ id: 'log-3' })
      })

      await logApiKeyActivity({
        serverId: 'server-xyz',
        serverName: 'Analytics Server',
        action: 'api-key.revoked',
        keyPrefix: 'mcp_g7h8i9',
      })

      assert.strictEqual(captured.action, 'api-key.revoked')
      assert.strictEqual(captured.entityName, 'Analytics Server')
      const meta = JSON.parse(captured.meta)
      assert.strictEqual(meta.keyPrefix, 'mcp_g7h8i9')
      console.log('  ✓ api-key.revoked — action and keyPrefix correct')
    }

    // ── 4. Raw key is never in meta ────────────────────────────────────────────
    console.log('\nTesting: meta never contains raw API key (only keyPrefix)')
    {
      let captured: any = null
      mockMethod('activityLog', 'create', (opts: any) => {
        captured = opts.data
        return Promise.resolve({ id: 'log-4' })
      })

      await logApiKeyActivity({
        serverId: 'server-abc',
        serverName: 'Test Server',
        action: 'api-key.generated',
        keyPrefix: 'mcp_a1b2c3',
      })

      const meta = JSON.parse(captured.meta)
      const metaKeys = Object.keys(meta)
      // meta must contain keyPrefix but nothing that looks like a full raw key
      assert.ok(metaKeys.includes('keyPrefix'), 'meta must include keyPrefix')
      assert.ok(!metaKeys.includes('rawKey'), 'meta must NOT include rawKey')
      assert.ok(!metaKeys.includes('key'), 'meta must NOT include key')
      assert.ok(!metaKeys.includes('keyHash'), 'meta must NOT include keyHash')
      // The keyPrefix itself should be short (≤12 chars as coded)
      assert.ok(meta.keyPrefix.length <= 12,
        `keyPrefix must be ≤12 chars (got ${meta.keyPrefix.length})`)
      console.log('  ✓ meta contains only keyPrefix — no raw key, no hash')
    }

    // ── 5. DB failure propagates (caller's .catch() responsibility) ─────────────
    console.log('\nTesting: DB failure propagates (caller must .catch)')
    {
      mockMethod('activityLog', 'create', () =>
        Promise.reject(new Error('DB connection lost'))
      )

      let threw = false
      try {
        await logApiKeyActivity({
          serverId: 'server-abc',
          serverName: 'Test',
          action: 'api-key.generated',
          keyPrefix: 'mcp_a1b2c3',
        })
      } catch {
        threw = true
      }
      assert.ok(threw, 'DB error must propagate — callers in routes use .catch()')
      console.log('  ✓ DB error propagates — callers suppress with .catch()')
    }

    // ── 6. action value is always one of the three allowed strings ─────────────
    console.log('\nTesting: all three action strings are accepted without error')
    {
      const actions = ['api-key.generated', 'api-key.rotated', 'api-key.revoked'] as const
      let callCount = 0

      mockMethod('activityLog', 'create', () => {
        callCount++
        return Promise.resolve({ id: `log-${callCount}` })
      })

      for (const action of actions) {
        await logApiKeyActivity({
          serverId: 'server-abc',
          serverName: 'Test',
          action,
          keyPrefix: 'mcp_a1b2c3',
        })
      }

      assert.strictEqual(callCount, 3, 'All three actions must trigger a DB write')
      console.log('  ✓ All three lifecycle actions (generated/rotated/revoked) write to ActivityLog')
    }

  } finally {
    restoreMocks()
  }

  console.log('\n🎉 ALL API KEY ACTIVITYLOG TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ API KEY ACTIVITYLOG TESTS FAILED:', err)
  process.exit(1)
})
