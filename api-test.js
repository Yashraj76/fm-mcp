const fetch = require('node:http').request; // We can use node's native fetch if available, which it is since node 18!
const { exec } = require('child_process');

const BASE_URL = 'http://localhost:3000';

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

async function runTests() {
  console.log('================================================================');
  console.log('🚀 Starting MCP Server & Branching System API Integration Tests');
  console.log('================================================================');

  try {
    // 1. GET /api/dashboard
    console.log('\n--- 1. Testing GET /api/dashboard ---');
    const { status: dashStatus, data: dashData } = await testFetch('/api/dashboard');
    if (dashStatus === 200 && dashData.overview) {
      console.log('✅ Dashboard loaded successfully');
      console.log('   Stats:', JSON.stringify(dashData.overview, null, 2));
    } else {
      throw new Error(`Dashboard fetch failed: ${JSON.stringify(dashData)}`);
    }

    // 2. GET /api/servers
    console.log('\n--- 2. Testing GET /api/servers ---');
    const { status: servStatus, data: servData } = await testFetch('/api/servers');
    if (servStatus !== 200 || !servData.success) {
      throw new Error(`Failed to list servers: ${JSON.stringify(servData)}`);
    }
    console.log(`✅ Server list loaded successfully (${servData.data.length} servers found)`);

    let server = servData.data[0];
    if (!server) {
      console.log('ℹ️ No existing server found, creating a new test server...');
      const createRes = await testFetch('/api/servers', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Dynamic Test Server',
          description: 'Used for automated API integration testing',
          version: '1.0.0',
        }),
      });
      if (createRes.status !== 201 || !createRes.data.success) {
        throw new Error(`Failed to create test server: ${JSON.stringify(createRes.data)}`);
      }
      server = createRes.data.data;
      console.log(`✅ Test server created successfully: ID = ${server.id}`);
    } else {
      console.log(`ℹ️ Using existing server: ID = ${server.id}, Name = ${server.name}`);
    }

    const serverId = server.id;

    // 3. GET /api/servers/[id]/branches
    console.log(`\n--- 3. Testing GET /api/servers/${serverId}/branches ---`);
    const { status: listBStatus, data: listBData } = await testFetch(`/api/servers/${serverId}/branches`);
    if (listBStatus !== 200 || !listBData.success) {
      throw new Error(`Failed to list server branches: ${JSON.stringify(listBData)}`);
    }
    console.log(`✅ Branches loaded successfully: found ${listBData.data.length} branches`);
    console.log('   Branches:', listBData.data.map(b => `${b.name} (default: ${b.isDefault}, protected: ${b.isProtected})`));

    // 4. POST /api/servers/[id]/branches (Create branch)
    console.log(`\n--- 4. Testing POST /api/servers/${serverId}/branches ---`);
    const branchName = `feature/api-test-${Date.now().toString().slice(-4)}`;
    const createBranchRes = await testFetch(`/api/servers/${serverId}/branches`, {
      method: 'POST',
      body: JSON.stringify({
        name: branchName,
        description: 'Auto-created branch during test run',
      }),
    });
    if (createBranchRes.status !== 201 || !createBranchRes.data.success) {
      throw new Error(`Failed to create feature branch: ${JSON.stringify(createBranchRes.data)}`);
    }
    const featureBranch = createBranchRes.data.data;
    console.log(`✅ Feature branch created successfully: ID = ${featureBranch.id}, Name = ${featureBranch.name}`);

    // 5. GET /api/branches/[id]/tools
    console.log(`\n--- 5. Testing GET /api/branches/${featureBranch.id}/tools ---`);
    const getBranchRes = await testFetch(`/api/branches/${featureBranch.id}/tools`);
    if (getBranchRes.status !== 200 || !getBranchRes.data.success) {
      throw new Error(`Failed to fetch branch tools: ${JSON.stringify(getBranchRes.data)}`);
    }
    console.log(`✅ Branch tools loaded successfully. Count: ${getBranchRes.data.data.length}`);

    // 6. POST /api/branches/[id]/tools
    console.log(`\n--- 6. Testing POST /api/branches/${featureBranch.id}/tools ---`);
    const toolName = `test_tool_${Date.now().toString().slice(-4)}`;
    const createToolRes = await testFetch(`/api/branches/${featureBranch.id}/tools`, {
      method: 'POST',
      body: JSON.stringify({
        name: toolName,
        description: 'Automated test tool description',
        inputSchema: { type: 'object', properties: { test: { type: 'string' } } },
        handlerConfig: { layout: 'TestLayout', type: 'find', fieldMappings: { test: 'TestField' } },
        handlerType: 'find',
        category: 'custom',
        enabled: true,
      }),
    });
    if (createToolRes.status !== 201 || !createToolRes.data.success) {
      throw new Error(`Failed to create tool on branch: ${JSON.stringify(createToolRes.data)}`);
    }
    const createdTool = createToolRes.data.data;
    console.log(`✅ Custom tool created on branch successfully: ID = ${createdTool.id}`);

    // 7. PUT /api/branches/[id]/tools/[toolId]
    console.log(`\n--- 7. Testing PUT /api/branches/${featureBranch.id}/tools/${createdTool.id} ---`);
    const updateToolRes = await testFetch(`/api/branches/${featureBranch.id}/tools/${createdTool.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        description: 'Updated automated test tool description',
        enabled: true,
      }),
    });
    if (updateToolRes.status !== 200 || !updateToolRes.data.success) {
      throw new Error(`Failed to update tool on branch: ${JSON.stringify(updateToolRes.data)}`);
    }
    console.log(`✅ Tool override updated successfully: ${JSON.stringify(updateToolRes.data.data)}`);

    // 8. GET /api/branches/[id]/diff
    console.log(`\n--- 8. Testing GET /api/branches/${featureBranch.id}/diff ---`);
    const diffRes = await testFetch(`/api/branches/${featureBranch.id}/diff`);
    if (diffRes.status !== 200 || !diffRes.data.success) {
      throw new Error(`Failed to retrieve branch diff: ${JSON.stringify(diffRes.data)}`);
    }
    console.log('✅ Diff retrieved successfully:');
    console.log('   Added tools:', diffRes.data.data.added.map(t => t.name));
    console.log('   Modified tools:', diffRes.data.data.modified.map(t => t.name));
    console.log('   Deleted tools:', diffRes.data.data.deleted);

    // 9. POST /api/branches/[id]/merge
    console.log(`\n--- 9. Testing POST /api/branches/${featureBranch.id}/merge ---`);
    const mergeRes = await testFetch(`/api/branches/${featureBranch.id}/merge`, {
      method: 'POST',
      body: JSON.stringify({
        commitMessage: 'Merge automated API test branch changes',
      }),
    });
    if (mergeRes.status !== 200 || !mergeRes.data.success) {
      throw new Error(`Failed to merge branch: ${JSON.stringify(mergeRes.data)}`);
    }
    const deployment = mergeRes.data.data.deployment;
    console.log(`✅ Branch merged successfully!`);
    console.log(`   New deployment version: ${deployment.version}`);
    console.log(`   Deployment ID: ${deployment.id}`);

    // 10. GET /api/logs
    console.log('\n--- 10. Testing GET /api/logs ---');
    const { status: logStatus, data: logData } = await testFetch('/api/logs');
    if (logStatus !== 200 || !logData.success) {
      throw new Error(`Failed to fetch logs: ${JSON.stringify(logData)}`);
    }
    console.log(`✅ Logs retrieved successfully: found ${logData.data.length} log entries`);
    console.log('   Recent actions:');
    logData.data.slice(0, 5).forEach(l => {
      console.log(`   - [${l.action}] Entity: ${l.entityType} (${l.entityName}) at ${l.createdAt}`);
    });

    // 11. Testing POST /api/deployments/[id]/rollback
    console.log(`\n--- 11. Testing POST /api/deployments/${deployment.id}/rollback ---`);
    const rollbackRes = await testFetch(`/api/deployments/${deployment.id}/rollback`, {
      method: 'POST',
    });
    if (rollbackRes.status !== 200) {
      if (rollbackRes.data && rollbackRes.data.error === 'Already the live deployment') {
        console.log('✅ Rollback validation working correctly: Refused rollback to current active deployment.');
      } else {
        throw new Error(`Rollback failed: ${JSON.stringify(rollbackRes.data)}`);
      }
    } else {
      console.log('✅ Rollback executed successfully!');
      console.log('   Restored version:', rollbackRes.data.data.restoredVersion);
    }

    console.log('\n================================================================');
    console.log('🎉 ALL API TESTS PASSED SUCCESSFULLY! COMPLETE SYSTEM HEALTHY 🎉');
    console.log('================================================================');

  } catch (error) {
    console.error('\n❌ API Testing Failed:', error.message);
    process.exit(1);
  }
}

runTests();
