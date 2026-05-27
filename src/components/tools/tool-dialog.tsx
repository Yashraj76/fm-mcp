'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
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
import { FieldMappingBuilder, mappingsToRecord, recordToMappings } from '@/components/tools/field-mapping-builder'
import { HandlerPreview } from '@/components/tools/handler-preview'
import { ODataFilterBuilder } from '@/components/tools/odata-filter-builder'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  Wrench,
  Database,
  FileJson,
  FileOutput,
  Play,
  Save,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  RotateCcw,
  GitFork,
  ChevronDown,
  ChevronUp,
  Globe,
} from 'lucide-react'
import { useCompiledSchema } from '@/hooks/use-compiled-schema'

const CATEGORIES = ['CRUD', 'Find', 'Script', 'Custom', 'Multi-Table'] as const

const FM_METHODS = [
  { value: 'find', label: 'Find Records' },
  { value: 'create', label: 'Create Record' },
  { value: 'update', label: 'Update Record' },
  { value: 'delete', label: 'Delete Record' },
  { value: 'list', label: 'List Records (paginated)' },
  { value: 'get', label: 'Get Record by ID' },
  { value: 'script', label: 'Run Script' },
  { value: 'custom', label: 'Custom' },
] as const

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
  recordIdField: string
  isEnabled: boolean
  inputSchema: JsonSchema
  outputSchema: JsonSchema
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
    fmMethod: 'custom',
    fmLayout: '',
    fmScript: '',
    recordIdField: 'recordId',
    isEnabled: true,
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    handlerConfig: {
      connectionId: '',
      method: 'custom',
      layout: '',
      script: null,
      recordIdField: 'recordId',
      requestParams: [],
      steps: [],
      fieldMappings: {},
    },
  }
}

interface ToolDialogProps {
  prefilledData?: Partial<ToolFormData>
}

export function ToolDialog({ prefilledData }: ToolDialogProps) {
  const showToolDialog = useAppStore(s => s.showToolDialog)
  const editingToolId = useAppStore(s => s.editingToolId)
  const currentServerId = useAppStore(s => s.currentServerId)
  const currentBranchId = useAppStore(s => s.currentBranchId)
  const setShowToolDialog = useAppStore(s => s.setShowToolDialog)
  const triggerRefreshTools = useAppStore(s => s.triggerRefreshTools)

  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('basic')
  const [formData, setFormData] = useState<ToolFormData>(getDefaultFormData())
  const [testResult, setTestResult] = useState<{
    status: number
    duration: number
    data: unknown
  } | null>(null)
  const [testBody, setTestBody] = useState('{}')
  const [handlerConfigStr, setHandlerConfigStr] = useState('{}')
  const [multiTableSteps, setMultiTableSteps] = useState<ToolStep[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [showAdvancedJson, setShowAdvancedJson] = useState(false)
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
  const activeConnectionId = useMemo<string | null>(() => {
    const fromForm = formData.handlerConfig?.connectionId as string | undefined
    if (fromForm) return fromForm
    // Fall back to the first active connection on the server
    return serverData?.connections?.[0]?.connection?.id ?? null
  }, [formData.handlerConfig?.connectionId, serverData?.connections])

  // ── Load compiled schema for the active connection ────────────────────────
  const { data: compiledSchema } = useCompiledSchema(activeConnectionId)

  // ── Derive available layouts / scripts ────────────────────────────────────
  const availableLayouts = useMemo(() => {
    if (compiledSchema?.layouts?.length) return compiledSchema.layouts.map(l => l.name).sort()
    // Legacy fallback
    const layouts = new Set<string>()
    serverData?.connections?.forEach((conn: any) => {
      const schema = safeParseJSON(conn.connection?.browsedSchema?.compiledSchema, {})
      schema.layouts?.forEach((l: any) => layouts.add(l.name))
    })
    return Array.from(layouts).sort()
  }, [compiledSchema, serverData])

  const availableScripts = useMemo(() => {
    if (compiledSchema?.scripts?.length) return compiledSchema.scripts.sort()
    const scripts = new Set<string>()
    serverData?.connections?.forEach((conn: any) => {
      const schema = safeParseJSON(conn.connection?.browsedSchema?.compiledSchema, {})
      schema.scripts?.forEach((s: any) => scripts.add(typeof s === 'string' ? s : s.name))
    })
    return Array.from(scripts).sort()
  }, [compiledSchema, serverData])

  // ── Current layout's fields (typed FieldMeta[]) ───────────────────────────
  const layoutFields = useMemo(() => {
    if (!formData.fmLayout) return []
    if (compiledSchema?.layouts?.length) {
      return compiledSchema.layouts.find(l => l.name === formData.fmLayout)?.fields ?? []
    }
    // Legacy fallback — returns field names as minimal FieldMeta
    const connId = formData.handlerConfig?.connectionId as string | undefined
    const fields: any[] = []
    serverData?.connections?.forEach((conn: any) => {
      if (connId && conn.connection?.id !== connId) return
      const schema = safeParseJSON(conn.connection?.browsedSchema?.compiledSchema, {})
      const layout = schema.layouts?.find((l: any) => l.name === formData.fmLayout)
      if (layout?.fieldMetaData) {
        layout.fieldMetaData.forEach((f: any) => {
          fields.push({
            name: f.name,
            type: f.type ?? 'normal',
            result: f.result ?? 'text',
            global: f.global ?? false,
            autoEnter: f.autoEnter ?? false,
            notEmpty: f.notEmpty ?? false,
          })
        })
      }
    })
    return fields
  }, [compiledSchema, formData.fmLayout, formData.handlerConfig?.connectionId, serverData])

  // ── OData availability ────────────────────────────────────────────────────
  const odataAvailable = (compiledSchema?.tables?.length ?? 0) > 0

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

        queueMicrotask(() => {
          setFormData({
            name: existingTool.name || '',
            description: existingTool.description || '',
            fmMethod: existingTool.fmMethod || 'custom',
            fmLayout: existingTool.fmLayout || '',
            fmScript: existingTool.fmScript || '',
            recordIdField:
              (handlerConfig as Record<string, unknown>)?.recordIdField as string || 'recordId',
            isEnabled: existingTool.isEnabled ?? true,
            inputSchema: inputSchema || { type: 'object', properties: {} },
            outputSchema: outputSchema || { type: 'object', properties: {} },
            handlerConfig: handlerConfig || {},
            category:
              Array.isArray(handlerConfig?.steps) && handlerConfig.steps.length > 0
                ? 'Multi-Table'
                : existingTool.category || 'Custom',
          })
          setHandlerConfigStr(JSON.stringify(handlerConfig || {}, null, 2))
          if (Array.isArray(handlerConfig?.steps) && handlerConfig.steps.length > 0) {
            setMultiTableSteps(handlerConfig.steps)
          }
          // Restore OData state
          if (
            existingTool.fmMethod === 'odata-filter' ||
            existingTool.fmMethod === 'odata-expand'
          ) {
            setUseOData(true)
            setOdataTable(handlerConfig?.table ?? '')
            setOdataFilterExpression(handlerConfig?.filterExpression ?? '')
            setOdataExpandTables(handlerConfig?.expandTables ?? [])
          }
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
          const hc = prefilledData.handlerConfig as any
          if (Array.isArray(hc?.steps)) setMultiTableSteps(hc.steps)
        }
      })
    }
  }, [existingTool, isEditing, prefilledData])

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      queueMicrotask(() => {
        setFormData(getDefaultFormData())
        setActiveTab('basic')
        setTestResult(null)
        setTestBody('{}')
        setHandlerConfigStr('{}')
        setMultiTableSteps([])
        setShowAdvancedJson(false)
        setUseOData(false)
        setOdataTable('')
        setOdataExpandTables([])
        setOdataFilterExpression('')
      })
    }
  }, [isOpen])

  // ── Sync fmMethod → category (skip when multi-table active) ──────────────
  useEffect(() => {
    const methodToCategory: Record<string, string> = {
      create: 'CRUD',
      read: 'CRUD',
      update: 'CRUD',
      delete: 'CRUD',
      list: 'CRUD',
      get: 'CRUD',
      find: 'Find',
      script: 'Script',
      'odata-filter': 'Custom',
      'odata-expand': 'Custom',
    }
    if (multiTableSteps.length > 0 || formData.category === 'Multi-Table') return
    if (methodToCategory[formData.fmMethod]) {
      queueMicrotask(() => {
        setFormData(prev => ({
          ...prev,
          category: methodToCategory[prev.fmMethod],
          handlerConfig: {
            ...prev.handlerConfig,
            method: prev.fmMethod,
            layout: prev.fmLayout || prev.handlerConfig.layout,
            script: prev.fmScript || prev.handlerConfig.script,
            recordIdField: prev.recordIdField,
          },
        }))
        setHandlerConfigStr(
          JSON.stringify(
            {
              ...formData.handlerConfig,
              method: formData.fmMethod,
              layout: formData.fmLayout || formData.handlerConfig.layout,
              script: formData.fmScript || formData.handlerConfig.script,
              recordIdField: formData.recordIdField,
            },
            null,
            2,
          ),
        )
      })
    }
  }, [formData.fmMethod, formData.fmLayout, formData.fmScript, formData.recordIdField])


  /** Called from every OData event handler to keep formData in sync without a useEffect */
  const applyODataToFormData = useCallback(
    (toggle: boolean, table: string, filterExpr: string, expandTablesArr: string[]) => {
      if (!toggle) return
      setFormData(prev => ({
        ...prev,
        fmMethod: 'odata-filter',
        category: 'Custom',
        handlerConfig: {
          ...prev.handlerConfig,
          method: 'odata-filter',
          table,
          filterExpression: filterExpr,
          expandTables: expandTablesArr,
        },
      }))
    },
    [],
  )

  const updateField = useCallback((field: keyof ToolFormData, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }

      // Auto-sync inputSchema properties to fieldMappings
      if (field === 'inputSchema' && prev.category !== 'Multi-Table') {
        const inputProps = (value as JsonSchema)?.properties || {}
        const newMappings = { ...(prev.handlerConfig?.fieldMappings || {}) }
        let hasChanges = false
        for (const key of Object.keys(inputProps)) {
          if (!(key in newMappings)) { newMappings[key] = key; hasChanges = true }
        }
        for (const key of Object.keys(newMappings)) {
          if (!(key in inputProps)) { delete newMappings[key]; hasChanges = true }
        }
        if (hasChanges) {
          updated.handlerConfig = { ...(prev.handlerConfig || {}), fieldMappings: newMappings }
        }
      }

      return updated
    })
  }, [])

  // ── Build the live handlerConfig preview ──────────────────────────────────
  const liveHandlerConfig = useMemo(() => {
    if (multiTableSteps.length > 0) {
      return { ...formData.handlerConfig, steps: multiTableSteps, method: 'sequential-multi-table' }
    }
    return formData.handlerConfig
  }, [formData.handlerConfig, multiTableSteps])

  // ── Save mutation ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (data: ToolFormData) => {
      let finalConfig = data.handlerConfig
      if (multiTableSteps.length > 0) {
        finalConfig = { ...finalConfig, steps: multiTableSteps, method: 'sequential-multi-table' }
      }
      try {
        const editorParsed = safeParseJSON(handlerConfigStr, null)
        if (!editorParsed) throw new Error('Invalid JSON')
        if (editorParsed?.steps?.length > 0) {
          finalConfig = { ...editorParsed, method: 'sequential-multi-table' }
        } else if (multiTableSteps.length > 0) {
          finalConfig = { ...editorParsed, steps: multiTableSteps, method: 'sequential-multi-table' }
        } else {
          finalConfig = editorParsed
        }
      } catch {
        console.warn('Using fallback handlerConfig — invalid JSON in advanced editor')
      }

      const payload = {
        ...data,
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
    onSuccess: () => {
      toast.success(isEditing ? 'Tool updated successfully' : 'Tool created successfully')
      queryClient.invalidateQueries({ queryKey: ['tools', currentServerId] })
      triggerRefreshTools()
      setShowToolDialog(false)
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save tool')
    },
  })

  const handleSave = useCallback(() => {
    if (!formData.name.trim()) { toast.error('Tool name is required'); return }
    if (!formData.description.trim()) { toast.error('Tool description is required'); return }
    if (!currentBranchId) { toast.error('No branch selected'); return }
    saveMutation.mutate(formData)
  }, [formData, currentBranchId, saveMutation])

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

      let finalConfig = formData.handlerConfig
      if (multiTableSteps.length > 0) {
        finalConfig = { ...finalConfig, steps: multiTableSteps, method: 'sequential-multi-table' }
      }
      try {
        const editorParsed = safeParseJSON(handlerConfigStr, null)
        if (!editorParsed) throw new Error('Invalid JSON')
        if (editorParsed?.steps?.length > 0) {
          finalConfig = { ...editorParsed, method: 'sequential-multi-table' }
        } else if (multiTableSteps.length > 0) {
          finalConfig = { ...editorParsed, steps: multiTableSteps, method: 'sequential-multi-table' }
        } else {
          finalConfig = editorParsed
        }
      } catch {}

      const result = await api.post<any>(`/api/servers/${currentServerId}/tools/dry-run`, {
        toolData: { ...formData, handlerConfig: finalConfig },
        body,
      })
      setTestResult({ status: 200, duration: Date.now() - startTime, data: result })
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
  }, [currentServerId, formData, multiTableSteps, handlerConfigStr, testBody])

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
      setActiveTab('output-schema')
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
    <Dialog open={isOpen} onOpenChange={open => setShowToolDialog(open)}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-5" />
            {isEditing ? 'Edit Tool' : 'Create New Tool'}
            {existingTool?.isAiGenerated && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 bg-violet-500/20 text-violet-400 border-violet-500/30"
              >
                AI Generated
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEditing
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
            {/* ── Tab order: Basic → Input → FileMaker → Multi-Table → Test → Output ── */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-6 pt-2">
                <TabsList className="w-full grid grid-cols-6">
                  <TabsTrigger value="basic" className="text-xs gap-1">
                    <Wrench className="size-3" />
                    <span className="hidden sm:inline">Basic</span>
                  </TabsTrigger>
                  <TabsTrigger value="input-schema" className="text-xs gap-1">
                    <FileJson className="size-3" />
                    <span className="hidden sm:inline">Input</span>
                  </TabsTrigger>
                  <TabsTrigger value="fm-mapping" className="text-xs gap-1">
                    <Database className="size-3" />
                    <span className="hidden sm:inline">FileMaker</span>
                  </TabsTrigger>
                  <TabsTrigger value="multi-table" className="text-xs gap-1">
                    <GitFork className="size-3" />
                    <span className="hidden sm:inline">Multi-Table</span>
                  </TabsTrigger>
                  <TabsTrigger value="test" className="text-xs gap-1">
                    <Play className="size-3" />
                    <span className="hidden sm:inline">Test</span>
                  </TabsTrigger>
                  <TabsTrigger value="output-schema" className="text-xs gap-1">
                    <FileOutput className="size-3" />
                    <span className="hidden sm:inline">Output</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                {/* ══════════ BASIC TAB ══════════ */}
                <TabsContent value="basic" className="mt-0 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tool-name">Tool Name *</Label>
                      <Input
                        id="tool-name"
                        value={formData.name}
                        onChange={e => updateField('name', e.target.value)}
                        placeholder="e.g., search_contacts"
                        className="font-mono text-sm"
                      />
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
                      className="min-h-[80px] text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      This description helps AI assistants understand when to use this tool.
                    </p>
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

                {/* ══════════ INPUT SCHEMA TAB (moved to position 2) ══════════ */}
                <TabsContent value="input-schema" className="mt-0">
                  <SchemaBuilder
                    value={formData.inputSchema}
                    onChange={schema => updateField('inputSchema', schema)}
                    title="Input Schema"
                    description="Define the parameters that AI assistants will send to this tool. These param names drive the field mapping dropdowns on the FileMaker tab."
                    availableFields={layoutFields.map(f => f.name)}
                  />
                </TabsContent>

                {/* ══════════ FILEMAKER TAB ══════════ */}
                <TabsContent value="fm-mapping" className="mt-0 space-y-4">
                  {/* Connection + Method */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fm-connection">Target Connection</Label>
                      <Select
                        value={(formData.handlerConfig?.connectionId as string) || 'default'}
                        onValueChange={v => {
                          const val = v === 'default' ? '' : v
                          const hc = { ...formData.handlerConfig, connectionId: val }
                          updateField('handlerConfig', hc)
                          setHandlerConfigStr(JSON.stringify(hc, null, 2))
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

                    <div className="space-y-2">
                      <Label htmlFor="fm-method">FileMaker Method *</Label>
                      <Select
                        value={useOData ? (formData.fmMethod || 'odata-filter') : formData.fmMethod}
                        onValueChange={v => {
                          updateField('fmMethod', v)
                          if (v === 'odata-filter' || v === 'odata-expand') setUseOData(true)
                        }}
                        disabled={useOData}
                      >
                        <SelectTrigger id="fm-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {useOData
                            ? ODATA_METHODS.map(m => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))
                            : FM_METHODS.map(m => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* OData toggle — only shown when OData tables available */}
                  {odataAvailable && (
                    <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/10">
                      <Switch
                        id="use-odata"
                        checked={useOData}
                        onCheckedChange={checked => {
                          setUseOData(checked)
                          if (checked) {
                            updateField('fmMethod', 'odata-filter')
                            updateField('category', 'Custom')
                          } else {
                            updateField('fmMethod', 'find')
                            updateField('category', 'Find')
                          }
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

                  {/* ── OData mode ── */}
                  {useOData ? (
                    <ODataFilterBuilder
                      tables={compiledSchema?.tables ?? []}
                      table={odataTable}
                      filterExpression={odataFilterExpression}
                      expandTables={odataExpandTables}
                      onTableChange={t => {
                        setOdataTable(t)
                        const hc = {
                          ...formData.handlerConfig,
                          method: formData.fmMethod,
                          table: t,
                          filterExpression: odataFilterExpression,
                          expandTables: odataExpandTables,
                        }
                        updateField('handlerConfig', hc)
                        setHandlerConfigStr(JSON.stringify(hc, null, 2))
                      }}
                      onFilterChange={expr => {
                        setOdataFilterExpression(expr)
                        const hc = {
                          ...formData.handlerConfig,
                          method: formData.fmMethod,
                          table: odataTable,
                          filterExpression: expr,
                          expandTables: odataExpandTables,
                        }
                        updateField('handlerConfig', hc)
                        setHandlerConfigStr(JSON.stringify(hc, null, 2))
                      }}
                      onExpandChange={tables => {
                        setOdataExpandTables(tables)
                        const hc = {
                          ...formData.handlerConfig,
                          method: formData.fmMethod,
                          table: odataTable,
                          filterExpression: odataFilterExpression,
                          expandTables: tables,
                        }
                        updateField('handlerConfig', hc)
                        setHandlerConfigStr(JSON.stringify(hc, null, 2))
                      }}
                    />
                  ) : (
                    <>
                      {/* ── FM Data API mode ── */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="fm-layout">FM Layout</Label>
                          <Select
                            value={formData.fmLayout || 'none'}
                            onValueChange={v => {
                              const val = v === 'none' ? '' : v
                              updateField('fmLayout', val)
                              const hc = {
                                ...formData.handlerConfig,
                                layout: val,
                                fieldMappings: {},
                              }
                              updateField('handlerConfig', hc)
                              setHandlerConfigStr(JSON.stringify(hc, null, 2))
                            }}
                          >
                            <SelectTrigger id="fm-layout" className="text-sm">
                              <SelectValue placeholder="Select layout" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-muted-foreground italic">
                                None
                              </SelectItem>
                              {availableLayouts.map(l => (
                                <SelectItem key={l} value={l}>{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            The FileMaker layout to target for data operations
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="fm-script">FM Script</Label>
                          <Select
                            value={formData.fmScript || 'none'}
                            onValueChange={v => updateField('fmScript', v === 'none' ? '' : v)}
                            disabled={formData.fmMethod !== 'script'}
                          >
                            <SelectTrigger id="fm-script" className="text-sm">
                              <SelectValue placeholder="Select script" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-muted-foreground italic">
                                None
                              </SelectItem>
                              {availableScripts.map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Record ID field (for read/update/delete/get) */}
                      {(formData.fmMethod === 'read' ||
                        formData.fmMethod === 'update' ||
                        formData.fmMethod === 'delete' ||
                        formData.fmMethod === 'get') && (
                        <div className="space-y-2">
                          <Label htmlFor="record-id-field">Record ID Field Mapping</Label>
                          <Input
                            id="record-id-field"
                            value={formData.recordIdField}
                            onChange={e => updateField('recordIdField', e.target.value)}
                            placeholder="recordId"
                            className="font-mono text-sm w-64"
                          />
                          <p className="text-xs text-muted-foreground">
                            The field name used to identify records in your schema
                          </p>
                        </div>
                      )}

                      {/* Field Mapping Builder */}
                      <div className="bg-muted/10 rounded-lg p-4 border">
                        <FieldMappingBuilder
                          mappings={recordToMappings(
                            formData.handlerConfig?.fieldMappings as Record<string, string>,
                          )}
                          fields={layoutFields}
                          onChange={mappings => {
                            const record = mappingsToRecord(mappings)
                            const hc = { ...formData.handlerConfig, fieldMappings: record }
                            updateField('handlerConfig', hc)
                            setHandlerConfigStr(JSON.stringify(hc, null, 2))
                          }}
                        />
                        <p className="text-[11px] text-muted-foreground mt-3">
                          Map input parameters (from Input Schema) to the actual FileMaker field names.
                          Selecting an FM field auto-fills the input param name.
                        </p>
                      </div>
                    </>
                  )}

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
                          For multi-table tools use the Multi-Table tab instead.
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

                {/* ══════════ MULTI-TABLE TAB ══════════ */}
                <TabsContent value="multi-table" className="mt-0 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Multi-Table Steps</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Build sequential FM Data API steps or OData calls that chain together across
                      multiple layouts or tables. Use this for cross-table lookups, OData $expand,
                      and atomic $batch writes.
                    </p>
                  </div>
                  <MultiTableBuilder
                    steps={multiTableSteps}
                    connectionId={formData.handlerConfig?.connectionId as string || ''}
                    serverData={serverData}
                    compiledSchema={compiledSchema}
                    onChange={steps => {
                      setMultiTableSteps(steps)
                      if (steps.length > 1) updateField('category', 'Multi-Table')
                    }}
                  />
                  {multiTableSteps.length > 0 && (
                    <p className="text-[11px] text-muted-foreground border border-dashed rounded px-2 py-1.5">
                      ✓ {multiTableSteps.length} step{multiTableSteps.length > 1 ? 's' : ''}{' '}
                      configured. These will be saved to{' '}
                      <code className="font-mono bg-muted px-1 rounded">handlerConfig.steps</code>.
                    </p>
                  )}
                </TabsContent>

                {/* ══════════ TEST TAB ══════════ */}
                <TabsContent value="test" className="mt-0 space-y-4">
                  {isEditing ? (
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
                          <div className="bg-muted/20 rounded-lg p-4 font-mono text-xs overflow-auto max-h-[300px] custom-scrollbar border">
                            <pre className="whitespace-pre-wrap">
                              {JSON.stringify(testResult.data, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Play className="size-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Save the tool first to enable testing
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* ══════════ OUTPUT SCHEMA TAB ══════════ */}
                <TabsContent value="output-schema" className="mt-0">
                  <SchemaBuilder
                    value={formData.outputSchema}
                    onChange={schema => updateField('outputSchema', schema)}
                    title="Output Schema"
                    description="Define the expected structure of tool responses"
                  />
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
              <Button variant="ghost" onClick={() => setShowToolDialog(false)}>
                Cancel
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
