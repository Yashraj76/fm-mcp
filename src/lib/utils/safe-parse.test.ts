import assert from 'assert';
import { safeParseJSON } from './safe-parse';

async function runTests() {
  console.log('🚀 Starting Safe Parse Smoke Tests...\n');

  try {
    console.log('Testing valid JSON parsing...');
    {
      const validJson = '{"key": "value", "num": 42}';
      const result = safeParseJSON<{ key: string; num: number }>(validJson);
      assert.deepStrictEqual(result, { key: 'value', num: 42 });
      console.log('  ✓ Valid JSON parsed correctly');
    }

    console.log('\nTesting invalid JSON parsing...');
    {
      const invalidJson = '{"key": "value", "num": 42'; // truncated
      const result = safeParseJSON(invalidJson, { fallback: true });
      assert.deepStrictEqual(result, { fallback: true });
      console.log('  ✓ Invalid JSON safely fell back');
    }

    console.log('\nTesting null/undefined input...');
    {
      const resultNull = safeParseJSON(null, []);
      assert.deepStrictEqual(resultNull, []);
      
      const resultUndefined = safeParseJSON(undefined, {});
      assert.deepStrictEqual(resultUndefined, {});
      
      const resultEmptyStr = safeParseJSON('', 'empty');
      assert.deepStrictEqual(resultEmptyStr, 'empty');
      console.log('  ✓ Null/undefined/empty input safely fell back');
    }

    console.log('\n🎉 ALL SAFE PARSE SMOKE TESTS PASSED! 🎉');
  } catch (err) {
    console.error('\n❌ SAFE PARSE SMOKE TESTS FAILED:', err);
    process.exit(1);
  }
}

runTests();
