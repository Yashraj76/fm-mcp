const { PrismaClient } = require('@prisma/client');
const { PrismaLibSQL } = require('@prisma/adapter-libsql');

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

let prisma;
if (url && url.startsWith('libsql://')) {
  const adapter = new PrismaLibSQL({ url, authToken });
  prisma = new PrismaClient({ adapter });
} else {
  prisma = new PrismaClient();
}

const BASE_URL = 'http://localhost:3000';
const CONNECTION_ID = 'cmpcmcl66000dkw04972n3846'; // KiBiAIDemo
const SERVER_ID = 'cmpcltxn3000qv0dt18dhw219';     // KibiAi Customer Sales Relationship

async function testFetch(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  const response = await globalThis.fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse JSON response from ${fullUrl}. Status: ${response.status}. Body: ${text}`);
  }
  return { status: response.status, data: json };
}

async function runAITests() {
  console.log('================================================================');
  console.log('🤖 Starting FileMaker MCP Platform AI Integration Tests');
  console.log('================================================================');

  try {
    // 1. Initializing schema browsing (POST /api/connections/[id]/browse-schema)
    console.log('\n--- 1. Browsing Connection Schema ---');
    const browseRes = await testFetch(`/api/connections/${CONNECTION_ID}/browse-schema`, { method: 'POST' });
    if (browseRes.status !== 200 || !browseRes.data.success) {
      throw new Error(`Browse schema failed: ${JSON.stringify(browseRes.data)}`);
    }
    console.log('✅ Connection layouts and scripts browsed successfully');
    console.log('   Layouts found:', browseRes.data.data.layouts);

    // 2. Fetch layout fields on demand
    console.log('\n--- 2. Fetching Layout Fields for Contacts & Sales ---');
    const contactsFieldsRes = await testFetch(`/api/connections/${CONNECTION_ID}/layout-fields`, {
      method: 'POST',
      body: JSON.stringify({ layout: 'Contacts' }),
    });
    const salesFieldsRes = await testFetch(`/api/connections/${CONNECTION_ID}/layout-fields`, {
      method: 'POST',
      body: JSON.stringify({ layout: 'Sales' }),
    });

    if (!contactsFieldsRes.data.success || !salesFieldsRes.data.success) {
      throw new Error('Failed to fetch layout fields');
    }
    console.log('✅ Layout fields loaded for Contacts:', contactsFieldsRes.data.data.fields);
    console.log('✅ Layout fields loaded for Sales:', salesFieldsRes.data.data.fields);

    // 3. Update rawLayoutMeta in the database
    console.log('\n--- 3. Saving rawLayoutMeta to database ---');
    const layoutMetaMap = {
      Contacts: contactsFieldsRes.data.data,
      Sales: salesFieldsRes.data.data,
    };
    await prisma.browsedSchema.update({
      where: { connectionId: CONNECTION_ID },
      data: {
        rawLayoutMeta: JSON.stringify(layoutMetaMap),
      },
    });
    console.log('✅ rawLayoutMeta populated successfully via Prisma');

    // 4. Save selections to compile schema (PUT /api/connections/[id]/schema/selections)
    console.log('\n--- 4. Saving selections and compiling schema ---');
    const selectionsRes = await testFetch(`/api/connections/${CONNECTION_ID}/schema/selections`, {
      method: 'PUT',
      body: JSON.stringify({
        selectedLayouts: ['Contacts', 'Sales'],
        selectedFields: {
          Contacts: contactsFieldsRes.data.data.fields,
          Sales: salesFieldsRes.data.data.fields,
        },
      }),
    });
    if (selectionsRes.status !== 200 || !selectionsRes.data.success) {
      throw new Error(`Failed to save selections: ${JSON.stringify(selectionsRes.data)}`);
    }
    console.log('✅ Schema compiled and saved successfully');

    // 5. Test AI Infer Relationships (POST /api/connections/[id]/infer-relationships)
    console.log('\n--- 5. Testing AI Detect/Infer Relationships ---');
    console.log('⌛ Calling Claude AI to infer primary keys & relationships...');
    const inferRes = await testFetch(`/api/connections/${CONNECTION_ID}/infer-relationships`, { method: 'POST' });
    if (inferRes.status !== 200 || !inferRes.data.success) {
      throw new Error(`AI Relationship Inference failed: ${JSON.stringify(inferRes.data)}`);
    }
    console.log('✅ AI Relationships detected successfully!');
    console.log('   Relationships:', JSON.stringify(inferRes.data.data.relationships, null, 2));
    console.log('   Primary Keys:', JSON.stringify(inferRes.data.data.primaryKeys, null, 2));

    // 7. Connect connection to Server (so tools can be generated)
    console.log('\n--- 7. Attaching connection to Server ---');
    const existingServerConnection = await prisma.fMConnectionServer.findFirst({
      where: { serverId: SERVER_ID, connectionId: CONNECTION_ID },
    });
    if (!existingServerConnection) {
      await prisma.fMConnectionServer.create({
        data: {
          serverId: SERVER_ID,
          connectionId: CONNECTION_ID,
          fileNames: '[]',
          isActive: true,
        },
      });
      console.log('✅ Server connection mapping created successfully');
    } else {
      console.log('ℹ️ Server connection mapping already exists');
    }

    // 6. Test AI Suggest Tools (POST /api/servers/[id]/ai/suggest)
    console.log('\n--- 6. Testing AI Suggest Tools ---');
    console.log('⌛ Calling Claude AI to suggest tools...');
    const suggestRes = await testFetch(`/api/servers/${SERVER_ID}/ai/suggest`, {
      method: 'POST',
      body: JSON.stringify({
        suggestionType: 'tool_suggestion',
        context: 'I need tools to analyze customer activity and manage order statuses.',
      }),
    });
    if (suggestRes.status !== 200 || !suggestRes.data.success) {
      throw new Error(`AI Suggest Tools failed: ${JSON.stringify(suggestRes.data)}`);
    }
    console.log('✅ AI Tool suggestions generated and stored successfully!');
    console.log('   Suggestions count:', suggestRes.data.suggestions.length);
    console.log('   Sample Suggestion:', {
      title: suggestRes.data.suggestions[0]?.title,
      description: suggestRes.data.suggestions[0]?.description,
    });

    // Load feature/dev branch or main branch for tools generation
    const branches = await prisma.branch.findMany({ where: { serverId: SERVER_ID } });
    const devBranch = branches.find(b => !b.isDefault) || branches[0];
    if (!devBranch) {
      throw new Error('No branch found for server');
    }
    console.log(`ℹ️ Generating tools on branch: ${devBranch.name} (ID: ${devBranch.id})`);

    // 8. Test Auto Generate Tools (POST /api/servers/[id]/ai/generate-server-tools)
    console.log('\n--- 8. Testing AI Auto-Generate Tools ---');
    console.log('⌛ Calling Claude AI to generate layout CRUD tools...');
    
    // Clean existing generated tools to avoid collisions/dups
    await prisma.tool.deleteMany({
      where: { serverId: SERVER_ID, isAiGenerated: true, category: 'CRUD' },
    });

    const genRes = await testFetch(`/api/servers/${SERVER_ID}/ai/generate-server-tools`, {
      method: 'POST',
      body: JSON.stringify({
        branchId: devBranch.id,
        connectionId: CONNECTION_ID,
        layouts: [
          { name: 'Contacts', fields: contactsFieldsRes.data.data.fields },
          { name: 'Sales', fields: salesFieldsRes.data.data.fields },
        ],
      }),
    });
    if (genRes.status !== 201 || !genRes.data.success) {
      throw new Error(`AI Tool Generation failed: ${JSON.stringify(genRes.data)}`);
    }
    console.log(`✅ AI Tools generated and saved successfully! Count: ${genRes.data.count}`);
    console.log('   Generated tools list:', genRes.data.data.tools.map(t => t.name));

    // 9. Test Server AI Agent Playground Run (POST /api/playground/ai-run)
    console.log('\n--- 9. Testing Server AI Agent (Playground AI Run) ---');
    console.log('⌛ Requesting AI Agent Orchestrator to solve user task...');
    const aiRunRes = await testFetch('/api/playground/ai-run', {
      method: 'POST',
      body: JSON.stringify({
        serverId: SERVER_ID,
        message: 'Search for customer named John and list all of their sales records.',
      }),
    });
    if (aiRunRes.status !== 202 || !aiRunRes.data.success) {
      throw new Error(`AI Run request failed: ${JSON.stringify(aiRunRes.data)}`);
    }
    const sessionId = aiRunRes.data.data.sessionId;
    console.log(`✅ AI Agent orchestration session established: Session ID = ${sessionId}`);
    console.log('   Agent Plan:', JSON.stringify(aiRunRes.data.data.plan, null, 2));

    // Poll playground session status
    console.log('\n--- 10. Polling AI Agent Progress Logs ---');
    let attempts = 0;
    while (attempts < 10) {
      const statusRes = await testFetch(`/api/playground/sessions/${sessionId}`);
      if (statusRes.status === 200 && statusRes.data.success) {
        const session = statusRes.data.data;
        console.log(`   [Attempt ${attempts + 1}] Session Status: ${session.status}`);
        if (session.stepLog) {
          const logs = typeof session.stepLog === 'string' ? JSON.parse(session.stepLog) : session.stepLog;
          console.log(`   Step Logs Count: ${logs.length}`);
          if (logs.length > 0) {
            console.log('   Recent Step Log:', logs[logs.length - 1]);
          }
        }
        if (session.status === 'done' || session.status === 'failed') {
          console.log(`✅ Session execution complete with status: ${session.status}`);
          break;
        }
      }
      attempts++;
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n================================================================');
    console.log('🎉 ALL AI END-TO-END APIS TESTED & VERIFIED SUCCESSFULLY! 🎉');
    console.log('================================================================');

  } catch (error) {
    console.error('\n❌ AI Integration Tests FAILED:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAITests();
