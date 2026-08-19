import { db } from './db';
import { safeParseJSON } from './utils/safe-parse';

// ── JSON-field deep merge ─────────────────────────────────────────────────────

// These Tool fields are stored as JSON strings. A branch override that only
// changes part of the schema (e.g. adds one property) must be merged with the
// base value, not replace it wholesale.
const JSON_MERGE_FIELDS = new Set(['inputSchema', 'outputSchema', 'handlerConfig', 'testConfig']);

function deepMergeObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...a };
  for (const [key, bVal] of Object.entries(b)) {
    const aVal = result[key];
    // Recurse only when BOTH sides are plain (non-array) objects.
    // Arrays and primitives are replaced outright — no union semantics.
    if (
      bVal !== null && typeof bVal === 'object' && !Array.isArray(bVal) &&
      aVal !== null && typeof aVal === 'object' && !Array.isArray(aVal)
    ) {
      result[key] = deepMergeObjects(
        aVal as Record<string, unknown>,
        bVal as Record<string, unknown>,
      );
    } else {
      result[key] = bVal;
    }
  }
  return result;
}

/**
 * Apply a branch override onto a base tool record.
 *
 * Scalar fields (name, description, isEnabled, …) are replaced outright.
 * JSON-string fields (inputSchema, handlerConfig, …) are deep-merged so a
 * partial override preserves base properties not mentioned in the override.
 *
 * Throws for invalid JSON in a JSON-merge field — this is intentional.
 * A corrupt override value must be caught early rather than silently serving
 * a broken (truncated) tool definition to AI agents.
 *
 * A corrupt *outer* overrideData string (the whole BranchTool.overrideData
 * column) is handled upstream by safeParseJSON returning {} — no override is
 * applied in that case, leaving the base tool intact.
 */
export function applyOverride(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, overrideVal] of Object.entries(override)) {
    if (overrideVal === undefined) continue;

    if (JSON_MERGE_FIELDS.has(key) && overrideVal !== null) {
      // ── Parse base value (leniently — corrupt base is treated as empty) ───
      let baseObj: Record<string, unknown> = {};
      const baseVal = base[key];
      if (baseVal !== null && baseVal !== undefined) {
        const baseStr = typeof baseVal === 'string' ? baseVal : JSON.stringify(baseVal);
        try {
          const parsed = JSON.parse(baseStr);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            baseObj = parsed as Record<string, unknown>;
          }
        } catch {
          // Corrupt base field — start from empty so the override can still apply
        }
      }

      // ── Parse override value (strictly — fail visibly on bad JSON) ────────
      const overrideStr =
        typeof overrideVal === 'string' ? overrideVal : JSON.stringify(overrideVal);
      let overrideObj: Record<string, unknown>;
      try {
        const parsed = JSON.parse(overrideStr);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new TypeError(
            `expected a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
          );
        }
        overrideObj = parsed as Record<string, unknown>;
      } catch (e) {
        throw new Error(
          `Branch override for field "${key}" contains invalid JSON: ${(e as Error).message}`,
        );
      }

      result[key] = JSON.stringify(deepMergeObjects(baseObj, overrideObj));
    } else {
      // Scalar field — override value replaces base value completely
      result[key] = overrideVal;
    }
  }

  return result;
}

/**
 * Resolve which branch to use for a given server.
 *
 * - If `preferredBranchId` is provided and belongs to `serverId`, that branch is used.
 * - Otherwise falls back to the server's default (main) branch.
 * - Returns `null` if no branch exists at all.
 */
export async function resolveServerBranch(
  serverId: string,
  preferredBranchId?: string | null,
): Promise<any | null> {
  if (preferredBranchId) {
    const branch = await db.branch.findFirst({
      where: { serverId, id: preferredBranchId },
      include: { connectionOverride: true },
    })
    if (branch) return branch
  }
  return db.branch.findFirst({
    where: { serverId, isDefault: true },
    include: { connectionOverride: true },
  })
}

/**
 * Return the effective tool list for a branch.
 *
 * Each `BranchTool` row links a base `Tool` with an optional JSON override blob.
 * Rows with `action = 'deleted'` are excluded.
 */
export async function getEffectiveTools(branchId: string) {
  const branchTools = await db.branchTool.findMany({
    where: {
      branchId,
      action: { not: 'deleted' },
      // Tools with action='added' were explicitly re-added to this branch — include them
      // even if Tool.deletedAt is set (the delete will be cleared when the branch is merged).
      // Inherited and modified tools are only shown when the base Tool is not soft-deleted.
      OR: [
        { action: 'added' },
        { tool: { deletedAt: null } },
      ],
    },
    include: { tool: { include: { server: { include: { connections: { include: { connection: true } } } } } } },
    orderBy: { createdAt: 'asc' },
  });

  return branchTools.map((bt: any) => {
    const base = bt.tool;
    // safeParseJSON returns {} when the whole overrideData column is corrupt
    // (unparseable JSON). applyOverride then throws for a corrupt *field value*
    // inside an otherwise-valid override object.
    const override = safeParseJSON<Record<string, any>>(bt.overrideData, {});
    return applyOverride(base, override);
  });
}
