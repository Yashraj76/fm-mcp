/**
 * OData filter value interpolation and sanitization.
 *
 * Security model: the filterExpression template is admin-authored (stored in
 * handlerConfig). Only the VALUES injected into {paramName} slots are end-user
 * controlled. This module is the single choke-point for all user-supplied values
 * entering OData $filter expressions.
 */

/**
 * Sanitize a string value before embedding it in an OData $filter string literal.
 * - Strips null bytes (U+0000) that some OData parsers treat as string terminators.
 * - Escapes single quotes as '' per OData 4.0 spec.
 */
export function sanitizeODataStringValue(value: string): string {
  return value
    .replace(/\0/g, '')    // null bytes — strip before quoting
    .replace(/'/g, "''");  // OData 4.0 single-quote escape
}

/**
 * Coerce a user-supplied limit/offset value to a safe non-negative integer.
 * Returns undefined when the input is not a valid non-negative integer — the caller
 * should omit the corresponding query param rather than forwarding a raw string.
 */
export function coerceODataInt(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return undefined;
  return n;
}

/**
 * Validate that a recordId value is safe to place inside an OData key predicate
 * of the form EntitySet(recordId). Accepts positive integers and OData GUID format.
 * Throws if the value contains characters that would alter the URL path.
 */
export function validateODataRecordId(recordId: unknown): string {
  const s = String(recordId ?? '').trim();
  if (!s) throw new Error('recordId must not be empty');
  if (/^\d+$/.test(s)) return s;
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s)) return s;
  throw new Error(
    `Invalid OData recordId '${s}': must be a positive integer or GUID (8-4-4-4-12 hex)`
  );
}

/**
 * Replace {paramName} placeholders in an admin-authored OData $filter template
 * with sanitized, properly-quoted values from a user-supplied params map.
 *
 * Quoting rules:
 *   null / undefined  → null   (OData null literal, no quotes)
 *   boolean           → true / false (no quotes)
 *   finite number     → numeric literal (no quotes)
 *   non-finite number → null
 *   everything else   → 'sanitized-value' (OData single-quoted string)
 *
 * Templates MUST NOT wrap placeholders in their own quotes — the interpolator
 * always supplies the quotes for string values. Correct: `Email eq {email}`.
 * Wrong (double-quoting): `Email eq '{email}'`.
 */
export function interpolateODataFilter(
  expression: string,
  params: Record<string, unknown>,
): string {
  return expression.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = params[key];
    if (val === undefined || val === null) return 'null';
    if (typeof val === 'boolean') return String(val);
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) return 'null';
      return String(val);
    }
    return `'${sanitizeODataStringValue(String(val))}'`;
  });
}
