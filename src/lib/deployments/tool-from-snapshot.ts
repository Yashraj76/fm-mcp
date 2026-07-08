/**
 * Maps a raw tool entry from a deployment snapshot to a Prisma ToolCreateInput
 * (minus serverId, which the caller supplies).
 *
 * Handles two snapshot shapes:
 *  - Modern: full prisma.Tool row objects (all fields present)
 *  - Legacy: partial objects that may have nested JSON already stringified
 *
 * All fields that affect execution (fmMethod, fmLayout, fmScript, handlerConfig,
 * outputSchema, inputSchema) are restored.  Metadata fields (version, sortOrder,
 * isAiGenerated, testConfig) are also restored so the rolled-back tool is
 * bit-for-bit identical to the snapshot.
 */
export function toolCreateDataFromSnapshot(t: Record<string, unknown>) {
  return {
    name:          t.name as string,
    description:   t.description as string,
    inputSchema:   coerceString(t.inputSchema)   ?? '{"type":"object","properties":{}}',
    outputSchema:  coerceString(t.outputSchema)  ?? null,
    handlerConfig: coerceString(t.handlerConfig) ?? '{}',
    fmMethod:      (t.fmMethod   as string | null | undefined) ?? null,
    fmLayout:      (t.fmLayout   as string | null | undefined) ?? null,
    fmScript:      (t.fmScript   as string | null | undefined) ?? null,
    isEnabled:     (t.isEnabled  ?? t.enabled    ?? true)      as boolean,
    category:      (t.category   as string | null | undefined) ?? null,
    isAiGenerated: typeof t.isAiGenerated === 'boolean' ? t.isAiGenerated : false,
    version:       typeof t.version   === 'number'  ? t.version   : 1,
    sortOrder:     typeof t.sortOrder === 'number'  ? t.sortOrder : 0,
    testConfig:    coerceString(t.testConfig)    ?? null,
  }
}

/** Returns the value as a string: already-strings pass through, objects are
 *  JSON.stringify-ed, null/undefined become null. */
function coerceString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return typeof v === 'string' ? v : JSON.stringify(v)
}
