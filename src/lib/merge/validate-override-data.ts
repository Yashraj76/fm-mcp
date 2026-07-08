export interface BranchToolForValidation {
  id: string;         // BranchTool row id
  toolId: string;
  overrideData: string | null;
}

export interface CorruptOverride {
  branchToolId: string;
  toolId: string;
  error: string;
}

export type OverrideValidationResult =
  | { ok: true }
  | { ok: false; corrupt: CorruptOverride[] };

/**
 * Validates that every modified BranchTool has parseable, object-shaped overrideData.
 *
 * null / empty overrideData is treated as "nothing to apply" and is skipped, not an error.
 * Non-parseable JSON or a non-object value (array, primitive, null literal) is flagged.
 *
 * Returns { ok: true } when all entries are valid, or
 * { ok: false, corrupt: [...] } listing every corrupt entry so callers can 422 early.
 */
export function validateModifiedOverrides(
  changes: BranchToolForValidation[]
): OverrideValidationResult {
  const corrupt: CorruptOverride[] = [];

  for (const change of changes) {
    if (!change.overrideData) continue;  // null/empty = no-op, not corrupt

    let parsed: unknown;
    try {
      parsed = JSON.parse(change.overrideData);
    } catch (e: any) {
      corrupt.push({
        branchToolId: change.id,
        toolId: change.toolId,
        error: e?.message ?? 'Invalid JSON',
      });
      continue;
    }

    // overrideData must be a plain object — arrays and primitives are not valid
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      corrupt.push({
        branchToolId: change.id,
        toolId: change.toolId,
        error: `overrideData must be a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
      });
    }
  }

  return corrupt.length === 0 ? { ok: true } : { ok: false, corrupt };
}
