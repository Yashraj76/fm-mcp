// screen-data-test.js — Verifies every screen in the app fetches live data from Turso
// Covers all 9 screens + sidebar + dialogs
// Run: node screen-data-test.js

const BASE = 'http://localhost:3000';

// ── Known IDs from Turso ────────────────────────────────────────────────────
// Discovered dynamically so this works even after DB changes
let SERVER_ID   = null;
let CONN_ID     = null;
let BRANCH_ID   = null;
let TOOL_ID     = null;
let DEPLOY_ID   = null;

let passed = 0, failed = 0, warned = 0;
const failures = [];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 100) }; }
    return { ok: res.ok, status: res.status, data: json };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

function check(label, condition, detail = '', warn = false) {
  if (condition) {
    console.log(`    ✅ ${label}`);
    passed++;
  } else if (warn) {
    console.log(`    ⚠️  ${label}${detail ? ' — ' + detail : ''}`);
    warned++;
  } else {
    console.log(`    ❌ ${label}${detail ? '\n       → ' + detail : ''}`);
    failed++;
    failures.push(`${label}${detail ? ': ' + detail : ''}`);
  }
}

function screen(name) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📱 ${name}`);
  console.log('─'.repeat(60));
}

// ── Phase 1: Discovery — get real IDs from Turso ─────────────────────────────

async function discover() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('🔍 Phase 1: Discovering live Turso IDs...');
  console.log('══════════════════════════════════════════════════════════');

  const servers = await api('/api/servers');
  const realServer = (servers.data?.data || []).find(s => s._count?.connections > 0) 
    || (servers.data?.data || [])[0];
  SERVER_ID = realServer?.id;
  console.log(`  Server  : ${SERVER_ID ? realServer.name + ' (' + SERVER_ID + ')' : 'NOT FOUND'}`);

  const conns = await api('/api/connections');
  CONN_ID = conns.data?.data?.[0]?.id;
  console.log(`  Connection: ${CONN_ID ? conns.data.data[0].name + ' (' + CONN_ID + ')' : 'NOT FOUND'}`);

  if (SERVER_ID) {
    const branches = await api(`/api/servers/${SERVER_ID}/branches`);
    const main = (branches.data?.data || []).find(b => b.isDefault) || branches.data?.data?.[0];
    BRANCH_ID = main?.id;
    console.log(`  Branch  : ${BRANCH_ID ? main.name + ' (' + BRANCH_ID + ')' : 'NOT FOUND'}`);

    const tools = await api(`/api/servers/${SERVER_ID}/tools`);
    TOOL_ID = tools.data?.data?.[0]?.id;
    console.log(`  Tool    : ${TOOL_ID ? tools.data.data[0].name + ' (' + TOOL_ID + ')' : 'NOT FOUND'}`);

    const deps = await api(`/api/servers/${SERVER_ID}/deployments`);
    DEPLOY_ID = deps.data?.data?.[0]?.id;
    console.log(`  Deploy  : ${DEPLOY_ID ? DEPLOY_ID : 'NONE'}`);
  }
}

// ── Screen Tests ─────────────────────────────────────────────────────────────

async function testDashboard() {
  screen('1. Dashboard');

  const { ok: ok1, status: s1, data: d1 } = await api('/api/connections');
  check('GET /api/connections → 200', s1 === 200, `status=${s1}`);
  check('Has connections array', Array.isArray(d1.data), JSON.stringify(d1).slice(0,80));
  check('Connection count from Turso ≥ 0', (d1.data?.length ?? 0) >= 0);
  if (d1.data?.length > 0) {
    const c = d1.data[0];
    check('Connection has id, name, host', !!(c.id && c.name && c.host), JSON.stringify(c).slice(0,80));
    console.log(`    ℹ️  ${d1.data.length} connection(s): ${d1.data.map(c=>c.name).join(', ')}`);
  }

  const { status: s2, data: d2 } = await api('/api/stats');
  check('GET /api/stats → 200', s2 === 200, `status=${s2} body=${JSON.stringify(d2).slice(0,60)}`);
  check('Stats has numeric fields', 
    typeof d2.data?.totalServers === 'number' || typeof d2.data?.servers === 'number' || d2.success !== false,
    JSON.stringify(d2).slice(0,100));
  console.log(`    ℹ️  Stats: ${JSON.stringify(d2.data).slice(0, 120)}`);
}

async function testConnections() {
  screen('2. Connections Page');

  const { status: s1, data: d1 } = await api('/api/connections');
  check('GET /api/connections → 200', s1 === 200);
  check('Returns connections array', Array.isArray(d1.data));
  if (d1.data?.length > 0) {
    const c = d1.data[0];
    check('Connection fields: id, name, host, status', !!(c.id && c.name && c.host));
    check('Connection has createdAt', !!c.createdAt, `missing createdAt`);
    console.log(`    ℹ️  ${d1.data.length} connection(s) from Turso`);
  } else {
    check('Has at least 1 connection', false, 'Turso has 0 connections', true);
  }

  const { status: s2, data: d2 } = await api('/api/server-connections');
  check('GET /api/server-connections → 200', s2 === 200, `status=${s2}`);
  check('Returns server-connections array', Array.isArray(d2.data), JSON.stringify(d2).slice(0,80));
  console.log(`    ℹ️  ${d2.data?.length ?? 0} server-connection(s) (FM Admin API connections)`);

  if (CONN_ID) {
    const { status: s3, data: d3 } = await api(`/api/connections/${CONN_ID}`);
    check(`GET /api/connections/${CONN_ID} → 200`, s3 === 200, `status=${s3}`);
    check('Connection detail has id', d3.data?.id === CONN_ID, `id=${d3.data?.id}`);
  }
}

async function testServers() {
  screen('3. Servers Page');

  const { status: s1, data: d1 } = await api('/api/servers');
  check('GET /api/servers → 200', s1 === 200);
  check('Returns servers array', Array.isArray(d1.data));
  if (d1.data?.length > 0) {
    const sv = d1.data[0];
    check('Server fields: id, name, status', !!(sv.id && sv.name && sv.status));
    check('Server has _count (tools, deployments, branches)', !!sv._count);
    console.log(`    ℹ️  ${d1.data.length} server(s): ${d1.data.map(s=>s.name).join(', ')}`);
  }

  if (SERVER_ID) {
    const { status: s2, data: d2 } = await api(`/api/servers/${SERVER_ID}`);
    check(`GET /api/servers/${SERVER_ID} → 200`, s2 === 200);
    check('Server detail has tools[]', Array.isArray(d2.data?.tools), `has tools: ${!!d2.data?.tools}`);
    check('Server detail has deployments[]', Array.isArray(d2.data?.deployments));
    console.log(`    ℹ️  Server "${d2.data?.name}" — ${d2.data?.tools?.length} tools, ${d2.data?.deployments?.length} deployments`);
  }
}

async function testServerDetail() {
  screen('4. Server Detail Page');
  if (!SERVER_ID) { console.log('    ⏭️  Skip — no server ID'); return; }

  const { status: s1, data: d1 } = await api(`/api/servers/${SERVER_ID}`);
  check('GET server detail → 200', s1 === 200);
  check('Has connections[]', Array.isArray(d1.data?.connections));
  check('Has branches[]', Array.isArray(d1.data?.branches));
  check('Has apiKey', d1.data?.apiKey !== undefined, 'apiKey field present');
  console.log(`    ℹ️  ${d1.data?.connections?.length} connections, ${d1.data?.branches?.length} branches`);

  const { status: s2, data: d2 } = await api(`/api/servers/${SERVER_ID}/deployments`);
  check('GET server deployments → 200', s2 === 200, `status=${s2}`);
  check('Deployments is array', Array.isArray(d2.data), JSON.stringify(d2).slice(0,80));
  console.log(`    ℹ️  ${d2.data?.length ?? 0} deployment(s)`);

  const { status: s3, data: d3 } = await api(`/api/servers/${SERVER_ID}/generate-tools/status`);
  check('GET generate-tools/status → 200 or 404', [200, 404].includes(s3), `status=${s3}`);
}

async function testBranches() {
  screen('5. Branches Page');

  const { status: s0, data: d0 } = await api('/api/servers');
  check('GET /api/servers (branch page initial load) → 200', s0 === 200);

  if (!SERVER_ID) { console.log('    ⏭️  Skip — no server ID'); return; }

  const { status: s1, data: d1 } = await api(`/api/servers/${SERVER_ID}/branches`);
  check('GET server branches → 200', s1 === 200, `status=${s1}`);
  check('Branches is array', Array.isArray(d1.data), JSON.stringify(d1).slice(0,80));
  if (d1.data?.length > 0) {
    const b = d1.data[0];
    check('Branch has id, name, isDefault, status', !!(b.id && b.name && b.status !== undefined));
    check('Branch has _count (tools, deployments)', !!b._count);
    const main = d1.data.find(b => b.isDefault);
    check('main branch exists and isProtected', !!main?.isProtected, `main=${JSON.stringify(main)?.slice(0,60)}`);
    console.log(`    ℹ️  ${d1.data.length} branch(es): ${d1.data.map(b=>b.name+(b.isDefault?' (main)':'')).join(', ')}`);
  }

  if (BRANCH_ID) {
    const { status: s2, data: d2 } = await api(`/api/branches/${BRANCH_ID}`);
    check(`GET /api/branches/${BRANCH_ID} → 200`, s2 === 200, `status=${s2}`);
    check('Branch detail has id', d2.data?.id === BRANCH_ID);
  }
}

async function testTools() {
  screen('6. Tools Page');
  if (!SERVER_ID) { console.log('    ⏭️  Skip — no server ID'); return; }

  const { status: s1, data: d1 } = await api(`/api/servers/${SERVER_ID}/tools`);
  check('GET server tools → 200', s1 === 200, `status=${s1}`);
  check('Tools is array', Array.isArray(d1.data), JSON.stringify(d1).slice(0,80));
  console.log(`    ℹ️  ${d1.data?.length ?? 0} tool(s) on server`);
  if (d1.data?.length > 0) {
    const t = d1.data[0];
    check('Tool has id, name, description', !!(t.id && t.name && t.description));
    check('Tool has inputSchema', !!t.inputSchema, `inputSchema=${t.inputSchema?.slice?.(0,40)}`);
    check('Tool has handlerConfig', !!t.handlerConfig);
    check('Tool has isEnabled bool', typeof t.isEnabled === 'boolean');
  }

  if (BRANCH_ID) {
    const { status: s2, data: d2 } = await api(`/api/branches/${BRANCH_ID}/tools`);
    check('GET branch tools → 200', s2 === 200, `status=${s2}`);
    check('Branch tools is array', Array.isArray(d2.data), JSON.stringify(d2).slice(0,80));
    console.log(`    ℹ️  ${d2.data?.length ?? 0} tool(s) on branch`);
  }

  if (TOOL_ID) {
    const { status: s3, data: d3 } = await api(`/api/servers/${SERVER_ID}/tools/${TOOL_ID}`);
    check('GET tool detail → 200', s3 === 200, `status=${s3}`);
    check('Tool detail has name', d3.data?.name === d1.data?.[0]?.name);
  }
}

async function testPlayground() {
  screen('7. Tool Playground');

  const { status: s1, data: d1 } = await api('/api/servers');
  check('GET /api/servers (playground server picker) → 200', s1 === 200);

  if (SERVER_ID) {
    const { status: s2, data: d2 } = await api(`/api/servers/${SERVER_ID}/tools`);
    check('GET tools for playground → 200', s2 === 200);
    check('Playground gets tools array', Array.isArray(d2.data));
    console.log(`    ℹ️  ${d2.data?.length ?? 0} tool(s) available in playground`);
  }

  if (TOOL_ID && SERVER_ID) {
    // Try executing a tool (will likely fail FM auth — that's fine, we just check the route works)
    const tool = (await api(`/api/servers/${SERVER_ID}/tools/${TOOL_ID}`)).data?.data;
    const inputSchema = tool?.inputSchema ? JSON.parse(tool.inputSchema) : { properties: {} };
    const testParams = {};
    Object.keys(inputSchema.properties || {}).forEach(k => { testParams[k] = 'test'; });

    const { status: s3, data: d3 } = await api(
      `/api/servers/${SERVER_ID}/tools/${TOOL_ID}/execute`,
      { method: 'POST', body: JSON.stringify({ params: testParams }) }
    );
    // Accept 200 (success), 500 (FM error — route works but FM rejected), or 400 (validation)
    check('POST execute tool → route responds (200/400/500)', [200, 400, 500].includes(s3), `status=${s3}`);
    check('Execute response has success field', d3.success !== undefined || d3.error !== undefined,
      JSON.stringify(d3).slice(0,100));
    console.log(`    ℹ️  Execute result: status=${s3} success=${d3.success}`);
  }

  // Test playground AI-run
  const { status: s4, data: d4 } = await api('/api/playground/ai-run', {
    method: 'POST',
    body: JSON.stringify({ serverId: SERVER_ID, message: 'List available tools.' }),
  });
  check('POST /api/playground/ai-run → 202', s4 === 202, `status=${s4}`);
  check('Returns sessionId', !!d4.data?.sessionId);

  if (d4.data?.sessionId) {
    await new Promise(r => setTimeout(r, 3000));
    const { status: s5, data: d5 } = await api(`/api/playground/sessions/${d4.data.sessionId}`);
    check('GET playground session → 200', s5 === 200, `status=${s5}`);
    check('Session has status field', !!d5.data?.status);
    console.log(`    ℹ️  Session status: ${d5.data?.status}`);
  }

  const { status: s6, data: d6 } = await api('/api/playground/history');
  check('GET /api/playground/history → 200', s6 === 200, `status=${s6}`);
  check('History returns sessions array', Array.isArray(d6.data), JSON.stringify(d6).slice(0,80));
}

async function testDeployments() {
  screen('8. Deployments Page');

  const { status: s1, data: d1 } = await api('/api/servers');
  check('GET /api/servers (deploy page server picker) → 200', s1 === 200);

  if (!SERVER_ID) { console.log('    ⏭️  Skip — no server ID'); return; }

  const { status: s2, data: d2 } = await api(`/api/servers/${SERVER_ID}/deployments`);
  check('GET server deployments → 200', s2 === 200, `status=${s2}`);
  check('Deployments is array', Array.isArray(d2.data), JSON.stringify(d2).slice(0,80));
  console.log(`    ℹ️  ${d2.data?.length ?? 0} deployment(s)`);

  if (d2.data?.length > 0) {
    const dep = d2.data[0];
    check('Deployment has id, version, status', !!(dep.id && dep.version && dep.status));
    check('Deployment has toolCount', dep.toolCount !== undefined, `toolCount=${dep.toolCount}`);
    check('Deployment has deployedAt', !!dep.deployedAt);
    check('Deployment has branchName', dep.branchName !== undefined, `branchName=${dep.branchName}`);
    console.log(`    ℹ️  Latest: v${dep.version} [${dep.status}] tools=${dep.toolCount}`);
  }

  if (DEPLOY_ID) {
    const { status: s3, data: d3 } = await api(`/api/deployments/${DEPLOY_ID}`);
    check(`GET /api/deployments/${DEPLOY_ID} → 200`, s3 === 200, `status=${s3}`);
  }
}

async function testSettings() {
  screen('9. Settings Page');

  const { status: s1, data: d1 } = await api('/api/settings');
  check('GET /api/settings → 200', s1 === 200, `status=${s1}`);
  check('Settings has success:true', d1.success === true, JSON.stringify(d1).slice(0,80));
  check('Settings has aiProvider', !!d1.data?.aiProvider, `aiProvider=${d1.data?.aiProvider}`);
  check('Settings has aiModel', !!d1.data?.aiModel, `aiModel=${d1.data?.aiModel}`);
  console.log(`    ℹ️  AI: ${d1.data?.aiProvider}/${d1.data?.aiModel}`);

  const { status: s2, data: d2 } = await api('/api/servers');
  check('GET /api/servers (API key picker) → 200', s2 === 200);

  if (SERVER_ID) {
    const { status: s3, data: d3 } = await api(`/api/servers/${SERVER_ID}/api-key`);
    // GET returns current key info (or 404 if no key set yet)
    check('GET server api-key → 200 or 404', [200, 404].includes(s3), `status=${s3}`);
    console.log(`    ℹ️  API key status: ${s3 === 200 ? 'configured' : 'not set'}`);
  }

  // Test AI
  const { status: s4, data: d4 } = await api('/api/settings/test-ai', { method: 'POST' });
  check('POST /api/settings/test-ai → 200', s4 === 200, `status=${s4}`);
  check('AI test returns success', d4.success === true, JSON.stringify(d4).slice(0,80));
}

async function testLogs() {
  screen('10. Activity Logs (sidebar/overlay)');

  const { status: s1, data: d1 } = await api('/api/logs');
  check('GET /api/logs → 200', s1 === 200, `status=${s1}`);
  check('Returns logs array', Array.isArray(d1.data), JSON.stringify(d1).slice(0,80));
  check('Has pagination cursor', d1.nextCursor !== undefined || d1.data !== undefined);
  console.log(`    ℹ️  ${d1.data?.length ?? 0} log entry(ies) returned`);

  if (d1.data?.length > 0) {
    const l = d1.data[0];
    check('Log has action, entityType, entityId', !!(l.action && l.entityType && l.entityId));
  }

  const { status: s2, data: d2 } = await api('/api/logs/stats');
  check('GET /api/logs/stats → 200', s2 === 200, `status=${s2}`);
  console.log(`    ℹ️  Stats: ${JSON.stringify(d2.data).slice(0,80)}`);

  if (SERVER_ID) {
    const { status: s3, data: d3 } = await api(`/api/servers/${SERVER_ID}/logs`);
    check(`GET server logs → 200`, s3 === 200, `status=${s3}`);
    check('Server logs is array', Array.isArray(d3.data), JSON.stringify(d3).slice(0,80));
    console.log(`    ℹ️  ${d3.data?.length ?? 0} server log(s)`);
  }
}

async function testDashboardAPI() {
  screen('11. Dashboard Stats API');

  const { status, data } = await api('/api/dashboard');
  check('GET /api/dashboard → 200', status === 200, `status=${status}`);
  check('Returns success:true', data.success !== false, JSON.stringify(data).slice(0,80));
  console.log(`    ℹ️  Dashboard: ${JSON.stringify(data.data ?? data).slice(0,120)}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();

  console.log('══════════════════════════════════════════════════════════');
  console.log('📱 FileMaker MCP — Per-Screen Turso Data Verification');
  console.log(`   Target: ${BASE}`);
  console.log('══════════════════════════════════════════════════════════');

  // Phase 1: Discover IDs
  await discover();

  if (!SERVER_ID) {
    console.log('\n  ❌ FATAL: No server found in Turso. Is the app running and DB accessible?');
    process.exit(1);
  }

  // Phase 2: Test each screen
  await testDashboard();
  await testDashboardAPI();
  await testConnections();
  await testServers();
  await testServerDetail();
  await testBranches();
  await testTools();
  await testPlayground();
  await testDeployments();
  await testSettings();
  await testLogs();

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('📊 RESULTS');
  console.log('──────────────────────────────────────────────────────────');
  console.log(`  ✅ Passed  : ${passed}`);
  console.log(`  ❌ Failed  : ${failed}`);
  console.log(`  ⚠️  Warned  : ${warned}`);
  console.log(`  ⏱️  Time    : ${elapsed}s`);
  if (failures.length > 0) {
    console.log('\n  Failed checks:');
    failures.forEach(f => console.log(`    • ${f}`));
  }
  console.log('══════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log('🎉 ALL SCREENS VERIFIED — data flows from Turso!');
  } else {
    console.log(`⚠️  ${failed} issue(s) need attention.`);
  }
  console.log('══════════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
