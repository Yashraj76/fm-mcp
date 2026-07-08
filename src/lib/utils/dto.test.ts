import assert from 'assert';
import { toSafeTool, toSafeDeployment, toSafeConnection, toSafeServer } from './dto';

async function runTests() {
  console.log('🚀 Starting DTO Sanitization Smoke Tests...\n');

  try {
    console.log('Testing toSafeTool sanitization...');
    {
      const toolInput = {
        id: 'tool-1',
        serverId: 'server-1',
        name: 'test_tool',
        description: 'Testing',
        handlerConfig: JSON.stringify({
          layout: 'Customers',
          password: 'secret-password',
          clientSecret: 'my-client-secret',
          accessToken: 'my-token',
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
        isEnabled: true,
        isAiGenerated: false,
        version: 1,
        sortOrder: 0,
      };

      const safeTool = toSafeTool(toolInput);
      assert.ok(safeTool, 'SafeTool should be returned');
      const parsedConfig = JSON.parse(safeTool.handlerConfig);
      
      assert.strictEqual(parsedConfig.layout, 'Customers', 'Safe config should keep valid data');
      assert.strictEqual(parsedConfig.password, undefined, 'Password should be stripped');
      assert.strictEqual(parsedConfig.clientSecret, undefined, 'Client secret should be stripped');
      assert.strictEqual(parsedConfig.accessToken, undefined, 'Access token should be stripped');
      console.log('  ✓ toSafeTool properly sanitized credentials');
    }

    console.log('\nTesting toSafeDeployment sanitization...');
    {
      const depInput = {
        id: 'dep-1',
        serverId: 'server-1',
        branchId: 'branch-1',
        version: '1.0.0',
        status: 'active',
        isLive: true,
        snapshot: JSON.stringify({
          connections: [
            { id: 'conn-1', password: 'secret-password-1', clientSecret: 'secret-2' },
            { id: 'conn-2', otherInfo: 'safe' }
          ]
        }),
        deployedAt: new Date(),
        createdAt: new Date(),
      };

      const safeDep = toSafeDeployment(depInput);
      assert.ok(safeDep, 'SafeDeployment should be returned');
      const parsedSnap = JSON.parse(safeDep.snapshot);
      
      assert.strictEqual(parsedSnap.connections[0].password, undefined, 'Password should be stripped from snapshot');
      assert.strictEqual(parsedSnap.connections[0].clientSecret, undefined, 'Client secret should be stripped from snapshot');
      assert.strictEqual(parsedSnap.connections[1].otherInfo, 'safe', 'Safe info should remain');
      console.log('  ✓ toSafeDeployment properly sanitized credentials in snapshots');
    }

    console.log('\nTesting toSafeConnection: schema blob exclusion + lightweight browsedSchema passthrough...');
    {
      // Simulate the new detail-GET shape: selectedLayouts/selectedTables only, no compiledSchema
      const connInput = {
        id: 'conn-1', userId: 'user-1', name: 'Test DB', host: 'fm.example.com',
        port: 443, database: 'MyDB', username: 'admin', authType: 'basic',
        sslVerify: true, status: 'connected',
        createdAt: new Date(), updatedAt: new Date(),
        browsedSchema: { selectedLayouts: '["Contacts","Invoices"]', selectedTables: '["T1"]' },
        // relationshipGraph intentionally absent (not fetched in new query)
      };

      const safe = toSafeConnection(connInput);
      assert.ok(safe, 'SafeConnection should be returned');
      assert.ok(safe.browsedSchema, 'browsedSchema should be present');
      assert.strictEqual((safe.browsedSchema as any).compiledSchema, undefined,
        'compiledSchema must not appear in response — it was not fetched');
      assert.strictEqual(safe.relationshipGraph, undefined,
        'relationshipGraph must be absent when not fetched');

      const layouts = JSON.parse((safe.browsedSchema as any).selectedLayouts || '[]');
      assert.strictEqual(layouts.length, 2, 'selectedLayouts should parse to 2 entries');
      const tables = JSON.parse((safe.browsedSchema as any).selectedTables || '[]');
      assert.strictEqual(tables.length, 1, 'selectedTables should parse to 1 entry');
      console.log('  ✓ toSafeConnection: compiledSchema absent, selectedLayouts/selectedTables pass through correctly');
    }

    console.log('\nTesting toSafeServer list mode: tools returned without heavy fields...');
    {
      // Simulate list-GET shape: tools fetched with select (no handlerConfig/inputSchema)
      const serverInput = {
        id: 'srv-1', userId: 'u-1', name: 'My Server', version: '1.0.0',
        status: 'draft', config: '{}', createdAt: new Date(), updatedAt: new Date(),
        tools: [
          // Only fields included by the select in the list route
          { id: 't-1', name: 'my_tool', isEnabled: true, category: 'Find', sortOrder: 0 },
        ],
      };

      const safe = toSafeServer(serverInput);
      assert.ok(safe, 'SafeServer should be returned');
      assert.ok(Array.isArray(safe.tools) && safe.tools.length === 1, 'tools array should have one entry');
      assert.strictEqual(safe.tools[0].name, 'my_tool');
      // handlerConfig and inputSchema are undefined because the list-GET uses select
      assert.strictEqual(safe.tools[0].handlerConfig, undefined,
        'handlerConfig must be absent in list-mode tool shape');
      assert.strictEqual(safe.tools[0].inputSchema, undefined,
        'inputSchema must be absent in list-mode tool shape');
      console.log('  ✓ toSafeServer list mode: tools lack handlerConfig/inputSchema when not fetched');
    }

    console.log('\n🎉 ALL DTO SMOKE TESTS PASSED! 🎉');
  } catch (err) {
    console.error('\n❌ DTO SMOKE TESTS FAILED:', err);
    process.exit(1);
  }
}

runTests();
