import assert from 'assert'
import { progressToPhase } from './job-progress'

async function runTests() {
  console.log('🚀 Starting Job Progress Tests...\n')

  // ── 1. Progress range boundaries ─────────────────────────────────────────────
  console.log('Testing: progressToPhase maps progress ranges to correct labels')
  {
    assert.strictEqual(progressToPhase(0), 'Queued...')
    assert.strictEqual(progressToPhase(4), 'Queued...')
    assert.strictEqual(progressToPhase(5), 'Analyzing schema...')
    assert.strictEqual(progressToPhase(19), 'Analyzing schema...')
    assert.strictEqual(progressToPhase(20), 'Preparing schema payload...')
    assert.strictEqual(progressToPhase(34), 'Preparing schema payload...')
    assert.strictEqual(progressToPhase(35), 'Generating tools with AI...')
    assert.strictEqual(progressToPhase(69), 'Generating tools with AI...')
    assert.strictEqual(progressToPhase(70), 'Parsing AI response...')
    assert.strictEqual(progressToPhase(79), 'Parsing AI response...')
    assert.strictEqual(progressToPhase(80), 'Validating tools...')
    assert.strictEqual(progressToPhase(99), 'Validating tools...')
    console.log('  ✓ All progress boundary values map to correct phases')
  }

  // ── 2. Terminal status overrides progress value ───────────────────────────────
  console.log('\nTesting: terminal status overrides numeric progress')
  {
    assert.strictEqual(progressToPhase(100, 'done'), 'Ready to review',
      'done status always yields "Ready to review"')
    assert.strictEqual(progressToPhase(50, 'done'), 'Ready to review',
      'done status overrides mid-progress value')
    assert.strictEqual(progressToPhase(0, 'done'), 'Ready to review',
      'done status overrides zero progress')
    assert.strictEqual(progressToPhase(50, 'failed'), 'Generation failed',
      'failed status overrides mid-progress value')
    assert.strictEqual(progressToPhase(0, 'failed'), 'Generation failed',
      'failed status overrides zero progress')
    console.log('  ✓ done/failed statuses override progress value')
  }

  // ── 3. Running status falls through to progress ───────────────────────────────
  console.log('\nTesting: non-terminal status falls through to progress-based label')
  {
    assert.strictEqual(progressToPhase(35, 'running'), 'Generating tools with AI...')
    assert.strictEqual(progressToPhase(80, 'running'), 'Validating tools...')
    assert.strictEqual(progressToPhase(5, 'pending'), 'Analyzing schema...')
    console.log('  ✓ running/pending status defers to progress value')
  }

  // ── 4. Null / undefined status treated as no-override ─────────────────────────
  console.log('\nTesting: null/undefined status handled gracefully')
  {
    assert.strictEqual(progressToPhase(0, null), 'Queued...')
    assert.strictEqual(progressToPhase(0, undefined), 'Queued...')
    assert.strictEqual(progressToPhase(35, null), 'Generating tools with AI...')
    assert.strictEqual(progressToPhase(35, undefined), 'Generating tools with AI...')
    console.log('  ✓ null/undefined status defers to progress value')
  }

  console.log('\n🎉 ALL JOB PROGRESS TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ JOB PROGRESS TESTS FAILED:', err)
  process.exit(1)
})
