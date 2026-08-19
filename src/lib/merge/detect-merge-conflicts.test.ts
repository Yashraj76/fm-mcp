import assert from 'assert';
import { detectMergeConflicts } from './detect-merge-conflicts';

async function runTests() {
  console.log('🚀 Starting Merge Conflict Detection Tests...\n');

  console.log('Testing: no conflict when baseUpdatedAt matches current updatedAt');
  {
    const t = new Date('2026-01-01T00:00:00Z');
    const conflicts = detectMergeConflicts([
      { toolId: 't1', toolName: 'find_contacts', baseUpdatedAt: t, currentToolUpdatedAt: t },
    ]);
    assert.strictEqual(conflicts.length, 0);
    console.log('  ✓ Matching base/current updatedAt → no conflict');
  }

  console.log('\nTesting: conflict when base tool changed since this branch edit');
  {
    const base = new Date('2026-01-01T00:00:00Z');
    const current = new Date('2026-01-02T00:00:00Z');
    const conflicts = detectMergeConflicts([
      { toolId: 't1', toolName: 'find_contacts', baseUpdatedAt: base, currentToolUpdatedAt: current },
    ]);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].toolId, 't1');
    assert.strictEqual(conflicts[0].toolName, 'find_contacts');
    assert.strictEqual(conflicts[0].baseUpdatedAt, base.toISOString());
    assert.strictEqual(conflicts[0].currentUpdatedAt, current.toISOString());
    console.log('  ✓ Diverged base tool → flagged as a conflict with both timestamps');
  }

  console.log('\nTesting: null baseUpdatedAt (legacy rows) never flagged');
  {
    const conflicts = detectMergeConflicts([
      { toolId: 't1', toolName: 'legacy_tool', baseUpdatedAt: null, currentToolUpdatedAt: new Date() },
    ]);
    assert.strictEqual(conflicts.length, 0);
    console.log('  ✓ Unknown base (null) is never treated as a conflict');
  }

  console.log('\nTesting: multiple changes, only diverged ones are flagged');
  {
    const t = new Date('2026-01-01T00:00:00Z');
    const changed = new Date('2026-01-05T00:00:00Z');
    const conflicts = detectMergeConflicts([
      { toolId: 'clean', toolName: 'clean_tool', baseUpdatedAt: t, currentToolUpdatedAt: t },
      { toolId: 'conflicted', toolName: 'conflicted_tool', baseUpdatedAt: t, currentToolUpdatedAt: changed },
    ]);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].toolId, 'conflicted');
    console.log('  ✓ Only the diverged tool is reported, clean ones are excluded');
  }

  console.log('\nTesting: empty input returns no conflicts');
  {
    assert.deepStrictEqual(detectMergeConflicts([]), []);
    console.log('  ✓ Empty change list → empty conflict list');
  }

  console.log('\n🎉 ALL MERGE CONFLICT DETECTION TESTS PASSED! 🎉');
}

runTests().catch((err) => {
  console.error('\n❌ MERGE CONFLICT DETECTION TESTS FAILED:', err);
  process.exit(1);
});
