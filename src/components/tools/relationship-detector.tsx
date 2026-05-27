'use client'

import { useEffect } from 'react'
import { type RelationshipEdge } from '@/hooks/use-compiled-schema'
import { cn } from '@/lib/utils'
import { fmFieldToParamName } from '@/lib/utils/field-name-utils'

interface DetectedRelationship {
  extractField: string
  useExtractedAs: string
  toKeyField: string
}

interface RelationshipDetectorProps {
  fromLayout: string
  toLayout: string
  relationships: RelationshipEdge[]
  onRelationshipDetected: (rel: DetectedRelationship | null) => void
}

const CONFIDENCE_STYLES: Record<string, string> = {
  certain: 'text-green-400 border-green-500/30 bg-green-500/10',
  high: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  medium: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  low: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
}

export function RelationshipDetector({
  fromLayout,
  toLayout,
  relationships,
  onRelationshipDetected,
}: RelationshipDetectorProps) {
  const rel = findRelationship(fromLayout, toLayout, relationships)

  useEffect(() => {
    if (!fromLayout || !toLayout) {
      onRelationshipDetected(null)
      return
    }

    if (!rel) {
      onRelationshipDetected(null)
      return
    }

    const isForward = rel.fromLayout === fromLayout
    const extractField = isForward ? rel.fromKey : rel.toKey
    const toKeyField = isForward ? rel.toKey : rel.fromKey
    const useExtractedAs = fmFieldToParamName(toKeyField)

    onRelationshipDetected({ extractField, useExtractedAs, toKeyField })
  }, [fromLayout, toLayout, relationships])

  if (!fromLayout || !toLayout) return null

  if (!rel) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
        <span className="mt-0.5">⚠️</span>
        <span>
          No saved relationship found between <strong>{fromLayout}</strong> and{' '}
          <strong>{toLayout}</strong>. Set Extract Field / Inject As manually below.
        </span>
      </div>
    )
  }

  const styleClass = CONFIDENCE_STYLES[rel.confidence] ?? 'text-muted-foreground border-border bg-muted/20'

  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-md border text-xs', styleClass)}>
      <span>🔗</span>
      <span className="flex-1">
        Auto-detected join:{' '}
        <strong>{rel.fromLayout}.{rel.fromKey}</strong>
        {' → '}
        <strong>{rel.toLayout}.{rel.toKey}</strong>
        {' '}
        <span className="opacity-70">
          ({rel.confidence} confidence{rel.source ? ` · ${rel.source}` : ''})
        </span>
      </span>
      <span className="opacity-60 shrink-0">Override below</span>
    </div>
  )
}

function findRelationship(
  fromLayout: string,
  toLayout: string,
  relationships: RelationshipEdge[],
): RelationshipEdge | undefined {
  return relationships.find(
    r =>
      r.usableInTools &&
      ((r.fromLayout === fromLayout && r.toLayout === toLayout) ||
        (r.fromLayout === toLayout && r.toLayout === fromLayout)),
  )
}
