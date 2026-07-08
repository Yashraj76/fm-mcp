import assert from 'assert';
import { buildActivityLogData, LOG_ACTIONS, type LogOptions } from './logger';
import { buildApiKeyActivityData, type ApiKeyActivityArgs } from '../mcp/activity';

// ── buildActivityLogData ───────────────────────────────────────────────────────

async function testBuildActivityLogData() {
  console.log('Testing buildActivityLogData...\n');

  // 1. actorUserId is included when provided
  {
    const data = buildActivityLogData({
      action: LOG_ACTIONS.TOOL_CREATED,
      entityType: 'tool', entityId: 'tool-1', entityName: 'get_contacts',
      serverId: 'srv-1',
      actorUserId: 'user-abc',
    });
    assert.strictEqual(data.actorUserId, 'user-abc');
    console.log('  ✓ actorUserId is set when provided');
  }

  // 2. actorUserId is null when not provided (MCP / unauthenticated paths)
  {
    const data = buildActivityLogData({
      action: LOG_ACTIONS.TOOL_EXECUTED,
      entityType: 'tool', entityId: 'tool-1', entityName: 'get_contacts',
    });
    assert.strictEqual(data.actorUserId, null);
    console.log('  ✓ actorUserId is null when not provided');
  }

  // 3. actorIp is preserved
  {
    const data = buildActivityLogData({
      action: LOG_ACTIONS.TOOL_CREATED,
      entityType: 'tool', entityId: 't1', entityName: 'x',
      actorIp: '10.0.0.1',
    });
    assert.strictEqual(data.actorIp, '10.0.0.1');
    console.log('  ✓ actorIp is preserved');
  }

  // 4. actorSession is preserved
  {
    const data = buildActivityLogData({
      action: LOG_ACTIONS.TOOL_CREATED,
      entityType: 'tool', entityId: 't1', entityName: 'x',
      actorSession: 'sess-xyz',
    });
    assert.strictEqual(data.actorSession, 'sess-xyz');
    console.log('  ✓ actorSession is preserved');
  }

  // 5. meta is JSON-serialised
  {
    const data = buildActivityLogData({
      action: LOG_ACTIONS.BRANCH_MERGED,
      entityType: 'branch', entityId: 'b1', entityName: 'feature/x',
      meta: { toolsAdded: 3, version: '1.2.0' },
      actorUserId: 'user-merge',
    });
    assert.strictEqual(data.actorUserId, 'user-merge');
    assert.strictEqual(data.meta, JSON.stringify({ toolsAdded: 3, version: '1.2.0' }));
    console.log('  ✓ meta is JSON-serialised and actorUserId is present');
  }

  // 6. Scenario — tool create mutation carries actorUserId
  {
    const opts: LogOptions = {
      action: LOG_ACTIONS.TOOL_CREATED,
      entityType: 'tool', entityId: 'tool-99', entityName: 'list_records',
      serverId: 'srv-1', branchId: 'br-1',
      after: JSON.stringify({ name: 'list_records', fmMethod: 'list' }),
      meta: { branch: 'main', addedOnBranch: true },
      actorUserId: 'user-creator',
    };
    const data = buildActivityLogData(opts);
    assert.strictEqual(data.actorUserId, 'user-creator', 'tool create: actorUserId present');
    assert.strictEqual(data.action, LOG_ACTIONS.TOOL_CREATED);
    assert.strictEqual(data.entityType, 'tool');
    assert.strictEqual(data.serverId, 'srv-1');
    console.log('  ✓ scenario: create tool → actorUserId in audit entry');
  }

  // 7. Scenario — server update mutation carries actorUserId
  {
    const opts: LogOptions = {
      action: LOG_ACTIONS.SERVER_UPDATED,
      entityType: 'server', entityId: 'srv-1', entityName: 'My Server',
      before: JSON.stringify({ name: 'Old Name' }),
      after: JSON.stringify({ name: 'My Server' }),
      actorUserId: 'user-admin',
    };
    const data = buildActivityLogData(opts);
    assert.strictEqual(data.actorUserId, 'user-admin', 'server update: actorUserId present');
    assert.strictEqual(data.action, LOG_ACTIONS.SERVER_UPDATED);
    console.log('  ✓ scenario: update server → actorUserId in audit entry');
  }

  // 8. Scenario — branch merge carries actorUserId
  {
    const opts: LogOptions = {
      action: LOG_ACTIONS.BRANCH_MERGED,
      entityType: 'branch', entityId: 'br-feature', entityName: 'feature/add-search',
      serverId: 'srv-1', branchId: 'br-main',
      meta: { mergedInto: 'main', version: '2.0.0', toolsAdded: 1, toolsModified: 2, toolsDeleted: 0 },
      actorUserId: 'user-merger',
    };
    const data = buildActivityLogData(opts);
    assert.strictEqual(data.actorUserId, 'user-merger', 'branch merge: actorUserId present');
    assert.strictEqual(data.action, LOG_ACTIONS.BRANCH_MERGED);
    const meta = JSON.parse(data.meta!);
    assert.strictEqual(meta.mergedInto, 'main');
    console.log('  ✓ scenario: merge branch → actorUserId in audit entry');
  }

  // 9. Optional fields default to null
  {
    const data = buildActivityLogData({
      action: LOG_ACTIONS.BRANCH_CREATED,
      entityType: 'branch', entityId: 'b1', entityName: 'my-branch',
    });
    assert.strictEqual(data.serverId, null);
    assert.strictEqual(data.branchId, null);
    assert.strictEqual(data.deploymentId, null);
    assert.strictEqual(data.before, null);
    assert.strictEqual(data.after, null);
    assert.strictEqual(data.meta, null);
    assert.strictEqual(data.actorUserId, null);
    assert.strictEqual(data.actorIp, null);
    assert.strictEqual(data.actorSession, null);
    console.log('  ✓ all optional fields default to null when absent');
  }
}

// ── buildApiKeyActivityData ───────────────────────────────────────────────────

async function testBuildApiKeyActivityData() {
  console.log('\nTesting buildApiKeyActivityData...\n');

  // 10. Scenario — API key generate carries actorUserId
  {
    const args: ApiKeyActivityArgs = {
      serverId: 'srv-1',
      serverName: 'My Server',
      action: 'api-key.generated',
      keyPrefix: 'mcp_a1b2c3d4e5f',
      actorUserId: 'user-owner',
    };
    const data = buildApiKeyActivityData(args);
    assert.strictEqual(data.actorUserId, 'user-owner', 'api-key generate: actorUserId present');
    assert.strictEqual(data.action, 'api-key.generated');
    assert.strictEqual(data.entityType, 'api-key');
    // Raw key or hash must never appear in the log data
    const meta = JSON.parse(data.meta!);
    assert.ok(!JSON.stringify(meta).includes('hash'), 'hash must not be in meta');
    assert.strictEqual(meta.keyPrefix, 'mcp_a1b2c3d4e5f');
    console.log('  ✓ scenario: generate API key → actorUserId in audit entry, raw key absent');
  }

  // 11. Scenario — API key revoke carries actorUserId
  {
    const args: ApiKeyActivityArgs = {
      serverId: 'srv-1',
      serverName: 'My Server',
      action: 'api-key.revoked',
      keyPrefix: 'mcp_a1b2c3d4e5f',
      actorUserId: 'user-revoker',
    };
    const data = buildApiKeyActivityData(args);
    assert.strictEqual(data.actorUserId, 'user-revoker', 'api-key revoke: actorUserId present');
    assert.strictEqual(data.action, 'api-key.revoked');
    console.log('  ✓ scenario: revoke API key → actorUserId in audit entry');
  }

  // 12. actorUserId is null when not provided (e.g. legacy callers)
  {
    const args: ApiKeyActivityArgs = {
      serverId: 'srv-1',
      serverName: 'My Server',
      action: 'api-key.rotated',
      keyPrefix: 'mcp_aaa',
    };
    const data = buildApiKeyActivityData(args);
    assert.strictEqual(data.actorUserId, null);
    console.log('  ✓ actorUserId is null when not provided in ApiKeyActivityArgs');
  }

  // 13. Raw secrets never appear — verify no full key / token leakage
  {
    const args: ApiKeyActivityArgs = {
      serverId: 'srv-1',
      serverName: 'My Server',
      action: 'api-key.generated',
      keyPrefix: 'mcp_abc123',
      actorUserId: 'user-x',
    };
    const data = buildApiKeyActivityData(args);
    const dataStr = JSON.stringify(data);
    // The prefix stored in meta is safe (public-facing hint). Verify no longer
    // key material or hash-like strings appear.
    assert.ok(!dataStr.includes('rawKey'), 'rawKey must not appear');
    assert.ok(!dataStr.includes('keyHash'), 'keyHash must not appear');
    assert.ok(!dataStr.includes('bcrypt'), 'bcrypt hash must not appear');
    console.log('  ✓ no raw key or hash material in log data');
  }
}

// ── runner ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Activity Log Tests...\n');
  await testBuildActivityLogData();
  await testBuildApiKeyActivityData();
  console.log('\n🎉 ALL ACTIVITY LOG TESTS PASSED! 🎉\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
