import assert from 'assert'
import { isCurrentDeployment, canRollbackTo, type DeploymentUiFlags } from './deployment-ui-state'

// Rows use the EXACT status strings the backend writes:
//  - deploy/merge create:  { status: 'active',      isLive: true }
//  - superseded by deploy: { status: 'superseded',  isLive: false }
//  - replaced by rollback: { status: 'rolled_back', isLive: false }
// (servers/[id]/deployments, branches/[id]/merge, deployments/[id]/rollback routes)

async function runTests() {
  console.log('🚀 Starting deployment UI-state tests...\n')

  // ── Scenario: deploy v2 over v1 ───────────────────────────────────────────
  console.log('Testing deploy v2 over v1...')
  {
    const v2: DeploymentUiFlags = { status: 'active', isLive: true }
    const v1: DeploymentUiFlags = { status: 'superseded', isLive: false }

    assert.strictEqual(isCurrentDeployment(v2), true, 'v2 shows the Current badge')
    assert.strictEqual(canRollbackTo(v2), false, 'v2 (live) must not offer rollback')
    console.log('  ✓ v2 (active, live) → Current badge, no rollback button')

    assert.strictEqual(isCurrentDeployment(v1), false, 'v1 is not current')
    assert.strictEqual(canRollbackTo(v1), true, 'v1 (superseded) must show the rollback button')
    console.log('  ✓ v1 (superseded) → rollback button shown')
  }

  // ── Scenario: after rolling back to v1 ────────────────────────────────────
  console.log('\nTesting state after rollback to v1...')
  {
    const v1: DeploymentUiFlags = { status: 'active', isLive: true }       // rollback target went live
    const v2: DeploymentUiFlags = { status: 'rolled_back', isLive: false } // former live

    assert.strictEqual(isCurrentDeployment(v1), true, 'v1 is current after rollback')
    assert.strictEqual(canRollbackTo(v1), false, 'live v1 offers no rollback')
    assert.strictEqual(isCurrentDeployment(v2), false)
    assert.strictEqual(canRollbackTo(v2), true, 'rolled_back v2 can be rolled back to (roll forward)')
    console.log('  ✓ v1 (active, live) → Current badge; v2 (rolled_back) → rollback button')
  }

  // ── Regression: the old "deployed" status never occurs ────────────────────
  console.log('\nTesting that no status string is special-cased...')
  {
    // The old UI keyed off status === 'deployed', which the backend never
    // writes — every badge/button vanished. The predicates must work from
    // isLive/'active' alone, whatever else status says.
    const unknownStatusLive: DeploymentUiFlags = { status: 'deployed', isLive: true }
    assert.strictEqual(isCurrentDeployment(unknownStatusLive), true, 'live row is current regardless of status string')
    const unknownStatusOld: DeploymentUiFlags = { status: 'deployed', isLive: false }
    assert.strictEqual(canRollbackTo(unknownStatusOld), true, 'non-live, non-active row is a rollback target')
    console.log('  ✓ predicates keyed off isLive/active, not a status string the backend never writes')
  }

  console.log('\n🎉 ALL DEPLOYMENT UI-STATE TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ Deployment UI-state test failure:', err)
  process.exit(1)
})
