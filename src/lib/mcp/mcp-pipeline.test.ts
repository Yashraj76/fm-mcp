/**
 * Integration tests for the MCP gateway pipeline (TC-004).
 *
 * Covers: valid Bearer auth, invalid Bearer → 401, missing Bearer → 401,
 * INTERNAL_TEST_SECRET bypass, production bypass block, unknown server → 404,
 * branch resolution (default + preferred), tool lookup with isEnabled filter,
 * and the executeMcpTool dispatch pattern used by the route's tool callbacks.
 */

import assert from 'assert'
import bcrypt from 'bcryptjs'
import { mcpGateway, McpGatewayDeps, McpGatewayParams } from './mcp-pipeline'
import type { BypassInput } from './auth-bypass'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'mcp_validtesttoken000000000000000000000000000000'
const WRONG_TOKEN = 'mcp_wrongtesttoken000000000000000000000000000000'
const TEST_SECRET = 'test-internal-secret-for-tc004'

const MOCK_SERVER = { id: 'srv-1', name: 'Test Server', version: '1.0.0' }
const BRANCH_MAIN = { id: 'branch-main' }
const BRANCH_FEAT = { id: 'branch-feat' }
const ALL_TOOLS = [
  { id: 't-1', name: 'find_contacts', isEnabled: true,  category: 'Find' },
  { id: 't-2', name: 'disabled_tool',  isEnabled: false, category: 'CRUD' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build default params with known-good token pointing at MOCK_SERVER. */
function params(overrides: Partial<McpGatewayParams> = {}): McpGatewayParams {
  return {
    serverId: 'srv-1',
    transport: 'mcp',
    bearerToken: VALID_TOKEN,
    internalSecret: null,
    bypassInput: noBypass(),
    preferredBranchId: null,
    hasRedis: false,
    ...overrides,
  }
}

/** BypassInput that leaves all bypass mechanisms off. */
function noBypass(): BypassInput {
  return {
    nodeEnv: 'test',
    internalSecret: null,
    configuredSecret: undefined,
    bearerToken: VALID_TOKEN,
    devBypassEnabled: false,
  }
}

/** BypassInput that activates the INTERNAL_TEST_SECRET path. */
function withSecretBypass(secret: string): BypassInput {
  return {
    nodeEnv: 'test',
    internalSecret: secret,
    configuredSecret: secret,
    bearerToken: null,
    devBypassEnabled: false,
  }
}

/** BypassInput with bypass configured but nodeEnv=production (hard block). */
function withProductionEnv(secret: string): BypassInput {
  return {
    nodeEnv: 'production',
    internalSecret: secret,
    configuredSecret: secret,
    bearerToken: null,
    devBypassEnabled: false,
  }
}

/**
 * Build mock deps.  `validKeyHash` pre-computed by the caller (once per suite)
 * to avoid slow bcrypt per-test.  Override individual fns as needed.
 */
function deps(hash: string, overrides: Partial<McpGatewayDeps> = {}): McpGatewayDeps {
  return {
    findApiKey: async (sid) => (sid === 'srv-1' ? { keyHash: hash } : null),
    touchApiKeyLastUsed: () => {},
    findServer: async (sid) => (sid === 'srv-1' ? MOCK_SERVER : null),
    resolveServerBranch: async (_sid, preferred) =>
      preferred === BRANCH_FEAT.id ? BRANCH_FEAT : BRANCH_MAIN,
    getEffectiveTools: async () => ALL_TOOLS,
    ...overrides,
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting MCP Pipeline Gateway Tests (TC-004)...\n')

  // Pre-compute hash once so all tests share it without repeating slow bcrypt
  const validKeyHash = await bcrypt.hash(VALID_TOKEN, 4)

  // ── 1. Missing bearer token → 401 ────────────────────────────────────────
  console.log('1. Missing bearer token → 401')
  {
    const result = await mcpGateway(
      params({ bearerToken: null, bypassInput: { ...noBypass(), bearerToken: null } }),
      deps(validKeyHash),
    )
    assert.strictEqual(result.ok, false)
    assert.strictEqual((result as any).status, 401)
    assert.ok((result as any).message.toLowerCase().includes('authorization'))
    console.log('  ✓ null bearer → 401 "Authorization required"')
  }

  // ── 2. Invalid bearer token → 401 ────────────────────────────────────────
  console.log('\n2. Invalid bearer token → 401')
  {
    const result = await mcpGateway(
      params({
        bearerToken: WRONG_TOKEN,
        bypassInput: { ...noBypass(), bearerToken: WRONG_TOKEN },
      }),
      deps(validKeyHash),
    )
    assert.strictEqual(result.ok, false)
    assert.strictEqual((result as any).status, 401)
    assert.ok((result as any).message.toLowerCase().includes('invalid'))
    console.log('  ✓ wrong token → 401 "Invalid API key"')
  }

  // ── 3. Valid bearer token → auth passes ───────────────────────────────────
  console.log('\n3. Valid bearer token → auth passes, server/branch/tools loaded')
  {
    const result = await mcpGateway(params(), deps(validKeyHash))
    assert.strictEqual(result.ok, true)
    const ok = result as any
    assert.strictEqual(ok.server.id, 'srv-1')
    assert.strictEqual(ok.branch.id, BRANCH_MAIN.id)
    // Only the enabled tool is returned
    assert.strictEqual(ok.tools.length, 1)
    assert.strictEqual(ok.tools[0].name, 'find_contacts')
    console.log('  ✓ valid token → ok=true, server loaded, default branch, 1 enabled tool')
  }

  // ── 4. touchApiKeyLastUsed called after successful auth ───────────────────
  console.log('\n4. touchApiKeyLastUsed called with correct serverId')
  {
    const touched: string[] = []
    const result = await mcpGateway(
      params(),
      deps(validKeyHash, { touchApiKeyLastUsed: (sid) => touched.push(sid) }),
    )
    assert.strictEqual(result.ok, true)
    assert.deepStrictEqual(touched, ['srv-1'])
    console.log('  ✓ touchApiKeyLastUsed("srv-1") called exactly once')
  }

  // ── 5. Unknown server → 404 (via bypass to reach server lookup) ───────────
  console.log('\n5. Unknown server → 404')
  {
    const result = await mcpGateway(
      params({
        serverId: 'no-such-server',
        bearerToken: null,
        bypassInput: withSecretBypass(TEST_SECRET),
      }),
      deps(validKeyHash, {
        // Server lookup returns null for the unknown ID
        findServer: async (sid) => (sid === 'srv-1' ? MOCK_SERVER : null),
      }),
    )
    assert.strictEqual(result.ok, false)
    assert.strictEqual((result as any).status, 404)
    assert.ok((result as any).message.toLowerCase().includes('server'))
    console.log('  ✓ unknown serverId → 404 "Server not found"')
  }

  // ── 6. Branch resolution: falls back to default when no preference given ──
  console.log('\n6. Branch resolution: default branch when preferredBranchId is null')
  {
    const result = await mcpGateway(params({ preferredBranchId: null }), deps(validKeyHash))
    assert.strictEqual(result.ok, true)
    assert.strictEqual((result as any).branch.id, BRANCH_MAIN.id)
    console.log('  ✓ null preferredBranchId → BRANCH_MAIN selected')
  }

  // ── 7. Branch resolution: preferred branch is used when provided ──────────
  console.log('\n7. Branch resolution: preferred branch used when provided')
  {
    const result = await mcpGateway(
      params({ preferredBranchId: BRANCH_FEAT.id }),
      deps(validKeyHash),
    )
    assert.strictEqual(result.ok, true)
    assert.strictEqual((result as any).branch.id, BRANCH_FEAT.id)
    console.log('  ✓ preferredBranchId → BRANCH_FEAT selected')
  }

  // ── 8. Tool lookup: only isEnabled=true tools are returned ─────────────────
  console.log('\n8. Tool lookup: disabled tools filtered out')
  {
    const result = await mcpGateway(
      params(),
      deps(validKeyHash, {
        getEffectiveTools: async () => [
          { id: 't-a', name: 'active_1',   isEnabled: true  },
          { id: 't-b', name: 'inactive',   isEnabled: false },
          { id: 't-c', name: 'active_2',   isEnabled: true  },
        ],
      }),
    )
    assert.strictEqual(result.ok, true)
    const tools = (result as any).tools
    assert.strictEqual(tools.length, 2)
    assert.ok(tools.every((t: any) => t.isEnabled === true), 'all returned tools must be enabled')
    console.log('  ✓ 2 enabled, 1 disabled → 2 tools returned, 0 disabled')
  }

  // ── 9. No branch → empty tool list, getEffectiveTools not called ──────────
  console.log('\n9. Null branch → empty tools, getEffectiveTools not invoked')
  {
    let getToolsCalled = false
    const result = await mcpGateway(
      params(),
      deps(validKeyHash, {
        resolveServerBranch: async () => null,
        getEffectiveTools: async () => {
          getToolsCalled = true
          throw new Error('should not be called')
        },
      }),
    )
    assert.strictEqual(result.ok, true)
    assert.strictEqual((result as any).branch, null)
    assert.strictEqual((result as any).tools.length, 0)
    assert.strictEqual(getToolsCalled, false)
    console.log('  ✓ null branch → getEffectiveTools not called, 0 tools returned')
  }

  // ── 10. INTERNAL_TEST_SECRET bypass (non-production) ─────────────────────
  console.log('\n10. INTERNAL_TEST_SECRET bypass in test env → skips API key check')
  {
    let findApiKeyCalled = false
    const result = await mcpGateway(
      params({
        bearerToken: null,
        bypassInput: withSecretBypass(TEST_SECRET),
      }),
      deps(validKeyHash, {
        findApiKey: async () => {
          findApiKeyCalled = true
          throw new Error('findApiKey must not be called during bypass')
        },
      }),
    )
    assert.strictEqual(result.ok, true, 'bypass must admit the request')
    assert.strictEqual(findApiKeyCalled, false, 'findApiKey must not be called during bypass')
    console.log('  ✓ INTERNAL_TEST_SECRET bypass → findApiKey skipped, server+branch+tools loaded')
  }

  // ── 11. INTERNAL_TEST_SECRET blocked in production ────────────────────────
  console.log('\n11. INTERNAL_TEST_SECRET bypass blocked in production')
  {
    const result = await mcpGateway(
      params({
        bearerToken: null,
        bypassInput: withProductionEnv(TEST_SECRET),
      }),
      deps(validKeyHash, {
        // findApiKey returns null → verifyMcpApiKey will reject with dummy hash
        findApiKey: async () => null,
      }),
    )
    assert.strictEqual(result.ok, false)
    assert.strictEqual((result as any).status, 401)
    console.log('  ✓ production nodeEnv → bypass path blocked, 401 returned')
  }

  // ── 12. executeMcpTool dispatch: success path (models route callback) ──────
  //   The route registers each tool via `mcpServer.registerTool(name, schema, callback)`.
  //   The callback wraps `executeMcpTool` and serialises the result.  This test
  //   models that callback directly, verifying the happy-path shape.
  console.log('\n12. executeMcpTool dispatch: success path (models route callback)')
  {
    const mockExecuteMcpTool = async (
      _tool: any,
      _params: any,
      _ctx: any,
    ): Promise<unknown> => ({ records: [{ id: 1, Name: 'Alice' }] })

    async function routeToolCallback(toolParams: Record<string, unknown>) {
      try {
        const result = await mockExecuteMcpTool({}, toolParams, { branchId: 'branch-main' })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        }
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        }
      }
    }

    const response = await routeToolCallback({ query: 'Alice', limit: 10 })
    assert.ok(!('isError' in response), 'success response must not have isError')
    const parsed = JSON.parse(response.content[0].text)
    assert.strictEqual(parsed.records[0].Name, 'Alice')
    console.log('  ✓ success → content[0].text contains serialised result, no isError')
  }

  // ── 13. executeMcpTool dispatch: error path returns isError:true ───────────
  console.log('\n13. executeMcpTool dispatch: error path returns isError:true')
  {
    const mockExecuteMcpTool = async (): Promise<never> => {
      throw new Error('FileMaker connection refused')
    }

    async function routeToolCallback(toolParams: Record<string, unknown>) {
      try {
        const result = await mockExecuteMcpTool()
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        }
      }
    }

    const response = await routeToolCallback({})
    assert.strictEqual((response as any).isError, true)
    assert.ok(response.content[0].text.includes('FileMaker connection refused'))
    console.log('  ✓ thrown error → isError:true + message surfaced in content')
  }

  console.log('\n🎉 ALL MCP PIPELINE TESTS PASSED! (13/13)\n')
}

runTests().catch((err) => {
  console.error('\n❌ MCP PIPELINE TESTS FAILED:', err)
  process.exit(1)
})
