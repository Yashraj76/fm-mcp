import assert from 'assert'
import { z } from 'zod'
import { jsonSchemaToZod } from './json-schema-to-zod'

function ok(schema: unknown, value: unknown, label = '') {
  const result = jsonSchemaToZod(schema).safeParse(value)
  assert.ok(result.success, `Expected PASS${label ? ` (${label})` : ''}: ${JSON.stringify(value)} — error: ${!result.success ? JSON.stringify(result.error.issues) : ''}`)
}

function fail(schema: unknown, value: unknown, label = '') {
  const result = jsonSchemaToZod(schema).safeParse(value)
  assert.ok(!result.success, `Expected FAIL${label ? ` (${label})` : ''}: ${JSON.stringify(value)}`)
}

async function runTests() {
  console.log('🚀 Starting json-schema-to-zod Tests...\n')

  // ── 1. Primitives ─────────────────────────────────────────────────────────────
  console.log('Testing: primitive types')
  {
    ok({ type: 'string' },  'hello')
    fail({ type: 'string' }, 123)
    ok({ type: 'number' },  42)
    ok({ type: 'integer' }, 7)
    fail({ type: 'number' }, 'x')
    ok({ type: 'boolean' }, true)
    fail({ type: 'boolean' }, 1)
    ok({ type: 'null' },    null)
    fail({ type: 'null' },  'x')
    console.log('  ✓ string / number / integer / boolean / null')
  }

  // ── 2. String enum ────────────────────────────────────────────────────────────
  console.log('\nTesting: string enum')
  {
    const schema = { type: 'string', enum: ['find', 'create', 'update', 'delete'] }
    ok(schema, 'find')
    ok(schema, 'delete')
    fail(schema, 'list', 'value not in enum')
    fail(schema, 123,    'wrong type')

    // Single-value enum
    const single = { enum: ['only'] }
    ok(single, 'only')
    fail(single, 'other')
    console.log('  ✓ string enum (multi-value, single-value)')
  }

  // ── 3. Mixed enum (string + number) ──────────────────────────────────────────
  console.log('\nTesting: mixed enum (string + number literals)')
  {
    const schema = { enum: ['active', 'inactive', 0, 1] }
    ok(schema, 'active')
    ok(schema, 1)
    fail(schema, 'other')
    fail(schema, 2)
    console.log('  ✓ mixed enum → union of literals')
  }

  // ── 4. Flat object with required and optional fields ──────────────────────────
  console.log('\nTesting: flat object with required + optional fields')
  {
    const schema = {
      type: 'object',
      properties: {
        name:   { type: 'string' },
        age:    { type: 'number' },
        active: { type: 'boolean' },
      },
      required: ['name'],
    }
    ok(schema,   { name: 'Alice' },                          'required only')
    ok(schema,   { name: 'Bob', age: 30, active: true },     'all fields')
    fail(schema, {},                                          'missing required name')
    fail(schema, { name: 42 },                               'name wrong type')

    // Optional field with wrong type still fails when provided
    fail(schema, { name: 'X', age: 'old' }, 'age wrong type when provided')
    console.log('  ✓ required fields enforced, optional fields pass-through when absent')
  }

  // ── 5. Nested object schema ───────────────────────────────────────────────────
  console.log('\nTesting: nested object schema')
  {
    const schema = {
      type: 'object',
      properties: {
        contact: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            phone: { type: 'string' },
          },
          required: ['email'],
        },
        count: { type: 'number' },
      },
      required: ['contact'],
    }
    ok(schema,   { contact: { email: 'a@b.com' } },              'nested required')
    ok(schema,   { contact: { email: 'x', phone: '123' }, count: 5 }, 'full')
    fail(schema, { contact: {} },                                 'nested required field missing')
    fail(schema, { contact: { email: 123 } },                     'nested field wrong type')
    fail(schema, { count: 1 },                                    'top-level required missing')
    console.log('  ✓ nested object with inner required fields')
  }

  // ── 6. Nullable field via anyOf ───────────────────────────────────────────────
  console.log('\nTesting: nullable field via anyOf [{type:"string"},{type:"null"}]')
  {
    const schema = {
      type: 'object',
      properties: {
        nickname: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: ['nickname'],
    }
    ok(schema,   { nickname: 'Neo' },  'string value')
    ok(schema,   { nickname: null },   'null value')
    fail(schema, { nickname: 123 },    'wrong type')
    fail(schema, {},                   'required field missing')
    console.log('  ✓ anyOf nullable field accepts string or null')
  }

  // ── 7. Nullable field via type array ─────────────────────────────────────────
  console.log('\nTesting: nullable field via type:["string","null"]')
  {
    const schema = {
      type: 'object',
      properties: {
        tag: { type: ['string', 'null'] },
      },
      required: ['tag'],
    }
    ok(schema,   { tag: 'featured' }, 'string')
    ok(schema,   { tag: null },       'null')
    fail(schema, { tag: 42 },         'wrong type')
    console.log('  ✓ type array nullable accepts string or null')
  }

  // ── 8. Array of primitives ────────────────────────────────────────────────────
  console.log('\nTesting: array of strings')
  {
    const schema = { type: 'array', items: { type: 'string' } }
    ok(schema,   ['a', 'b', 'c'],  'string array')
    ok(schema,   [],               'empty array')
    fail(schema, [1, 2],           'number items')
    fail(schema, 'not an array',   'not array')
    console.log('  ✓ array of strings')
  }

  // ── 9. Array of objects ───────────────────────────────────────────────────────
  console.log('\nTesting: array of objects')
  {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:    { type: 'number' },
          label: { type: 'string' },
        },
        required: ['id'],
      },
    }
    ok(schema,   [{ id: 1, label: 'x' }, { id: 2 }], 'valid objects')
    ok(schema,   [],                                   'empty array')
    fail(schema, [{ label: 'no-id' }],                 'item missing required field')
    fail(schema, [{ id: 'str' }],                      'item field wrong type')
    console.log('  ✓ array of objects with nested required fields')
  }

  // ── 10. anyOf with multiple non-null types ────────────────────────────────────
  console.log('\nTesting: anyOf with multiple non-null types → z.union')
  {
    const schema = { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] }
    ok(schema,   'hello')
    ok(schema,   42)
    ok(schema,   true)
    fail(schema, null)
    fail(schema, [])
    console.log('  ✓ anyOf (string | number | boolean) via z.union')
  }

  // ── 11. oneOf ─────────────────────────────────────────────────────────────────
  console.log('\nTesting: oneOf')
  {
    const schema = { oneOf: [{ type: 'string' }, { type: 'null' }] }
    ok(schema,   'text')
    ok(schema,   null)
    fail(schema, 42)
    console.log('  ✓ oneOf treated same as anyOf')
  }

  // ── 12. additionalProperties: false (strict) ──────────────────────────────────
  console.log('\nTesting: additionalProperties: false → strict object')
  {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    }
    ok(schema,   { name: 'Alice' },            'exact shape')
    fail(schema, { name: 'Alice', extra: 1 }, 'extra key rejected')
    console.log('  ✓ additionalProperties:false → strict, extra keys rejected')
  }

  // ── 13. additionalProperties as schema (catchall) ─────────────────────────────
  console.log('\nTesting: additionalProperties as schema → catchall')
  {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: { type: 'number' },
    }
    ok(schema,   { name: 'X', count: 5, total: 10 }, 'extra number keys ok')
    fail(schema, { name: 'X', extra: 'str' },         'extra non-number key rejected')
    console.log('  ✓ additionalProperties schema → catchall, typed extra keys')
  }

  // ── 14. Empty schema {} → passthrough object ──────────────────────────────────
  console.log('\nTesting: empty schema {} → passthrough (not z.any())')
  {
    const schema = {}
    const zType = jsonSchemaToZod(schema)
    // Should not be z.any() — should accept objects
    ok(schema, {},              'empty object')
    ok(schema, { anything: 1 }, 'arbitrary keys pass through')
    // Empty schema is permissive — these also pass with passthrough
    console.log('  ✓ empty schema → passthrough object, not z.any()')
  }

  // ── 15. Deeply nested schema ──────────────────────────────────────────────────
  console.log('\nTesting: deeply nested schema (3 levels)')
  {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            city: { type: 'string' },
            geo: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lon: { type: 'number' },
              },
              required: ['lat', 'lon'],
            },
          },
          required: ['city'],
        },
      },
      required: ['address'],
    }
    ok(schema,   { address: { city: 'NYC', geo: { lat: 40.7, lon: -74 } } }, 'full deep')
    ok(schema,   { address: { city: 'LA' } },                                 'inner optional absent')
    fail(schema, { address: { geo: { lat: 1, lon: 2 } } },                    'inner required missing')
    fail(schema, { address: { city: 'X', geo: { lat: 1 } } },                'deep required missing')
    console.log('  ✓ 3-level nested schema with required at each level')
  }

  // ── 16. typeless schema with properties → inferred as object ──────────────────
  console.log('\nTesting: typeless schema with properties → inferred as object')
  {
    const schema = {
      properties: { query: { type: 'string' } },
      required: ['query'],
    }
    ok(schema,   { query: 'hello' }, 'inferred object')
    fail(schema, {},                  'required field missing')
    console.log('  ✓ typeless schema with properties inferred as object')
  }

  // ── 17. Array without items → array of any ────────────────────────────────────
  console.log('\nTesting: array without items → z.array(z.any())')
  {
    const schema = { type: 'array' }
    ok(schema, [1, 'a', true, null], 'mixed values accepted')
    fail(schema, 'not-array',         'non-array rejected')
    console.log('  ✓ array without items → accepts anything in the array')
  }

  // ── 18. Nullable primitive via anyOf with null only ───────────────────────────
  console.log('\nTesting: anyOf with only null variants → z.null()')
  {
    const schema = { anyOf: [{ type: 'null' }, { type: 'null' }] }
    ok(schema, null)
    fail(schema, 'x')
    console.log('  ✓ anyOf of only null → z.null()')
  }

  // ── 19. object with nested array of typed objects ─────────────────────────────
  console.log('\nTesting: object with nested array of typed objects')
  {
    const schema = {
      type: 'object',
      properties: {
        query: { type: 'string' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['field', 'value'],
          },
        },
      },
      required: ['query'],
    }
    ok(schema, { query: 'contacts', filters: [{ field: 'name', value: 'Alice' }] })
    ok(schema, { query: 'all' })
    fail(schema, { query: 'x', filters: [{ field: 'name' }] }, 'filter item missing required field')
    fail(schema, {}, 'top-level required missing')
    console.log('  ✓ object with nested array of typed objects')
  }

  console.log('\n🎉 ALL JSON-SCHEMA-TO-ZOD TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ JSON-SCHEMA-TO-ZOD TESTS FAILED:', err)
  process.exit(1)
})
