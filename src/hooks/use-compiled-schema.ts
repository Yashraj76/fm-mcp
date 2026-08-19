'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'

export interface FieldMeta {
  name: string
  type: string      // "normal" | "calculation" | "summary"
  result: string    // "text" | "number" | "date" | "timestamp" | "container"
  global: boolean
  autoEnter: boolean
  notEmpty: boolean
}

export interface PortalMeta {
  table: string
  fields: { name: string; type: string }[]
}

export interface LayoutMeta {
  name: string
  connectionId?: string
  fields: FieldMeta[]
  portals: PortalMeta[]
}

export interface ODataTable {
  name: string
  fields: { name: string; type: string }[]
}

export interface RelationshipEdge {
  id: string
  fromLayout: string
  toLayout: string
  fromKey: string
  toKey: string
  type: string
  confidence: string
  usableInTools: boolean
  source?: string
}

export interface CompiledSchema {
  layouts: LayoutMeta[]
  tables: ODataTable[]
  scripts: string[]
  relationships: RelationshipEdge[]
  primaryKeys: Record<string, string>
}

// The saved schema only ever persists layout fields as plain name strings
// (see src/app/api/connections/[id]/schema/selections/route.ts), never full
// FieldMeta objects — normalize here so every consumer (tool-dialog's field
// mapper, multi-table builder, FieldSelector) can rely on the declared shape
// instead of crashing on `field.name` being undefined.
function toFieldMeta(f: unknown): FieldMeta {
  if (typeof f === 'string') {
    return { name: f, type: 'normal', result: 'text', global: false, autoEnter: false, notEmpty: false }
  }
  return f as FieldMeta
}

export function useCompiledSchema(connectionId: string | null | undefined) {
  return useQuery({
    queryKey: ['compiled-schema', connectionId],
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000, // 5 min cache — schema doesn't change often
    queryFn: async () => {
      // GET /schema/compiled responds with { compiledSchema, selectedLayouts,
      // selectedTables, selectedScripts, fetchedAt, updatedAt } — the actual
      // {layouts, tables, scripts, relationships} shape lives one level
      // deeper, under `compiledSchema`.
      const res = await api.get<{ compiledSchema: CompiledSchema }>(`/api/connections/${connectionId}/schema/compiled`)
      const schema = res.compiledSchema
      return {
        ...schema,
        layouts: (schema.layouts ?? []).map(l => ({ ...l, fields: (l.fields ?? []).map(toFieldMeta) })),
      }
    },
  })
}
