import assert from 'assert'
import { prisma } from '../prisma'
import {
  getMcpServer,
  listMcpServers,
  getFMServerConnection,
  listFMServerConnections,
  getFMConnection,
  listFMConnections,
  getBranch,
  listBranches,
  getTool,
  listTools,
} from './user-scoped'

// Create a helper to restore original methods
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

async function runTests() {
  console.log('🚀 Starting User-Scoped Data Access Helpers Smoke Tests...\n')

  try {
    // 1. Testing getMcpServer and listMcpServers
    console.log('Testing McpServer helpers...')
    {
      mockPrismaMethod('mcpServer', 'findFirst', (options: any) => {
        assert.strictEqual(options.where.id, 'server-123')
        assert.strictEqual(options.where.userId, 'user-abc')
        return Promise.resolve({ id: 'server-123', name: 'My Server', userId: 'user-abc' })
      })

      const server = await getMcpServer('server-123', 'user-abc')
      assert.ok(server, 'Server should be found')
      assert.strictEqual(server.id, 'server-123', 'Returned server ID mismatch')
      console.log('  ✓ getMcpServer passed')
    }

    {
      mockPrismaMethod('mcpServer', 'findMany', (options: any) => {
        assert.strictEqual(options.where.userId, 'user-abc')
        return Promise.resolve([
          { id: 'server-1', userId: 'user-abc' },
          { id: 'server-2', userId: 'user-abc' },
        ])
      })

      const list = await listMcpServers('user-abc')
      assert.strictEqual(list.length, 2, 'Should list 2 servers')
      console.log('  ✓ listMcpServers passed')
    }

    // 2. Testing FMServerConnection helpers
    console.log('\nTesting FMServerConnection helpers...')
    {
      mockPrismaMethod('fMServerConnection', 'findFirst', (options: any) => {
        assert.strictEqual(options.where.id, 'sconn-123')
        assert.strictEqual(options.where.userId, 'user-abc')
        return Promise.resolve({ id: 'sconn-123', userId: 'user-abc' })
      })

      const sconn = await getFMServerConnection('sconn-123', 'user-abc')
      assert.ok(sconn, 'Server connection should be found')
      console.log('  ✓ getFMServerConnection passed')
    }

    {
      mockPrismaMethod('fMServerConnection', 'findMany', (options: any) => {
        assert.strictEqual(options.where.userId, 'user-abc')
        return Promise.resolve([{ id: 'sconn-1', userId: 'user-abc' }])
      })

      const list = await listFMServerConnections('user-abc')
      assert.strictEqual(list.length, 1)
      console.log('  ✓ listFMServerConnections passed')
    }

    // 3. Testing FMConnection helpers
    console.log('\nTesting FMConnection helpers...')
    {
      mockPrismaMethod('fMConnection', 'findFirst', (options: any) => {
        assert.strictEqual(options.where.id, 'conn-123')
        assert.strictEqual(options.where.userId, 'user-abc')
        return Promise.resolve({ id: 'conn-123', userId: 'user-abc' })
      })

      const conn = await getFMConnection('conn-123', 'user-abc')
      assert.ok(conn)
      console.log('  ✓ getFMConnection passed')
    }

    // 4. Testing Branch helpers (ownership checks inherited via Server)
    console.log('\nTesting Branch helpers...')
    {
      mockPrismaMethod('branch', 'findFirst', (options: any) => {
        assert.strictEqual(options.where.id, 'branch-123')
        assert.deepStrictEqual(options.where.server, { userId: 'user-abc' })
        return Promise.resolve({ id: 'branch-123', name: 'main', serverId: 'server-1' })
      })

      const branch = await getBranch('branch-123', 'user-abc')
      assert.ok(branch)
      console.log('  ✓ getBranch (inherited server check) passed')
    }

    {
      mockPrismaMethod('branch', 'findMany', (options: any) => {
        assert.strictEqual(options.where.serverId, 'server-1')
        assert.deepStrictEqual(options.where.server, { userId: 'user-abc' })
        return Promise.resolve([{ id: 'branch-1', name: 'main' }])
      })

      const list = await listBranches('server-1', 'user-abc')
      assert.strictEqual(list.length, 1)
      console.log('  ✓ listBranches passed')
    }

    // 5. Testing Tool helpers (ownership checks inherited via Server)
    console.log('\nTesting Tool helpers...')
    {
      mockPrismaMethod('tool', 'findFirst', (options: any) => {
        assert.strictEqual(options.where.id, 'tool-123')
        assert.deepStrictEqual(options.where.server, { userId: 'user-abc' })
        return Promise.resolve({ id: 'tool-123', name: 'search_contacts' })
      })

      const tool = await getTool('tool-123', 'user-abc')
      assert.ok(tool)
      console.log('  ✓ getTool (inherited server check) passed')
    }

    {
      mockPrismaMethod('tool', 'findMany', (options: any) => {
        assert.strictEqual(options.where.serverId, 'server-1')
        assert.deepStrictEqual(options.where.server, { userId: 'user-abc' })
        return Promise.resolve([{ id: 'tool-1', name: 'search_contacts' }])
      })

      const list = await listTools('server-1', 'user-abc')
      assert.strictEqual(list.length, 1)
      console.log('  ✓ listTools passed')
    }

    // 6. Testing Ownership Validation Failures
    console.log('\nTesting Ownership Validation Failures...')
    {
      mockPrismaMethod('mcpServer', 'findFirst', (options: any) => {
        // Mock a scenario where user tries to access another user's server
        return Promise.resolve(null)
      })

      const server = await getMcpServer('server-999', 'user-abc')
      assert.strictEqual(server, null, 'Should return null for ownership mismatch')
      console.log('  ✓ getMcpServer correctly returned null for ownership mismatch')
    }

    console.log('\n🎉 ALL DATABASE OWNERSHIP SMOKE TESTS PASSED! 🎉')
  } finally {
    restorePrismaMocks()
  }
}

runTests().catch(err => {
  console.error('\n❌ OWNERSHIP SMOKE TESTS FAILED:', err)
  process.exit(1)
})
