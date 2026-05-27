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

export function useCompiledSchema(connectionId: string | null | undefined) {
  return useQuery({
    queryKey: ['compiled-schema', connectionId],
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000, // 5 min cache — schema doesn't change often
    queryFn: async () => {
      const res = await api.get<CompiledSchema>(`/api/connections/${connectionId}/schema/compiled`)
      return res as CompiledSchema
    },
  })
}
