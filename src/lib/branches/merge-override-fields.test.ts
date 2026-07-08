import assert from 'assert';
import { mergeToolOverrideFields } from './merge-override-fields';

async function runTests() {
  console.log('🚀 Starting mergeToolOverrideFields Tests...\n');

  // ── 1. Primary regression: two sequential PUTs ───────────────────────────
  // First PUT sets handlerConfig; second PUT changes only description.
  // handlerConfig must survive the second write.
  console.log('Testing: two sequential PUTs — handlerConfig survives description-only update');
  {
    const handlerConfig = JSON.stringify({ connectionId: 'conn_1', layout: 'Contacts' });

    // First PUT
    const afterFirstPut = mergeToolOverrideFields(
      {},
      { handlerConfig },
    );
    assert.strictEqual(
      afterFirstPut.handlerConfig,
      handlerConfig,
      'handlerConfig stored after first PUT'
    );
    assert.strictEqual(Object.keys(afterFirstPut).length, 1);

    // Second PUT — only description provided
    const afterSecondPut = mergeToolOverrideFields(
      afterFirstPut,
      { description: 'Updated description' },
    );
    assert.strictEqual(
      afterSecondPut.handlerConfig,
      handlerConfig,
      'handlerConfig must still be present after description-only second PUT'
    );
    assert.strictEqual(
      afterSecondPut.description,
      'Updated description',
      'description from second PUT is saved'
    );
    assert.strictEqual(Object.keys(afterSecondPut).length, 2);
    console.log('  ✓ handlerConfig preserved after description-only second PUT');
  }

  // ── 2. Incoming field overwrites existing ────────────────────────────────
  console.log('\nTesting: incoming field overwrites matching existing field');
  {
    const result = mergeToolOverrideFields(
      { name: 'old_name', description: 'original' },
      { name: 'new_name' },
    );
    assert.strictEqual(result.name, 'new_name', 'name should be overwritten');
    assert.strictEqual(result.description, 'original', 'description should be preserved');
    console.log('  ✓ Incoming field overwrites existing; other fields preserved');
  }

  // ── 3. Empty incoming — existing untouched ───────────────────────────────
  console.log('\nTesting: empty incoming does not change existing');
  {
    const existing = { name: 'keep', handlerConfig: '{"layout":"X"}' };
    const result = mergeToolOverrideFields(existing, {});
    assert.deepStrictEqual(result, existing);
    // Result must be a new object, not a reference to existing
    assert.notStrictEqual(result, existing);
    console.log('  ✓ Empty incoming → existing preserved, new object returned');
  }

  // ── 4. Empty existing + empty incoming ──────────────────────────────────
  console.log('\nTesting: both empty → empty result');
  {
    const result = mergeToolOverrideFields({}, {});
    assert.deepStrictEqual(result, {});
    console.log('  ✓ Both empty → empty result');
  }

  // ── 5. undefined values in incoming are skipped ──────────────────────────
  console.log('\nTesting: undefined values in incoming are not stored');
  {
    const result = mergeToolOverrideFields(
      { name: 'original' },
      { name: undefined as any, description: 'added' },
    );
    assert.strictEqual(result.name, 'original', 'undefined should not overwrite name');
    assert.strictEqual(result.description, 'added');
    console.log('  ✓ undefined incoming values are ignored; existing value kept');
  }

  // ── 6. All five overrideable fields preserved across updates ─────────────
  console.log('\nTesting: all override fields survive across multiple updates');
  {
    const step1 = mergeToolOverrideFields({}, { name: 'find_contacts' });
    const step2 = mergeToolOverrideFields(step1, { description: 'Find contacts by name' });
    const step3 = mergeToolOverrideFields(step2, { handlerConfig: '{"layout":"Contacts"}' });
    const step4 = mergeToolOverrideFields(step3, { inputSchema: '{"type":"object"}' });
    const step5 = mergeToolOverrideFields(step4, { isEnabled: false });

    assert.strictEqual(step5.name, 'find_contacts');
    assert.strictEqual(step5.description, 'Find contacts by name');
    assert.strictEqual(step5.handlerConfig, '{"layout":"Contacts"}');
    assert.strictEqual(step5.inputSchema, '{"type":"object"}');
    assert.strictEqual(step5.isEnabled, false);
    assert.strictEqual(Object.keys(step5).length, 5);
    console.log('  ✓ All five fields accumulated correctly across 5 sequential PUTs');
  }

  // ── 7. isEnabled: false is not skipped ───────────────────────────────────
  console.log('\nTesting: isEnabled:false is stored (falsy but meaningful)');
  {
    const result = mergeToolOverrideFields(
      { isEnabled: true },
      { isEnabled: false },
    );
    assert.strictEqual(result.isEnabled, false);
    console.log('  ✓ isEnabled: false correctly overwrites isEnabled: true');
  }

  console.log('\n🎉 ALL mergeToolOverrideFields TESTS PASSED! 🎉\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
