'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Trash2,
  ArrowDown,
  Database,
  Globe,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type StepApi = 'data-api' | 'odata'
export type StepOperation =
  | 'find' | 'create' | 'update' | 'delete' | 'list' | 'script'
  | 'odata-get' | 'odata-batch'

export interface ToolStep {
  stepIndex: number
  api: StepApi
  operation: StepOperation
  layout?: string
  table?: string
  fieldMappings?: Record<string, string>
  filterExpression?: string
  expandTables?: string[]
  extractField?: string
  useExtractedAs?: string
  scriptName?: string
}

interface MultiTableBuilderProps {
  steps: ToolStep[]
  connectionId?: string
  onChange: (steps: ToolStep[]) => void
}

const OPERATION_LABELS: Record<StepOperation, string> = {
  find: 'Find Records (/_find)',
  create: 'Create Record',
  update: 'Update Record',
  delete: 'Delete Record',
  list: 'List Records (paginated)',
  script: 'Run FM Script',
  'odata-get': 'OData GET ($filter / $expand)',
  'odata-batch': 'OData $batch (atomic writes)',
}

const STRATEGY_DESCRIPTIONS = {
  sequential: {
    label: 'Sequential Multi-Table',
    desc: 'Step 0 queries Table A; extracts a key; Step 1 uses that key to query Table B via FM Data API.',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  },
  'odata-expand': {
    label: 'OData $expand',
    desc: 'Single OData call that fetches a parent record and expands related child records in one response.',
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  },
  'odata-filter': {
    label: 'OData $filter',
    desc: 'Single OData call with complex multi-field filter conditions (AND/OR) across a related navigation property.',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
  'odata-batch': {
    label: 'OData $batch',
    desc: 'Atomic multi-write operation: create/update records in multiple tables in a single transaction.',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
}

function inferStrategy(steps: ToolStep[]) {
  if (steps.length === 0) return null
  const hasOdata = steps.some(s => s.api === 'odata')
  if (!hasOdata) return steps.length > 1 ? 'sequential' : null
  const op = steps[0]?.operation
  if (op === 'odata-batch') return 'odata-batch'
  if (steps[0]?.expandTables?.length) return 'odata-expand'
  if (steps[0]?.filterExpression) return 'odata-filter'
  return null
}

function FieldMappingEditor({
  mappings,
  onChange,
}: {
  mappings: Record<string, string>
  onChange: (m: Record<string, string>) => void
}) {
  const pairs = Object.entries(mappings)

  const update = (idx: number, key: string, val: string) => {
    const next = [...pairs]
    next[idx] = [key, val]
    onChange(Object.fromEntries(next))
  }

  const add = () => onChange({ ...mappings, '': '' })

  const remove = (idx: number) => {
    const next = [...pairs]
    next.splice(idx, 1)
    onChange(Object.fromEntries(next))
  }

  return (
    <div className="space-y-1.5">
      {pairs.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            className="h-7 text-xs font-mono flex-1"
            placeholder="inputParam"
            value={k}
            onChange={e => update(i, e.target.value, v)}
          />
          <span className="text-muted-foreground text-xs">→</span>
          <Input
            className="h-7 text-xs font-mono flex-1"
            placeholder="FMFieldName"
            value={v}
            onChange={e => update(i, k, e.target.value)}
          />
          <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => remove(i)}>
            <Trash2 className="size-3 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full" onClick={add}>
        <Plus className="size-3" /> Add Mapping
      </Button>
    </div>
  )
}

function StepEditor({
  step,
  index,
  totalSteps,
  onChange,
  onDelete,
}: {
  step: ToolStep
  index: number
  totalSteps: number
  onChange: (s: ToolStep) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const isOdata = step.api === 'odata'

  const update = <K extends keyof ToolStep>(key: K, value: ToolStep[K]) =>
    onChange({ ...step, [key]: value })

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 cursor-pointer select-none',
          isOdata ? 'bg-violet-500/10' : 'bg-blue-500/10'
        )}
        onClick={() => setExpanded(e => !e)}
      >
        <GripVertical className="size-3.5 text-muted-foreground" />
        <Badge
          variant="outline"
          className={cn(
            'text-xs font-mono',
            isOdata
              ? 'border-violet-500/40 text-violet-400'
              : 'border-blue-500/40 text-blue-400'
          )}
        >
          Step {index}
        </Badge>
        {isOdata ? (
          <Globe className="size-3 text-violet-400" />
        ) : (
          <Database className="size-3 text-blue-400" />
        )}
        <span className="text-xs font-medium flex-1 truncate">
          {isOdata
            ? `OData → ${step.table || '(table)'}`
            : `FM Data API → ${step.layout || '(layout)'} [${step.operation}]`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
          >
            <Trash2 className="size-3 text-destructive" />
          </Button>
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 bg-muted/10">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">API Type</Label>
              <Select value={step.api} onValueChange={(v) => update('api', v as StepApi)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="data-api">FM Data API</SelectItem>
                  <SelectItem value="odata">OData</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Operation</Label>
              <Select value={step.operation} onValueChange={(v) => update('operation', v as StepOperation)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isOdata
                    ? (['odata-get', 'odata-batch'] as StepOperation[])
                    : (['find', 'create', 'update', 'delete', 'list', 'script'] as StepOperation[])
                  ).map(op => (
                    <SelectItem key={op} value={op} className="text-xs">
                      {OPERATION_LABELS[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isOdata ? (
            <div className="space-y-1">
              <Label className="text-xs">OData Table Name</Label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder="e.g. Customers"
                value={step.table || ''}
                onChange={e => update('table', e.target.value)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">FM Layout</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. Customers"
                  value={step.layout || ''}
                  onChange={e => update('layout', e.target.value)}
                />
              </div>
              {step.operation === 'script' && (
                <div className="space-y-1">
                  <Label className="text-xs">Script Name</Label>
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="e.g. SendWelcomeEmail"
                    value={step.scriptName || ''}
                    onChange={e => update('scriptName', e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {!isOdata && step.operation !== 'script' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Field Mappings <span className="text-muted-foreground">(inputParam → FMField)</span></Label>
              <FieldMappingEditor
                mappings={step.fieldMappings || {}}
                onChange={m => update('fieldMappings', m)}
              />
            </div>
          )}

          {isOdata && step.operation === 'odata-get' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">$filter Expression</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="Email eq '{email}' and Status eq 'Active'"
                  value={step.filterExpression || ''}
                  onChange={e => update('filterExpression', e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Use <code className="bg-muted px-1 rounded">{'{paramName}'}</code> as placeholders. Strings auto-quoted at runtime.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">$expand Tables <span className="text-muted-foreground">(comma separated)</span></Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="Orders,SupportTickets"
                  value={(step.expandTables || []).join(', ')}
                  onChange={e =>
                    update('expandTables', e.target.value.split(',').map(t => t.trim()).filter(Boolean))
                  }
                />
              </div>
            </>
          )}

          {index < totalSteps - 1 && !isOdata && (
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-dashed">
              <div className="space-y-1">
                <Label className="text-xs text-amber-400">Extract Field (from result)</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. CustomerID"
                  value={step.extractField || ''}
                  onChange={e => update('extractField', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-amber-400">Inject As (into next step)</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. customerId"
                  value={step.useExtractedAs || ''}
                  onChange={e => update('useExtractedAs', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function MultiTableBuilder({ steps, connectionId, onChange }: MultiTableBuilderProps) {
  const strategy = inferStrategy(steps)

  const addStep = (api: StepApi) => {
    const next: ToolStep = {
      stepIndex: steps.length,
      api,
      operation: api === 'odata' ? 'odata-get' : 'find',
      layout: api === 'data-api' ? '' : undefined,
      table: api === 'odata' ? '' : undefined,
    }
    onChange([...steps, next])
  }

  const updateStep = (index: number, updated: ToolStep) => {
    const next = steps.map((s, i) => (i === index ? { ...updated, stepIndex: i } : s))
    onChange(next)
  }

  const deleteStep = (index: number) => {
    const next = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepIndex: i }))
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {strategy && (
        <div className={cn('text-xs rounded-md px-3 py-2 border', STRATEGY_DESCRIPTIONS[strategy as keyof typeof STRATEGY_DESCRIPTIONS]?.color)}>
          <span className="font-semibold">{STRATEGY_DESCRIPTIONS[strategy as keyof typeof STRATEGY_DESCRIPTIONS]?.label}:</span>{' '}
          {STRATEGY_DESCRIPTIONS[strategy as keyof typeof STRATEGY_DESCRIPTIONS]?.desc}
        </div>
      )}

      {steps.length === 0 && (
        <div className="text-xs text-muted-foreground rounded-md border border-dashed p-3 space-y-1.5">
          <p className="font-medium text-foreground">Choose a multi-table strategy:</p>
          {Object.values(STRATEGY_DESCRIPTIONS).map(s => (
            <div key={s.label} className="flex gap-2">
              <Badge variant="outline" className={cn('shrink-0 text-[10px]', s.color)}>{s.label}</Badge>
              <span>{s.desc}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i}>
            <StepEditor
              step={step}
              index={i}
              totalSteps={steps.length}
              onChange={updated => updateStep(i, updated)}
              onDelete={() => deleteStep(i)}
            />
            {i < steps.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="size-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs flex-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          onClick={() => addStep('data-api')}
        >
          <Database className="size-3" />
          + FM Data API Step
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs flex-1 border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
          onClick={() => addStep('odata')}
        >
          <Globe className="size-3" />
          + OData Step
        </Button>
      </div>
    </div>
  )
}
