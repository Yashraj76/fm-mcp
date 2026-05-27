'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface HandlerPreviewProps {
  handlerConfig: Record<string, any>
  className?: string
}

export function HandlerPreview({ handlerConfig, className }: HandlerPreviewProps) {
  const [expanded, setExpanded] = useState(false)

  const json = useMemo(
    () => JSON.stringify(handlerConfig, null, 2),
    [handlerConfig],
  )

  const lines = json.split('\n')
  const COLLAPSE_AT = 10
  const hasMore = lines.length > COLLAPSE_AT
  const preview = expanded ? json : lines.slice(0, COLLAPSE_AT).join('\n') + (hasMore ? '\n…' : '')

  return (
    <div className={cn('rounded-md border border-border bg-muted/20', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Handler Config Preview
        </span>
        <div className="flex items-center gap-2">
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-primary hover:underline"
            >
              {expanded ? 'Collapse' : `Show all (${lines.length} lines)`}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(json)}
            title="Copy JSON"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Code */}
      <pre className={cn(
        'font-mono text-xs p-3 overflow-x-auto text-foreground/80',
        !expanded && hasMore && 'max-h-[200px] overflow-y-hidden',
      )}>
        {preview}
      </pre>
    </div>
  )
}
