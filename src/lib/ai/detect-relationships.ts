export interface RelationshipSuggestion {
  from: string
  to: string
  key: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

/**
 * Returns a canonical dedup key for a relationship.
 * Uses sorted table names so A↔B and B↔A are treated as the same pair,
 * while A↔C and B↔C (different tables, same key name) remain distinct.
 */
export function relDedupKey(from: string, to: string, key: string): string {
  return `${[from, to].sort().join('↔')}::${key}`
}

/**
 * Rule-based relationship detector.
 * Works WITHOUT an AI API key — uses field name conventions:
 *  - Exact shared field name across two layouts → high confidence
 *  - Common FK patterns: *ID, *_id, *Id, ContactID, CustomerID etc.
 *  - Portal links (definite)
 */
export function detectRelationships(
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
    /ID$/i,       // ContactID, CustomerID, OrderID
    /^ID$/i,      // bare "ID"
    /_id$/i,      // contact_id
    /Id$/,        // contactId (camelCase)
    /^FK_/i,      // FK_Customer
    /Key$/i,      // PrimaryKey, ForeignKey
    /Code$/i,     // CustomerCode, ItemCode
    /Num$/i,      // OrderNum, InvoiceNum
    /Number$/i,   // OrderNumber
  ]

  for (const [field, layouts] of Object.entries(fieldToLayouts)) {
    if (layouts.length < 2) continue
    const isFK = FK_PATTERNS.some((p) => p.test(field))
    if (!isFK) continue

    // Create a suggestion for every pair of layouts sharing this field.
    // Dedup key uses both table names so Customers↔Orders::ID and
    // Products↔Orders::ID are NOT collapsed to the same key.
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const from = layouts[i]
        const to = layouts[j]
        const key = relDedupKey(from, to, field)
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
  const COMMON_NON_FK = [
    /name$/i, /email$/i, /phone$/i, /address$/i, /date$/i,
  ]
  for (const [field, layouts] of Object.entries(fieldToLayouts)) {
    if (layouts.length < 2) continue
    const isFK = FK_PATTERNS.some((p) => p.test(field))
    if (isFK) continue
    const isCommon = COMMON_NON_FK.some((p) => p.test(field))
    if (!isCommon) continue

    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const from = layouts[i]
        const to = layouts[j]
        const key = relDedupKey(from, to, field)
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
        const key = relDedupKey(layouts[i], layouts[j], 'prefix')
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
