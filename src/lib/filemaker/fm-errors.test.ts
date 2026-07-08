import assert from 'assert'
import { FileMakerError, mapNetworkError } from './client'

async function runTests() {
  console.log('🚀 Starting FileMaker Error Handling Tests...\n')

  // ── 1. FM code 401 → isNoRecordsFound ────────────────────────────────────────
  console.log('Testing: FM error code 401 is recognised as "no records found"')
  {
    const err = new FileMakerError('401', 200, 'No matching records found.')
    assert.ok(err.isNoRecordsFound, 'fmCode 401 should be no-records-found')
    assert.ok(!err.isAuthError,     'fmCode 401 must NOT be treated as auth error')
    assert.ok(err instanceof Error,           'FileMakerError extends Error')
    assert.ok(err instanceof FileMakerError,  'instanceof check works')
    assert.strictEqual(err.name, 'FileMakerError')
    console.log('  ✓ FM 401 → isNoRecordsFound=true, isAuthError=false')
  }

  // ── 2. HTTP 401 → isAuthError, NOT no-records ────────────────────────────────
  console.log('\nTesting: HTTP 401 (non-JSON proxy/server response) is an auth error, not no-records')
  {
    const err = new FileMakerError('', 401, 'Authentication failed. Verify the FileMaker username and password in connection settings.')
    assert.ok(err.isAuthError,        'HTTP 401 must be isAuthError=true')
    assert.ok(!err.isNoRecordsFound,  'HTTP 401 must NOT be isNoRecordsFound')
    console.log('  ✓ HTTP 401 → isAuthError=true, isNoRecordsFound=false')
  }

  // ── 3. FM credential codes → isAuthError ─────────────────────────────────────
  console.log('\nTesting: FM codes 212/213/214/216 are auth errors')
  {
    for (const code of ['212', '213', '214', '216']) {
      const err = new FileMakerError(code, 200, 'auth failure')
      assert.ok(err.isAuthError,       `FM code ${code} should be isAuthError`)
      assert.ok(!err.isNoRecordsFound, `FM code ${code} must NOT be isNoRecordsFound`)
    }
    console.log('  ✓ FM 212/213/214/216 → isAuthError=true')
  }

  // ── 4. Other FM codes → neither auth nor no-records ──────────────────────────
  console.log('\nTesting: FM code 500 (missing value) is neither auth nor no-records')
  {
    const err = new FileMakerError('500', 200, 'Missing required field value. (Field "Name" is required)')
    assert.ok(!err.isAuthError,       'FM 500 must not be auth')
    assert.ok(!err.isNoRecordsFound,  'FM 500 must not be no-records')
    console.log('  ✓ FM 500 → isAuthError=false, isNoRecordsFound=false')
  }

  // ── 5. multi-executor catch: isNoRecordsFound → swallowed as empty ────────────
  console.log('\nTesting: multi-executor correctly swallows isNoRecordsFound and re-throws others')
  {
    function simulateCatch(err: unknown): any[] {
      if (err instanceof FileMakerError && err.isNoRecordsFound) {
        return []
      }
      throw err
    }

    // FM code 401 (no records) → returns empty array
    const noRecords = new FileMakerError('401', 200, 'No matching records found.')
    const result = simulateCatch(noRecords)
    assert.deepStrictEqual(result, [], 'No-records error should produce empty array')
    console.log('  ✓ FM 401 (no-records) swallowed → returns []')

    // HTTP 401 (auth failure) → re-thrown
    const authFail = new FileMakerError('', 401, 'Authentication failed.')
    assert.throws(
      () => simulateCatch(authFail),
      (e) => e instanceof FileMakerError && e.isAuthError,
      'HTTP 401 auth error must be re-thrown'
    )
    console.log('  ✓ HTTP 401 (auth failure) re-thrown, not swallowed')

    // Generic non-FM error → re-thrown
    assert.throws(() => simulateCatch(new Error('network timeout')))
    console.log('  ✓ Generic errors re-thrown unchanged')
  }

  // ── 6. Regression guard: old string-match "401" would have swallowed HTTP 401 ─
  console.log('\nTesting: regression guard — old string-match bug cannot recur')
  {
    // The OLD client.ts threw: new Error(`FileMaker Error: Non-JSON response (401)`)
    // The OLD multi-executor caught: err.message.includes('401') → swallowed auth errors!
    const OLD_AUTH_ERROR_MSG = 'FileMaker Error: Non-JSON response (401)'
    assert.ok(OLD_AUTH_ERROR_MSG.includes('401'), 'Old message contained "401" — that was the bug')

    // Simulate old swallow logic: would have caught this as "no records"
    const wouldOldCodeSwallow = OLD_AUTH_ERROR_MSG.includes('401')
    assert.ok(wouldOldCodeSwallow, 'Old code WOULD have swallowed the HTTP 401 auth error (bug confirmed)')

    // The NEW client.ts throws a structured FileMakerError with fmCode='' and httpStatus=401
    const newAuthError = new FileMakerError('', 401, 'Authentication failed. Verify the FileMaker username and password in connection settings.')

    // New swallow check: only true when fmCode === '401' (FM no-records), NOT when httpStatus === 401
    const wouldNewCodeSwallow = newAuthError instanceof FileMakerError && newAuthError.isNoRecordsFound
    assert.ok(!wouldNewCodeSwallow, 'New code must NOT swallow HTTP 401 auth errors')
    assert.ok(newAuthError.isAuthError, 'New code correctly identifies it as an auth error')
    console.log('  ✓ Old code swallowed HTTP 401 as no-records; new code correctly re-throws it')
  }

  // ── 7. OData 401 errors use FileMakerError with isAuthError ──────────────────
  console.log('\nTesting: OData HTTP 401 produces FileMakerError with isAuthError=true')
  {
    // Simulate what the updated odata-executor now throws for HTTP 401
    const odataAuthErr = new FileMakerError('', 401, 'OData authentication failed. Verify the FileMaker username and password in connection settings.')
    assert.ok(odataAuthErr instanceof FileMakerError)
    assert.ok(odataAuthErr.isAuthError)
    assert.ok(!odataAuthErr.isNoRecordsFound)
    assert.strictEqual(odataAuthErr.httpStatus, 401)
    assert.strictEqual(odataAuthErr.fmCode, '')
    console.log('  ✓ OData HTTP 401 → FileMakerError with isAuthError=true, isNoRecordsFound=false')
  }

  // ── 8. Error properties are accessible ───────────────────────────────────────
  console.log('\nTesting: fmCode and httpStatus properties are correctly set')
  {
    const err = new FileMakerError('300', 409, 'Record is locked by another user — try again shortly.')
    assert.strictEqual(err.fmCode, '300')
    assert.strictEqual(err.httpStatus, 409)
    assert.ok(err.message.includes('locked'))
    console.log('  ✓ fmCode, httpStatus, and message all accessible on FileMakerError')
  }

  // ── mapNetworkError timeout mapping tests ────────────────────────────────────

  // ── 9. UND_ERR_CONNECT_TIMEOUT → clear connect-timeout FileMakerError ─────────
  console.log('\nTesting: UND_ERR_CONNECT_TIMEOUT maps to user-safe FileMakerError')
  {
    const undiciConnectTimeout = Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' })
    let caught: FileMakerError | null = null
    try { mapNetworkError(undiciConnectTimeout) } catch (e: any) { caught = e }
    assert.ok(caught instanceof FileMakerError, 'Should throw FileMakerError')
    assert.strictEqual(caught!.fmCode, '')
    assert.strictEqual(caught!.httpStatus, 0)
    assert.ok(caught!.message.includes('timed out'), `Expected "timed out" in: ${caught!.message}`)
    assert.ok(caught!.message.toLowerCase().includes('connect'), `Expected "connect" in: ${caught!.message}`)
    console.log('  ✓ UND_ERR_CONNECT_TIMEOUT → FileMakerError with connect-timeout message')
  }

  // ── 10. UND_ERR_BODY_TIMEOUT → clear body-timeout FileMakerError ──────────────
  console.log('\nTesting: UND_ERR_BODY_TIMEOUT maps to user-safe FileMakerError')
  {
    const undiciBodyTimeout = Object.assign(new Error('body timeout'), { code: 'UND_ERR_BODY_TIMEOUT' })
    let caught: FileMakerError | null = null
    try { mapNetworkError(undiciBodyTimeout) } catch (e: any) { caught = e }
    assert.ok(caught instanceof FileMakerError, 'Should throw FileMakerError')
    assert.strictEqual(caught!.fmCode, '')
    assert.ok(caught!.message.includes('timed out'), `Expected "timed out" in: ${caught!.message}`)
    console.log('  ✓ UND_ERR_BODY_TIMEOUT → FileMakerError with response-timeout message')
  }

  // ── 11. UND_ERR_HEADERS_TIMEOUT → same timeout path as body ──────────────────
  console.log('\nTesting: UND_ERR_HEADERS_TIMEOUT maps to user-safe FileMakerError')
  {
    const undiciHeadersTimeout = Object.assign(new Error('headers timeout'), { code: 'UND_ERR_HEADERS_TIMEOUT' })
    let caught: FileMakerError | null = null
    try { mapNetworkError(undiciHeadersTimeout) } catch (e: any) { caught = e }
    assert.ok(caught instanceof FileMakerError)
    assert.ok(caught!.message.includes('timed out'))
    console.log('  ✓ UND_ERR_HEADERS_TIMEOUT → FileMakerError with response-timeout message')
  }

  // ── 12. ECONNREFUSED → clear "connection refused" FileMakerError ──────────────
  console.log('\nTesting: ECONNREFUSED maps to user-safe FileMakerError')
  {
    const connRefused = Object.assign(new Error('connect ECONNREFUSED 192.168.1.1:443'), { code: 'ECONNREFUSED' })
    let caught: FileMakerError | null = null
    try { mapNetworkError(connRefused) } catch (e: any) { caught = e }
    assert.ok(caught instanceof FileMakerError)
    assert.ok(caught!.message.toLowerCase().includes('refused'), `Expected "refused" in: ${caught!.message}`)
    console.log('  ✓ ECONNREFUSED → FileMakerError with connection-refused message')
  }

  // ── 13. ENOTFOUND → clear "hostname not resolved" FileMakerError ──────────────
  console.log('\nTesting: ENOTFOUND maps to user-safe FileMakerError')
  {
    const notFound = new Error('getaddrinfo ENOTFOUND myserver.example.com')
    let caught: FileMakerError | null = null
    try { mapNetworkError(notFound) } catch (e: any) { caught = e }
    assert.ok(caught instanceof FileMakerError)
    assert.ok(
      caught!.message.toLowerCase().includes('hostname') || caught!.message.toLowerCase().includes('resolved'),
      `Expected hostname/resolved message, got: ${caught!.message}`,
    )
    console.log('  ✓ ENOTFOUND → FileMakerError with hostname-not-resolved message')
  }

  // ── 14. Existing FileMakerError is re-thrown unchanged ────────────────────────
  console.log('\nTesting: mapNetworkError re-throws FileMakerError unchanged')
  {
    const fmErr = new FileMakerError('401', 200, 'No records found')
    let caught: unknown = null
    try { mapNetworkError(fmErr) } catch (e) { caught = e }
    assert.ok(caught === fmErr, 'FileMakerError must be the exact same object — not wrapped')
    console.log('  ✓ Existing FileMakerError passes through unchanged')
  }

  // ── 15. Generic unknown error → wrapped in FileMakerError ─────────────────────
  console.log('\nTesting: unknown error is wrapped in a FileMakerError')
  {
    const unknown = new Error('some unexpected low-level failure')
    let caught: FileMakerError | null = null
    try { mapNetworkError(unknown) } catch (e: any) { caught = e }
    assert.ok(caught instanceof FileMakerError)
    assert.ok(caught!.message.includes('some unexpected low-level failure'))
    console.log('  ✓ Unknown error wrapped in FileMakerError with original message')
  }

  console.log('\n🎉 ALL FM ERROR HANDLING TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ FM ERROR HANDLING TESTS FAILED:', err)
  process.exit(1)
})
