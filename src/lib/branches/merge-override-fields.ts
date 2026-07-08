/**
 * Merge a new set of branch-tool override fields onto the existing stored
 * override, preserving any prior fields not included in the incoming request.
 *
 * Rules:
 *   - Keys present only in `existing` are kept unchanged.
 *   - Keys present in `incoming` replace their counterpart in `existing`.
 *   - `undefined` values in `incoming` are skipped (treated as "not provided").
 *
 * Returns a new plain object safe to pass to JSON.stringify.
 */
export function mergeToolOverrideFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}
