import { detectRelationships, relDedupKey } from './detect-relationships'
import { INFER_RELATIONSHIPS_PROMPT } from './prompts/infer-relationships'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import { logger } from '@/lib/logger'

export type AICallerFn = (opts: {
  systemPrompt: string
  userMessage: string
  maxOutputTokens: number
  userId: string
}) => Promise<string>

export interface InferRelationshipsResult {
  relationships: any[]
  primaryKeys: Record<string, string>
  notes: string | null
  skippedLayouts: string[]
}

/**
 * Canonical relationship inference shared by both relationship endpoints.
 *
 * Phase 1 — rule-based (`detectRelationships`): always runs, works without AI.
 * Phase 2 — AI augmentation: only runs when `callAIFn` is provided and at
 *   least two layouts have field/portal data.  AI results are merged with
 *   rule-based output and deduplicated via `relDedupKey` so reversed-direction
 *   duplicates are suppressed.  An AI failure degrades gracefully — the
 *   rule-based results are still returned.
 *
 * `callAIFn` is an injected parameter so callers (and tests) can control
 * whether AI runs without touching global state.
 */
export async function inferRelationships(
  selectedLayouts: string[],
  layoutMeta: Record<string, { fields: string[]; portals: string[] }>,
  userId: string,
  callAIFn?: AICallerFn,
): Promise<InferRelationshipsResult> {
  // Which layouts have enough data to be useful
  const layoutsWithData = selectedLayouts.filter(name => {
    const meta = layoutMeta[name]
    return meta && ((meta.fields?.length ?? 0) > 0 || (meta.portals?.length ?? 0) > 0)
  })
  const skippedLayouts = selectedLayouts.filter(name => !layoutsWithData.includes(name))

  // ── Phase 1: rule-based ────────────────────────────────────────────────────
  const ruleSuggestions = detectRelationships(selectedLayouts, layoutMeta)
  const existingKeys = new Set(ruleSuggestions.map(s => relDedupKey(s.from, s.to, s.key)))

  const relationships: any[] = ruleSuggestions.map((s, i) => ({
    id: `rel_rule_${i + 1}`,
    from: s.from,
    to: s.to,
    key: s.key,
    toKey: s.key,
    type: 'one-to-many',
    confidence: s.confidence,
    source: 'rule-based',
    reason: s.reason,
    usableInTools: s.confidence !== 'low',
  }))

  let primaryKeys: Record<string, string> = {}
  let notes: string | null = null

  // ── Phase 2: AI augmentation ───────────────────────────────────────────────
  if (callAIFn && layoutsWithData.length >= 2) {
    const inputPayload = {
      selectedLayouts: layoutsWithData.map(name => ({
        name,
        fields: layoutMeta[name]?.fields ?? [],
        portals: layoutMeta[name]?.portals ?? [],
      })),
    }

    try {
      const aiText = await callAIFn({
        systemPrompt: INFER_RELATIONSHIPS_PROMPT,
        userMessage: JSON.stringify(inputPayload, null, 2),
        maxOutputTokens: 8192,
        userId,
      })

      const match = aiText.match(/\{[\s\S]*\}/)
      const clean = match
        ? match[0]
        : aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = safeParseJSON<any>(clean)

      if (parsed) {
        primaryKeys = parsed.primaryKeys ?? {}
        notes = parsed.notes ?? null

        for (const aiRel of parsed.relationships ?? []) {
          if (!aiRel.from || !aiRel.to || !aiRel.key) continue
          const dk = relDedupKey(aiRel.from, aiRel.to, aiRel.key)
          if (existingKeys.has(dk)) continue
          existingKeys.add(dk)
          relationships.push({
            id: aiRel.id ?? `rel_ai_${relationships.length + 1}`,
            from: aiRel.from,
            to: aiRel.to,
            key: aiRel.key,
            toKey: aiRel.toKey ?? aiRel.key,
            type: aiRel.type ?? 'one-to-many',
            confidence: aiRel.confidence ?? 'medium',
            source: aiRel.source ?? 'ai',
            reason: aiRel.reason ?? 'AI inferred',
            usableInTools: aiRel.usableInTools ?? (aiRel.confidence !== 'low'),
          })
        }
      }
    } catch (err: any) {
      logger.error({ errMsg: err.message }, '[inferRelationships] AI augmentation failed')
      // Degrade gracefully — return rule-based results only
    }
  }

  return { relationships, primaryKeys, notes, skippedLayouts }
}
