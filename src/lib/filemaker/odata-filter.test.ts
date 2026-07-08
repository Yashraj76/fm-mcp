/**
 * Tests for OData filter interpolation, sanitization, and validation utilities.
 */

import {
  interpolateODataFilter,
  sanitizeODataStringValue,
  coerceODataInt,
  validateODataRecordId,
} from './odata-filter';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected)
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toContain(substr: string) {
      if (typeof actual !== 'string' || !actual.includes(substr))
        throw new Error(`expected string to contain ${JSON.stringify(substr)}, got ${JSON.stringify(actual)}`);
    },
    toThrow() {
      throw new Error('use expectThrows()');
    },
  };
}

function expectThrows(fn: () => unknown, substring?: string) {
  try {
    fn();
    throw new Error('expected function to throw but it did not');
  } catch (err: any) {
    if (err.message === 'expected function to throw but it did not') throw err;
    if (substring && !err.message.includes(substring))
      throw new Error(`expected error containing "${substring}", got: ${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// sanitizeODataStringValue
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nsanitizeODataStringValue');

test('plain string — unchanged', () => {
  expect(sanitizeODataStringValue('hello')).toBe('hello');
});

test('single quote → doubled (OData escape)', () => {
  expect(sanitizeODataStringValue("O'Brien")).toBe("O''Brien");
});

test('two single quotes → four (each individually escaped)', () => {
  expect(sanitizeODataStringValue("it''s")).toBe("it''''s");
});

test('null byte → stripped', () => {
  expect(sanitizeODataStringValue('hello\0world')).toBe('helloworld');
});

test('multiple null bytes → all stripped', () => {
  expect(sanitizeODataStringValue('\0foo\0bar\0')).toBe('foobar');
});

test('empty string → empty string', () => {
  expect(sanitizeODataStringValue('')).toBe('');
});

// ──────────────────────────────────────────────────────────────────────────────
// interpolateODataFilter
// ──────────────────────────────────────────────────────────────────────────────

console.log('\ninterpolateODataFilter');

test('basic string substitution with auto-quoting', () => {
  const result = interpolateODataFilter('Email eq {email}', { email: 'alice@example.com' });
  expect(result).toBe("Email eq 'alice@example.com'");
});

test('boolean value — no quotes, lowercase', () => {
  const result = interpolateODataFilter('IsActive eq {active}', { active: true });
  expect(result).toBe('IsActive eq true');
});

test('integer value — no quotes', () => {
  const result = interpolateODataFilter('Age gt {age}', { age: 30 });
  expect(result).toBe('Age gt 30');
});

test('null value → null literal', () => {
  const result = interpolateODataFilter('Field eq {val}', { val: null });
  expect(result).toBe('Field eq null');
});

test('undefined param → null literal', () => {
  const result = interpolateODataFilter('Field eq {val}', {});
  expect(result).toBe('Field eq null');
});

test('NaN → null literal', () => {
  const result = interpolateODataFilter('Field eq {val}', { val: NaN });
  expect(result).toBe('Field eq null');
});

test('Infinity → null literal', () => {
  const result = interpolateODataFilter('Field eq {val}', { val: Infinity });
  expect(result).toBe('Field eq null');
});

test('multiple placeholders substituted independently', () => {
  const result = interpolateODataFilter(
    'Email eq {email} and Status eq {status}',
    { email: 'bob@example.com', status: 'Active' },
  );
  expect(result).toBe("Email eq 'bob@example.com' and Status eq 'Active'");
});

test('single quote in string value is escaped', () => {
  const result = interpolateODataFilter('Name eq {name}', { name: "O'Brien" });
  expect(result).toBe("Name eq 'O''Brien'");
});

test('injection attempt: early close + append operator', () => {
  // User tries: foo' or 1 eq 1 or 'x' eq '
  const injection = "foo' or 1 eq 1 or 'x' eq '";
  const result = interpolateODataFilter('Field eq {val}', { val: injection });
  // All quotes doubled — the injection becomes a string literal, not OData syntax
  expect(result).toBe("Field eq 'foo'' or 1 eq 1 or ''x'' eq '''");
});

test('injection attempt: close quote + operator + reopen', () => {
  const injection = "' or Status eq 'Admin";
  const result = interpolateODataFilter('Email eq {email}', { email: injection });
  expect(result).toBe("Email eq ''' or Status eq ''Admin'");
});

test('injection attempt: parentheses and functions', () => {
  const injection = "x') or contains(Name,'admin";
  const result = interpolateODataFilter('Email eq {email}', { email: injection });
  expect(result).toBe("Email eq 'x'') or contains(Name,''admin'");
});

test('injection attempt: null byte to terminate string', () => {
  const injection = "admin\0' or 1 eq 1";
  const result = interpolateODataFilter('Field eq {val}', { val: injection });
  // Null byte stripped, remaining quotes escaped
  expect(result).toBe("Field eq 'admin'' or 1 eq 1'");
});

test('contains() function template', () => {
  const result = interpolateODataFilter('contains(Name, {name})', { name: 'Smith' });
  expect(result).toBe("contains(Name, 'Smith')");
});

test('startswith() function template', () => {
  const result = interpolateODataFilter('startswith(Email, {prefix})', { prefix: 'admin' });
  expect(result).toBe("startswith(Email, 'admin')");
});

test('complex multi-clause expression', () => {
  const result = interpolateODataFilter(
    'Status eq {status} and startswith(Email, {prefix}) and Age gt {age}',
    { status: 'Active', prefix: 'user', age: 18 },
  );
  expect(result).toBe("Status eq 'Active' and startswith(Email, 'user') and Age gt 18");
});

test('template with no placeholders — returned unchanged', () => {
  const expr = "Status eq 'Active'";
  expect(interpolateODataFilter(expr, {})).toBe(expr);
});

// ──────────────────────────────────────────────────────────────────────────────
// coerceODataInt
// ──────────────────────────────────────────────────────────────────────────────

console.log('\ncoerceODataInt');

test('positive integer string → number', () => {
  expect(coerceODataInt('100')).toBe(100);
});

test('zero → 0', () => {
  expect(coerceODataInt(0)).toBe(0);
});

test('numeric integer → same number', () => {
  expect(coerceODataInt(50)).toBe(50);
});

test('float → undefined (not integer)', () => {
  expect(coerceODataInt(1.5)).toBe(undefined);
});

test('negative integer → undefined', () => {
  expect(coerceODataInt(-1)).toBe(undefined);
});

test('injection string → undefined', () => {
  expect(coerceODataInt('100 or 1 eq 1')).toBe(undefined);
});

test('NaN → undefined', () => {
  expect(coerceODataInt(NaN)).toBe(undefined);
});

test('undefined → undefined', () => {
  expect(coerceODataInt(undefined)).toBe(undefined);
});

test('null → undefined', () => {
  expect(coerceODataInt(null)).toBe(undefined);
});

test('empty string → undefined', () => {
  expect(coerceODataInt('')).toBe(undefined);
});

// ──────────────────────────────────────────────────────────────────────────────
// validateODataRecordId
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nvalidateODataRecordId');

test('positive integer → returned as string', () => {
  expect(validateODataRecordId(123)).toBe('123');
});

test('integer string → returned as-is', () => {
  expect(validateODataRecordId('456')).toBe('456');
});

test('valid GUID → returned as-is', () => {
  const guid = '550e8400-e29b-41d4-a716-446655440000';
  expect(validateODataRecordId(guid)).toBe(guid);
});

test('injection via path segment separator → throws', () => {
  expectThrows(() => validateODataRecordId('1)/SomeTable'), 'Invalid OData recordId');
});

test('injection via closing paren + query string → throws', () => {
  expectThrows(() => validateODataRecordId('1)?$filter=1 eq 1'), 'Invalid OData recordId');
});

test('empty string → throws', () => {
  expectThrows(() => validateODataRecordId(''), 'must not be empty');
});

test('null → throws', () => {
  expectThrows(() => validateODataRecordId(null), 'must not be empty');
});

test('arbitrary text → throws', () => {
  expectThrows(() => validateODataRecordId('admin'), 'Invalid OData recordId');
});

test('negative integer string → throws', () => {
  expectThrows(() => validateODataRecordId('-1'), 'Invalid OData recordId');
});

// ──────────────────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${failed === 0 ? '🎉 ALL ODATA FILTER TESTS PASSED!' : '❌ SOME TESTS FAILED'} (${passed}/${total})`);
if (failed > 0) process.exit(1);
