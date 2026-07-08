import { checkTransport } from './transport-guard'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err: any) {
    console.error(`  ✗ ${name}: ${err.message}`)
    failed++
  }
}

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected)
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    },
    toBeFalse() {
      if (actual !== false)
        throw new Error(`expected false, got ${JSON.stringify(actual)}`)
    },
    toBeTrue() {
      if (actual !== true)
        throw new Error(`expected true, got ${JSON.stringify(actual)}`)
    },
    toContain(substr: string) {
      if (typeof actual !== 'string' || !actual.includes(substr))
        throw new Error(`expected string to contain ${JSON.stringify(substr)}, got ${JSON.stringify(actual)}`)
    },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Supported transports
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nSupported transports')

test('mcp transport — ok regardless of Redis availability', () => {
  const result = checkTransport('mcp', false)
  if (!result.ok) throw new Error(`expected ok:true, got ok:false: ${result.message}`)
  expect(result.transport).toBe('mcp')
})

test('mcp transport — ok when Redis is available', () => {
  const result = checkTransport('mcp', true)
  if (!result.ok) throw new Error(`expected ok:true, got ok:false: ${result.message}`)
  expect(result.transport).toBe('mcp')
})

test('sse transport — ok when Redis is available', () => {
  const result = checkTransport('sse', true)
  if (!result.ok) throw new Error(`expected ok:true, got ok:false: ${result.message}`)
  expect(result.transport).toBe('sse')
})

// ──────────────────────────────────────────────────────────────────────────────
// SSE without Redis
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nSSE without Redis')

test('sse transport without Redis — returns 503', () => {
  const result = checkTransport('sse', false)
  if (result.ok) throw new Error('expected ok:false, got ok:true')
  expect(result.status).toBe(503)
})

test('sse transport without Redis — message mentions REDIS_URL', () => {
  const result = checkTransport('sse', false)
  if (result.ok) throw new Error('expected ok:false')
  expect(result.message).toContain('REDIS_URL')
})

test('sse transport without Redis — message suggests /mcp alternative', () => {
  const result = checkTransport('sse', false)
  if (result.ok) throw new Error('expected ok:false')
  expect(result.message).toContain('/mcp')
})

// ──────────────────────────────────────────────────────────────────────────────
// Unknown transports
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nUnknown transports')

test('unknown transport "http" — returns 400', () => {
  const result = checkTransport('http', true)
  if (result.ok) throw new Error('expected ok:false, got ok:true')
  expect(result.status).toBe(400)
})

test('unknown transport "websocket" — returns 400', () => {
  const result = checkTransport('websocket', false)
  if (result.ok) throw new Error('expected ok:false, got ok:true')
  expect(result.status).toBe(400)
})

test('unknown transport "stdio" — returns 400', () => {
  const result = checkTransport('stdio', true)
  if (result.ok) throw new Error('expected ok:false, got ok:true')
  expect(result.status).toBe(400)
})

test('unknown transport "" (empty string) — returns 400', () => {
  const result = checkTransport('', false)
  if (result.ok) throw new Error('expected ok:false, got ok:true')
  expect(result.status).toBe(400)
})

test('unknown transport with special chars — returns 400', () => {
  const result = checkTransport('../config', false)
  if (result.ok) throw new Error('expected ok:false, got ok:true')
  expect(result.status).toBe(400)
})

test('unknown transport "MCP" (wrong case) — returns 400', () => {
  // Transport names are case-sensitive
  const result = checkTransport('MCP', true)
  if (result.ok) throw new Error('expected ok:false, got ok:true')
  expect(result.status).toBe(400)
})

test('unknown transport "SSE" (wrong case) — returns 400', () => {
  const result = checkTransport('SSE', true)
  if (result.ok) throw new Error('expected ok:false, got ok:true')
  expect(result.status).toBe(400)
})

test('unknown transport error message names the invalid value', () => {
  const result = checkTransport('foobar', false)
  if (result.ok) throw new Error('expected ok:false')
  expect(result.message).toContain('foobar')
})

test('unknown transport error message lists supported options', () => {
  const result = checkTransport('invalid', false)
  if (result.ok) throw new Error('expected ok:false')
  expect(result.message).toContain('mcp')
  expect(result.message).toContain('sse')
})

// ──────────────────────────────────────────────────────────────────────────────

const total = passed + failed
console.log(
  `\n${failed === 0 ? '🎉 ALL TRANSPORT GUARD TESTS PASSED!' : '❌ SOME TESTS FAILED'} (${passed}/${total})`,
)
if (failed > 0) process.exit(1)
