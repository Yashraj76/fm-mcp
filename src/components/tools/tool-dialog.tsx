'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
import { invalidateToolLists } from '@/lib/query-keys'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SchemaBuilder, type JsonSchema } from '@/components/tools/schema-builder'
import { MultiTableBuilder, type ToolStep } from '@/components/tools/multi-table-builder'
import { ExtraParamsBuilder } from '@/components/tools/extra-params-builder'
import { deriveInputSchema, defaultRecordIdParam, reverseDeriveExtraParams, type ExtraParam } from '@/lib/tools/extra-params'
import dynamic from 'next/dynamic'
const HandlerPreview = dynamic(() => import('@/components/tools/handler-preview').then(m => m.HandlerPreview), { ssr: false, loading: () => <div className="p-4 text-sm text-muted-foreground animate-pulse">Loading preview...</div> })
import { ODataFilterBuilder } from '@/components/tools/odata-filter-builder'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  Wrench,
  Database,
  Play,
  Save,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Globe,
} from 'lucide-react'
import { useCompiledSchema } from '@/hooks/use-compiled-schema'

// ── Test result summary (readable by default, raw JSON on demand) ──────────
function TestResultSummary({ data, isSuccess }: { data: unknown; isSuccess: boolean }) {
  if (!isSuccess) {
    const errMsg =
      typeof data === 'object' && data !== null
        ? ((data as any).error || (data as any).message || JSON.stringify(data))
        : String(data ?? 'Unknown error')
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 whitespace-pre-wrap">
        {errMsg}
      </div>
    )
  }
  const raw = data as any
  const records: any[] | null = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.response?.data) ? raw.response.data
    : null

  if (records !== null) {
    const count = records.length
    const first = records[0]
    const cols = first ? Object.keys(first).slice(0, 5) : []
    return (
      <div className="space-y-2">
        <p className="text-sm text-green-400 flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          {count} record{count !== 1 ? 's' : ''} returned
        </p>
        {first && cols.length > 0 && (
          <div className="rounded-lg border overflow-hidden text-xs">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {cols.map(k => <th key={k} className="px-3 py-2 text-left text-muted-foreground font-medium truncate max-w-[140px]">{k}</th>)}
                    {Object.keys(first).length > 5 && <th className="px-3 py-2 text-left text-muted-foreground">+{Object.keys(first).length - 5}</th>}
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 3).map((row: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      {cols.map(k => <td key={k} className="px-3 py-2 truncate max-w-[140px]">{String(row[k] ?? '')}</td>)}
                      {Object.keys(first).length > 5 && <td className="px-3 py-2 text-muted-foreground">…</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {count > 3 && <p className="px-3 py-1.5 text-[11px] text-muted-foreground border-t bg-muted/20">Showing 3 of {count} records</p>}
          </div>
        )}
        {count === 0 && <p className="text-xs text-muted-foreground">No records matched the query.</p>}
      </div>
    )
  }

  const entries = Object.entries(raw || {}).slice(0, 10)
  if (entries.length === 0) {
    return <p className="text-sm text-green-400 flex items-center gap-2"><CheckCircle2 className="size-4" />Success</p>
  }
  return (
    <div className="rounded-lg border bg-muted/10 divide-y text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-start gap-3 px-3 py-2">
          <span className="text-muted-foreground font-mono w-32 shrink-0 truncate">{k}</span>
          <span className="break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}</span>
        </div>
      ))}
      {Object.keys(raw || {}).length > 10 && (
        <div className="px-3 py-2 text-muted-foreground">+{Object.keys(raw).length - 10} more fields</div>
      )}
    </div>
  )
}

// ── Output shaping: pick a field/array/object path from the test response ──
function flattenPaths(value: unknown, prefix = '', depth = 0, maxDepth = 4): { path: string; preview: string }[] {
  if (depth >= maxDepth || value === null || typeof value !== 'object') return []

  const entries: [string, unknown][] = Array.isArray(value)
    ? value.slice(0, 1).map((v, i) => [`[${i}]`, v] as [string, unknown]) // one representative array element
    : Object.entries(value as Record<string, unknown>)

  const results: { path: string; preview: string }[] = []
  for (const [key, v] of entries) {
    const path = key.startsWith('[') ? `${prefix}${key}` : prefix ? `${prefix}.${key}` : key
    const preview = Array.isArray(v)
      ? `array(${v.length})`
      : v !== null && typeof v === 'object'
      ? 'object'
      : JSON.stringify(v)
    results.push({ path, preview })
    results.push(...flattenPaths(v, path, depth + 1, maxDepth))
  }
  return results
}

function OutputSelectorPicker({
  data,
  value,
  onChange,
}: {
  data: unknown
  value: string | null
  onChange: (path: string | null) => void
}) {
  const paths = useMemo(() => flattenPaths(data).slice(0, 60), [data])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Output Shape</Label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear (return full response)
          </button>
        )}
      </div>
      <Input
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        placeholder="e.g. response.data[0].fieldData — leave empty to return the full response"
        className="h-8 text-xs font-mono"
      />
      {paths.length > 0 && (
        <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/10 p-1.5 flex flex-wrap gap-1">
          {paths.map(p => (
            <button
              key={p.path}
              type="button"
              onClick={() => onChange(p.path)}
              className={cn(
                'text-[11px] font-mono px-1.5 py-0.5 rounded border transition-colors',
                value === p.path
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/30',
              )}
              title={p.preview}
            >
              {p.path}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Click a path or type one to project the tool's response to just that field, array, or object before it's returned to the MCP client.
      </p>
    </div>
  )
}

const CATEGORIES = ['CRUD', 'Find', 'Script', 'Custom', 'Multi-Table'] as const

// FileMaker Method → Category, for the single tag every tool keeps at the
// top level. Multi-table tools and OData tools are set separately.
const METHOD_TO_CATEGORY: Record<string, string> = {
  find: 'Find',
  create: 'CRUD',
  update: 'CRUD',
  delete: 'CRUD',
  get: 'CRUD',
  list: 'CRUD',
  script: 'Script',
}

const ODATA_METHODS = [
  { value: 'odata-filter', label: 'OData $filter' },
  { value: 'odata-expand', label: 'OData $expand' },
] as const

interface ToolFormData {
  name: string
  description: string
  category: string
  fmMethod: string
  fmLayout: string
  fmScript: string
  isEnabled: boolean
  inputSchema: JsonSchema
  outputSchema: JsonSchema
  outputSelector: string | null
  handlerConfig: Record<string, unknown> & {
    connectionId?: string
    fieldMappings?: Record<string, string>
  }
}

function getDefaultFormData(): ToolFormData {
  return {
    name: '',
    description: '',
    category: 'Custom',
    fmMethod: 'find',
    fmLayout: '',
    fmScript: '',
    isEnabled: true,
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    outputSelector: null,
    handlerConfig: {
      connectionId: '',
      method: 'find',
      steps: [],
    },
  }
}

// Maps a legacy flat-shape tool's `fmMethod` to the equivalent step operation
// when upgrading it to a `steps[]` array. Anything unrecognized (e.g. the
// long-dead 'custom' method) falls back to 'find'.
const LEGACY_METHOD_TO_OPERATION: Record<string, ToolStep['operation']> = {
  find: 'find', create: 'create', update: 'update', delete: 'delete', get: 'get', list: 'list', script: 'script',
}

/** Pure builder for {fmMethod, fmLayout, fmScript, handlerConfig} — the same
 * shape both the live editor (`assembleTool`) and the edit-load effect need
 * to produce, so a freshly-loaded tool's "already tested" snapshot and a
 * live re-assembly of unchanged state serialize identically. */
function assembleHandlerConfig(opts: {
  connectionId: string
  useOData: boolean
  odataMethod: string
  odataTable: string
  odataFilterExpression: string
  odataExpandTables: string[]
  steps: ToolStep[]
}) {
  if (opts.useOData) {
    return {
      fmMethod: opts.odataMethod,
      fmLayout: '',
      fmScript: '',
      handlerConfig: {
        connectionId: opts.connectionId,
        method: opts.odataMethod,
        type: opts.odataMethod,
        table: opts.odataTable,
        filterExpression: opts.odataFilterExpression,
        expandTables: opts.odataExpandTables,
      },
    }
  }

  const isMulti = opts.steps.length > 1
  const fmMethod = isMulti ? 'sequential-multi-table' : opts.steps[0]?.operation || 'find'
  return {
    fmMethod,
    fmLayout: opts.steps[0]?.layout || '',
    fmScript: opts.steps[0]?.scriptName || '',
    handlerConfig: { connectionId: opts.connectionId, method: fmMethod, steps: opts.steps },
  }
}

/** Reconstructs a 1-step array from a legacy flat handlerConfig, or passes
 * through an already-modern `steps[]`. Returns `[]` for OData tools (they
 * don't use the steps model) or handlerConfigs with neither shape. */
function buildStepsFromHandlerConfig(handlerConfig: any, fmMethod: string | null | undefined): ToolStep[] {
  if (fmMethod === 'odata-filter' || fmMethod === 'odata-expand') return []
  if (Array.isArray(handlerConfig?.steps) && handlerConfig.steps.length > 0) return handlerConfig.steps
  if (handlerConfig?.layout) {
    return [{
      stepIndex: 0,
      api: 'data-api',
      operation: LEGACY_METHOD_TO_OPERATION[fmMethod as string] ?? 'find',
      layout: handlerConfig.layout,
      fieldMappings: handlerConfig.fieldMappings || {},
      scriptName: handlerConfig.script || handlerConfig.scriptName || undefined,
    }]
  }
  return []
}

interface ToolDialogProps {
  prefilledData?: Partial<ToolFormData>
}

export function ToolDialog({ prefilledData: propPrefilledData }: ToolDialogProps) {
  const showToolDialog = useAppStore(s => s.showToolDialog)
  const editingToolId = useAppStore(s => s.editingToolId)
  const currentServerId = useAppStore(s => s.currentServerId)
  const currentBranchId = useAppStore(s => s.currentBranchId)
  const toolDialogConnectionId = useAppStore(s => s.toolDialogConnectionId)
  const toolDialogPrefilledData = useAppStore(s => s.toolDialogPrefilledData)
  const aiReviewQueue = useAppStore(s => s.aiReviewQueue)
  const setAiReviewQueue = useAppStore(s => s.setAiReviewQueue)
  const setShowToolDialog = useAppStore(s => s.setShowToolDialog)

  // Store-driven queue takes priority since it's set for every AI-review
  // session; the prop is kept as a direct-usage escape hatch for callers
  // that render <ToolDialog prefilledData={...}> themselves.
  const prefilledData = (propPrefilledData ?? toolDialogPrefilledData ?? undefined) as
    | Partial<ToolFormData>
    | undefined


  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('basic')
  const [formData, setFormData] = useState<ToolFormData>(getDefaultFormData())
  const [nameError, setNameError] = useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const [showRawResult, setShowRawResult] = useState(false)
  const [testResult, setTestResult] = useState<{
    status: number
    duration: number
    data: unknown
  } | null>(null)
  // Snapshot of the exact config that was last successfully dry-run tested —
  // compared against the current config at save time so an edit made after
  // testing (a different layout, a changed mapping, ...) can't ride through
  // on a stale pass; the user must re-test whatever they actually save.
  const [testedConfigSnapshot, setTestedConfigSnapshot] = useState<string | null>(null)
  const [testBody, setTestBody] = useState('{}')
  const [handlerConfigStr, setHandlerConfigStr] = useState('{}')
  const [multiTableSteps, setMultiTableSteps] = useState<ToolStep[]>([])
  const [tableMode, setTableMode] = useState<'single' | 'multi'>('single')
  const [extraParams, setExtraParams] = useState<ExtraParam[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [showAdvancedJson, setShowAdvancedJson] = useState(false)
  const [showOutputSchema, setShowOutputSchema] = useState(false)
  const [useOData, setUseOData] = useState(false)
  const [odataTable, setOdataTable] = useState('')
  const [odataExpandTables, setOdataExpandTables] = useState<string[]>([])
  const [odataFilterExpression, setOdataFilterExpression] = useState('')
  const testPanelRef = useRef<HTMLDivElement>(null)

  const isEditing = !!editingToolId
  const isOpen = showToolDialog

  // ── Fetch existing tool for editing ──────────────────────────────────────
  const { data: existingTool, isLoading: isLoadingTool } = useQuery({
    queryKey: ['tool', editingToolId, currentBranchId],
    queryFn: () => {
      const url = currentBranchId
        ? `/api/branches/${currentBranchId}/tools/${editingToolId}`
        : `/api/servers/${currentServerId}/tools/${editingToolId}`
      return api.get<any>(url)
    },
    enabled: isEditing && !!currentServerId && !!editingToolId,
  })

  // ── Fetch server data (for connection list, legacy fallback) ──────────────
  const { data: serverData } = useQuery({
    queryKey: ['server', currentServerId],
    queryFn: () => api.get<any>(`/api/servers/${currentServerId}`),
    enabled: !!currentServerId,
  })

  // ── Determine active connectionId ─────────────────────────────────────────
  // Priority: form value (once populated) > the connectionId the calling page
  // already knew and passed in via the store (known instantly, no fetch) >
  // serverData's first connection (only source left once both of the above
  // are unavailable — e.g. the dialog was opened directly without a hint).
  // Checking the store value before serverData lets useCompiledSchema below
  // fire in parallel with the serverData fetch instead of waiting on it.
  const activeConnectionId = useMemo<string | null>(() => {
    const fromForm = formData.handlerConfig?.connectionId as string | undefined
    if (fromForm) return fromForm
    if (toolDialogConnectionId) return toolDialogConnectionId
    return serverData?.connections?.[0]?.connection?.id ?? null
  }, [formData.handlerConfig?.connectionId, toolDialogConnectionId, serverData?.connections])

  // ── Load compiled schema for the active connection ────────────────────────
  const { data: compiledSchema, isLoading: isLoadingSchema, error: schemaError } = useCompiledSchema(activeConnectionId)

  // Layouts come from the connection's saved schema selections (Browse
  // Schema → Save Selections). There's no other source — a connection that
  // was never browsed, or browsed but never saved, simply has none; see
  // `schemaHint` below for the message shown in that case. (MultiTableBuilder
  // computes its own layout/script/field lists per step from the same
  // `compiledSchema` object — this copy exists purely to gate the hint.)
  const availableLayouts = useMemo(() => {
    return compiledSchema?.layouts?.length ? compiledSchema.layouts.map(l => l.name).sort() : []
  }, [compiledSchema])

  const schemaHint = useMemo(() => {
    if (!activeConnectionId || isLoadingSchema || availableLayouts.length > 0) return null
    const code = (schemaError as { code?: string } | null)?.code
    if (code === 'NOT_BROWSED_YET' || code === 'SCHEMA_NOT_SAVED') {
      return 'This connection has no saved schema yet — open Browse Schema on the Connections page, select layouts, and save.'
    }
    return null
  }, [activeConnectionId, isLoadingSchema, availableLayouts.length, schemaError])

  // ── OData availability ────────────────────────────────────────────────────
  const odataAvailable = (compiledSchema?.tables?.length ?? 0) > 0

  // ── inputSchema is generated, not authored — every step's field mappings
  // plus every declared extra param become an inputSchema property. OData
  // mode has no fieldMappings concept (its {placeholders} live inside the
  // filter expression instead), so it's extraParams-only.
  useEffect(() => {
    const derived = deriveInputSchema(useOData ? [] : multiTableSteps, extraParams)
    queueMicrotask(() => {
      setFormData(prev =>
        JSON.stringify(prev.inputSchema) === JSON.stringify(derived) ? prev : { ...prev, inputSchema: derived },
      )
    })
  }, [multiTableSteps, extraParams, useOData])

  // ── recordId is a reserved, executor-required param — auto add/remove it
  // as an extra param whenever a step needs to address one record by id,
  // instead of making the user remember to declare it themselves.
  useEffect(() => {
    if (useOData) return
    const needsRecordId = multiTableSteps.some(s => ['update', 'delete', 'get'].includes(s.operation))
    queueMicrotask(() => {
      setExtraParams(prev => {
        const has = prev.some(p => p.name === 'recordId')
        if (needsRecordId && !has) return [defaultRecordIdParam(), ...prev]
        if (!needsRecordId && has) return prev.filter(p => p.name !== 'recordId')
        return prev
      })
    })
  }, [multiTableSteps, useOData])

  // ── Populate form when editing ────────────────────────────────────────────
  useEffect(() => {
    if (existingTool && isEditing) {
      try {
        const inputSchema =
          typeof existingTool.inputSchema === 'string'
            ? safeParseJSON(existingTool.inputSchema, {})
            : existingTool.inputSchema
        const outputSchema = existingTool.outputSchema
          ? typeof existingTool.outputSchema === 'string'
            ? safeParseJSON(existingTool.outputSchema, {})
            : existingTool.outputSchema
          : { type: 'object', properties: {} }
        const handlerConfig =
          typeof existingTool.handlerConfig === 'string'
            ? safeParseJSON(existingTool.handlerConfig, {})
            : existingTool.handlerConfig

        const isOData = existingTool.fmMethod === 'odata-filter' || existingTool.fmMethod === 'odata-expand'

        // Auto-upgrade the legacy flat shape (handlerConfig.layout/fieldMappings,
        // no `steps`) to a 1-step array — the dialog only ever authors `steps[]`
        // now, whether the tool has one step or many.
        const steps = buildStepsFromHandlerConfig(handlerConfig, existingTool.fmMethod)

        queueMicrotask(() => {
          setFormData({
            name: existingTool.name || '',
            description: existingTool.description || '',
            fmMethod: existingTool.fmMethod || 'find',
            fmLayout: existingTool.fmLayout || '',
            fmScript: existingTool.fmScript || '',
            isEnabled: existingTool.isEnabled ?? true,
            inputSchema: inputSchema || { type: 'object', properties: {} },
            outputSchema: outputSchema || { type: 'object', properties: {} },
            outputSelector: existingTool.outputSelector ?? null,
            handlerConfig: handlerConfig || {},
            category: existingTool.category || (steps.length > 1 ? 'Multi-Table' : 'Custom'),
          })
          setHandlerConfigStr(JSON.stringify(handlerConfig || {}, null, 2))
          setMultiTableSteps(steps)
          setTableMode(steps.length > 1 ? 'multi' : 'single')
          // Field mappings only cover the params tied to a layout field —
          // anything else already in the saved inputSchema (pagination,
          // recordId, script args...) becomes an extra param so it isn't
          // silently dropped by the new schema-generation path.
          setExtraParams(reverseDeriveExtraParams(inputSchema, steps))
          // Restore OData state
          if (isOData) {
            setUseOData(true)
            setOdataTable(handlerConfig?.table ?? '')
            setOdataFilterExpression(handlerConfig?.filterExpression ?? '')
            setOdataExpandTables(handlerConfig?.expandTables ?? [])
          }
          // This tool is already saved and presumably working — seed the
          // "already tested" snapshot from its own config so editing
          // something unrelated (description, output schema) doesn't force
          // a redundant re-test. The moment anything execution-relevant
          // changes, this snapshot stops matching and a fresh test is
          // required again before the next save.
          setTestedConfigSnapshot(JSON.stringify(assembleHandlerConfig({
            connectionId: (handlerConfig?.connectionId as string) || '',
            useOData: isOData,
            odataMethod: existingTool.fmMethod || 'find',
            odataTable: handlerConfig?.table ?? '',
            odataFilterExpression: handlerConfig?.filterExpression ?? '',
            odataExpandTables: handlerConfig?.expandTables ?? [],
            steps,
          }).handlerConfig))
        })
      } catch {
        toast.error('Failed to parse existing tool data')
      }
    } else if (prefilledData) {
      queueMicrotask(() => {
        setFormData(prev => ({
          ...prev,
          ...prefilledData,
          inputSchema: prefilledData.inputSchema || prev.inputSchema,
          outputSchema: prefilledData.outputSchema || prev.outputSchema,
          handlerConfig: prefilledData.handlerConfig || prev.handlerConfig,
        }))
        if (prefilledData.handlerConfig) {
          setHandlerConfigStr(JSON.stringify(prefilledData.handlerConfig, null, 2))
          const steps = buildStepsFromHandlerConfig(prefilledData.handlerConfig, prefilledData.fmMethod)
          setMultiTableSteps(steps)
          setTableMode(steps.length > 1 ? 'multi' : 'single')
          setExtraParams(reverseDeriveExtraParams(prefilledData.inputSchema, steps))
        }
      })
    }
  }, [existingTool, isEditing, prefilledData])

  // ── Reset all local form state ────────────────────────────────────────────
  // Shared by the close effect below and by the AI-review queue advance
  // (handleCloseDialog) — the latter keeps the dialog mounted/open between
  // queued tools, so it can't rely on the isOpen transition to clear state.
  const resetFormState = useCallback(() => {
    setFormData(getDefaultFormData())
    setActiveTab('basic')
    setNameError(null)
    setDescriptionError(null)
    setLayoutError(null)
    setTestResult(null)
    setTestedConfigSnapshot(null)
    setShowRawResult(false)
    setTestBody('{}')
    setHandlerConfigStr('{}')
    setMultiTableSteps([])
    setTableMode('single')
    setExtraParams([])
    setShowAdvancedJson(false)
    setShowOutputSchema(false)
    setUseOData(false)
    setOdataTable('')
    setOdataExpandTables([])
    setOdataFilterExpression('')
  }, [])

  useEffect(() => {
    if (!isOpen) {
      queueMicrotask(resetFormState)
    }
  }, [isOpen, resetFormState])

  // ── Sync steps/OData → category — category is informational (the executor
  // never reads it), so this just keeps the Basic tab's suggested value
  // reasonable as the mode/operation changes; the user can still override it.
  useEffect(() => {
    const category = useOData
      ? 'Custom'
      : multiTableSteps.length > 1
      ? 'Multi-Table'
      : METHOD_TO_CATEGORY[multiTableSteps[0]?.operation ?? 'find'] ?? 'Custom'
    queueMicrotask(() => {
      setFormData(prev => (prev.category === category ? prev : { ...prev, category }))
    })
  }, [useOData, multiTableSteps])

  const updateField = useCallback((field: keyof ToolFormData, value: any) => {
    if (field === 'name') setNameError(null)
    if (field === 'description') setDescriptionError(null)
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])

  // ── Single source of truth for fmMethod/fmLayout/fmScript/handlerConfig ──
  // Both single- and multi-table tools are always a `steps[]` array now (see
  // executor-service.ts's dispatch) — OData tools stay on the separate flat
  // shape the OData executor actually reads. Built on the module-level
  // `assembleHandlerConfig` (shared with the edit-load effect below) so the
  // "already tested" snapshot and the live config are always constructed
  // identically and can be compared by string equality.
  const assembleTool = useCallback(() => {
    return assembleHandlerConfig({
      connectionId: (formData.handlerConfig?.connectionId as string) || '',
      useOData,
      odataMethod: formData.fmMethod,
      odataTable,
      odataFilterExpression,
      odataExpandTables,
      steps: multiTableSteps,
    })
  }, [formData.handlerConfig?.connectionId, formData.fmMethod, useOData, odataTable, odataFilterExpression, odataExpandTables, multiTableSteps])

  // Keeps the Advanced JSON textarea showing the live assembled config —
  // but only while the panel is collapsed, so it never clobbers a hand edit
  // the user is actively making once they've opened it.
  useEffect(() => {
    if (showAdvancedJson) return
    const str = JSON.stringify(assembleTool().handlerConfig, null, 2)
    queueMicrotask(() => setHandlerConfigStr(str))
  }, [showAdvancedJson, assembleTool])

  // ── Build the live handlerConfig preview ──────────────────────────────────
  const liveHandlerConfig = useMemo(() => assembleTool().handlerConfig, [assembleTool])

  // Advanced JSON always wins when it's valid (per the panel's own warning)
  // — but if the user hasn't touched `steps` there, keep it in sync with the
  // live Single/Multi-Table UI rather than going stale. Shared by both the
  // dry-run test and the actual save so they always execute/persist the
  // exact same config.
  const computeFinalConfig = useCallback((assembled: ReturnType<typeof assembleTool>): Record<string, unknown> => {
    const editorParsed = safeParseJSON<Record<string, any>>(handlerConfigStr, null)
    if (!editorParsed) return assembled.handlerConfig
    return Array.isArray(editorParsed.steps) && editorParsed.steps.length > 0
      ? editorParsed
      : { ...editorParsed, ...(multiTableSteps.length > 0 && !useOData ? { steps: multiTableSteps } : {}) }
  }, [handlerConfigStr, multiTableSteps, useOData])

  // `testedConfigSnapshot` is the actual signal — it's seeded from the tool's
  // own saved config on edit-load (already "tested" by virtue of already
  // working) as well as set by a live passing dry-run. Gating on `testResult`
  // instead would force a redundant re-test on every single Edit-open, since
  // `testResult` always starts null and the seeded snapshot would never get
  // consulted.
  const needsRetest = testedConfigSnapshot === null || JSON.stringify(computeFinalConfig(assembleTool())) !== testedConfigSnapshot
  const hasEverPassedTest = testedConfigSnapshot !== null

  // ── Save mutation ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (data: ToolFormData) => {
      const assembled = assembleTool()
      const finalConfig = computeFinalConfig(assembled)

      const payload = {
        ...data,
        fmMethod: assembled.fmMethod,
        fmLayout: assembled.fmLayout,
        fmScript: assembled.fmScript,
        inputSchema: JSON.stringify(data.inputSchema),
        outputSchema: JSON.stringify(data.outputSchema),
        handlerConfig: JSON.stringify(finalConfig),
        branchId: currentBranchId,
      }

      if (isEditing) {
        const url = currentBranchId
          ? `/api/branches/${currentBranchId}/tools/${editingToolId}`
          : `/api/servers/${currentServerId}/tools/${editingToolId}`
        return api.put<any>(url, payload)
      } else {
        const url = currentBranchId
          ? `/api/branches/${currentBranchId}/tools`
          : `/api/servers/${currentServerId}/tools`
        return api.post<any>(url, payload)
      }
    },
    onSuccess: (data: any) => {
      toast.success(isEditing ? 'Tool updated' : 'Tool created')
      invalidateToolLists(queryClient, currentServerId, currentBranchId)
      if (!isEditing && data?.id) {
        // Switch to edit mode for the new tool so Test tab becomes live.
        // Carry the connection hint and prefilledData marker through so an
        // AI-review session is still recognized as active when this dialog
        // is eventually closed (see handleCloseDialog).
        setShowToolDialog(true, data.id, toolDialogConnectionId, toolDialogPrefilledData)
      } else {
        queryClient.invalidateQueries({ queryKey: ['tool', editingToolId, currentBranchId] })
      }
      setActiveTab('test')
      setShowRawResult(false)
    },
    onError: (err: any) => {
      if (err.code === 'DUPLICATE_TOOL_NAME') {
        setNameError(err.message)
        setActiveTab('basic')
      } else {
        toast.error(err.message || 'Failed to save tool')
      }
    },
  })

  const handleSave = useCallback(() => {
    let firstErrorTab: string | null = null
    if (!formData.name.trim()) {
      setNameError('Tool name is required')
      if (!firstErrorTab) firstErrorTab = 'basic'
    }
    if (!formData.description.trim()) {
      setDescriptionError('Description is required')
      if (!firstErrorTab) firstErrorTab = 'basic'
    }
    if (!useOData) {
      const missingLayout = multiTableSteps.length === 0 || multiTableSteps.some(s => s.api === 'data-api' && !s.layout)
      if (missingLayout) {
        setLayoutError('Select a layout for every step')
        if (!firstErrorTab) firstErrorTab = 'filemaker'
      }
      const missingScript = multiTableSteps.some(s => s.operation === 'script' && !s.scriptName)
      if (missingScript) {
        setLayoutError('Select a script for every script step')
        if (!firstErrorTab) firstErrorTab = 'filemaker'
      }
    }
    if (firstErrorTab) { setActiveTab(firstErrorTab); return }

    // The exact config about to be saved must have been successfully
    // dry-run at least once — catches broken layouts/mappings/connections
    // before they reach production, for both new and edited tools.
    if (needsRetest) {
      toast.error(
        !hasEverPassedTest
          ? 'Test the tool successfully before saving.'
          : 'The config changed since your last passing test — re-test before saving.',
      )
      setActiveTab('test')
      return
    }

    if (!currentBranchId) { toast.error('No branch selected'); return }
    saveMutation.mutate(formData)
  }, [formData, currentBranchId, saveMutation, useOData, multiTableSteps, needsRetest, hasEverPassedTest])

  // Closing a dialog that's part of an AI-generated tool review queue moves
  // to the next queued tool instead of just closing — each generated tool
  // gets its own full create → test → close cycle before the next opens.
  const handleCloseDialog = useCallback((open: boolean) => {
    if (open) {
      setShowToolDialog(true)
      return
    }
    if (toolDialogPrefilledData && aiReviewQueue.length > 0) {
      const [next, ...rest] = aiReviewQueue
      resetFormState()
      setAiReviewQueue(rest)
      setShowToolDialog(true, null, next.connectionId, next.prefilledData)
    } else {
      setAiReviewQueue([])
      setShowToolDialog(false)
    }
  }, [toolDialogPrefilledData, aiReviewQueue, setAiReviewQueue, setShowToolDialog, resetFormState])

  const handleExecuteTest = useCallback(async () => {
    if (!currentServerId) return
    setIsExecuting(true)
    setTestResult(null)
    const startTime = Date.now()
    try {
      let body: Record<string, unknown>
      try {
        body = safeParseJSON(testBody, null)
        if (!body) throw new Error('Invalid JSON')
      } catch {
        toast.error('Invalid JSON in test body')
        setIsExecuting(false)
        return
      }

      const assembled = assembleTool()
      const finalConfig = computeFinalConfig(assembled)

      const result = await api.post<any>(`/api/servers/${currentServerId}/tools/dry-run`, {
        toolData: { ...formData, fmMethod: assembled.fmMethod, fmLayout: assembled.fmLayout, fmScript: assembled.fmScript, handlerConfig: finalConfig },
        body,
        branchId: currentBranchId,
      })
      setTestResult({ status: 200, duration: Date.now() - startTime, data: result })
      setTestedConfigSnapshot(JSON.stringify(finalConfig))
      testPanelRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch (err: any) {
      setTestResult({
        status: err.status || 500,
        duration: Date.now() - startTime,
        data: { error: err.message || 'Failed to execute tool' },
      })
    } finally {
      setIsExecuting(false)
    }
  }, [currentServerId, formData, assembleTool, computeFinalConfig, testBody])

  const handleCopyResponse = useCallback(() => {
    if (testResult) {
      navigator.clipboard.writeText(JSON.stringify(testResult.data, null, 2))
      toast.success('Response copied to clipboard')
    }
  }, [testResult])

  const handleDeriveOutputSchema = useCallback(() => {
    if (testResult?.data) {
      const deriveSchema = (obj: any): any => {
        if (Array.isArray(obj)) return { type: 'array', items: obj.length > 0 ? deriveSchema(obj[0]) : {} }
        if (typeof obj === 'object' && obj !== null) {
          const properties: any = {}
          for (const [k, v] of Object.entries(obj)) properties[k] = deriveSchema(v)
          return { type: 'object', properties }
        }
        if (typeof obj === 'number') return { type: 'number' }
        if (typeof obj === 'boolean') return { type: 'boolean' }
        return { type: 'string' }
      }
      updateField('outputSchema', deriveSchema(testResult.data))
      toast.success('Output schema derived successfully!')
      setShowOutputSchema(true)
    }
  }, [testResult, updateField])

  // Auto-fill test body from input schema
  useEffect(() => {
    if (activeTab === 'test' && formData.inputSchema.properties) {
      const sampleBody: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(formData.inputSchema.properties)) {
        const prop = value as Record<string, unknown>
        if (prop.type === 'string') sampleBody[key] = ''
        else if (prop.type === 'number' || prop.type === 'integer') sampleBody[key] = 0
        else if (prop.type === 'boolean') sampleBody[key] = false
        else if (prop.type === 'array') sampleBody[key] = []
        else if (prop.type === 'object') sampleBody[key] = {}
      }
      if (Object.keys(sampleBody).length > 0) {
        queueMicrotask(() => setTestBody(JSON.stringify(sampleBody, null, 2)))
      }
    }
  }, [activeTab, formData.inputSchema.properties])

  return (
    <Dialog open={isOpen} onOpenChange={handleCloseDialog}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-5" />
            {isEditing ? 'Edit Tool' : 'Create New Tool'}
            {(existingTool?.isAiGenerated || toolDialogPrefilledData) && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 bg-violet-500/20 text-violet-400 border-violet-500/30"
              >
                AI Generated
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {toolDialogPrefilledData
              ? `Review and adjust before saving — ${aiReviewQueue.length} more tool${aiReviewQueue.length !== 1 ? 's' : ''} queued after this one`
              : isEditing
              ? `Editing v${existingTool?.version || 1} of ${existingTool?.name || 'tool'}`
              : 'Configure a new MCP tool for your FileMaker server'}
          </DialogDescription>
        </DialogHeader>

        {isLoadingTool ? (
          <div className="px-6 py-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            {/* ── Tab order: Basic → FileMaker → Test (includes Output Schema) ── */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-6 pt-2">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="basic" className="text-xs gap-1">
                    <Wrench className="size-3" />
                    <span className="hidden sm:inline">Basic</span>
                  </TabsTrigger>
                  <TabsTrigger value="filemaker" className="text-xs gap-1">
                    <Database className="size-3" />
                    <span className="hidden sm:inline">FileMaker</span>
                  </TabsTrigger>
                  <TabsTrigger value="test" className="text-xs gap-1">
                    <Play className="size-3" />
                    <span className="hidden sm:inline">Test</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                {/* ========== BASIC TAB ========== */}
                <TabsContent value="basic" className="mt-0 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tool-name">Tool Name *</Label>
                      <Input
                        id="tool-name"
                        value={formData.name}
                        onChange={e => updateField('name', e.target.value)}
                        placeholder="e.g., search_contacts"
                        className={cn('font-mono text-sm', nameError && 'border-destructive focus-visible:ring-destructive')}
                        aria-describedby={nameError ? 'tool-name-error' : undefined}
                        aria-invalid={!!nameError}
                      />
                      {nameError && (
                        <p id="tool-name-error" className="flex items-center gap-1 text-xs text-destructive">
                          <XCircle className="size-3 shrink-0" />
                          {nameError}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tool-category">Category</Label>
                      <Select
                        value={formData.category}
                        onValueChange={v => updateField('category', v)}
                      >
                        <SelectTrigger id="tool-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tool-desc">Description *</Label>
                    <Textarea
                      id="tool-desc"
                      value={formData.description}
                      onChange={e => updateField('description', e.target.value)}
                      placeholder="Describe what this tool does for AI assistants…"
                      className={cn('min-h-[80px] text-sm', descriptionError && 'border-destructive focus-visible:ring-destructive')}
                      aria-describedby={descriptionError ? 'tool-desc-error' : undefined}
                      aria-invalid={!!descriptionError}
                    />
                    {descriptionError ? (
                      <p id="tool-desc-error" className="flex items-center gap-1 text-xs text-destructive">
                        <XCircle className="size-3 shrink-0" />{descriptionError}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        This description helps AI assistants understand when to use this tool.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Switch
                      id="tool-enabled"
                      checked={formData.isEnabled}
                      onCheckedChange={checked => updateField('isEnabled', checked)}
                    />
                    <Label htmlFor="tool-enabled" className="text-sm">
                      Enabled{' '}
                      <span className="text-muted-foreground">
                        {formData.isEnabled ? '(active in server)' : '(disabled)'}
                      </span>
                    </Label>
                  </div>
                </TabsContent>

                {/* ========== FILEMAKER TAB (merged single/multi-table) ========== */}
                <TabsContent value="filemaker" className="mt-0 space-y-4">
                  {/* Connection + Method */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fm-connection">Target Connection</Label>
                      <Select
                        value={(formData.handlerConfig?.connectionId as string) || 'default'}
                        onValueChange={v => {
                          const val = v === 'default' ? '' : v
                          updateField('handlerConfig', { ...formData.handlerConfig, connectionId: val })
                        }}
                      >
                        <SelectTrigger id="fm-connection">
                          <SelectValue placeholder="Default (First Connection)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          {serverData?.connections?.map((c: any) => (
                            <SelectItem key={c.connection.id} value={c.connection.id}>
                              {c.connection.name} ({c.connection.database})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {useOData && (
                      <div className="space-y-2">
                        <Label htmlFor="fm-method">OData Method *</Label>
                        <Select value={formData.fmMethod || 'odata-filter'} onValueChange={v => updateField('fmMethod', v)}>
                          <SelectTrigger id="fm-method">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ODATA_METHODS.map(m => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* OData toggle — only shown when OData tables available */}
                  {odataAvailable && (
                    <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/10">
                      <Switch
                        id="use-odata"
                        checked={useOData}
                        onCheckedChange={checked => {
                          setUseOData(checked)
                          updateField('fmMethod', checked ? 'odata-filter' : 'find')
                        }}
                      />
                      <Label htmlFor="use-odata" className="text-sm cursor-pointer">
                        <span className="flex items-center gap-1.5">
                          <Globe className="size-3.5 text-violet-400" />
                          Use OData API
                        </span>
                        <span className="text-xs text-muted-foreground font-normal block mt-0.5">
                          Faster for complex multi-field filters (AND/OR). Requires FM OData service.
                        </span>
                      </Label>
                    </div>
                  )}

                  {schemaHint && (
                    <p className="flex items-center gap-1 text-xs text-amber-500">
                      <AlertTriangle className="size-3 shrink-0" />{schemaHint}
                    </p>
                  )}

                  {/* ── OData mode ── */}
                  {useOData ? (
                    <ODataFilterBuilder
                      tables={compiledSchema?.tables ?? []}
                      relationships={compiledSchema?.relationships ?? []}
                      table={odataTable}
                      filterExpression={odataFilterExpression}
                      expandTables={odataExpandTables}
                      onTableChange={setOdataTable}
                      onFilterChange={setOdataFilterExpression}
                      onExpandChange={setOdataExpandTables}
                    />
                  ) : (
                    <>
                      {/* ── FM Data API mode: Single Table / Multi-Table ── */}
                      <div className="flex items-center gap-1 rounded-md bg-muted p-0.5 w-fit">
                        {(['single', 'multi'] as const).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setTableMode(m)
                              setLayoutError(null)
                              if (m === 'single' && multiTableSteps.length > 1) {
                                setMultiTableSteps(steps => steps.slice(0, 1))
                              }
                            }}
                            className={cn(
                              'text-xs px-3 py-1.5 rounded transition-colors',
                              tableMode === m
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {m === 'single' ? 'Single Table' : 'Multi-Table'}
                          </button>
                        ))}
                      </div>

                      {layoutError && (
                        <p className="flex items-center gap-1 text-xs text-destructive">
                          <XCircle className="size-3 shrink-0" />{layoutError}
                        </p>
                      )}

                      <MultiTableBuilder
                        steps={multiTableSteps}
                        connectionId={formData.handlerConfig?.connectionId as string || ''}
                        serverData={serverData}
                        compiledSchema={compiledSchema}
                        singleMode={tableMode === 'single'}
                        onChange={steps => {
                          setMultiTableSteps(steps)
                          setLayoutError(null)
                        }}
                      />
                    </>
                  )}

                  {/* Extra Parameters — inputs with no matching layout field:
                      pagination, sort, recordId, script args, OData {placeholders} */}
                  <ExtraParamsBuilder
                    params={extraParams}
                    onChange={setExtraParams}
                    lockedNames={['recordId']}
                  />

                  {/* Live Handler Config Preview */}
                  <HandlerPreview handlerConfig={liveHandlerConfig} />

                  {/* Advanced JSON editor (collapsed by default) */}
                  <div className="rounded-lg border border-border bg-muted/10">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedJson(s => !s)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-left"
                    >
                      <span>
                        Advanced Handler JSON{' '}
                        <span className="text-xs text-muted-foreground font-normal">(optional override)</span>
                      </span>
                      {showAdvancedJson ? (
                        <ChevronUp className="size-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                      )}
                    </button>

                    {showAdvancedJson && (
                      <div className="px-4 pb-4 space-y-2">
                        <p className="text-xs text-amber-500">
                          ⚠ Advanced JSON overrides the form fields above on save.
                        </p>
                        <Textarea
                          className="font-mono text-xs min-h-[140px] custom-scrollbar"
                          value={handlerConfigStr}
                          onChange={e => setHandlerConfigStr(e.target.value)}
                          onBlur={() => {
                            const val = safeParseJSON(handlerConfigStr, null)
                            if (!val) {
                              toast.error('Invalid JSON in Handler Config')
                            } else {
                              updateField('handlerConfig', val)
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ========== TEST TAB ========== */}
                <TabsContent value="test" className="mt-0 space-y-4">
                  {/* Dry-run executes the in-memory toolData directly — no
                      need to save first, for either a new or existing tool. */}
                  <>
                      <div className="space-y-2">
                        <Label>Request Body</Label>
                        <p className="text-xs text-muted-foreground">
                          Auto-generated from input schema. Modify as needed for testing.
                        </p>
                        <Textarea
                          value={testBody}
                          onChange={e => setTestBody(e.target.value)}
                          className="font-mono text-xs min-h-[120px] max-h-[240px]"
                          placeholder="{}"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          onClick={handleExecuteTest}
                          disabled={isExecuting}
                          className="gap-1"
                          size="sm"
                        >
                          {isExecuting ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              Executing…
                            </>
                          ) : (
                            <>
                              <Play className="size-3.5" />
                              Execute
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTestResult(null)}
                          className="gap-1"
                        >
                          <RotateCcw className="size-3" />
                          Reset
                        </Button>
                      </div>

                      {testResult && (
                        <div ref={testPanelRef} className="space-y-3">
                          {/* Status bar */}
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className={cn(
                                testResult.status >= 200 && testResult.status < 300
                                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                  : 'bg-red-500/20 text-red-400 border-red-500/30',
                              )}
                            >
                              {testResult.status >= 200 && testResult.status < 300 ? (
                                <CheckCircle2 className="size-3 mr-1" />
                              ) : (
                                <XCircle className="size-3 mr-1" />
                              )}
                              {testResult.status}
                            </Badge>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="size-3" />
                              {testResult.duration}ms
                            </span>
                            <div className="flex gap-2 ml-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDeriveOutputSchema}
                                className="h-7 text-xs gap-1"
                              >
                                Derive Schema
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCopyResponse}
                                className="h-7 px-2"
                              >
                                <Copy className="size-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Readable summary */}
                          <TestResultSummary
                            data={testResult.data}
                            isSuccess={testResult.status >= 200 && testResult.status < 300}
                          />

                          {/* Output shaping — pick what the MCP client actually gets back */}
                          {testResult.status >= 200 && testResult.status < 300 && (
                            <OutputSelectorPicker
                              data={testResult.data}
                              value={formData.outputSelector}
                              onChange={path => updateField('outputSelector', path)}
                            />
                          )}

                          {/* Expandable raw JSON */}
                          <div className="rounded-lg border overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setShowRawResult(s => !s)}
                              className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/20 transition-colors"
                            >
                              <span>Raw JSON</span>
                              {showRawResult ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                            </button>
                            {showRawResult && (
                              <div className="border-t bg-muted/10 p-4 font-mono text-xs overflow-auto max-h-[260px] custom-scrollbar">
                                <pre className="whitespace-pre-wrap">
                                  {JSON.stringify(testResult.data, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Output Schema — collapsed by default; "Derive Schema"
                          above fills this in from a real test response and
                          expands it, or hand-author/adjust it here directly. */}
                      <div className="rounded-lg border border-border bg-muted/10">
                        <button
                          type="button"
                          onClick={() => setShowOutputSchema(s => !s)}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-left"
                        >
                          <span>
                            Output Schema{' '}
                            <span className="text-xs text-muted-foreground font-normal">
                              (expected shape of the response)
                            </span>
                          </span>
                          {showOutputSchema ? (
                            <ChevronUp className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          )}
                        </button>
                        {showOutputSchema && (
                          <div className="px-4 pb-4">
                            <SchemaBuilder
                              value={formData.outputSchema}
                              onChange={schema => updateField('outputSchema', schema)}
                              title="Output Schema"
                              description="Define the expected structure of tool responses"
                            />
                          </div>
                        )}
                      </div>
                    </>
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
              {needsRetest && (
                <span className="flex items-center gap-1 text-xs text-amber-500 mr-auto">
                  <AlertTriangle className="size-3 shrink-0" />
                  {hasEverPassedTest ? 'Config changed — re-test before saving' : 'Test the tool before saving'}
                </span>
              )}
              <Button variant="ghost" onClick={() => handleCloseDialog(false)}>
                {toolDialogPrefilledData && aiReviewQueue.length > 0 ? 'Skip / Next Tool' : 'Cancel'}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="gap-1"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {isEditing ? 'Update Tool' : 'Create Tool'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
