import assert from 'assert'
import {
  isBlockedIp,
  isBlockedHostname,
  parseHostUrl,
  assertPublicHost,
  assertAllowedAiBaseUrl,
  SsrfBlockedError,
  type ResolveFn,
} from './ssrf-guard'

// Cast to a plain mutable record to avoid TS2540 on ProcessEnv's typed properties.
const mutableEnv = process.env as Record<string, string | undefined>

async function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {}
  for (const key of Object.keys(vars)) saved[key] = mutableEnv[key]
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete mutableEnv[key]
      else mutableEnv[key] = value
    }
    await fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete mutableEnv[key]
      else mutableEnv[key] = value
    }
  }
}

async function assertBlocked(promise: Promise<unknown>, label: string): Promise<void> {
  let threw = false
  try {
    await promise
  } catch (e) {
    threw = true
    assert.ok(e instanceof SsrfBlockedError, `${label}: expected SsrfBlockedError, got ${e}`)
  }
  assert.ok(threw, `${label}: expected to be blocked but was allowed`)
}

const resolveTo = (...addresses: string[]): ResolveFn =>
  async () => addresses.map((address) => ({ address }))

async function runTests() {
  console.log('🚀 Starting SSRF guard tests...\n')

  // Ensure the opt-out is off for the main test body.
  await withEnv({ SSRF_ALLOW_PRIVATE_HOSTS: undefined, AI_BASE_URL_ALLOWED_HOSTS: undefined }, async () => {

    // ── isBlockedIp: blocked ranges ─────────────────────────────────────────
    console.log('Testing isBlockedIp — blocked ranges...')
    const blockedIps = [
      ['127.0.0.1', 'IPv4 loopback'],
      ['127.8.8.8', 'IPv4 loopback /8'],
      ['0.0.0.0', 'unspecified'],
      ['10.0.0.1', 'RFC 1918 10/8'],
      ['172.16.0.1', 'RFC 1918 172.16/12 low'],
      ['172.31.255.255', 'RFC 1918 172.16/12 high'],
      ['192.168.1.1', 'RFC 1918 192.168/16'],
      ['169.254.169.254', 'link-local / AWS metadata'],
      ['169.254.0.1', 'link-local'],
      ['100.64.0.1', 'CGNAT'],
      ['100.100.100.200', 'Alibaba metadata (CGNAT range)'],
      ['192.0.0.170', 'IETF protocol assignments'],
      ['198.18.0.1', 'benchmarking'],
      ['224.0.0.1', 'multicast'],
      ['240.0.0.1', 'class E'],
      ['255.255.255.255', 'broadcast'],
      ['::1', 'IPv6 loopback'],
      ['::', 'IPv6 unspecified'],
      ['fc00::1', 'ULA fc00::/7 low'],
      ['fd12:3456::1', 'ULA fc00::/7 fd'],
      ['fe80::1', 'IPv6 link-local'],
      ['fe80::1%en0', 'IPv6 link-local with zone id'],
      ['ff02::1', 'IPv6 multicast'],
      ['64:ff9b::808:808', 'NAT64 prefix'],
      ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
      ['::ffff:10.0.0.1', 'IPv4-mapped RFC 1918'],
      ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
      ['not-an-ip', 'non-IP input fails closed'],
    ] as const
    for (const [ip, label] of blockedIps) {
      assert.strictEqual(isBlockedIp(ip), true, `${label} (${ip}) should be blocked`)
      console.log(`  ✓ blocked: ${label} (${ip})`)
    }

    // ── isBlockedIp: allowed public addresses ───────────────────────────────
    console.log('\nTesting isBlockedIp — public addresses allowed...')
    const allowedIps = [
      ['8.8.8.8', 'public IPv4'],
      ['1.1.1.1', 'public IPv4'],
      ['172.32.0.1', 'just outside 172.16/12'],
      ['100.128.0.1', 'just outside CGNAT /10'],
      ['198.20.0.1', 'just outside benchmarking /15'],
      ['2606:4700:4700::1111', 'public IPv6'],
      ['::ffff:8.8.8.8', 'IPv4-mapped public'],
    ] as const
    for (const [ip, label] of allowedIps) {
      assert.strictEqual(isBlockedIp(ip), false, `${label} (${ip}) should be allowed`)
      console.log(`  ✓ allowed: ${label} (${ip})`)
    }

    // ── isBlockedHostname ───────────────────────────────────────────────────
    console.log('\nTesting isBlockedHostname...')
    for (const name of ['localhost', 'LOCALHOST', 'localhost.', 'sub.localhost', 'metadata.google.internal', 'metadata.goog', 'foo.internal']) {
      assert.strictEqual(isBlockedHostname(name), true, `${name} should be blocked`)
      console.log(`  ✓ blocked hostname: ${name}`)
    }
    for (const name of ['example.com', 'fm.company.com', 'internal.example.com']) {
      assert.strictEqual(isBlockedHostname(name), false, `${name} should be allowed`)
      console.log(`  ✓ allowed hostname: ${name}`)
    }

    // ── parseHostUrl ────────────────────────────────────────────────────────
    console.log('\nTesting parseHostUrl...')
    assert.strictEqual(parseHostUrl('fm.example.com').protocol, 'https:', 'bare host defaults to https')
    console.log('  ✓ bare host defaults to https')
    assert.strictEqual(parseHostUrl('fm.example.com:8443').port, '8443', 'host:port parses')
    console.log('  ✓ host:port parses')
    assert.strictEqual(parseHostUrl('http://fm.example.com').protocol, 'http:', 'explicit http:// is the opt-in and is kept')
    console.log('  ✓ explicit http:// opt-in is kept')
    assert.throws(() => parseHostUrl('ftp://fm.example.com'), SsrfBlockedError, 'non-http scheme rejected')
    console.log('  ✓ ftp:// rejected')
    assert.throws(() => parseHostUrl(''), SsrfBlockedError, 'empty host rejected')
    console.log('  ✓ empty host rejected')
    assert.throws(() => parseHostUrl('   '), SsrfBlockedError, 'blank host rejected')
    console.log('  ✓ blank host rejected')

    // ── assertPublicHost: IP literals ───────────────────────────────────────
    console.log('\nTesting assertPublicHost — IP literals (no DNS needed)...')
    await assertBlocked(assertPublicHost('127.0.0.1'), 'bare loopback literal')
    console.log('  ✓ 127.0.0.1 blocked')
    await assertBlocked(assertPublicHost('https://192.168.1.10'), 'private literal in URL')
    console.log('  ✓ https://192.168.1.10 blocked')
    await assertBlocked(assertPublicHost('https://[::1]'), 'IPv6 loopback literal in URL')
    console.log('  ✓ https://[::1] blocked')
    await assertBlocked(assertPublicHost('https://169.254.169.254/latest/meta-data/'), 'metadata IP')
    console.log('  ✓ metadata IP blocked')
    // WHATWG URL normalizes decimal/octal/hex IPv4 forms before our checks run.
    await assertBlocked(assertPublicHost('https://2130706433'), 'decimal-encoded 127.0.0.1')
    console.log('  ✓ decimal-encoded loopback (2130706433) blocked')
    await assert.doesNotReject(assertPublicHost('8.8.8.8'), 'public IP literal allowed')
    console.log('  ✓ 8.8.8.8 allowed')

    // ── assertPublicHost: hostname blocklist (no DNS needed) ────────────────
    console.log('\nTesting assertPublicHost — internal hostnames...')
    await assertBlocked(assertPublicHost('localhost'), 'localhost')
    console.log('  ✓ localhost blocked')
    await assertBlocked(assertPublicHost('http://sub.localhost:3000'), '*.localhost')
    console.log('  ✓ sub.localhost blocked')
    await assertBlocked(assertPublicHost('metadata.google.internal'), 'GCP metadata hostname')
    console.log('  ✓ metadata.google.internal blocked')

    // ── assertPublicHost: DNS re-check (rebinding) via injected resolver ────
    console.log('\nTesting assertPublicHost — DNS resolution re-check...')
    await assertBlocked(
      assertPublicHost('public-looking.example.com', { resolve: resolveTo('10.0.0.5') }),
      'hostname resolving to RFC 1918'
    )
    console.log('  ✓ hostname resolving to 10.0.0.5 blocked (rebinding)')
    await assertBlocked(
      assertPublicHost('public-looking.example.com', { resolve: resolveTo('93.184.216.34', '169.254.169.254') }),
      'hostname with one internal address among results'
    )
    console.log('  ✓ hostname with ANY internal address in results blocked')
    await assertBlocked(
      assertPublicHost('nxdomain.example.com', { resolve: async () => { throw new Error('ENOTFOUND') } }),
      'unresolvable hostname'
    )
    console.log('  ✓ unresolvable hostname blocked')
    await assert.doesNotReject(
      assertPublicHost('fm.example.com', { resolve: resolveTo('93.184.216.34', '2606:2800:220:1::1') }),
      'hostname resolving only to public addresses'
    )
    console.log('  ✓ hostname resolving to public addresses allowed')

    // ── assertAllowedAiBaseUrl ──────────────────────────────────────────────
    console.log('\nTesting assertAllowedAiBaseUrl...')
    assert.doesNotThrow(() => assertAllowedAiBaseUrl('https://api.openai.com/v1'))
    console.log('  ✓ https://api.openai.com/v1 allowed')
    assert.doesNotThrow(() => assertAllowedAiBaseUrl('https://api.anthropic.com'))
    console.log('  ✓ https://api.anthropic.com allowed')
    assert.throws(() => assertAllowedAiBaseUrl('http://api.openai.com/v1'), SsrfBlockedError, 'http rejected')
    console.log('  ✓ plain http rejected even for known host')
    assert.throws(() => assertAllowedAiBaseUrl('https://evil.example.com/v1'), SsrfBlockedError, 'unknown host rejected')
    console.log('  ✓ unknown host rejected')
    assert.throws(() => assertAllowedAiBaseUrl('https://169.254.169.254/v1'), SsrfBlockedError, 'metadata IP rejected')
    console.log('  ✓ metadata IP rejected')

    await withEnv({ AI_BASE_URL_ALLOWED_HOSTS: 'my-vllm.example.com, other.example.com' }, () => {
      assert.doesNotThrow(() => assertAllowedAiBaseUrl('https://my-vllm.example.com/v1'))
      assert.throws(() => assertAllowedAiBaseUrl('https://still-blocked.example.com'), SsrfBlockedError)
    })
    console.log('  ✓ AI_BASE_URL_ALLOWED_HOSTS extends the allow-list')
  })

  // ── SSRF_ALLOW_PRIVATE_HOSTS opt-out (self-hosted deployments) ───────────
  console.log('\nTesting SSRF_ALLOW_PRIVATE_HOSTS opt-out...')
  await withEnv({ SSRF_ALLOW_PRIVATE_HOSTS: 'true' }, async () => {
    await assert.doesNotReject(assertPublicHost('192.168.1.10'), 'private host allowed when opted out')
    await assert.doesNotReject(assertPublicHost('localhost'), 'localhost allowed when opted out')
    assert.doesNotThrow(() => assertAllowedAiBaseUrl('http://localhost:11434/v1'), 'local Ollama allowed when opted out')
    // Scheme validation still applies even when opted out.
    await assertBlocked(assertPublicHost('ftp://192.168.1.10'), 'non-http scheme still rejected')
  })
  console.log('  ✓ private hosts and local Ollama allowed with SSRF_ALLOW_PRIVATE_HOSTS=true')
  console.log('  ✓ non-http schemes still rejected when opted out')

  console.log('\n🎉 ALL SSRF GUARD TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ SSRF guard test failure:', err)
  process.exit(1)
})
