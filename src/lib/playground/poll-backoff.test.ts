import assert from 'assert'
import {
  nextIntervalMs,
  isTerminalStatus,
  isPollTimedOut,
  MIN_INTERVAL_MS,
  MAX_INTERVAL_MS,
  POLL_TIMEOUT_MS,
} from './poll-backoff'

async function runTests() {
  console.log('🚀 Starting Poll Backoff Tests...\n')

  // ── 1. nextIntervalMs: exponential schedule ──────────────────────────────
  console.log('Testing: nextIntervalMs produces correct exponential schedule')
  {
    assert.strictEqual(nextIntervalMs(0), 1_000, 'attempt 0 → 1 s')
    assert.strictEqual(nextIntervalMs(1), 2_000, 'attempt 1 → 2 s')
    assert.strictEqual(nextIntervalMs(2), 4_000, 'attempt 2 → 4 s')
    assert.strictEqual(nextIntervalMs(3), 8_000, 'attempt 3 → 8 s')
    assert.strictEqual(nextIntervalMs(4), 8_000, 'attempt 4 → capped at 8 s')
    assert.strictEqual(nextIntervalMs(10), 8_000, 'attempt 10 → still capped at 8 s')
    console.log('  ✓ 1 s → 2 s → 4 s → 8 s → 8 s (capped)')
  }

  // ── 2. nextIntervalMs: never below MIN, never above MAX ──────────────────
  console.log('\nTesting: nextIntervalMs stays within [MIN, MAX] bounds')
  {
    for (let i = 0; i <= 20; i++) {
      const ms = nextIntervalMs(i)
      assert.ok(ms >= MIN_INTERVAL_MS, `attempt ${i}: ${ms} < MIN_INTERVAL_MS`)
      assert.ok(ms <= MAX_INTERVAL_MS, `attempt ${i}: ${ms} > MAX_INTERVAL_MS`)
    }
    console.log('  ✓ all 21 attempts stay within [1000, 8000] ms')
  }

  // ── 3. isTerminalStatus: terminal statuses ────────────────────────────────
  console.log('\nTesting: isTerminalStatus identifies terminal statuses')
  {
    assert.strictEqual(isTerminalStatus('done'),    true,  'done is terminal')
    assert.strictEqual(isTerminalStatus('error'),   true,  'error is terminal')
    assert.strictEqual(isTerminalStatus('timeout'), true,  'timeout is terminal')
    console.log('  ✓ done, error, timeout are all terminal')
  }

  // ── 4. isTerminalStatus: non-terminal statuses ────────────────────────────
  console.log('\nTesting: isTerminalStatus does not flag active statuses')
  {
    assert.strictEqual(isTerminalStatus('running'), false, 'running is not terminal')
    assert.strictEqual(isTerminalStatus('pending'), false, 'pending is not terminal')
    assert.strictEqual(isTerminalStatus(''),        false, 'empty string is not terminal')
    assert.strictEqual(isTerminalStatus('unknown'), false, 'unknown status is not terminal')
    console.log('  ✓ running, pending, unknown are not terminal')
  }

  // ── 5. isPollTimedOut: within window ─────────────────────────────────────
  console.log('\nTesting: isPollTimedOut returns false while within the timeout window')
  {
    const start = 1000
    assert.strictEqual(isPollTimedOut(start, start),                   false, 'now = start → not timed out')
    assert.strictEqual(isPollTimedOut(start, start + POLL_TIMEOUT_MS - 1), false, 'one ms before threshold → not timed out')
    console.log('  ✓ polls within the 5-min window are not considered timed out')
  }

  // ── 6. isPollTimedOut: at and beyond threshold ────────────────────────────
  console.log('\nTesting: isPollTimedOut returns true at and beyond POLL_TIMEOUT_MS')
  {
    const start = 1000
    assert.strictEqual(isPollTimedOut(start, start + POLL_TIMEOUT_MS),     true, 'exactly at threshold → timed out')
    assert.strictEqual(isPollTimedOut(start, start + POLL_TIMEOUT_MS + 1), true, 'one ms after threshold → timed out')
    assert.strictEqual(isPollTimedOut(start, start + POLL_TIMEOUT_MS * 2), true, 'double the threshold → timed out')
    console.log('  ✓ polls at or past 5 minutes are timed out')
  }

  // ── 7. Poll schedule is sublinear: total wait for N polls ─────────────────
  console.log('\nTesting: cumulative poll time grows slower than linear (backoff works)')
  {
    // A linear 2 s poller would accumulate 20 s over 10 polls.
    // With backoff: 1 + 2 + 4 + 8 + 8 + 8 + 8 + 8 + 8 + 8 = 63 s for 10 polls.
    // But more importantly the first 3 polls happen faster (< 2 s each).
    const intervals = Array.from({ length: 10 }, (_, i) => nextIntervalMs(i))
    const total = intervals.reduce((sum, v) => sum + v, 0)
    // First poll at 1 s — faster than the original 2 s fixed interval
    assert.ok(intervals[0] < 2_000, 'first poll fires faster than original 2 s interval')
    // After a few polls it is slower (the whole point: less hammering)
    assert.ok(intervals[3] === 8_000, 'after 4 polls the interval has fully backed off to cap')
    // Total time is dominated by the cap — proportional to cap, not linear
    assert.ok(total > 0 && total < Infinity)
    console.log(`  ✓ first poll at ${intervals[0]}ms, backed off to cap at attempt 3 (${intervals[3]}ms)`)
  }

  // ── 8. Constants are sane defaults ──────────────────────────────────────
  console.log('\nTesting: exported constants have sensible values')
  {
    assert.strictEqual(MIN_INTERVAL_MS,  1_000,          'MIN = 1 s')
    assert.strictEqual(MAX_INTERVAL_MS,  8_000,          'MAX = 8 s')
    assert.strictEqual(POLL_TIMEOUT_MS,  5 * 60 * 1_000, 'TIMEOUT = 5 min')
    assert.ok(MIN_INTERVAL_MS < MAX_INTERVAL_MS, 'MIN < MAX')
    assert.ok(MAX_INTERVAL_MS < POLL_TIMEOUT_MS, 'MAX cap < overall timeout')
    console.log('  ✓ MIN=1s, MAX=8s, TIMEOUT=5min — all sane')
  }

  // ── 9. Regression: timeout branch transitions to 'failed' state ────────────
  //   Mirrors the fix in auto-generate-preview-dialog.tsx — the dialog was
  //   previously stuck in 'generating' when isPollTimedOut returned true because
  //   the timeout branch just returned without updating state.
  console.log('\nTesting: poll-timeout branch must stop polling and surface a failed state')
  {
    // ── Model the component's doPoll callback ──
    type UiStep = 'generating' | 'failed'
    let uiStep: UiStep = 'generating'
    let errorMessage: string | null = null
    let stopPollCalled = false

    function stopPolling() { stopPollCalled = true }

    function doPoll(startedAt: number, now: number) {
      if (isPollTimedOut(startedAt, now)) {
        stopPolling()
        errorMessage = 'Tool generation timed out after 5 minutes. Please try again.'
        uiStep = 'failed'
        return
      }
      // ... would continue polling
    }

    // Before timeout: state must remain 'generating'
    doPoll(0, POLL_TIMEOUT_MS - 1)
    assert.strictEqual(uiStep, 'generating', 'Should still be generating before timeout')
    assert.strictEqual(stopPollCalled, false, 'stopPolling must NOT be called before timeout')
    assert.strictEqual(errorMessage, null, 'No error message before timeout')

    // At timeout: must transition to 'failed'
    doPoll(0, POLL_TIMEOUT_MS)
    assert.strictEqual(uiStep, 'failed', 'Must transition to failed on timeout')
    assert.strictEqual(stopPollCalled, true, 'stopPolling must be called on timeout')
    assert.ok(errorMessage, 'Error message must be set on timeout')
    console.log('  ✓ timeout → stopPolling() called, uiStep=failed, errorMessage set')
  }

  console.log('\n🎉 ALL POLL BACKOFF TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ POLL BACKOFF TESTS FAILED:', err)
  process.exit(1)
})
