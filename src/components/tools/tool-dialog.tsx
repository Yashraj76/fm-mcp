'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
} from 'lucide-react'

const CATEGORIES = ['CRUD', 'Find', 'Script', 'Custom'] as const
const FM_METHODS = [
  { value: 'create', label: 'Create Record' },
  { value: 'read', label: 'Read Record' },
  { value: 'update', label: 'Update Record' },
  { value: 'delete', label: 'Delete Record' },
  { value: 'find', label: 'Find Records' },
  { value: 'script', label: 'Run Script' },
  { value: 'custom', label: 'Custom' },
] as const

// Mock layouts and scripts for autocomplete
const MOCK_LAYOUTS = ['Contacts', 'Invoices', 'Products', 'Orders', 'Projects', 'Tasks']
const MOCK_SCRIPTS = [
  'Send Notification',
  'Calculate Total',
  'Generate Invoice PDF',
  'Create Related Records',
  'Import Data',
  'Export Report',
]

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
  handlerConfig: Record<string, unknown>
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
      method: 'custom',
      layout: '',
      script: null,
      recordIdField: 'recordId',
      requestParams: [],
    },
  }
}

interface ToolDialogProps {
  prefilledData?: Partial<ToolFormData>
}

export function ToolDialog({ prefilledData }: ToolDialogProps) {
  const {
    showToolDialog,
    editingToolId,
    currentServerId,
    currentBranchId,
    setShowToolDialog,
    triggerRefreshTools,
  } = useAppStore()

  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('basic')
  const [formData, setFormData] = useState<ToolFormData>(getDefaultFormData())
  const [testResult, setTestResult] = useState<{
    status: number
    duration: number
    data: unknown
  } | null>(null)
  const [testBody, setTestBody] = useState('{}')
  const [isExecuting, setIsExecuting] = useState(false)
  const testPanelRef = useRef<HTMLDivElement>(null)

  const isEditing = !!editingToolId
  const isOpen = showToolDialog

  // Fetch existing tool data for editing
  const { data: existingTool, isLoading: isLoadingTool } = useQuery({
    queryKey: ['tool', editingToolId],
    queryFn: async () => {
      const res = await fetch(`/api/servers/${currentServerId}/tools/${editingToolId}`)
      if (!res.ok) throw new Error('Failed to fetch tool')
      return res.json()
    },
    enabled: isEditing && !!currentServerId && !!editingToolId,
  })

  // Populate form when editing
  useEffect(() => {
    if (existingTool && isEditing) {
      try {
        const inputSchema = typeof existingTool.inputSchema === 'string'
          ? JSON.parse(existingTool.inputSchema)
          : existingTool.inputSchema
        const outputSchema = existingTool.outputSchema
          ? typeof existingTool.outputSchema === 'string'
            ? JSON.parse(existingTool.outputSchema)
            : existingTool.outputSchema
          : { type: 'object', properties: {} }
        const handlerConfig = typeof existingTool.handlerConfig === 'string'
          ? JSON.parse(existingTool.handlerConfig)
          : existingTool.handlerConfig

        setFormData({
          name: existingTool.name || '',
          description: existingTool.description || '',
          category: existingTool.category || 'Custom',
          fmMethod: existingTool.fmMethod || 'custom',
          fmLayout: existingTool.fmLayout || '',
          fmScript: existingTool.fmScript || '',
          recordIdField: (handlerConfig as Record<string, unknown>)?.recordIdField as string || 'recordId',
          isEnabled: existingTool.isEnabled ?? true,
          inputSchema: inputSchema || { type: 'object', properties: {} },
          outputSchema: outputSchema || { type: 'object', properties: {} },
          handlerConfig: handlerConfig || {},
        })
      } catch {
        toast.error('Failed to parse existing tool data')
      }
    } else if (prefilledData) {
      setFormData((prev) => ({
        ...prev,
        ...prefilledData,
        inputSchema: prefilledData.inputSchema || prev.inputSchema,
        outputSchema: prefilledData.outputSchema || prev.outputSchema,
        handlerConfig: prefilledData.handlerConfig || prev.handlerConfig,
      }))
    }
  }, [existingTool, isEditing, prefilledData])

  // Reset form on dialog close
  useEffect(() => {
    if (!isOpen) {
      setFormData(getDefaultFormData())
      setActiveTab('basic')
      setTestResult(null)
      setTestBody('{}')
    }
  }, [isOpen])

  // Sync fmMethod to category
  useEffect(() => {
    const methodToCategory: Record<string, string> = {
      create: 'CRUD',
      read: 'CRUD',
      update: 'CRUD',
      delete: 'CRUD',
      find: 'Find',
      script: 'Script',
    }
    if (methodToCategory[formData.fmMethod]) {
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
    }
  }, [formData.fmMethod, formData.fmLayout, formData.fmScript, formData.recordIdField])

  const updateField = useCallback(<K extends keyof ToolFormData>(key: K, value: ToolFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: ToolFormData) => {
      const payload = {
        ...data,
        inputSchema: JSON.stringify(data.inputSchema),
        outputSchema: JSON.stringify(data.outputSchema),
        handlerConfig: JSON.stringify(data.handlerConfig),
        branchId: currentBranchId,
      }

      if (isEditing) {
        const res = await fetch(`/api/servers/${currentServerId}/tools/${editingToolId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to update tool')
        return res.json()
      } else {
        const res = await fetch(`/api/servers/${currentServerId}/tools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to create tool')
        return res.json()
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Tool updated successfully' : 'Tool created successfully')
      queryClient.invalidateQueries({ queryKey: ['tools', currentServerId] })
      triggerRefreshTools()
      setShowToolDialog(false)
    },
    onError: (err: Error) => {
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
    if (!editingToolId || !currentServerId) return

    setIsExecuting(true)
    setTestResult(null)
    try {
      let body: Record<string, unknown>
      try {
        body = JSON.parse(testBody)
      } catch {
        toast.error('Invalid JSON in test body')
        setIsExecuting(false)
        return
      }

      const res = await fetch(
        `/api/servers/${currentServerId}/tools/${editingToolId}/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const result = await res.json()
      setTestResult({
        status: result.status,
        duration: result.duration,
        data: result.data,
      })

      if (testPanelRef.current) {
        testPanelRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    } catch {
      setTestResult({
        status: 500,
        duration: 0,
        data: { error: 'Failed to execute tool' },
      })
    } finally {
      setIsExecuting(false)
    }
  }, [editingToolId, currentServerId, testBody])

  const handleCopyResponse = useCallback(() => {
    if (testResult) {
      navigator.clipboard.writeText(JSON.stringify(testResult.data, null, 2))
      toast.success('Response copied to clipboard')
    }
  }, [testResult])

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
        setTestBody(JSON.stringify(sampleBody, null, 2))
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
                <TabsList className="w-full grid grid-cols-5">
                  <TabsTrigger value="basic" className="text-xs gap-1">
                    <Wrench className="size-3" />
                    <span className="hidden sm:inline">Basic</span>
                  </TabsTrigger>
                  <TabsTrigger value="fm-mapping" className="text-xs gap-1">
                    <Database className="size-3" />
                    <span className="hidden sm:inline">FileMaker</span>
                  </TabsTrigger>
                  <TabsTrigger value="input-schema" className="text-xs gap-1">
                    <FileJson className="size-3" />
                    <span className="hidden sm:inline">Input</span>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fm-layout">FM Layout</Label>
                      <div className="relative">
                        <Input
                          id="fm-layout"
                          value={formData.fmLayout}
                          onChange={(e) => updateField('fmLayout', e.target.value)}
                          placeholder="Select or type layout name"
                          list="layout-list"
                          className="text-sm"
                        />
                        <datalist id="layout-list">
                          {MOCK_LAYOUTS.map((l) => (
                            <option key={l} value={l} />
                          ))}
                        </datalist>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The FileMaker layout to target for data operations
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fm-script">FM Script</Label>
                      <div className="relative">
                        <Input
                          id="fm-script"
                          value={formData.fmScript}
                          onChange={(e) => updateField('fmScript', e.target.value)}
                          placeholder="Select or type script name"
                          list="script-list"
                          disabled={formData.fmMethod !== 'script'}
                          className="text-sm"
                        />
                        <datalist id="script-list">
                          {MOCK_SCRIPTS.map((s) => (
                            <option key={s} value={s} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                  </div>

                  {(formData.fmMethod === 'read' ||
                    formData.fmMethod === 'update' ||
                    formData.fmMethod === 'delete') && (
                    <div className="space-y-2">
                      <Label htmlFor="record-id-field">Record ID Field Mapping</Label>
                      <Input
                        id="record-id-field"
                        value={formData.recordIdField}
                        onChange={(e) => updateField('recordIdField', e.target.value)}
                        placeholder="recordId"
                        className="font-mono text-sm w-48"
                      />
                      <p className="text-xs text-muted-foreground">
                        The field name used to identify records in your schema
                      </p>
                    </div>
                  )}

                  <div className="bg-muted/20 rounded-lg p-4 border">
                    <h4 className="text-sm font-medium mb-2">Request Parameter Mapping</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Configure how tool input parameters map to FileMaker field requests.
                    </p>
                    <div className="bg-muted/30 rounded-lg p-3 font-mono text-[11px] overflow-auto max-h-32 custom-scrollbar border">
                      <pre className="text-muted-foreground">
                        {JSON.stringify(formData.handlerConfig, null, 2)}
                      </pre>
                    </div>
                  </div>
                </TabsContent>

                {/* ===== INPUT SCHEMA TAB ===== */}
                <TabsContent value="input-schema" className="mt-0">
                  <SchemaBuilder
                    value={formData.inputSchema}
                    onChange={(schema) => updateField('inputSchema', schema)}
                    title="Input Schema"
                    description="Define the parameters that AI assistants will send to this tool"
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCopyResponse}
                              className="h-6 text-xs gap-1 ml-auto"
                            >
                              <Copy className="size-3" />
                              Copy
                            </Button>
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
