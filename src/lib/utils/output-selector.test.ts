import assert from 'assert';
import { projectByPath } from './output-selector';

async function runTests() {
  console.log('🚀 Starting Output Selector Tests...\n');

  console.log('Testing: empty/null path returns the value unchanged');
  {
    const value = { a: 1 };
    assert.strictEqual(projectByPath(value, ''), value);
    assert.strictEqual(projectByPath(value, null), value);
    assert.strictEqual(projectByPath(value, undefined), value);
    console.log('  ✓ empty/null/undefined path is a no-op');
  }

  console.log('\nTesting: simple dot path into a nested object');
  {
    const value = { response: { data: { name: 'Ada' } } };
    assert.strictEqual(projectByPath(value, 'response.data.name'), 'Ada');
    console.log('  ✓ nested object path resolved');
  }

  console.log('\nTesting: array index syntax');
  {
    const value = { response: { data: [{ fieldData: { Name: 'Ada' } }] } };
    assert.strictEqual(projectByPath(value, 'response.data[0].fieldData.Name'), 'Ada');
    console.log('  ✓ array index resolved');
  }

  console.log('\nTesting: missing path segment returns undefined');
  {
    const value = { response: { data: [] } };
    assert.strictEqual(projectByPath(value, 'response.data[0].fieldData'), undefined);
    assert.strictEqual(projectByPath(value, 'response.missing.deep'), undefined);
    console.log('  ✓ missing segments resolve to undefined, not a throw');
  }

  console.log('\nTesting: non-numeric index into an array returns undefined');
  {
    const value = { list: [1, 2, 3] };
    assert.strictEqual(projectByPath(value, 'list.foo'), undefined);
    console.log('  ✓ non-numeric array index handled safely');
  }

  console.log('\nTesting: path into a primitive returns undefined');
  {
    const value = { count: 5 };
    assert.strictEqual(projectByPath(value, 'count.value'), undefined);
    console.log('  ✓ descending into a primitive is safe');
  }

  console.log('\nTesting: whole-array selector');
  {
    const value = { response: { data: [{ id: 1 }, { id: 2 }] } };
    assert.deepStrictEqual(projectByPath(value, 'response.data'), [{ id: 1 }, { id: 2 }]);
    console.log('  ✓ selecting an array returns it as-is');
  }

  console.log('\n🎉 ALL OUTPUT SELECTOR TESTS PASSED! 🎉');
}

runTests().catch((err) => {
  console.error('\n❌ OUTPUT SELECTOR TESTS FAILED:', err);
  process.exit(1);
});
