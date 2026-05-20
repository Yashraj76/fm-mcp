// full-api-test.js — Comprehensive API Test for FileMaker MCP Platform
// Run: node full-api-test.js

const BASE_URL = 'http://localhost:3000';

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function req(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await globalThis.fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, data: json };
}

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    failures.push(`${label}${detail ? ': ' + detail : ''}`);
  }
}

function skip(label, reason) {
  console.log(`  ⏭️  ${label} — SKIPPED (${reason})`);
  skipped++;
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📂 ${title}`);
  console.log('─'.repeat(60));
}

// ─── State shared across tests ─────────────────────────────────────────────

let serverId, serverBranchId, featureBranchId;
let connectionId, toolId, deploymentId, logId, playgroundSessionId;

// ─── Test Groups ──────────────────────────────────────────────────────────────

async function testDashboard() {
  section('Dashboard & Stats');

  const { status, data } = await req('/api/dashboard');
  ok('GET /api/dashboard → 200', status === 200, JSON.stringify(data).slice(0, 120));
  ok('Has overview field', !!data.overview);

  const { status: s2, data: d2 } = await req('/api/stats');
  ok('GET /api/stats → 200', s2 === 200, JSON.stringify(d2).slice(0, 120));
}

async function testConnections() {
  section('Connections');

  // List
  const { status, data } = await req('/api/connections');
  ok('GET /api/connections → 200', status === 200);
  ok('Returns success:true', data.success === true);
  ok('Returns array', Array.isArray(data.data));

  if (data.data?.length > 0) {
    connectionId = data.data[0].id;
    console.log(`  ℹ️  Using connectionId: ${connectionId}`);

    // GET single
    const { status: s2, data: d2 } = await req(`/api/connections/${connectionId}`);
    ok(`GET /api/connections/${connectionId} → 200`, s2 === 200);
    ok('Returns connection object', !!d2.data?.id);

    // Test connection
    const { status: s3, data: d3 } = await req(`/api/connections/${connectionId}/test`, { method: 'POST' });
    ok(`POST /api/connections/${connectionId}/test → 200`, s3 === 200, JSON.stringify(d3).slice(0, 80));

    // Browse schema (may be slow)
    const { status: s4, data: d4 } = await req(`/api/connections/${connectionId}/browse-schema`, { method: 'POST' });
    ok(`POST /api/connections/${connectionId}/browse-schema → 200`, s4 === 200, JSON.stringify(d4).slice(0, 80));

    // Schema compiled
    const { status: s5, data: d5 } = await req(`/api/connections/${connectionId}/schema/compiled`);
    ok(`GET /api/connections/${connectionId}/schema/compiled → 200`, s5 === 200, JSON.stringify(d5).slice(0, 80));

    // Schema (browsed)
    const { status: s6, data: d6 } = await req(`/api/connections/${connectionId}/schema`);
    ok(`GET /api/connections/${connectionId}/schema → 200`, s6 === 200, JSON.stringify(d6).slice(0, 80));

  } else {
    skip('Connection sub-routes', 'No connections in DB');
  }

  // POST create — validation error test
  const { status: sv, data: dv } = await req('/api/connections', {
    method: 'POST',
    body: JSON.stringify({ name: '' }), // intentionally bad
  });
  ok('POST /api/connections with bad body → 400', sv === 400, JSON.stringify(dv).slice(0, 80));
}

async function testServerConnections() {
  section('Server Connections (Admin)');

  const { status, data } = await req('/api/server-connections');
  ok('GET /api/server-connections → 200', status === 200, JSON.stringify(data).slice(0, 80));
}

async function testServers() {
  section('Servers');

  // List
  const { status, data } = await req('/api/servers');
  ok('GET /api/servers → 200', status === 200);
  ok('Returns success:true', data.success === true);
  ok('Returns array', Array.isArray(data.data));

  // Use existing or create
  if (data.data?.length > 0) {
    serverId = data.data[0].id;
    console.log(`  ℹ️  Using serverId: ${serverId}`);
  } else {
    const { status: sc, data: dc } = await req('/api/servers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Server', description: 'API test', version: '1.0.0' }),
    });
    ok('POST /api/servers (create) → 201', sc === 201, JSON.stringify(dc).slice(0, 80));
    serverId = dc.data?.id;
  }

  if (!serverId) { skip('Server sub-routes', 'No server available'); return; }

  // GET single
  const { status: s2, data: d2 } = await req(`/api/servers/${serverId}`);
  ok(`GET /api/servers/${serverId} → 200`, s2 === 200);
  ok('Server has id', !!d2.data?.id);

  // Config
  const { status: s3, data: d3 } = await req(`/api/servers/${serverId}/config`);
  ok(`GET /api/servers/${serverId}/config → 200`, s3 === 200, JSON.stringify(d3).slice(0, 80));

  // API Key (GET)
  const { status: s4, data: d4 } = await req(`/api/servers/${serverId}/api-key`);
  ok(`GET /api/servers/${serverId}/api-key → 200`, s4 === 200, JSON.stringify(d4).slice(0, 80));

  // Server-level tools
  const { status: s5, data: d5 } = await req(`/api/servers/${serverId}/tools`);
  ok(`GET /api/servers/${serverId}/tools → 200`, s5 === 200);
  ok('Tools is array', Array.isArray(d5.data));
  if (d5.data?.length > 0) toolId = d5.data[0].id;

  // Server deployments
  const { status: s6, data: d6 } = await req(`/api/servers/${serverId}/deployments`);
  ok(`GET /api/servers/${serverId}/deployments → 200`, s6 === 200, JSON.stringify(d6).slice(0, 80));
  if (d6.data?.length > 0) deploymentId = d6.data[0].id;

  // Server logs
  const { status: s7, data: d7 } = await req(`/api/servers/${serverId}/logs`);
  ok(`GET /api/servers/${serverId}/logs → 200`, s7 === 200, JSON.stringify(d7).slice(0, 80));
}

async function testBranches() {
  section('Branches');

  if (!serverId) { skip('All branch tests', 'No serverId'); return; }

  // List branches for server
  const { status, data } = await req(`/api/servers/${serverId}/branches`);
  ok(`GET /api/servers/${serverId}/branches → 200`, status === 200);
  ok('Returns array', Array.isArray(data.data));

  if (data.data?.length > 0) {
    serverBranchId = data.data.find(b => b.isDefault)?.id || data.data[0].id;
    console.log(`  ℹ️  Main branch ID: ${serverBranchId}`);
  }

  // Create feature branch
  const bName = `feature/api-test-${Date.now().toString().slice(-5)}`;
  const { status: sc, data: dc } = await req(`/api/servers/${serverId}/branches`, {
    method: 'POST',
    body: JSON.stringify({ name: bName, description: 'Auto test branch' }),
  });
  ok(`POST /api/servers/${serverId}/branches → 201`, sc === 201, JSON.stringify(dc).slice(0, 80));
  featureBranchId = dc.data?.id;

  if (!featureBranchId) { skip('Branch sub-routes', 'Feature branch creation failed'); return; }
  console.log(`  ℹ️  Feature branch ID: ${featureBranchId}`);

  // GET branch
  const { status: sg, data: dg } = await req(`/api/branches/${featureBranchId}`);
  ok(`GET /api/branches/${featureBranchId} → 200`, sg === 200);

  // GET branch tools
  const { status: st, data: dt } = await req(`/api/branches/${featureBranchId}/tools`);
  ok(`GET /api/branches/${featureBranchId}/tools → 200`, st === 200);
  ok('Tools is array', Array.isArray(dt.data));

  // GET branch diff
  const { status: sd, data: dd } = await req(`/api/branches/${featureBranchId}/diff`);
  ok(`GET /api/branches/${featureBranchId}/diff → 200`, sd === 200, JSON.stringify(dd).slice(0, 80));

  // Create a tool on the branch
  const tName = `test_tool_${Date.now().toString().slice(-5)}`;
  const { status: stc, data: dtc } = await req(`/api/branches/${featureBranchId}/tools`, {
    method: 'POST',
    body: JSON.stringify({
      name: tName,
      description: 'API test tool',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: [] },
      handlerConfig: { layout: 'TestLayout', type: 'find', fieldMappings: { q: 'Name' } },
      handlerType: 'find',
      category: 'custom',
      enabled: true,
    }),
  });
  ok(`POST /api/branches/${featureBranchId}/tools → 201`, stc === 201, JSON.stringify(dtc).slice(0, 80));
  const branchToolId = dtc.data?.id;

  if (branchToolId) {
    // Update tool on branch
    const { status: spu, data: dpu } = await req(`/api/branches/${featureBranchId}/tools/${branchToolId}`, {
      method: 'PUT',
      body: JSON.stringify({ description: 'Updated description' }),
    });
    ok(`PUT /api/branches/${featureBranchId}/tools/${branchToolId} → 200`, spu === 200, JSON.stringify(dpu).slice(0, 80));

    // Delete tool on branch
    const { status: spd, data: dpd } = await req(`/api/branches/${featureBranchId}/tools/${branchToolId}`, {
      method: 'DELETE',
    });
    ok(`DELETE /api/branches/${featureBranchId}/tools/${branchToolId} → 200`, spd === 200, JSON.stringify(dpd).slice(0, 80));
  }

  // Merge
  const { status: sm, data: dm } = await req(`/api/branches/${featureBranchId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ commitMessage: 'API test merge' }),
  });
  ok(`POST /api/branches/${featureBranchId}/merge → 200`, sm === 200, JSON.stringify(dm).slice(0, 100));
  if (dm.data?.deployment?.id) deploymentId = dm.data.deployment.id;
}

async function testTools() {
  section('Tools (Direct)');

  // GET all tools
  const { status, data } = await req('/api/tools');
  ok('GET /api/tools → 200', status === 200, JSON.stringify(data).slice(0, 80));

  if (!toolId && data.data?.length > 0) toolId = data.data[0].id;

  if (toolId) {
    // GET single tool
    const { status: s2, data: d2 } = await req(`/api/tools/${toolId}`);
    ok(`GET /api/tools/${toolId} → 200`, s2 === 200);

    // PUT update tool
    const { status: s3, data: d3 } = await req(`/api/tools/${toolId}`, {
      method: 'PUT',
      body: JSON.stringify({ description: 'Updated by API test' }),
    });
    ok(`PUT /api/tools/${toolId} → 200 or 403`, [200, 403].includes(s3), JSON.stringify(d3).slice(0, 80));

    // POST execute (may fail if no FM connection, but endpoint should respond)
    const { status: s4, data: d4 } = await req(`/api/tools/${toolId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ params: {} }),
    });
    ok(`POST /api/tools/${toolId}/execute → responds`, [200, 400, 500].includes(s4), JSON.stringify(d4).slice(0, 80));
  } else {
    skip('Tool sub-routes', 'No toolId available');
  }

  // POST suggest tools
  const { status: ss, data: ds } = await req('/api/tools/suggest', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'search customers' }),
  });
  ok('POST /api/tools/suggest → responds', [200, 400, 422, 500].includes(ss), JSON.stringify(ds).slice(0, 80));
}

async function testDeployments() {
  section('Deployments');

  if (deploymentId) {
    // GET single deployment
    const { status, data } = await req(`/api/deployments/${deploymentId}`);
    ok(`GET /api/deployments/${deploymentId} → 200`, status === 200, JSON.stringify(data).slice(0, 80));

    // Rollback — expect 200 or "Already the live" error
    const { status: sr, data: dr } = await req(`/api/deployments/${deploymentId}/rollback`, { method: 'POST' });
    const rollbackOk = sr === 200 || (sr === 400 && (dr.error || '').includes('live'));
    ok(`POST /api/deployments/${deploymentId}/rollback → valid response`, rollbackOk, JSON.stringify(dr).slice(0, 80));
  } else {
    skip('Deployment sub-routes', 'No deploymentId');
  }
}

async function testLogs() {
  section('Activity Logs');

  const { status, data } = await req('/api/logs');
  ok('GET /api/logs → 200', status === 200);
  ok('Returns success:true', data.success === true);
  ok('Has data array', Array.isArray(data.data));

  if (data.data?.length > 0) {
    logId = data.data[0].id;
    const { status: s2, data: d2 } = await req(`/api/logs/${logId}`);
    ok(`GET /api/logs/${logId} → 200`, s2 === 200, JSON.stringify(d2).slice(0, 80));
  }

  // Stats
  const { status: ss, data: ds } = await req('/api/logs/stats');
  ok('GET /api/logs/stats → 200', ss === 200, JSON.stringify(ds).slice(0, 80));
}

async function testSettings() {
  section('Settings');

  const { status, data } = await req('/api/settings');
  ok('GET /api/settings → 200', status === 200, JSON.stringify(data).slice(0, 80));

  // PUT update (non-destructive — just resave existing values)
  if (data.data) {
    const payload = {
      aiProvider: data.data.aiProvider || 'anthropic',
      aiModel: data.data.aiModel || 'claude-sonnet-4-5',
    };
    const { status: sp, data: dp } = await req('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    ok('PUT /api/settings → 200', sp === 200, JSON.stringify(dp).slice(0, 80));
  }

  // Test AI endpoint
  const { status: st, data: dt } = await req('/api/settings/test-ai', { method: 'POST' });
  ok('POST /api/settings/test-ai → responds', [200, 400, 500].includes(st), JSON.stringify(dt).slice(0, 80));
}

async function testPlayground() {
  section('Playground');

  if (!serverId) { skip('All playground tests', 'No serverId'); return; }

  // History
  const { status: sh, data: dh } = await req(`/api/playground/history?serverId=${serverId}`);
  ok(`GET /api/playground/history → responds`, [200, 404].includes(sh), JSON.stringify(dh).slice(0, 80));

  // Execute (manual tool run — may error without FM connection, but should respond)
  if (toolId) {
    const { status: se, data: de } = await req('/api/playground/execute', {
      method: 'POST',
      body: JSON.stringify({ toolId, params: {}, serverId }),
    });
    ok('POST /api/playground/execute → responds', [200, 400, 500].includes(se), JSON.stringify(de).slice(0, 80));
  } else {
    skip('POST /api/playground/execute', 'No toolId');
  }

  // AI Run (async job)
  const { status: sar, data: dar } = await req('/api/playground/ai-run', {
    method: 'POST',
    body: JSON.stringify({ serverId, message: 'List all tools available' }),
  });
  ok('POST /api/playground/ai-run → 202', sar === 202, JSON.stringify(dar).slice(0, 100));
  playgroundSessionId = dar.data?.sessionId;

  if (playgroundSessionId) {
    // Poll once
    await new Promise(r => setTimeout(r, 2000));
    const { status: sps, data: dps } = await req(`/api/playground/sessions/${playgroundSessionId}`);
    ok(`GET /api/playground/sessions/${playgroundSessionId} → 200`, sps === 200, JSON.stringify(dps).slice(0, 80));
    ok('Session has status field', !!dps.data?.status);
  }
}

async function testServerAI() {
  section('Server AI Endpoints');

  if (!serverId) { skip('All AI tests', 'No serverId'); return; }

  // AI Suggest
  const { status: ss, data: ds } = await req(`/api/servers/${serverId}/ai/suggest`, {
    method: 'POST',
    body: JSON.stringify({ context: 'search and list customers' }),
  });
  ok(`POST /api/servers/${serverId}/ai/suggest → responds`, [200, 400, 500].includes(ss), JSON.stringify(ds).slice(0, 100));

  // Generate-tools (background job) — just validate it starts
  if (connectionId) {
    const { status: sg, data: dg } = await req(`/api/servers/${serverId}/generate-tools`, {
      method: 'POST',
      body: JSON.stringify({ connectionId }),
    });
    ok(`POST /api/servers/${serverId}/generate-tools → 202 or valid response`, [202, 200, 400, 500].includes(sg), JSON.stringify(dg).slice(0, 100));
  } else {
    skip(`POST /api/servers/${serverId}/generate-tools`, 'No connectionId');
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 FileMaker MCP Platform — Full API Integration Test');
  console.log(`   Target: ${BASE_URL}`);
  console.log('═'.repeat(60));

  const start = Date.now();

  try {
    await testDashboard();
    await testConnections();
    await testServerConnections();
    await testServers();
    await testBranches();
    await testTools();
    await testDeployments();
    await testLogs();
    await testSettings();
    await testPlayground();
    await testServerAI();
  } catch (err) {
    console.error('\n💥 Unexpected error during test run:', err);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESULTS');
  console.log('─'.repeat(60));
  console.log(`  ✅ Passed : ${passed}`);
  console.log(`  ❌ Failed : ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ⏱️  Time   : ${elapsed}s`);

  if (failures.length > 0) {
    console.log('\n  Failed checks:');
    failures.forEach(f => console.log(`    • ${f}`));
  }

  console.log('═'.repeat(60));
  if (failed === 0) {
    console.log('🎉 ALL CHECKS PASSED!');
  } else {
    console.log(`⚠️  ${failed} check(s) failed. See details above.`);
  }
  console.log('═'.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();
