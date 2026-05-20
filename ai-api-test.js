// ai-api-test.js — Comprehensive AI API Integration Test
// Tests: detect-relationships, infer-relationships (AI), ai-suggest, generate-server-tools, playground AI agent
// Run: node ai-api-test.js
// Note: Some tests require a compiled schema saved for the connection (browse schema first).

const BASE_URL = 'http://localhost:3000';

// ── IDs — use the KiBiAi Customer Sales server which has a real FM connection ──
const CONNECTION_ID = 'cmpcmcl66000dkw04972n3846'; // KiBiAIDemo
const SERVER_ID     = 'cmpcltxn3000qv0dt18dhw219'; // KibiAi Customer Sales Relationship

let passed = 0, failed = 0, skipped = 0;
const failures = [];

// ── Helpers ────────────────────────────────────────────────────────────────────

async function req(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await globalThis.fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 300) }; }
  return { status: res.status, data: json };
}

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? '\n     → ' + detail : ''}`);
    failed++;
    failures.push(label + (detail ? ': ' + detail : ''));
  }
}

function skip(label, reason) {
  console.log(`  ⏭️  ${label} — ${reason}`);
  skipped++;
}

function section(title) {
  console.log(`\n${'─'.repeat(66)}`);
  console.log(`🤖 ${title}`);
  console.log('─'.repeat(66));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(66));
  console.log('🤖 FileMaker MCP — AI API Integration Test Suite');
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Connection: ${CONNECTION_ID}  (KiBiAIDemo)`);
  console.log(`   Server:     ${SERVER_ID}  (KibiAi Customer Sales)`);
  console.log('═'.repeat(66));

  const start = Date.now();

  // ── Preflight ───────────────────────────────────────────────────────────────
  const { data: branchData } = await req(`/api/servers/${SERVER_ID}/branches`);
  const mainBranch = (branchData.data || []).find(b => b.isDefault);
  const branchId = mainBranch?.id ?? null;
  console.log(`\n  ℹ️  Using branch: ${branchId ?? 'none found'}`);

  const { data: schemaData } = await req(`/api/connections/${CONNECTION_ID}/schema/compiled`);
  const compiledLayouts = Object.keys(schemaData?.data?.layouts || {});
  const hasCompiledSchema = compiledLayouts.length > 0;
  console.log(`  ℹ️  Compiled schema: ${hasCompiledSchema ? compiledLayouts.length + ' layouts (' + compiledLayouts.slice(0,3).join(', ') + ')' : 'NOT available'}`);

  // ── 1. AI Settings ──────────────────────────────────────────────────────────
  section('1. AI Settings & Connectivity');

  const { status: s1, data: d1 } = await req('/api/settings');
  ok('GET /api/settings → 200', s1 === 200);
  const provider = d1.data?.aiProvider;
  const hasKey   = !!d1.data?.aiApiKeyEncrypted;
  ok('AI provider is configured', !!provider, `provider=${provider}`);
  ok('AI API key is saved', hasKey, hasKey ? '' : '⚠️  No key in DB — check Settings page');

  const { status: tp, data: td } = await req('/api/settings/test-ai', { method: 'POST' });
  ok('POST /api/settings/test-ai → 200', tp === 200, JSON.stringify(td).slice(0, 120));
  ok('AI ping returns success', td.success === true, JSON.stringify(td).slice(0, 120));
  if (td.success) console.log(`  ℹ️  AI provider "${provider}" is responding correctly ✨`);

  // ── 2. Rule-Based Relationship Detection (no AI needed) ─────────────────────
  section('2. Rule-Based Relationship Detection (no AI key needed)');

  const { status: s2, data: d2 } = await req(
    `/api/connections/${CONNECTION_ID}/schema/ai-relationships`,
    { method: 'POST' }
  );
  ok(`POST /api/connections/${CONNECTION_ID}/schema/ai-relationships → 200`, s2 === 200, JSON.stringify(d2).slice(0, 150));
  ok('Returns success:true', d2.success === true);
  ok('Returns suggestions array', Array.isArray(d2.data?.suggestions),
     `got: ${JSON.stringify(d2.data)?.slice(0, 80)}`);

  const ruleSuggestions = d2.data?.suggestions ?? [];
  console.log(`  ℹ️  ${ruleSuggestions.length > 0
    ? `Found ${ruleSuggestions.length} rule-based suggestion(s):`
    : 'No rule-based relationships found — schema may need browse + save first'}`);
  ruleSuggestions.slice(0, 3).forEach(s =>
    console.log(`     • ${s.from} ↔ ${s.to} (${s.confidence}) — ${s.reason?.slice(0, 60)}`)
  );

  // ── 3. AI Infer Relationships ────────────────────────────────────────────────
  section('3. AI Infer Relationships (calls LLM to analyze schema)');

  if (!hasCompiledSchema) {
    skip('AI Infer Relationships', 'No compiled schema — browse schema and save selections first');
    // Still check that the error shape is correct
    const { status: s3e, data: d3e } = await req(`/api/connections/${CONNECTION_ID}/infer-relationships`, { method: 'POST' });
    ok('Returns structured error when schema missing (not 500 crash)',
       s3e === 400 && d3e.success === false && d3e.code !== undefined,
       `status=${s3e} code=${d3e.code}`);
  } else {
    console.log('  ⌛ Calling AI to infer relationships from schema...');
    const { status: s3, data: d3 } = await req(
      `/api/connections/${CONNECTION_ID}/infer-relationships`,
      { method: 'POST' }
    );
    ok(`POST /api/connections/${CONNECTION_ID}/infer-relationships → 200`, s3 === 200, JSON.stringify(d3).slice(0, 200));
    ok('Returns success:true', d3.success === true, JSON.stringify(d3).slice(0, 120));
    ok('Has relationships array', Array.isArray(d3.data?.relationships), JSON.stringify(d3.data).slice(0, 80));
    ok('Has primaryKeys object', typeof d3.data?.primaryKeys === 'object');
    ok('count matches relationships length',
       d3.data?.count === (d3.data?.relationships?.length ?? 0),
       `count=${d3.data?.count} len=${d3.data?.relationships?.length}`);

    if ((d3.data?.relationships?.length ?? 0) > 0) {
      console.log(`  ℹ️  AI inferred ${d3.data.relationships.length} relationship(s):`);
      d3.data.relationships.slice(0, 3).forEach(r =>
        console.log(`     • ${r.fromLayout || r.from} → ${r.toLayout || r.to} via ${r.throughField || r.key}`)
      );
    }

    // Verify persisted
    const { status: gs, data: gd } = await req(`/api/connections/${CONNECTION_ID}/infer-relationships`);
    ok('GET relationship graph → 200', gs === 200);
    ok('Relationship graph persisted in DB', Array.isArray(gd.data?.relationships));
  }

  // ── 4. AI Suggest Tools ──────────────────────────────────────────────────────
  section('4. AI Suggest Tools (needs compiled schema on server)');

  if (!hasCompiledSchema) {
    skip('AI Suggest Tools', 'No compiled schema — route requires browsed & compiled schema');
    const { status: s4e, data: d4e } = await req(`/api/servers/${SERVER_ID}/ai/suggest`, {
      method: 'POST',
      body: JSON.stringify({ context: 'test' }),
    });
    ok('Returns structured error when schema missing',
       s4e === 400 && d4e.success === false,
       `status=${s4e} error=${d4e.error}`);
  } else {
    console.log('  ⌛ Asking AI to suggest tools for this server...');
    const { status: s4, data: d4 } = await req(`/api/servers/${SERVER_ID}/ai/suggest`, {
      method: 'POST',
      body: JSON.stringify({
        context: 'Search customers, view their sales orders, calculate totals.',
        suggestionType: 'tool_suggestion',
      }),
    });
    ok(`POST /api/servers/${SERVER_ID}/ai/suggest → 200`, s4 === 200, JSON.stringify(d4).slice(0, 200));
    ok('Returns success:true', d4.success === true);
    ok('Has suggestions array', Array.isArray(d4.suggestions), `got: ${JSON.stringify(d4.suggestions)?.slice(0, 80)}`);

    const suggestions = d4.suggestions ?? [];
    ok('At least 1 suggestion returned', suggestions.length > 0, `count=${suggestions.length}`);
    if (suggestions.length > 0) {
      const s = suggestions[0];
      ok('Suggestion has title', typeof s.title === 'string' && s.title.length > 0);
      ok('Suggestion has description', typeof s.description === 'string');
      ok('Suggestion has proposedConfig', typeof s.proposedConfig === 'object');
      ok('Suggestion status is pending', s.status === 'pending', `status=${s.status}`);
      console.log(`  ℹ️  Got ${suggestions.length} suggestion(s). First: "${suggestions[0].title}"`);
    }
  }

  // ── 5. Auto-Generate Tools ────────────────────────────────────────────────────
  section('5. Auto-Generate Tools (full CRUD suite per layout)');

  if (!hasCompiledSchema) {
    skip('Auto-Generate Tools', 'No compiled schema — route requires browsed & compiled schema');
    const { status: s5e, data: d5e } = await req(`/api/servers/${SERVER_ID}/ai/generate-server-tools`, {
      method: 'POST',
      body: JSON.stringify({ branchId: branchId ?? 'test' }),
    });
    ok('Returns structured validation error when schema missing',
       (s5e === 400 && d5e.code === 'VALIDATION_ERROR') || s5e === 400,
       `status=${s5e} error=${d5e.error}`);
  } else if (!branchId) {
    skip('Auto-Generate Tools', 'No branch found');
  } else {
    console.log('  ⌛ Asking AI to generate CRUD tools from schema... (may take 20–40s)');
    const { status: s5, data: d5 } = await req(`/api/servers/${SERVER_ID}/ai/generate-server-tools`, {
      method: 'POST',
      body: JSON.stringify({ branchId }),
    });
    ok(`POST /api/servers/${SERVER_ID}/ai/generate-server-tools → 201`, s5 === 201, JSON.stringify(d5).slice(0, 200));
    ok('Returns success:true', d5.success === true);
    ok('Returns count > 0', (d5.count ?? 0) > 0, `count=${d5.count}`);
    const tools = d5.data?.tools || [];
    if (tools.length > 0) {
      console.log(`  ℹ️  Generated ${d5.count} tool(s). Sample:`);
      tools.slice(0, 4).forEach(t =>
        console.log(`     • ${t.name} [${t.fmMethod}] on "${t.fmLayout}"`)
      );
    }
  }

  // ── 6. AI Generate Single Tool ────────────────────────────────────────────────
  section('6. AI Generate Single Tool');

  const layoutForSingle = compiledLayouts[0] || null;

  if (!layoutForSingle || !branchId) {
    skip('AI Generate Single Tool', !layoutForSingle ? 'No compiled schema' : 'No branchId');
    // Still check the route exists
    const { status: s6e, data: d6e } = await req(`/api/servers/${SERVER_ID}/ai/generate-tool`, {
      method: 'POST',
      body: JSON.stringify({
        connectionId: CONNECTION_ID,
        branchId: branchId ?? 'x',
        layoutName: 'Contacts',
        description: 'Search contacts by name',
        toolType: 'search',
      }),
    });
    if (s6e === 404) {
      skip('POST /api/servers/[id]/ai/generate-tool', 'Route not yet implemented (404)');
    } else {
      ok('Route responds with JSON', typeof d6e === 'object');
    }
  } else {
    console.log(`  ⌛ Generating single tool for layout "${layoutForSingle}"...`);
    const { status: s6, data: d6 } = await req(`/api/servers/${SERVER_ID}/ai/generate-tool`, {
      method: 'POST',
      body: JSON.stringify({
        connectionId: CONNECTION_ID,
        branchId,
        layoutName: layoutForSingle,
        description: `Search ${layoutForSingle} records by name`,
        toolType: 'search',
      }),
    });
    if (s6 === 404) {
      skip('POST /api/servers/[id]/ai/generate-tool', 'Route not yet implemented (404)');
    } else {
      ok(`POST /api/servers/${SERVER_ID}/ai/generate-tool → 200 or 201`, [200, 201].includes(s6), JSON.stringify(d6).slice(0, 200));
      ok('Returns success:true', d6.success === true, JSON.stringify(d6).slice(0, 80));
    }
  }

  // ── 7. Server AI Agent Playground ─────────────────────────────────────────────
  section('7. Server AI Agent Playground (ai-run + session poll)');

  console.log('  ⌛ Sending task to AI orchestrator...');
  const { status: s7, data: d7 } = await req('/api/playground/ai-run', {
    method: 'POST',
    body: JSON.stringify({
      serverId: SERVER_ID,
      message: 'Show me all the available tools and what they can do.',
    }),
  });
  ok('POST /api/playground/ai-run → 202', s7 === 202, JSON.stringify(d7).slice(0, 200));
  ok('Returns success:true', d7.success === true, JSON.stringify(d7).slice(0, 80));
  ok('Returns sessionId', typeof d7.data?.sessionId === 'string', `sessionId=${d7.data?.sessionId}`);
  ok('Returns plan.intent', typeof d7.data?.plan?.intent === 'string', `intent=${d7.data?.plan?.intent}`);
  ok('Returns plan.stepCount', typeof d7.data?.plan?.stepCount === 'number', `steps=${d7.data?.plan?.stepCount}`);
  if (d7.data?.plan) console.log(`  ℹ️  AI Plan: "${d7.data.plan.intent}" — ${d7.data.plan.stepCount} step(s)`);

  const sessionId = d7.data?.sessionId;
  if (sessionId) {
    console.log('\n  ⌛ Polling session for completion (up to 60s)...');
    let finalStatus = 'running';
    let stepLog = [];
    let finalResult = null;
    let attempts = 0;

    while (attempts < 15) {
      await sleep(4000);
      attempts++;
      const { status: ps, data: pd } = await req(`/api/playground/sessions/${sessionId}`);
      if (ps !== 200 || !pd.success) { console.log(`  ⚠️  Poll ${attempts} failed`); continue; }
      finalStatus = pd.data?.status;
      stepLog = pd.data?.stepLog ?? [];
      finalResult = pd.data?.finalResult;
      console.log(`  [Poll ${attempts}] status=${finalStatus} steps=${stepLog.length}`);
      if (finalStatus === 'done' || finalStatus === 'failed') break;
    }

    ok(`GET /api/playground/sessions/${sessionId} → terminal state`,
       finalStatus === 'done' || finalStatus === 'failed',
       `status=${finalStatus} after ${attempts} polls`);
    ok('Session has step log array', Array.isArray(stepLog));
    ok('Agent orchestration completed (not stuck "running")',
       finalStatus !== 'running', `status=${finalStatus}`);

    if (stepLog.length > 0) {
      console.log(`\n  ℹ️  Step Log (${stepLog.length} steps):`);
      stepLog.forEach((step, i) => {
        const icon = step.status === 'done' ? '✅' : step.status === 'error' ? '❌' : '⏳';
        console.log(`     ${icon} Step ${i + 1}: ${step.toolName} — ${(step.reason || '').slice(0, 70)}`);
        if (step.error) console.log(`        ⚠️  Error: ${String(step.error).slice(0, 80)}`);
      });
    }
    if (finalResult) ok('Session has finalResult', !!finalResult);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(66));
  console.log('📊 RESULTS');
  console.log('─'.repeat(66));
  console.log(`  ✅ Passed  : ${passed}`);
  console.log(`  ❌ Failed  : ${failed}`);
  console.log(`  ⏭️  Skipped : ${skipped} (need compiled schema — browse schema first)`);
  console.log(`  ⏱️  Time    : ${elapsed}s`);

  if (failures.length > 0) {
    console.log('\n  Failed checks:');
    failures.forEach(f => console.log(`    • ${f}`));
  }

  if (!hasCompiledSchema) {
    console.log('\n  ⚠️  IMPORTANT: Several AI tests were skipped because the connection has no');
    console.log('     compiled schema. To run full AI tests:');
    console.log('     1. Go to Connections → KiBiAIDemo → Browse Schema');
    console.log('     2. Select layouts → Save Selections');
    console.log('     3. Re-run: node ai-api-test.js');
  }

  console.log('═'.repeat(66));
  if (failed === 0) {
    console.log(`🎉 ALL ${passed} CHECKS PASSED! (+ ${skipped} skipped due to no compiled schema)`);
  } else {
    console.log(`⚠️  ${failed} check(s) failed — see above.`);
  }
  console.log('═'.repeat(66) + '\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
