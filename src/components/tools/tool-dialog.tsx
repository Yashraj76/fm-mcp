/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { FieldMapper } from '@/components/tools/field-mapper'
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
} from 'lucide-react'

const CATEGORIES = ['CRUD', 'Find', 'Script', 'Custom', 'Multi-Table'] as const
const FM_METHODS = [
  { value: 'create', label: 'Create Record' },
  { value: 'read', label: 'Read Record' },
  { value: 'update', label: 'Update Record' },
  { value: 'delete', label: 'Delete Record' },
  { value: 'find', label: 'Find Records' },
  { value: 'script', label: 'Run Script' },
  { value: 'custom', label: 'Custom' },
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
  handlerConfig: Record<string, unknown> & { connectionId?: string, fieldMappings?: Record<string, string> }
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
  const showToolDialog = useAppStore((s) => s.showToolDialog)
  const editingToolId = useAppStore((s) => s.editingToolId)
  const currentServerId = useAppStore((s) => s.currentServerId)
  const currentBranchId = useAppStore((s) => s.currentBranchId)
  const setShowToolDialog = useAppStore((s) => s.setShowToolDialog)
  const triggerRefreshTools = useAppStore((s) => s.triggerRefreshTools)

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
  const testPanelRef = useRef<HTMLDivElement>(null)

  const isEditing = !!editingToolId
  const isOpen = showToolDialog

  // Fetch existing tool data for editing
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

  // Fetch server data for schema autocompletion
  const { data: serverData } = useQuery({
    queryKey: ['server', currentServerId],
    queryFn: () => api.get<any>(`/api/servers/${currentServerId}`),
    enabled: !!currentServerId,
  })

  const [availableLayouts, setAvailableLayouts] = useState<string[]>([])
  const [availableScripts, setAvailableScripts] = useState<string[]>([])

  useEffect(() => {
    if (serverData?.connections) {
      const layouts = new Set<string>()
      const scripts = new Set<string>()
      serverData.connections.forEach((conn: any) => {
        if (conn.connection?.browsedSchema?.compiledSchema) {
          try {
            const schema = safeParseJSON(conn.connection.browsedSchema.compiledSchema, {})
            schema.layouts?.forEach((l: any) => layouts.add(l.name))
            schema.scripts?.forEach((s: any) => scripts.add(s.name))
          } catch {}
        }
      })
      setAvailableLayouts(Array.from(layouts).sort())
      setAvailableScripts(Array.from(scripts).sort())
    }
  }, [serverData])

  const [layoutFields, setLayoutFields] = useState<string[]>([])

  useEffect(() => {
    if (serverData?.connections && formData.fmLayout) {
      let fields: string[] = []
      serverData.connections.forEach((conn: any) => {
        if (!formData.handlerConfig?.connectionId || conn.connection.id === formData.handlerConfig.connectionId) {
          if (conn.connection?.browsedSchema?.compiledSchema) {
            try {
              const schema = safeParseJSON(conn.connection.browsedSchema.compiledSchema, {})
              const layout = schema.layouts?.find((l: any) => l.name === formData.fmLayout)
              if (layout && layout.fieldMetaData) {
                fields = [...new Set([...fields, ...layout.fieldMetaData.map((f: any) => f.name)])]
              }
            } catch {}
          }
        }
      })
      setLayoutFields(fields.sort())
    } else {
      setLayoutFields([])
    }
  }, [serverData, formData.fmLayout, formData.handlerConfig?.connectionId])

  // Populate form when editing
  useEffect(() => {
    if (existingTool && isEditing) {
      try {
        const inputSchema = typeof existingTool.inputSchema === 'string'
          ? safeParseJSON(existingTool.inputSchema, {})
          : existingTool.inputSchema
        const outputSchema = existingTool.outputSchema
          ? typeof existingTool.outputSchema === 'string'
            ? safeParseJSON(existingTool.outputSchema, {})
            : existingTool.outputSchema
          : { type: 'object', properties: {} }
        const handlerConfig = typeof existingTool.handlerConfig === 'string'
          ? safeParseJSON(existingTool.handlerConfig, {})
          : existingTool.handlerConfig

        queueMicrotask(() => {
          setFormData({
            name: existingTool.name || '',
            description: existingTool.description || '',
            fmMethod: existingTool.fmMethod || 'custom',
            fmLayout: existingTool.fmLayout || '',
            fmScript: existingTool.fmScript || '',
            recordIdField: (handlerConfig as Record<string, unknown>)?.recordIdField as string || 'recordId',
            isEnabled: existingTool.isEnabled ?? true,
            inputSchema: inputSchema || { type: 'object', properties: {} },
            outputSchema: outputSchema || { type: 'object', properties: {} },
            handlerConfig: handlerConfig || {},
            // If this is a multi-table tool, override category
            category: Array.isArray(handlerConfig?.steps) && handlerConfig.steps.length > 0
              ? 'Multi-Table'
              : existingTool.category || 'Custom',
          })
          setHandlerConfigStr(JSON.stringify(handlerConfig || {}, null, 2))
          // Restore multi-table steps into the visual builder
          if (Array.isArray(handlerConfig?.steps) && handlerConfig.steps.length > 0) {
            setMultiTableSteps(handlerConfig.steps)
          }
        })
      } catch {
        toast.error('Failed to parse existing tool data')
      }
    } else if (prefilledData) {
      queueMicrotask(() => {
        setFormData((prev) => ({
          ...prev,
          ...prefilledData,
          inputSchema: prefilledData.inputSchema || prev.inputSchema,
          outputSchema: prefilledData.outputSchema || prev.outputSchema,
          handlerConfig: prefilledData.handlerConfig || prev.handlerConfig,
        }))
        if (prefilledData.handlerConfig) {
          setHandlerConfigStr(JSON.stringify(prefilledData.handlerConfig, null, 2))
          // Restore multi-table steps if present
          const hc = prefilledData.handlerConfig as any
          if (Array.isArray(hc?.steps)) setMultiTableSteps(hc.steps)
        }
      })
    }
  }, [existingTool, isEditing, prefilledData])

  // Reset form on dialog close
  useEffect(() => {
    if (!isOpen) {
      queueMicrotask(() => {
        setFormData(getDefaultFormData())
        setActiveTab('basic')
        setTestResult(null)
        setTestBody('{}')
        setHandlerConfigStr('{}')
        setMultiTableSteps([])
      })
    }
  }, [isOpen])

  // Sync fmMethod to category — skip if multi-table steps are active
  useEffect(() => {
    const methodToCategory: Record<string, string> = {
      create: 'CRUD',
      read: 'CRUD',
      update: 'CRUD',
      delete: 'CRUD',
      find: 'Find',
      script: 'Script',
    }
    // Don't override category when multi-table mode is active
    if (multiTableSteps.length > 0 || formData.category === 'Multi-Table') return
    if (methodToCategory[formData.fmMethod]) {
      queueMicrotask(() => {
        setFormData((prev) => ({
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
        setHandlerConfigStr(JSON.stringify({
          ...formData.handlerConfig,
          method: formData.fmMethod,
          layout: formData.fmLayout || formData.handlerConfig.layout,
          script: formData.fmScript || formData.handlerConfig.script,
          recordIdField: formData.recordIdField,
        }, null, 2))
      })
    }
  }, [formData.fmMethod, formData.fmLayout, formData.fmScript, formData.recordIdField])

  const updateField = useCallback((field: keyof ToolFormData, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }

      // Auto-sync inputSchema properties to fieldMappings
      if (field === 'inputSchema' && prev.category !== 'Multi-Table') {
        const inputProps = value?.properties || {}
        const newMappings = { ...(prev.handlerConfig?.fieldMappings || {}) }
        let hasChanges = false
        
        // Add new keys
        for (const key of Object.keys(inputProps)) {
          if (!(key in newMappings)) {
            newMappings[key] = key
            hasChanges = true
          }
        }
        
        // Remove deleted keys
        for (const key of Object.keys(newMappings)) {
          if (!(key in inputProps)) {
            delete newMappings[key]
            hasChanges = true
          }
        }

        if (hasChanges) {
          updated.handlerConfig = {
            ...(prev.handlerConfig || {}),
            fieldMappings: newMappings
          }
        }
      }

      return updated
    })
  }, [])

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: ToolFormData) => {
      let finalConfig = data.handlerConfig;
      // If multi-table steps exist, merge them into handlerConfig
      if (multiTableSteps.length > 0) {
        finalConfig = { ...finalConfig, steps: multiTableSteps, method: 'sequential-multi-table' }
      }
      try {
        // Allow manual JSON override via the advanced editor
        const editorParsed = safeParseJSON(handlerConfigStr, null)
        if (!editorParsed) throw new Error('Invalid JSON')
        if (editorParsed?.steps?.length > 0) {
          // Ensure method is always sequential-multi-table when steps exist
          finalConfig = { ...editorParsed, method: 'sequential-multi-table' }
        } else if (multiTableSteps.length > 0) {
          finalConfig = { ...editorParsed, steps: multiTableSteps, method: 'sequential-multi-table' }
        } else {
          finalConfig = editorParsed
        }
      } catch (e) {
        console.warn('Using fallback handlerConfig, invalid JSON in advanced editor')
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
    if (!formData.name.trim()) {
      toast.error('Tool name is required')
      return
    }
    if (!formData.description.trim()) {
      toast.error('Tool description is required')
      return
    }
    if (!currentBranchId) {
      toast.error('No branch selected')
      return
    }
    saveMutation.mutate(formData)
  }, [formData, currentBranchId, saveMutation, setShowToolDialog])

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

      const result = await api.post<any>(
        `/api/servers/${currentServerId}/tools/dry-run`,
        {
          toolData: { ...formData, handlerConfig: finalConfig },
          body: body
        }
      )
      setTestResult({
        status: 200,
        duration: Date.now() - startTime,
        data: result,
      })

      if (testPanelRef.current) {
        testPanelRef.current.scrollIntoView({ behavior: 'smooth' })
      }
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
    if (testResult && testResult.data) {
      const deriveSchema = (obj: any): any => {
        if (Array.isArray(obj)) {
          return {
            type: 'array',
            items: obj.length > 0 ? deriveSchema(obj[0]) : {},
          }
        } else if (typeof obj === 'object' && obj !== null) {
          const properties: any = {}
          for (const [k, v] of Object.entries(obj)) {
            properties[k] = deriveSchema(v)
          }
          return { type: 'object', properties }
        } else if (typeof obj === 'number') {
          return { type: 'number' }
        } else if (typeof obj === 'boolean') {
          return { type: 'boolean' }
        }
        return { type: 'string' }
      }
      
      const schema = deriveSchema(testResult.data)
      updateField('outputSchema', schema)
      toast.success('Output schema derived successfully!')
      setActiveTab('output-schema')
    }
  }, [testResult, updateField])

  // Generate test body from input schema
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
        queueMicrotask(() => {
          setTestBody(JSON.stringify(sampleBody, null, 2))
        })
      }
    }
  }, [activeTab, formData.inputSchema.properties])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => setShowToolDialog(open)}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-5" />
            {isEditing ? 'Edit Tool' : 'Create New Tool'}
            {existingTool?.isAiGenerated && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-violet-500/20 text-violet-400 border-violet-500/30">
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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-6 pt-2">
              <TabsList className="w-full grid grid-cols-6">
                  <TabsTrigger value="basic" className="text-xs gap-1">
                    <Wrench className="size-3" />
                    <span className="hidden sm:inline">Basic</span>
                  </TabsTrigger>
                  <TabsTrigger value="fm-mapping" className="text-xs gap-1">
                    <Database className="size-3" />
                    <span className="hidden sm:inline">FileMaker</span>
                  </TabsTrigger>
                  <TabsTrigger value="multi-table" className="text-xs gap-1">
                    <GitFork className="size-3" />
                    <span className="hidden sm:inline">Multi-Table</span>
                  </TabsTrigger>
                  <TabsTrigger value="input-schema" className="text-xs gap-1">
                    <FileJson className="size-3" />
                    <span className="hidden sm:inline">Input</span>
                  </TabsTrigger>
                  <TabsTrigger value="test" className="text-xs gap-1">
                    <Play className="size-3" />
                    <span className="hidden sm:inline">Test</span>
                  </TabsTrigger>
                  <TabsTrigger value="output-schema" className="text-xs gap-1">
                    <FileOutput className="size-3" />
                    <span className="hidden sm:inline">Output</span>
                  </TabsTrigger>
                  <TabsTrigger value="test" className="text-xs gap-1" disabled={!isEditing}>
                    <Play className="size-3" />
                    <span className="hidden sm:inline">Test</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                {/* ===== BASIC INFO TAB ===== */}
                <TabsContent value="basic" className="mt-0 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tool-name">Tool Name *</Label>
                      <Input
                        id="tool-name"
                        value={formData.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        placeholder="e.g., Create Contact Record"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tool-category">Category</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(v) => updateField('category', v)}
                      >
                        <SelectTrigger id="tool-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
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
                      onChange={(e) => updateField('description', e.target.value)}
                      placeholder="Describe what this tool does for AI assistants..."
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
                      onCheckedChange={(checked) => updateField('isEnabled', checked)}
                    />
                    <Label htmlFor="tool-enabled" className="text-sm">
                      Enabled{' '}
                      <span className="text-muted-foreground">
                        {formData.isEnabled ? '(active in server)' : '(disabled)'}
                      </span>
                    </Label>
                  </div>
                </TabsContent>

                {/* ===== FILEMAKER MAPPING TAB ===== */}
                <TabsContent value="fm-mapping" className="mt-0 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fm-connection">Target Connection</Label>
                      <Select 
                        value={(formData.handlerConfig?.connectionId as string) || 'default'} 
                        onValueChange={(v) => {
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
                      <Select value={formData.fmMethod} onValueChange={(v) => updateField('fmMethod', v)}>
                        <SelectTrigger id="fm-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FM_METHODS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fm-layout">FM Layout</Label>
                      <Select
                        value={formData.fmLayout || 'default'}
                        onValueChange={(v) => updateField('fmLayout', v === 'default' ? '' : v)}
                      >
                        <SelectTrigger id="fm-layout" className="text-sm">
                          <SelectValue placeholder="Select layout" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default" className="text-muted-foreground italic">None</SelectItem>
                          {availableLayouts.map((l) => (
                            <SelectItem key={l} value={l}>
                              {l}
                            </SelectItem>
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
                        value={formData.fmScript || 'default'}
                        onValueChange={(v) => updateField('fmScript', v === 'default' ? '' : v)}
                        disabled={formData.fmMethod !== 'script'}
                      >
                        <SelectTrigger id="fm-script" className="text-sm">
                          <SelectValue placeholder="Select script" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default" className="text-muted-foreground italic">None</SelectItem>
                          {availableScripts.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {(formData.fmMethod === 'read' ||
                    formData.fmMethod === 'update' ||
                    formData.fmMethod === 'delete' ||
                    formData.fmMethod === 'get') && (
                    <div className="space-y-2">
                      <Label htmlFor="record-id-field">Record ID Field Mapping</Label>
                      <div className="relative">
                        <Input
                          id="record-id-field"
                          value={formData.recordIdField}
                          onChange={(e) => updateField('recordIdField', e.target.value)}
                          placeholder="recordId"
                          list="record-id-list"
                          className="font-mono text-sm w-64"
                        />
                        <datalist id="record-id-list">
                          {layoutFields.map((f) => (
                            <option key={f} value={f} />
                          ))}
                        </datalist>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The field name used to identify records in your schema
                      </p>
                    </div>
                  )}

                  {formData.fmLayout && layoutFields.length > 0 && (
                    <div className="bg-muted/10 rounded-lg p-4 border mt-4">
                      <FieldMapper 
                        layoutFields={layoutFields}
                        value={formData.handlerConfig?.fieldMappings as Record<string, string> || {}}
                        onChange={(mappings) => {
                          const hc = { ...formData.handlerConfig, fieldMappings: mappings }
                          updateField('handlerConfig', hc)
                          setHandlerConfigStr(JSON.stringify(hc, null, 2))
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground mt-3">
                        Use this to map the input parameters (from Input Schema) to the actual FileMaker field names.
                      </p>
                    </div>
                  )}

                  <div className="bg-muted/20 rounded-lg p-4 border mt-4">
                    <h4 className="text-sm font-medium mb-2">Advanced Handler JSON <span className="text-xs text-muted-foreground font-normal">(optional override)</span></h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Manually edit the full handler config. For multi-table tools, use the Multi-Table tab instead.
                    </p>
                    <Textarea
                      className="font-mono text-xs min-h-[140px] custom-scrollbar"
                      value={handlerConfigStr}
                      onChange={(e) => setHandlerConfigStr(e.target.value)}
                      onBlur={() => {
                        try {
                          const val = safeParseJSON(handlerConfigStr, null)
                          if (!val) throw new Error('Invalid JSON')
                          updateField('handlerConfig', val)
                        } catch (e) {
                          toast.error('Invalid JSON in Handler Config')
                        }
                      }}
                    />
                  </div>
                </TabsContent>

                {/* ===== MULTI-TABLE TAB ===== */}
                <TabsContent value="multi-table" className="mt-0 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Multi-Table Steps</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Build sequential FM Data API steps or OData calls that chain together across multiple layouts or tables.
                      Use this for cross-table lookups, OData $expand, and atomic $batch writes.
                    </p>
                  </div>
                  <MultiTableBuilder
                    steps={multiTableSteps}
                    connectionId={formData.handlerConfig?.connectionId as string || ''}
                    serverData={serverData}
                    onChange={(steps) => {
                      setMultiTableSteps(steps)
                      // Keep category in sync
                      if (steps.length > 1) updateField('category', 'Multi-Table')
                    }}
                  />
                  {multiTableSteps.length > 0 && (
                    <p className="text-[11px] text-muted-foreground border border-dashed rounded px-2 py-1.5">
                      ✓ {multiTableSteps.length} step{multiTableSteps.length > 1 ? 's' : ''} configured. These will be saved to <code className="font-mono bg-muted px-1 rounded">handlerConfig.steps</code>.
                    </p>
                  )}
                </TabsContent>

                {/* ===== INPUT SCHEMA TAB ===== */}
                <TabsContent value="input-schema" className="mt-0">
                  <SchemaBuilder
                    value={formData.inputSchema}
                    onChange={(schema) => updateField('inputSchema', schema)}
                    title="Input Schema"
                    description="Define the parameters that AI assistants will send to this tool"
                    availableFields={layoutFields}
                  />
                </TabsContent>

                {/* ===== OUTPUT SCHEMA TAB ===== */}
                <TabsContent value="output-schema" className="mt-0">
                  <SchemaBuilder
                    value={formData.outputSchema}
                    onChange={(schema) => updateField('outputSchema', schema)}
                    title="Output Schema"
                    description="Define the expected structure of tool responses"
                  />
                </TabsContent>

                {/* ===== TEST TAB ===== */}
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
                          onChange={(e) => setTestBody(e.target.value)}
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
                              Executing...
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
                                  : 'bg-red-500/20 text-red-400 border-red-500/30'
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
