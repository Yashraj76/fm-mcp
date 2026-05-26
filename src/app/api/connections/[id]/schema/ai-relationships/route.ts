import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from "@/lib/auth/api-guard";
import { getAppSettings } from '@/lib/settings'
import { safeParseJSON } from '@/lib/utils/safe-parse';

type Params = { params: Promise<{ id: string }> }

interface RelationshipSuggestion {
  from: string
  to: string
  key: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

/**
 * Rule-based relationship detector.
 * Works WITHOUT an AI API key — uses field name conventions:
 *  - Exact shared field name across two layouts → high confidence
 *  - Common FK patterns: *ID, *_id, *Id, ContactID, CustomerID etc.
 *  - Portal links (definite)
 */
function detectRelationships(
  selectedLayouts: string[],
  layoutMeta: Record<string, { fields: string[]; portals: string[] }>
): RelationshipSuggestion[] {
  const suggestions: RelationshipSuggestion[] = []
  const seen = new Set<string>()

  // Only consider selected layouts that have metadata
  const active = selectedLayouts.filter((l) => layoutMeta[l])

  // ── 1. Portal relationships (definite / high confidence) ──
  for (const layoutName of active) {
    const meta = layoutMeta[layoutName]
    for (const portal of meta.portals || []) {
      const key = `${layoutName}→${portal}::portal`
      if (!seen.has(key)) {
        seen.add(key)
        suggestions.push({
          from: layoutName,
          to: portal,
          key: 'portal',
          confidence: 'high',
          reason: `FileMaker portal in "${layoutName}" directly links to "${portal}"`,
        })
      }
    }
  }

  // ── 2. Shared FK field names (high confidence) ──
  // Build a map: fieldName → layouts that contain it
  const fieldToLayouts: Record<string, string[]> = {}
  for (const layoutName of active) {
    for (const field of layoutMeta[layoutName]?.fields || []) {
      if (!fieldToLayouts[field]) fieldToLayouts[field] = []
      fieldToLayouts[field].push(layoutName)
    }
  }

  // FK heuristics — field names that look like join keys
  const FK_PATTERNS = [
    /ID$/i,        // ContactID, CustomerID, OrderID
    /^ID$/i,       // bare "ID"
    /_id$/i,       // contact_id
    /Id$/,         // contactId (camelCase)
    /^FK_/i,       // FK_Customer
    /Key$/i,       // PrimaryKey, ForeignKey
    /Code$/i,      // CustomerCode, ItemCode
    /Num$/i,       // OrderNum, InvoiceNum
    /Number$/i,    // OrderNumber
  ]

  for (const [field, layouts] of Object.entries(fieldToLayouts)) {
    if (layouts.length < 2) continue
    const isFK = FK_PATTERNS.some((p) => p.test(field))
    if (!isFK) continue

    // Create a suggestion for every pair of layouts sharing this field
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const from = layouts[i]
        const to = layouts[j]
        const key = `${[from, to].sort().join('↔')}::${field}`
        if (seen.has(key)) continue
        seen.add(key)
        suggestions.push({
          from,
          to,
          key: field,
          confidence: 'high',
          reason: `Both layouts share the field "${field}" — likely a join key`,
        })
      }
    }
  }

  // ── 3. Shared common fields (medium confidence) ──
  // Non-FK fields shared by 2+ layouts (e.g., ContactName, Email)
  const COMMON_NON_FK = [
    /name$/i, /email$/i, /phone$/i, /address$/i, /date$/i,
  ]
  for (const [field, layouts] of Object.entries(fieldToLayouts)) {
    if (layouts.length < 2) continue
    const isFK = FK_PATTERNS.some((p) => p.test(field))
    if (isFK) continue // already handled above
    const isCommon = COMMON_NON_FK.some((p) => p.test(field))
    if (!isCommon) continue

    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const from = layouts[i]
        const to = layouts[j]
        const key = `${[from, to].sort().join('↔')}::${field}`
        if (seen.has(key)) continue
        seen.add(key)
        suggestions.push({
          from,
          to,
          key: field,
          confidence: 'medium',
          reason: `Shared field "${field}" may indicate a relationship`,
        })
      }
    }
  }

  // ── 4. Name-prefix matching (layout names sharing a common prefix) ──
  // e.g., CMT_Web & CMT_Portal → likely related to same table
  const prefixMap: Record<string, string[]> = {}
  for (const layout of active) {
    const prefix = layout.split(/[_\s-]/)[0].toLowerCase()
    if (!prefixMap[prefix]) prefixMap[prefix] = []
    prefixMap[prefix].push(layout)
  }
  for (const [prefix, layouts] of Object.entries(prefixMap)) {
    if (layouts.length < 2 || prefix.length < 3) continue
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const key = `${[layouts[i], layouts[j]].sort().join('↔')}::prefix`
        if (seen.has(key)) continue
        seen.add(key)
        suggestions.push({
          from: layouts[i],
          to: layouts[j],
          key: `${prefix}_*`,
          confidence: 'low',
          reason: `Both layouts share the prefix "${prefix}" — may belong to the same table occurrence`,
        })
      }
    }
  }

  return suggestions
}

export const POST = withAuth(async (req, { params, userId }) => {
    try {
    const { id } = params

    // Verify connection ownership
    const conn = await db.fMConnection.findFirst({
      where: { id, userId }
    });
    if (!conn) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    // Read request body for optional selectedLayouts override
    let body: any = {}
    try { body = await req.json() } catch { /* no body is fine */ }

    const browsedSchema = await db.browsedSchema.findUnique({
      where: { connectionId: id }
    })
    if (!browsedSchema) {
      return NextResponse.json({
        success: false,
        error: 'Schema not browsed yet. Run browse-schema first.',
        code: 'NOT_FOUND',
      }, { status: 404 })
    }

    const layoutMeta: Record<string, { fields: string[]; portals: string[] }> = safeParseJSON(browsedSchema.rawLayoutMeta, {})

    // Use selectedLayouts from request body, or from saved selection, or all layouts
    const savedSelected: string[] = body.selectedLayouts
      || (browsedSchema.selectedLayouts ? safeParseJSON(browsedSchema.selectedLayouts, null) : null)
      || Object.keys(layoutMeta)

    // 1. Run Rule-based detection
    const ruleSuggestions = detectRelationships(savedSelected, layoutMeta)
    let finalSuggestions = [...ruleSuggestions]

    // 2. Check if AI is enabled and run AI detection
    const settings = await getAppSettings(userId)

    // Default to true if null (assume enabled by default)
    const isAiEnabled = settings?.aiApiKeyEncrypted && settings?.aiProvider !== 'ollama' ? true : 
                        (settings?.aiProvider === 'ollama' ? true : false)

    if (isAiEnabled) {
      const { suggestRelationships } = await import('@/lib/ai/client')
      
      const payloadLayouts = savedSelected.map(name => ({
        name,
        fields: layoutMeta[name]?.fields || []
      }))
      
      try {
        const aiSuggestions = await suggestRelationships({ layouts: payloadLayouts, tables: [] })
        
        // Merge AI suggestions with rule-based ones (rule-based takes precedence for same keys, but AI finds new ones)
        const existingKeys = new Set(ruleSuggestions.map(s => s.key))
        
        for (const aiSug of aiSuggestions) {
          if (!existingKeys.has(aiSug.key)) {
            finalSuggestions.push(aiSug)
            existingKeys.add(aiSug.key)
          }
        }
      } catch (aiErr: any) {
        console.error('[AI] Relationship suggestion failed:', aiErr.message)
        // We continue with just rule-based suggestions instead of failing completely
      }
    }

    // Persist the suggestions
    await db.browsedSchema.update({
      where: { connectionId: id },
      data: { suggestedRelationships: JSON.stringify(finalSuggestions) },
    })

    return NextResponse.json({
      success: true,
      data: {
        suggestions: finalSuggestions,
        analyzedLayouts: savedSelected.length,
        totalSuggestions: finalSuggestions.length,
      },
    })
    } catch (e: any) {
    console.error('[ai-relationships POST]', e)
    return NextResponse.json({
      success: false,
      error: e.message || 'Relationship detection failed',
      code: 'SERVER_ERROR',
    }, { status: 500 })
    }
    });
