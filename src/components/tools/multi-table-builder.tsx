'use client'

import { useState, useEffect, useRef } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FieldMappingBuilder, mappingsToRecord, recordToMappings } from './field-mapping-builder'
import { FieldSelector } from './field-selector'
import { RelationshipDetector } from './relationship-detector'
import { type CompiledSchema, type FieldMeta } from '@/hooks/use-compiled-schema'
import { safeParseJSON } from '@/lib/utils/safe-parse'

export type StepApi = 'data-api' | 'odata'
export type StepOperation =
  | 'find' | 'create' | 'update' | 'delete' | 'get' | 'list' | 'script'
  | 'odata-get' | 'odata-batch'

/** Operations that address one specific record — need a `recordId` input
 * param rather than (or in addition to) field-mapped criteria. */
export const RECORD_ID_OPERATIONS: StepOperation[] = ['update', 'delete', 'get']

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
  /** Legacy fallback — used only when compiledSchema is absent */
  serverData?: any
  /** Primary source of truth for layouts/tables/relationships */
  compiledSchema?: CompiledSchema
  onChange: (steps: ToolStep[]) => void
  /** Constrains to exactly one FM Data API step and hides add/remove-step
   * chrome and the strategy banner — the "Single Table" mode of the merged
   * FileMaker tab. Auto-creates a default step if none exists yet. */
  singleMode?: boolean
}

const OPERATION_LABELS: Record<StepOperation, string> = {
  find: 'Find Records (/_find)',
  create: 'Create Record',
  update: 'Update Record',
  delete: 'Delete Record',
  get: 'Get Record by ID',
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
    desc: 'Single OData call with complex multi-field filter conditions (AND/OR) across a navigation property.',
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

/** Derive field list for a layout from compiledSchema or raw serverData */
function getLayoutFields(
  layoutName: string | undefined,
  compiledSchema: CompiledSchema | undefined,
  serverData: any,
  connectionId?: string,
): FieldMeta[] {
  if (!layoutName) return []

  // Prefer typed compiledSchema
  if (compiledSchema?.layouts) {
    const layout = compiledSchema.layouts.find(l => l.name === layoutName)
    if (layout) return layout.fields ?? []
  }

  // Fallback to raw serverData
  if (serverData?.connections) {
    for (const conn of serverData.connections) {
      if (connectionId && conn.connection?.id !== connectionId) continue
      const schema = safeParseJSON<Record<string, any>>(conn.connection?.browsedSchema?.compiledSchema, {})
      const layout = schema.layouts?.find((l: any) => l.name === layoutName)
      if (layout?.fieldMetaData) {
        return layout.fieldMetaData.map((f: any) => ({
          name: f.name,
          type: f.type ?? 'normal',
          result: f.result ?? 'text',
          global: f.global ?? false,
          autoEnter: f.autoEnter ?? false,
          notEmpty: f.notEmpty ?? false,
        }))
      }
    }
  }

  return []
}

/** Derive layout names from compiledSchema or raw serverData */
function getAvailableLayouts(
  compiledSchema: CompiledSchema | undefined,
  serverData: any,
  connectionId?: string,
): string[] {
  if (compiledSchema?.layouts?.length) {
    return compiledSchema.layouts.map(l => l.name).sort()
  }
  if (serverData?.connections) {
    const layouts = new Set<string>()
    for (const conn of serverData.connections) {
      if (connectionId && conn.connection?.id !== connectionId) continue
      const schema = safeParseJSON<Record<string, any>>(conn.connection?.browsedSchema?.compiledSchema, {})
      schema.layouts?.forEach((l: any) => layouts.add(l.name))
    }
    return Array.from(layouts).sort()
  }
  return []
}

function StepEditor({
  step,
  index,
  totalSteps,
  compiledSchema,
  serverData,
  connectionId,
  prevStep,
  onChange,
  onDelete,
  singleMode,
  onAutoMap,
}: {
  step: ToolStep
  index: number
  totalSteps: number
  compiledSchema?: CompiledSchema
  serverData?: any
  connectionId?: string
  prevStep?: ToolStep
  onChange: (s: ToolStep) => void
  onDelete?: () => void
  singleMode?: boolean
  onAutoMap?: (
    prevExtract: string,
    prevUseAs: string,
    currMappings: Record<string, string>,
  ) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const isOdata = step.api === 'odata'

  const update = <K extends keyof ToolStep>(key: K, value: ToolStep[K]) =>
    onChange({ ...step, [key]: value })

  const availableLayouts = getAvailableLayouts(compiledSchema, serverData, connectionId)
  const layoutFields = getLayoutFields(step.layout, compiledSchema, serverData, connectionId)
  const odataTables = compiledSchema?.tables ?? []
  const relationships = compiledSchema?.relationships ?? []

  // Relationship detector fires for non-last steps
  const nextLayout = prevStep?.layout // we detect from prevStep → this step
  const showRelDetector =
    index > 0 &&
    !isOdata &&
    step.layout &&
    prevStep?.api === 'data-api' &&
    prevStep?.layout

  // The row list is buffered in local state rather than derived fresh from
  // `step.fieldMappings` every render — that Record<string,string> can't
  // represent a row mid-edit (empty inputParam or fmField), so re-deriving
  // on every render would make a just-added empty row vanish immediately
  // (mappingsToRecord drops it, then recordToMappings reflects the drop).
  // `lastEmittedRef` distinguishes "step.fieldMappings changed because we
  // just wrote it" (ignore) from "it changed some other way" — a
  // relationship-detector auto-map or a layout switch — in which case we
  // do want to resync from the new record.
  const [mappings, setMappings] = useState(() => recordToMappings(step.fieldMappings))
  const lastEmittedRef = useRef(mappingsToRecord(mappings))
  useEffect(() => {
    const incoming = step.fieldMappings || {}
    if (JSON.stringify(incoming) !== JSON.stringify(lastEmittedRef.current)) {
      lastEmittedRef.current = incoming
      setMappings(recordToMappings(incoming))
    }
  }, [step.fieldMappings])

  function handleMappingsChange(next: ReturnType<typeof recordToMappings>) {
    setMappings(next)
    const record = mappingsToRecord(next)
    lastEmittedRef.current = record
    update('fieldMappings', record)
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Step header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 cursor-pointer select-none',
          isOdata ? 'bg-violet-500/10' : 'bg-blue-500/10',
        )}
        onClick={() => setExpanded(e => !e)}
      >
        {!singleMode && (
          <Badge
            variant="outline"
            className={cn(
              'text-xs font-mono shrink-0',
              isOdata ? 'border-violet-500/40 text-violet-400' : 'border-blue-500/40 text-blue-400',
            )}
          >
            Step {index}
          </Badge>
        )}

        {isOdata ? (
          <Globe className="size-3 text-violet-400 shrink-0" />
        ) : (
          <Database className="size-3 text-blue-400 shrink-0" />
        )}

        <span className="text-xs font-medium flex-1 truncate">
          {isOdata
            ? `OData → ${step.table || '(table)'}`
            : `FM Data API → ${step.layout || '(layout)'} [${step.operation}]`}
        </span>

        <div className="flex items-center gap-1">
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={e => { e.stopPropagation(); onDelete() }}
              aria-label={`Delete step ${index}`}
            >
              <Trash2 className="size-3 text-destructive" />
            </Button>
          )}
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 bg-muted/10">
          {/* Relationship detector (for step > 0 with prev step layout) */}
          {showRelDetector && (
            <RelationshipDetector
              fromLayout={prevStep!.layout!}
              toLayout={step.layout!}
              relationships={relationships}
              onRelationshipDetected={rel => {
                if (rel && onAutoMap) {
                  onAutoMap(rel.extractField, rel.useExtractedAs, {
                    [rel.useExtractedAs]: rel.toKeyField,
                  })
                }
              }}
            />
          )}

          {/* API type + operation */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">API Type</Label>
              <Select value={step.api} onValueChange={v => update('api', v as StepApi)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="data-api">FM Data API</SelectItem>
                  <SelectItem
                    value="odata"
                    disabled={odataTables.length === 0}
                  >
                    OData{odataTables.length === 0 ? ' (not available)' : ''}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Operation</Label>
              <Select
                value={step.operation}
                onValueChange={v => update('operation', v as StepOperation)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isOdata
                    ? (['odata-get', 'odata-batch'] as StepOperation[])
                    : (['find', 'create', 'update', 'delete', 'get', 'list', 'script'] as StepOperation[])
                  ).map(op => (
                    <SelectItem key={op} value={op} className="text-xs">
                      {OPERATION_LABELS[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Layout / Table selector */}
          {!isOdata ? (
            <div className="space-y-1">
              <Label className="text-xs">FM Layout</Label>
              {availableLayouts.length > 0 ? (
                <Select
                  value={step.layout ?? ''}
                  onValueChange={v => onChange({ ...step, layout: v, fieldMappings: {} })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select layout…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLayouts.map(l => (
                      <SelectItem key={l} value={l} className="text-xs font-mono">
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="Layout name…"
                  value={step.layout ?? ''}
                  onChange={e => onChange({ ...step, layout: e.target.value, fieldMappings: {} })}
                />
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">OData Table</Label>
              {odataTables.length > 0 ? (
                <Select
                  value={step.table ?? ''}
                  onValueChange={v => update('table', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select table…" />
                  </SelectTrigger>
                  <SelectContent>
                    {odataTables.map(t => (
                      <SelectItem key={t.name} value={t.name} className="text-xs font-mono">
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. Customers"
                  value={step.table ?? ''}
                  onChange={e => update('table', e.target.value)}
                />
              )}
            </div>
          )}

          {/* Script name */}
          {!isOdata && step.operation === 'script' && (
            <div className="space-y-1">
              <Label className="text-xs">Script Name</Label>
              {(compiledSchema?.scripts?.length ?? 0) > 0 ? (
                <Select value={step.scriptName ?? ''} onValueChange={v => update('scriptName', v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select script…" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...(compiledSchema?.scripts ?? [])].sort().map(s => (
                      <SelectItem key={s} value={s} className="text-xs font-mono">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. SendWelcomeEmail"
                  value={step.scriptName ?? ''}
                  onChange={e => update('scriptName', e.target.value)}
                />
              )}
            </div>
          )}

          {/* recordId hint — update/delete/get address one record by id,
              which is a reserved input param, never a mapped FM field */}
          {!isOdata && RECORD_ID_OPERATIONS.includes(step.operation) && (
            <p className="text-[11px] text-amber-500/90 flex items-center gap-1">
              <span className="font-mono bg-amber-500/10 px-1 rounded">recordId</span>
              is required — it's added to this tool's inputs automatically, not mapped below.
            </p>
          )}

          {/* Field Mappings (data-api, non-script) */}
          {!isOdata && step.operation !== 'script' && (
            <div className="space-y-1.5">
              <FieldMappingBuilder
                mappings={mappings}
                fields={layoutFields}
                onChange={handleMappingsChange}
              />
            </div>
          )}

          {/* OData filter */}
          {isOdata && step.operation === 'odata-get' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">$filter Expression</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="Email eq '{email}' and Status eq 'Active'"
                  value={step.filterExpression ?? ''}
                  onChange={e => update('filterExpression', e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Use <code className="bg-muted px-1 rounded">{'{'+'paramName'+'}'}</code> as placeholders. Strings are auto-quoted at runtime.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  $expand Tables <span className="text-muted-foreground">(comma separated)</span>
                </Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="Orders,SupportTickets"
                  value={(step.expandTables ?? []).join(', ')}
                  onChange={e =>
                    update(
                      'expandTables',
                      e.target.value.split(',').map(t => t.trim()).filter(Boolean),
                    )
                  }
                />
              </div>
            </>
          )}

          {/* Extract / inject (non-last data-api steps) */}
          {index < totalSteps - 1 && !isOdata && (
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-dashed">
              <div className="space-y-1">
                <Label className="text-xs text-amber-400">Extract Field (from result)</Label>
                {layoutFields.length > 0 ? (
                  <FieldSelector
                    fields={layoutFields}
                    value={step.extractField ?? ''}
                    onChange={v => update('extractField', v)}
                    placeholder="Select field…"
                  />
                ) : (
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="e.g. CustomerID"
                    value={step.extractField ?? ''}
                    onChange={e => update('extractField', e.target.value)}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-amber-400">Inject As (into next step)</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. customerId"
                  value={step.useExtractedAs ?? ''}
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

export function MultiTableBuilder({
  steps,
  connectionId,
  serverData,
  compiledSchema,
  onChange,
  singleMode = false,
}: MultiTableBuilderProps) {
  const strategy = singleMode ? null : inferStrategy(steps)

  // Single Table mode always has exactly one step — seed a default the first
  // time there isn't one (e.g. a brand new tool, or switching modes).
  useEffect(() => {
    if (singleMode && steps.length === 0) {
      onChange([{ stepIndex: 0, api: 'data-api', operation: 'find', layout: '' }])
    }
  }, [singleMode, steps.length, onChange])

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
        <div
          className={cn(
            'text-xs rounded-md px-3 py-2 border',
            STRATEGY_DESCRIPTIONS[strategy as keyof typeof STRATEGY_DESCRIPTIONS]?.color,
          )}
        >
          <span className="font-semibold">
            {STRATEGY_DESCRIPTIONS[strategy as keyof typeof STRATEGY_DESCRIPTIONS]?.label}:
          </span>{' '}
          {STRATEGY_DESCRIPTIONS[strategy as keyof typeof STRATEGY_DESCRIPTIONS]?.desc}
        </div>
      )}

      {!singleMode && steps.length === 0 && (
        <div className="text-xs text-muted-foreground rounded-md border border-dashed p-3 space-y-1.5">
          <p className="font-medium text-foreground">Choose a multi-table strategy:</p>
          {Object.values(STRATEGY_DESCRIPTIONS).map(s => (
            <div key={s.label} className="flex gap-2">
              <Badge variant="outline" className={cn('shrink-0 text-[10px]', s.color)}>
                {s.label}
              </Badge>
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
              compiledSchema={compiledSchema}
              serverData={serverData}
              connectionId={connectionId}
              prevStep={i > 0 ? steps[i - 1] : undefined}
              onChange={updated => updateStep(i, updated)}
              onDelete={singleMode ? undefined : () => deleteStep(i)}
              singleMode={singleMode}
              onAutoMap={(prevExtract, prevUseAs, currMappings) => {
                const newSteps = [...steps]
                newSteps[i - 1] = {
                  ...newSteps[i - 1],
                  extractField: prevExtract,
                  useExtractedAs: prevUseAs,
                }
                newSteps[i] = { ...newSteps[i], fieldMappings: currMappings }
                onChange(newSteps)
              }}
            />
            {i < steps.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="size-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>

      {!singleMode && (
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
          {/* OData steps aren't supported by the multi-step executor yet
              (executeMultiStepTool only handles api:'data-api') — disabled
              rather than shipping a step type that throws at run time. Use
              the "Use OData API" toggle in Single Table mode instead. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs w-full border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                  disabled
                >
                  <Globe className="size-3" />
                  + OData Step
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Not supported in multi-table chains yet — use the OData toggle in Single Table mode.</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
