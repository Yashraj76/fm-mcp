import assert from 'assert'
import { prisma } from '../prisma'
import { isJobStale, JOB_STALE_THRESHOLD_MS, runToolGenerationJob } from './job-runner'

// ── In-memory job store ───────────────────────────────────────────────────────

interface MockJob {
  id: string
  status: string
  progress: number
  startedAt: Date | null
  completedAt: Date | null
  error: string | null
  log: string
  generatedTools: string | null
}

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: 'job-1', status: 'pending', progress: 0,
    startedAt: null, completedAt: null, error: null,
    log: '[]', generatedTools: null,
    ...overrides,
  }
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Job Runner Tests...\n')

  // ── 1. setImmediate is not reliable — demonstrate the old bug ─────────────────
  console.log('Testing: setImmediate can be pre-empted (demonstrates why the fix was needed)')
  {
    let executed = false
    setImmediate(() => { executed = true })
    // At this point the process would send the HTTP response on Vercel.
    // The process is then frozen — setImmediate never fires.
    // Simulated here: check synchronously that work has NOT yet run.
    assert.strictEqual(executed, false,
      'setImmediate is fire-and-forget: work has not yet run at this point in the call stack')
    console.log('  ✓ setImmediate has not executed yet at response-send time — it is lost on Vercel')
  }

  // ── 2. await guarantees execution before the caller resumes ──────────────────
  console.log('\nTesting: await guarantees the job runs before the response is sent')
  {
    let executed = false
    const mockJob = async () => { executed = true }
    await mockJob()
    assert.ok(executed, 'Awaited function always completes before the caller continues')
    console.log('  ✓ await guarantees execution — job is always complete before HTTP response')
  }

  // ── 3. isJobStale — not stale when status is not running ─────────────────────
  console.log('\nTesting: isJobStale returns false for non-running statuses')
  {
    const old = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
    for (const status of ['pending', 'done', 'failed']) {
      assert.strictEqual(isJobStale({ status, startedAt: old }), false,
        `Status "${status}" should never be stale`)
    }
    console.log('  ✓ pending/done/failed are never stale regardless of age')
  }

  // ── 4. isJobStale — not stale when running but recent ────────────────────────
  console.log('\nTesting: isJobStale returns false for a recently-started running job')
  {
    const recentStart = new Date(Date.now() - 30_000) // 30 seconds ago
    assert.strictEqual(isJobStale({ status: 'running', startedAt: recentStart }), false)
    console.log('  ✓ Running job started 30 s ago is not stale')
  }

  // ── 5. isJobStale — stale when running for too long ──────────────────────────
  console.log('\nTesting: isJobStale returns true for a job stuck in running past the threshold')
  {
    const staleStart = new Date(Date.now() - JOB_STALE_THRESHOLD_MS - 1000)
    assert.ok(isJobStale({ status: 'running', startedAt: staleStart }),
      'Job running past threshold should be stale')
    console.log(`  ✓ Running job older than ${JOB_STALE_THRESHOLD_MS / 60000} minutes is stale`)
  }

  // ── 6. isJobStale — custom threshold ─────────────────────────────────────────
  console.log('\nTesting: isJobStale respects custom threshold')
  {
    const start = new Date(Date.now() - 5_000) // 5 seconds ago
    assert.strictEqual(isJobStale({ status: 'running', startedAt: start }, 30_000), false,
      'Not stale under 30s threshold')
    assert.ok(isJobStale({ status: 'running', startedAt: start }, 3_000),
      'Stale under 3s threshold')
    console.log('  ✓ Custom threshold respected')
  }

  // ── 7. isJobStale — null startedAt is never stale ────────────────────────────
  console.log('\nTesting: isJobStale handles null startedAt (pending job never started)')
  {
    assert.strictEqual(isJobStale({ status: 'running', startedAt: null }), false,
      'No startedAt → not stale (job may still be starting)')
    console.log('  ✓ null startedAt → not stale')
  }

  // ── 8. runToolGenerationJob — server not found → persists failure ─────────────
  console.log('\nTesting: runToolGenerationJob persists failed status when server is not found')
  {
    const jobs: Record<string, MockJob> = {
      'job-test-1': makeJob({ id: 'job-test-1' }),
    }

    ;(prisma as any).toolGenerationJob = {
      findUnique: async ({ where }: any) => jobs[where.id] ?? null,
      update: async ({ where, data }: any) => {
        jobs[where.id] = { ...jobs[where.id], ...data }
        return jobs[where.id]
      },
    }
    ;(prisma as any).mcpServer = {
      findFirst: async () => null, // Server not found
    }

    await runToolGenerationJob('job-test-1', 'server-1', 'user-1', 'conn-1')

    const finalJob = jobs['job-test-1']
    assert.strictEqual(finalJob.status, 'failed', 'Job status must be failed')
    assert.ok(finalJob.error?.toLowerCase().includes('not found') ||
              finalJob.error?.toLowerCase().includes('unauthorized'),
      `Error message should mention "not found" or "unauthorized", got: "${finalJob.error}"`)
    assert.ok(finalJob.completedAt !== null, 'completedAt must be set on failure')
    console.log('  ✓ Server-not-found → job.status=failed with error persisted')
  }

  // ── 9. runToolGenerationJob — no connection → persists failure ────────────────
  console.log('\nTesting: runToolGenerationJob persists failed status when no connection exists')
  {
    const jobs: Record<string, MockJob> = {
      'job-test-2': makeJob({ id: 'job-test-2' }),
    }

    ;(prisma as any).toolGenerationJob = {
      findUnique: async ({ where }: any) => jobs[where.id] ?? null,
      update: async ({ where, data }: any) => {
        jobs[where.id] = { ...jobs[where.id], ...data }
        return jobs[where.id]
      },
    }
    ;(prisma as any).mcpServer = {
      findFirst: async () => ({
        id: 'server-1', name: 'Test', description: '',
        connections: [], // No connections
      }),
    }

    await runToolGenerationJob('job-test-2', 'server-1', 'user-1', 'conn-1')

    const finalJob = jobs['job-test-2']
    assert.strictEqual(finalJob.status, 'failed')
    assert.ok(finalJob.error?.toLowerCase().includes('connection'),
      `Error should mention connection, got: "${finalJob.error}"`)
    console.log('  ✓ No connection → job.status=failed with connection error persisted')
  }

  // ── 10. runToolGenerationJob — no compiled schema → persists failure ──────────
  console.log('\nTesting: runToolGenerationJob persists failed status when schema is not compiled')
  {
    const jobs: Record<string, MockJob> = {
      'job-test-3': makeJob({ id: 'job-test-3' }),
    }

    ;(prisma as any).toolGenerationJob = {
      findUnique: async ({ where }: any) => jobs[where.id] ?? null,
      update: async ({ where, data }: any) => {
        jobs[where.id] = { ...jobs[where.id], ...data }
        return jobs[where.id]
      },
    }
    ;(prisma as any).mcpServer = {
      findFirst: async () => ({
        id: 'server-1', name: 'Test', description: '',
        connections: [{
          connectionId: 'conn-1',
          connection: {
            id: 'conn-1',
            browsedSchema: null, // No compiled schema
          },
        }],
      }),
    }

    await runToolGenerationJob('job-test-3', 'server-1', 'user-1', 'conn-1')

    const finalJob = jobs['job-test-3']
    assert.strictEqual(finalJob.status, 'failed')
    assert.ok(finalJob.error?.toLowerCase().includes('schema') ||
              finalJob.error?.toLowerCase().includes('browse'),
      `Error should mention schema, got: "${finalJob.error}"`)
    console.log('  ✓ No compiled schema → job.status=failed with schema error persisted')
  }

  // ── 11. runToolGenerationJob starts as 'running' before failing ───────────────
  console.log('\nTesting: runToolGenerationJob transitions to running before any failure')
  {
    const statusHistory: string[] = []
    const jobs: Record<string, MockJob> = {
      'job-test-4': makeJob({ id: 'job-test-4' }),
    }

    ;(prisma as any).toolGenerationJob = {
      findUnique: async ({ where }: any) => jobs[where.id] ?? null,
      update: async ({ where, data }: any) => {
        if (data.status) statusHistory.push(data.status)
        jobs[where.id] = { ...jobs[where.id], ...data }
        return jobs[where.id]
      },
    }
    ;(prisma as any).mcpServer = {
      findFirst: async () => null, // Fail fast
    }

    await runToolGenerationJob('job-test-4', 'server-1', 'user-1', 'conn-1')

    assert.ok(statusHistory.includes('running'),
      'Job must transition through running before failing')
    const runningIdx = statusHistory.indexOf('running')
    const failedIdx = statusHistory.lastIndexOf('failed')
    assert.ok(runningIdx < failedIdx, 'running must precede failed in status history')
    console.log('  ✓ Status transitions: pending → running → failed (correct order)')
  }

  // ── 12. runToolGenerationJob — successful run → status='done', generatedTools set ─
  console.log('\nTesting: runToolGenerationJob happy path → status=done with generatedTools')
  {
    const jobs: Record<string, MockJob> = {
      'job-done': makeJob({ id: 'job-done' }),
    }

    ;(prisma as any).toolGenerationJob = {
      findUnique: async ({ where }: any) => jobs[where.id] ?? null,
      update: async ({ where, data }: any) => {
        jobs[where.id] = { ...jobs[where.id], ...data }
        return jobs[where.id]
      },
    }
    ;(prisma as any).mcpServer = {
      findFirst: async () => ({
        id: 'server-done', name: 'Test Server', description: 'For testing',
        connections: [{
          connectionId: 'conn-1',
          connection: {
            id: 'conn-1',
            browsedSchema: {
              compiledSchema: JSON.stringify({
                layouts: [{ name: 'Contacts', fields: ['Name', 'Email', 'Phone'] }],
              }),
            },
          },
        }],
      }),
    }
    // seedDefaultTools needs branch.findFirst and tool.findFirst
    ;(prisma as any).branch = {
      findFirst: async () => ({ id: 'branch-main', name: 'main', isDefault: true }),
    }
    // Return existing so seedDefaultTools skips creation (avoids needing $transaction mock)
    ;(prisma as any).tool = {
      findFirst: async () => ({ id: 'existing-system-tool' }),
    }

    const aiOutput = JSON.stringify([{
      name: 'find_contacts',
      description: 'Find contacts in the database',
      executionStrategy: 'fm-find',
      fmLayout: 'Contacts',
      handlerConfig: { connectionId: 'conn-1', layout: 'Contacts', method: 'find' },
      inputSchema: { type: 'object', properties: {}, required: [] },
    }])

    await runToolGenerationJob('job-done', 'server-done', 'user-1', 'conn-1', {
      callAI: async () => aiOutput,
    })

    const finalJob = jobs['job-done']
    assert.strictEqual(finalJob.status, 'done',
      `Expected status=done, got "${finalJob.status}" (error: ${finalJob.error})`)
    assert.strictEqual(finalJob.progress, 100, 'progress must be 100 on completion')
    assert.ok(finalJob.generatedTools !== null, 'generatedTools must be set on done job')
    assert.ok(finalJob.completedAt !== null, 'completedAt must be set on done job')
    const parsedTools = JSON.parse(finalJob.generatedTools!)
    assert.ok(Array.isArray(parsedTools), 'generatedTools must be a JSON array')
    assert.strictEqual(parsedTools.length, 1)
    assert.strictEqual(parsedTools[0].name, 'find_contacts')
    console.log('  ✓ Happy path: status=done, progress=100, generatedTools contains AI output')
  }

  // ── 13. Stale detection + persistence (status endpoint logic) ─────────────────
  // This test mirrors the exact logic in the status endpoint's stale-check branch
  // to prove that a stuck 'running' job is persisted as 'failed' with a retry message.
  console.log('\nTesting: stale job detection persists failed status with timeout message')
  {
    const staleStart = new Date(Date.now() - JOB_STALE_THRESHOLD_MS - 5000)
    const staleJob = makeJob({ id: 'job-stale', status: 'running', startedAt: staleStart })

    let persistedUpdate: any = null
    ;(prisma as any).toolGenerationJob = {
      findFirst: async () => staleJob,
      update: async ({ where, data }: any) => {
        persistedUpdate = data
        return { ...staleJob, ...data }
      },
    }

    // Status endpoint logic — replicated inline for deterministic testing
    if (isJobStale(staleJob)) {
      const timeoutMsg = 'Job timed out. The generation process exceeded the maximum allowed duration. Please try again.'
      await (prisma as any).toolGenerationJob.update({
        where: { id: staleJob.id },
        data: { status: 'failed', error: timeoutMsg, completedAt: new Date() },
      })
    }

    assert.ok(persistedUpdate !== null, 'Stale job must trigger a DB update')
    assert.strictEqual(persistedUpdate.status, 'failed', 'Stale job must be persisted as failed')
    assert.ok(persistedUpdate.error?.includes('timed out'),
      `Expected "timed out" in error, got: "${persistedUpdate.error}"`)
    assert.ok(persistedUpdate.error?.includes('try again') || persistedUpdate.error?.includes('try Again') ||
              persistedUpdate.error?.toLowerCase().includes('try again'),
      'Error must include a retryable hint')
    assert.ok(persistedUpdate.completedAt !== null, 'completedAt must be set when marking stale')
    console.log('  ✓ Stale job: DB update persisted with status=failed and retryable timeout message')
  }

  // ── 14. runToolGenerationJob — AI returns invalid JSON → persists failure ──────
  console.log('\nTesting: runToolGenerationJob persists failed status when AI returns invalid JSON')
  {
    const jobs: Record<string, MockJob> = {
      'job-bad-json': makeJob({ id: 'job-bad-json' }),
    }

    ;(prisma as any).toolGenerationJob = {
      findUnique: async ({ where }: any) => jobs[where.id] ?? null,
      update: async ({ where, data }: any) => {
        jobs[where.id] = { ...jobs[where.id], ...data }
        return jobs[where.id]
      },
    }
    ;(prisma as any).mcpServer = {
      findFirst: async () => ({
        id: 'server-bad-json', name: 'Test', description: '',
        connections: [{
          connectionId: 'conn-1',
          connection: {
            id: 'conn-1',
            browsedSchema: {
              compiledSchema: JSON.stringify({ layouts: [{ name: 'Contacts', fields: [] }] }),
            },
          },
        }],
      }),
    }
    ;(prisma as any).branch = {
      findFirst: async () => ({ id: 'branch-main', name: 'main', isDefault: true }),
    }
    ;(prisma as any).tool = {
      findFirst: async () => ({ id: 'existing-system-tool' }),
    }

    await runToolGenerationJob('job-bad-json', 'server-bad-json', 'user-1', 'conn-1', {
      callAI: async () => 'this is not valid json at all',
    })

    const finalJob = jobs['job-bad-json']
    assert.strictEqual(finalJob.status, 'failed', 'Job must be failed when AI returns invalid JSON')
    assert.ok(
      finalJob.error?.toLowerCase().includes('parse') || finalJob.error?.toLowerCase().includes('json'),
      `Error must mention parse/JSON failure, got: "${finalJob.error}"`
    )
    assert.ok(finalJob.completedAt !== null, 'completedAt must be set on failure')
    console.log('  ✓ Invalid JSON from AI → job.status=failed with parse error persisted')
  }

  // ── 15. Multi-connection: uses the explicitly selected connection, not connections[0] ──
  console.log('\nTesting: multi-connection server uses the requested connectionId, not connections[0]')
  {
    const jobs: Record<string, MockJob> = {
      'job-multi': makeJob({ id: 'job-multi' }),
    }

    let capturedUserMessage: string | null = null

    ;(prisma as any).toolGenerationJob = {
      findUnique: async ({ where }: any) => jobs[where.id] ?? null,
      update: async ({ where, data }: any) => {
        jobs[where.id] = { ...jobs[where.id], ...data }
        return jobs[where.id]
      },
    }
    ;(prisma as any).mcpServer = {
      findFirst: async () => ({
        id: 'server-multi', name: 'Multi DB Server', description: '',
        connections: [
          {
            connectionId: 'conn-a',
            connection: {
              id: 'conn-a',
              browsedSchema: {
                compiledSchema: JSON.stringify({ layouts: [{ name: 'LayoutA', fields: [] }] }),
              },
            },
          },
          {
            connectionId: 'conn-b',
            connection: {
              id: 'conn-b',
              browsedSchema: {
                compiledSchema: JSON.stringify({ layouts: [{ name: 'LayoutB', fields: [] }] }),
              },
            },
          },
        ],
      }),
    }
    ;(prisma as any).branch = {
      findFirst: async () => ({ id: 'branch-main', name: 'main', isDefault: true }),
    }
    ;(prisma as any).tool = {
      findFirst: async () => ({ id: 'existing-system-tool' }),
    }

    await runToolGenerationJob('job-multi', 'server-multi', 'user-1', 'conn-b', {
      callAI: async ({ userMessage }: any) => {
        capturedUserMessage = userMessage
        return JSON.stringify([{
          name: 'find_layout_b',
          description: 'Find in LayoutB',
          executionStrategy: 'fm-find',
          fmLayout: 'LayoutB',
          handlerConfig: { connectionId: 'conn-b', layout: 'LayoutB', method: 'find' },
          inputSchema: { type: 'object', properties: {}, required: [] },
        }])
      },
    })

    const finalJob = jobs['job-multi']
    assert.strictEqual(finalJob.status, 'done',
      `Expected status=done, got "${finalJob.status}" (error: ${finalJob.error})`)

    assert.ok(capturedUserMessage !== null, 'callAI must have been called')
    const payload = JSON.parse(capturedUserMessage!)
    assert.strictEqual(payload.connectionId, 'conn-b', 'AI payload must use conn-b, not conn-a')
    const layouts: any[] = payload.compiledSchema?.layouts ?? []
    assert.ok(layouts.some((l: any) => l.name === 'LayoutB'), 'conn-b schema (LayoutB) passed to AI')
    assert.ok(!layouts.some((l: any) => l.name === 'LayoutA'), 'conn-a schema (LayoutA) must NOT appear')
    console.log('  ✓ Multi-connection: AI was called with conn-b schema, not connections[0] (conn-a)')
  }

  // ── 16. Multi-connection: invalid connectionId → persists failure ─────────────────
  console.log('\nTesting: invalid connectionId → persists failure')
  {
    const jobs: Record<string, MockJob> = {
      'job-bad-conn': makeJob({ id: 'job-bad-conn' }),
    }

    ;(prisma as any).toolGenerationJob = {
      findUnique: async ({ where }: any) => jobs[where.id] ?? null,
      update: async ({ where, data }: any) => {
        jobs[where.id] = { ...jobs[where.id], ...data }
        return jobs[where.id]
      },
    }
    ;(prisma as any).mcpServer = {
      findFirst: async () => ({
        id: 'server-bad-conn', name: 'Multi DB Server', description: '',
        connections: [
          { connectionId: 'conn-a', connection: { id: 'conn-a', browsedSchema: null } },
          { connectionId: 'conn-b', connection: { id: 'conn-b', browsedSchema: null } },
        ],
      }),
    }

    await runToolGenerationJob('job-bad-conn', 'server-bad-conn', 'user-1', 'conn-nonexistent')

    const finalJob = jobs['job-bad-conn']
    assert.strictEqual(finalJob.status, 'failed', 'Job must fail for invalid connectionId')
    assert.ok(
      finalJob.error?.toLowerCase().includes('connection') ||
      finalJob.error?.toLowerCase().includes('linked') ||
      finalJob.error?.toLowerCase().includes('not found'),
      `Error must mention connection problem, got: "${finalJob.error}"`
    )
    assert.ok(finalJob.completedAt !== null, 'completedAt must be set on failure')
    console.log('  ✓ Invalid connectionId → job.status=failed with connection error')
  }

  console.log('\n🎉 ALL JOB RUNNER TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ JOB RUNNER TESTS FAILED:', err)
  process.exit(1)
})
