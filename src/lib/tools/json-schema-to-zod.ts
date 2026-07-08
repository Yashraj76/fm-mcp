import { z } from 'zod'

/**
 * Recursive JSON Schema → Zod converter.
 *
 * Covers the subset of JSON Schema used by FileMaker MCP tool definitions:
 *   object (with properties, required, additionalProperties)
 *   array  (with typed items)
 *   string, number, integer, boolean, null
 *   enum   (string-only → z.enum; mixed → z.union of z.literal)
 *   anyOf / oneOf  (nullable shorthand detected automatically)
 *   type as array  (["string","null"] → z.string().nullable())
 *
 * Falls back to z.any() only for genuinely unsupported constructs, and logs
 * a warning so the degradation is visible in server logs.
 */
export function jsonSchemaToZod(schema: unknown, path = 'root'): z.ZodTypeAny {
  if (schema === null || schema === undefined || typeof schema !== 'object' || Array.isArray(schema)) {
    warn(path, `invalid schema value (${JSON.stringify(schema)})`)
    return z.any()
  }

  const s = schema as Record<string, unknown>

  // ── Composite keywords (checked before `type` — they can appear without it) ──
  if (Array.isArray(s.anyOf) && s.anyOf.length > 0) {
    return buildComposite(s.anyOf, path, 'anyOf')
  }
  if (Array.isArray(s.oneOf) && s.oneOf.length > 0) {
    return buildComposite(s.oneOf, path, 'oneOf')
  }

  // ── type as array: ["string","null"] → nullable ───────────────────────────
  if (Array.isArray(s.type)) {
    return buildTypeArray(s, s.type as string[], path)
  }

  // ── Top-level enum (type may or may not be present alongside enum) ─────────
  if (Array.isArray(s.enum) && s.enum.length > 0) {
    return buildEnum(s.enum, path)
  }

  // ── Scalar and structural types ────────────────────────────────────────────
  switch (s.type as string | undefined) {
    case 'string':  return z.string()
    case 'number':
    case 'integer': return z.number()
    case 'boolean': return z.boolean()
    case 'null':    return z.null()
    case 'object':  return buildObject(s, path)
    case 'array':   return buildArray(s, path)

    default: {
      // Typeless schema — infer from structural keywords before giving up
      if (s.properties !== undefined) return buildObject(s, path)
      if (s.items !== undefined)      return buildArray(s, path)
      if (s.type !== undefined) {
        warn(path, `unsupported type "${s.type}"`)
      }
      // Empty schema {} — treat as passthrough (no constraints), not z.any() fallback
      if (Object.keys(s).length === 0) return z.object({}).passthrough()
      warn(path, 'no recognisable JSON Schema keywords — using z.any()')
      return z.any()
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function warn(path: string, reason: string): void {
  console.warn(`[json-schema-to-zod] ${path}: ${reason} — falling back to z.any()`)
}

/** Handles `anyOf` / `oneOf`. Detects nullable shorthand automatically. */
function buildComposite(schemas: unknown[], path: string, keyword: string): z.ZodTypeAny {
  const nullVariants  = schemas.filter(isNullSchema)
  const otherVariants = schemas.filter(s => !isNullSchema(s))

  if (otherVariants.length === 0) return z.null()

  const converted = otherVariants.map((s, i) =>
    jsonSchemaToZod(s, `${path}.${keyword}[${i}]`),
  )

  const base = converted.length === 1 ? converted[0] : buildUnion(converted, path)
  return nullVariants.length > 0 ? base.nullable() : base
}

function isNullSchema(s: unknown): boolean {
  return typeof s === 'object' && s !== null && (s as any).type === 'null'
}

/** Handles `type` as an array, e.g. `["string","null"]`. */
function buildTypeArray(s: Record<string, unknown>, types: string[], path: string): z.ZodTypeAny {
  const hasNull   = types.includes('null')
  const nonNull   = types.filter(t => t !== 'null')

  if (nonNull.length === 0) return z.null()

  const converted = nonNull.map((t, i) =>
    jsonSchemaToZod({ ...s, type: t }, `${path}[${i}]`),
  )

  const base = converted.length === 1 ? converted[0] : buildUnion(converted, path)
  return hasNull ? base.nullable() : base
}

/** Builds a Zod union from ≥2 variants. */
function buildUnion(variants: z.ZodTypeAny[], path: string): z.ZodTypeAny {
  if (variants.length === 0) { warn(path, 'empty union'); return z.any() }
  if (variants.length === 1) return variants[0]
  return z.union(
    [variants[0], variants[1], ...variants.slice(2)] as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
  )
}

/** Builds a Zod enum/literal union from an `enum` array. */
function buildEnum(values: unknown[], path: string): z.ZodTypeAny {
  const allStrings = values.every(v => typeof v === 'string')

  if (allStrings) {
    if (values.length === 1) return z.literal(values[0] as string)
    return z.enum(values as [string, ...string[]])
  }

  // Mixed or non-string values → union of literals
  const literals = values.map(v => z.literal(v as string | number | boolean | null))
  if (literals.length === 1) return literals[0]
  return z.union(
    [literals[0], literals[1], ...literals.slice(2)] as [z.ZodLiteral<any>, z.ZodLiteral<any>, ...z.ZodLiteral<any>[]],
  )
}

/** Builds a `z.object({...})` with nested recursive conversion. */
function buildObject(s: Record<string, unknown>, path: string): z.ZodTypeAny {
  const properties  = (s.properties ?? {}) as Record<string, unknown>
  const required    = new Set<string>(Array.isArray(s.required) ? s.required as string[] : [])

  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, propSchema] of Object.entries(properties)) {
    const propType = jsonSchemaToZod(propSchema, `${path}.${key}`)
    shape[key] = required.has(key) ? propType : propType.optional()
  }

  let obj = z.object(shape)

  if (s.additionalProperties === false) {
    return obj.strict()
  }

  if (s.additionalProperties !== undefined && typeof s.additionalProperties === 'object' && s.additionalProperties !== null) {
    const additionalType = jsonSchemaToZod(s.additionalProperties, `${path}.additionalProperties`)
    return obj.catchall(additionalType)
  }

  // Default: passthrough (unknown keys allowed, like JSON Schema default)
  return obj.passthrough()
}

/** Builds a `z.array(itemType)` with recursive item conversion. */
function buildArray(s: Record<string, unknown>, path: string): z.ZodTypeAny {
  if (s.items !== undefined) {
    return z.array(jsonSchemaToZod(s.items, `${path}[items]`))
  }
  return z.array(z.any())
}
