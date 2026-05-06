'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check, X, Pencil, ChevronDown, ChevronUp, Sparkles, Layout } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AiSuggestion {
  id: string
  type: 'tool_suggestion' | 'optimization' | 'error_fix'
  title: string
  description: string
  confidence: number
  category: string
  proposedConfig: Record<string, unknown>
}

interface AiSuggestionCardProps {
  suggestion: AiSuggestion
  onAccept: (suggestion: AiSuggestion) => void
  onReject: (id: string) => void
  onModify: (suggestion: AiSuggestion) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  CRUD: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Find: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Script: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  Custom: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-red-500/20 text-red-400',
}

function getConfidenceLevel(confidence: number): string {
  if (confidence >= 85) return 'high'
  if (confidence >= 65) return 'medium'
  return 'low'
}

export function AiSuggestionCard({
  suggestion,
  onAccept,
  onReject,
  onModify,
}: AiSuggestionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const confidenceLevel = getConfidenceLevel(suggestion.confidence)

  const categoryColor = CATEGORY_COLORS[suggestion.category] || CATEGORY_COLORS.Custom

  // Extract tool configs for preview
  const proposedTools = (suggestion.proposedConfig.tools as Array<Record<string, unknown>>) || []
  const isMultiTool = proposedTools.length > 1
  const isOptimization = suggestion.type === 'optimization'

  return (
    <Card
      className={cn(
        'border transition-all duration-200 hover:shadow-md',
        'border-l-4',
        suggestion.type === 'tool_suggestion' && 'border-l-emerald-500',
        suggestion.type === 'optimization' && 'border-l-amber-500',
        suggestion.type === 'error_fix' && 'border-l-red-500',
        isRejecting && 'opacity-50 scale-95'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <div
              className={cn(
                'flex-shrink-0 mt-0.5 size-8 rounded-lg flex items-center justify-center',
                suggestion.type === 'tool_suggestion' && 'bg-emerald-500/20',
                suggestion.type === 'optimization' && 'bg-amber-500/20',
                suggestion.type === 'error_fix' && 'bg-red-500/20'
              )}
            >
              {suggestion.type === 'tool_suggestion' && (
                <Layout className="size-4 text-emerald-400" />
              )}
              {suggestion.type === 'optimization' && (
                <Sparkles className="size-4 text-amber-400" />
              )}
              {suggestion.type === 'error_fix' && (
                <X className="size-4 text-red-400" />
              )}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold leading-tight">
                {suggestion.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {suggestion.description}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Badge variant="outline" className={cn('text-[10px]', categoryColor)}>
              {suggestion.category}
            </Badge>
            <Badge
              variant="outline"
              className={cn('text-[10px]', CONFIDENCE_COLORS[confidenceLevel])}
            >
              {suggestion.confidence}% confidence
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Tool preview chips */}
        {isMultiTool && (
          <div className="flex flex-wrap gap-1.5">
            {proposedTools.slice(0, 5).map((tool, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] font-mono">
                {(tool.name as string) || `Tool ${i + 1}`}
              </Badge>
            ))}
            {proposedTools.length > 5 && (
              <Badge variant="secondary" className="text-[10px]">
                +{proposedTools.length - 5} more
              </Badge>
            )}
          </div>
        )}

        {isOptimization && suggestion.proposedConfig.recommendation && (
          <div className="bg-muted/30 rounded-lg p-2 text-xs text-muted-foreground">
            💡 {suggestion.proposedConfig.recommendation as string}
          </div>
        )}

        {/* Expandable config preview */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {expanded ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
          {expanded ? 'Hide configuration' : 'View configuration'}
        </button>

        {expanded && (
          <div className="bg-muted/20 rounded-lg p-3 font-mono text-[11px] overflow-auto max-h-48 custom-scrollbar border">
            <pre className="whitespace-pre-wrap text-muted-foreground">
              {JSON.stringify(suggestion.proposedConfig, null, 2)}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => onAccept(suggestion)}
            className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
          >
            <Check className="size-3" />
            Accept
          </Button>
          {!isOptimization && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onModify(suggestion)}
              className="h-7 text-xs gap-1"
            >
              <Pencil className="size-3" />
              Modify
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsRejecting(true)
              setTimeout(() => {
                onReject(suggestion.id)
              }, 200)
            }}
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive ml-auto"
          >
            <X className="size-3" />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
