'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  Send,
  Copy,
  RotateCcw,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  ArrowRight,
  Terminal,
} from 'lucide-react'

interface ExecutionResult {
  status: number
  duration: number
  data: unknown
}

interface ExecutionHistoryItem {
  id: string
  toolId: string
  toolName: string
  requestBody: string
  responseStatus: number | null
  responseBody: string | null
  duration: number | null
  status: string
  createdAt: string
}

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ServerPlayground } from './server-playground'


export function ToolPlayground() {
  const { currentServerId, setCurrentServer } = useAppStore()

  // Fetch all servers for the dropdown
  const { data: servers = [], isLoading: isLoadingServers } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const res = await fetch('/api/servers')
      if (!res.ok) throw new Error('Failed to fetch servers')
      return res.json().then((r: { data?: Array<{ id: string; name: string }> }) => r.data ?? [])
    },
  })

  // Fetch tools for selector
  const { data: tools = [], isLoading: isLoadingTools } = useQuery({
    queryKey: ['tools', currentServerId],
    queryFn: async () => {
      if (!currentServerId) return []
      const res = await fetch(`/api/servers/${currentServerId}/tools`)
      if (!res.ok) throw new Error('Failed to fetch tools')
      return res.json().then((r: { data?: unknown[] }) => r.data ?? [])
    },
    enabled: !!currentServerId,
  })

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Terminal className="size-6" />
          Tool Playground
        </h1>
        
        <div className="w-[250px]">
          <Select 
            value={currentServerId || undefined} 
            onValueChange={setCurrentServer}
            disabled={isLoadingServers}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a server to test..." />
            </SelectTrigger>
            <SelectContent>
              {servers.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="manual" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit mb-2">
          <TabsTrigger value="manual">Manual Tester</TabsTrigger>
          <TabsTrigger value="agent">Server AI Agent</TabsTrigger>
        </TabsList>
        <TabsContent value="manual" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden flex flex-col">
          <ToolPlaygroundContent tools={tools} isLoadingTools={isLoadingTools} />
        </TabsContent>
        <TabsContent value="agent" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden flex flex-col">
          <ServerPlayground />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ToolPlaygroundContent({
  tools,
  isLoadingTools,
}: {
  tools: Array<Record<string, unknown>>
  isLoadingTools: boolean
}) {
  const [selectedToolId, setSelectedToolId] = useState<string>('')
  const [requestBody, setRequestBody] = useState('{\n  \n}')
  const [response, setResponse] = useState<ExecutionResult | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [history, setHistory] = useState<ExecutionHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(true)
  const responseRef = useRef<HTMLDivElement>(null)

  const selectedTool = tools.find((t) => t.id === selectedToolId)

  // Auto-generate request body from input schema when tool changes
  useEffect(() => {
    if (!selectedTool) {
      queueMicrotask(() => {
        setRequestBody('{\n  \n}')
        setResponse(null)
      })
      return
    }
    try {
      const inputSchema =
        typeof selectedTool.inputSchema === 'string'
          ? JSON.parse(selectedTool.inputSchema)
          : selectedTool.inputSchema
 
      if (inputSchema?.properties) {
        const sampleBody: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(inputSchema.properties)) {
          const prop = value as Record<string, unknown>
          if (prop.type === 'string') sampleBody[key] = ''
          else if (prop.type === 'number' || prop.type === 'integer') sampleBody[key] = 0
          else if (prop.type === 'boolean') sampleBody[key] = false
          else if (prop.type === 'array') sampleBody[key] = []
          else if (prop.type === 'object') sampleBody[key] = {}
          else sampleBody[key] = null
        }
        queueMicrotask(() => {
          setRequestBody(JSON.stringify(sampleBody, null, 2))
        })
      }
    } catch {
      queueMicrotask(() => {
        setRequestBody('{\n  \n}')
      })
    }
    queueMicrotask(() => {
      setResponse(null)
    })
  }, [selectedToolId, selectedTool])

  const handleExecute = useCallback(async () => {
    if (!selectedToolId || !selectedTool) return

    let body: Record<string, unknown>
    try {
      body = JSON.parse(requestBody)
    } catch {
      toast.error('Invalid JSON in request body')
      return
    }

    setIsExecuting(true)
    setResponse(null)
    const startTime = Date.now()

    try {
      const res = await fetch(
        `/api/servers/${selectedTool.serverId}/tools/${selectedToolId}/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const result = await res.json()
      const execResult: ExecutionResult = {
        status: result.status || res.status,
        duration: result.duration || 0,
        data: result.success === false 
          ? { error: result.error, code: result.code, details: result.details } 
          : result.data,
      }
      setResponse(execResult)

      // Add to history
      const historyItem: ExecutionHistoryItem = {
        id: `exec_${Date.now()}`,
        toolId: selectedToolId,
        toolName: selectedTool.name as string,
        requestBody,
        responseStatus: execResult.status,
        responseBody: JSON.stringify(execResult.data, null, 2),
        duration: execResult.duration,
        status: execResult.status >= 200 && execResult.status < 300 ? 'success' : 'error',
        createdAt: new Date().toISOString(),
      }
      setHistory((prev) => [historyItem, ...prev])

      if (responseRef.current) {
        responseRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    } catch {
      setResponse({
        status: 500,
        duration: Date.now() - startTime,
        data: { error: 'Failed to execute tool' },
      })
    } finally {
      setIsExecuting(false)
    }
  }, [selectedToolId, selectedTool, requestBody])

  const handleReplay = useCallback((item: ExecutionHistoryItem) => {
    setSelectedToolId(item.toolId)
    setRequestBody(item.requestBody)
    setShowHistory(false)
    setResponse({
      status: item.responseStatus || 500,
      duration: item.duration || 0,
      data: item.responseBody ? JSON.parse(item.responseBody) : null,
    })
  }, [])

  const handleCopyResponse = useCallback(() => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response.data, null, 2))
      toast.success('Response copied to clipboard')
    }
  }, [response])

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Main panels */}
      <ResizablePanelGroup direction="vertical" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={showHistory ? 70 : 85} minSize={40}>
          <ResizablePanelGroup direction="horizontal">
            {/* Left: Request Builder */}
            <ResizablePanel defaultSize={45} minSize={30}>
              <div className="flex flex-col h-full bg-muted/20 rounded-lg border p-4 gap-3">
                <div className="flex items-center justify-between flex-shrink-0">
                  <h2 className="text-sm font-semibold">Request Builder</h2>
                </div>

                {/* Tool Selector */}
                <div className="space-y-1.5 flex-shrink-0">
                  <Label className="text-xs text-muted-foreground">Select Tool</Label>
                  {isLoadingTools ? (
                    <Skeleton className="h-8 w-full" />
                  ) : (
                    <Select value={selectedToolId} onValueChange={setSelectedToolId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choose a tool to test..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tools
                          .filter((t) => t.isEnabled)
                          .map((tool) => (
                            <SelectItem key={tool.id as string} value={tool.id as string} className="text-xs">
                              <div className="flex items-center gap-1.5">
                                <span>{tool.name as string}</span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0"
                                >
                                  {tool.category as string}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Auto-generated form fields */}
                {selectedTool && (
                  <div className="flex-shrink-0">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      Parameters (auto-generated)
                    </Label>
                    <AutoGeneratedForm
                      tool={selectedTool}
                      onChange={(key, value) => {
                        try {
                          const body = JSON.parse(requestBody)
                          body[key] = value
                          setRequestBody(JSON.stringify(body, null, 2))
                        } catch {
                          // ignore
                        }
                      }}
                      currentBody={requestBody}
                    />
                  </div>
                )}

                {/* JSON Body */}
                <div className="flex-1 flex flex-col min-h-0 gap-1.5">
                  <Label className="text-xs text-muted-foreground flex-shrink-0">
                    Request Body (JSON)
                  </Label>
                  <textarea
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="flex-1 bg-muted/30 rounded-lg p-3 font-mono text-xs resize-none border focus:outline-none focus:ring-1 focus:ring-ring/50 overflow-auto min-h-[120px]"
                    spellCheck={false}
                  />
                </div>

                {/* Execute button */}
                <Button
                  onClick={handleExecute}
                  disabled={isExecuting || !selectedToolId}
                  className="gap-1.5 flex-shrink-0"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Send className="size-3.5" />
                      Send Request
                    </>
                  )}
                </Button>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right: Response Inspector */}
            <ResizablePanel defaultSize={55} minSize={30}>
              <div
                ref={responseRef}
                className="flex flex-col h-full bg-muted/20 rounded-lg border p-4 gap-3 overflow-auto"
              >
                <div className="flex items-center justify-between flex-shrink-0">
                  <h2 className="text-sm font-semibold">Response Inspector</h2>
                  {response && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyResponse}
                      className="h-6 text-xs gap-1"
                    >
                      <Copy className="size-3" />
                      Copy
                    </Button>
                  )}
                </div>

                {response ? (
                  <>
                    {/* Status & Duration */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          response.status >= 200 && response.status < 300
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : response.status >= 400 && response.status < 500
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-red-500/20 text-red-400 border-red-500/30'
                        )}
                      >
                        {response.status >= 200 && response.status < 300 ? (
                          <CheckCircle2 className="size-3 mr-1" />
                        ) : (
                          <XCircle className="size-3 mr-1" />
                        )}
                        {response.status}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {response.duration}ms
                      </span>
                    </div>

                    {/* Response Body */}
                    <Tabs defaultValue="json" className="flex-1 flex flex-col min-h-0 mt-2">
                      <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
                        <TabsList className="h-7">
                          <TabsTrigger value="json" className="text-[10px] px-2 py-0.5">JSON</TabsTrigger>
                          <TabsTrigger value="table" className="text-[10px] px-2 py-0.5">Table</TabsTrigger>
                        </TabsList>
                      </div>
                      <TabsContent value="json" className="flex-1 bg-muted/30 rounded-lg p-3 font-mono text-xs overflow-auto min-h-0 border m-0 data-[state=inactive]:hidden">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(response.data, null, 2)}
                        </pre>
                      </TabsContent>
                      <TabsContent value="table" className="flex-1 bg-muted/30 rounded-lg overflow-auto min-h-0 border m-0 data-[state=inactive]:hidden">
                        <ResponseTable data={response.data} />
                      </TabsContent>
                    </Tabs>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-2">
                      <ArrowRight className="size-8 text-muted-foreground mx-auto opacity-50" />
                      <p className="text-sm text-muted-foreground">
                        {isExecuting ? (
                          <span className="flex items-center gap-1.5 justify-center">
                            <Loader2 className="size-3.5 animate-spin" />
                            Waiting for response...
                          </span>
                        ) : (
                          'Execute a request to see the response here'
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        {/* Execution History */}
        {history.length > 0 && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={showHistory ? 30 : 15} minSize={10}>
              <Collapsible open={showHistory} onOpenChange={setShowHistory} className="h-full">
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
                    {showHistory ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronUp className="size-3" />
                    )}
                    <History className="size-3" />
                    Execution History ({history.length})
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-y-auto max-h-full custom-scrollbar">
                  <div className="space-y-1 px-1 pb-2">
                    {history.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleReplay(item)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/40 transition-colors text-left group"
                      >
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] flex-shrink-0',
                            item.status === 'success'
                              ? 'bg-green-500/20 text-green-400 border-green-500/30'
                              : 'bg-red-500/20 text-red-400 border-red-500/30'
                          )}
                        >
                          {item.responseStatus}
                        </Badge>
                        <span className="text-xs font-medium truncate flex-1">
                          {item.toolName}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {item.duration}ms
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 hidden sm:inline">
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </span>
                        <Play className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  )
}

// ===== Auto-generated form from input schema =====
function AutoGeneratedForm({
  tool,
  onChange,
  currentBody,
}: {
  tool: Record<string, unknown>
  onChange: (key: string, value: string) => void
  currentBody: string
}) {
  let inputSchema: Record<string, unknown> | null = null
  try {
    inputSchema =
      typeof tool.inputSchema === 'string'
        ? JSON.parse(tool.inputSchema)
        : (tool.inputSchema as Record<string, unknown>)
  } catch {
    return null
  }

  if (!inputSchema?.properties || typeof inputSchema.properties !== 'object') return null

  let parsedBody: Record<string, unknown> = {}
  try {
    parsedBody = JSON.parse(currentBody)
  } catch {
    // ignore
  }

  return (
    <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
      {Object.entries(inputSchema.properties).map(([key, value]) => {
        const prop = value as Record<string, unknown>
        const currentVal = parsedBody[key]

        return (
          <div key={key} className="grid grid-cols-[80px_1fr] gap-1.5 items-center">
            <Label className="text-xs font-mono text-muted-foreground truncate">{key}</Label>
            {prop.type === 'boolean' ? (
              <select
                className="h-7 text-xs bg-muted/30 border rounded px-2"
                value={String(currentVal ?? false)}
                onChange={(e) => onChange(key, e.target.value === 'true')}
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : (
              <Input
                className="h-7 text-xs font-mono"
                value={currentVal !== undefined && currentVal !== null ? String(currentVal) : ''}
                onChange={(e) => {
                  let val: string | number = e.target.value
                  if (prop.type === 'number' || prop.type === 'integer') {
                    val = e.target.value === '' ? 0 : Number(e.target.value)
                  }
                  onChange(key, val)
                }}
                placeholder={(prop.description as string) || key}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ===== Response Table Formatter =====
function ResponseTable({ data }: { data: any }) {
  if (!data) return <div className="p-4 text-xs text-muted-foreground text-center">No data available</div>

  let records: any[] = []
  
  if (data.stepResults && Array.isArray(data.stepResults)) {
    // Multi-step tool result
    records = data.stepResults.flatMap((step: any) => {
      if (step?.response?.data && Array.isArray(step.response.data)) {
        return step.response.data.map((r: any) => ({
          recordId: r.recordId,
          ...r.fieldData
        }))
      }
      return []
    })
  } else if (data.response && Array.isArray(data.response.data)) {
    // Standard FileMaker single-table result
    records = data.response.data.map((r: any) => ({
      recordId: r.recordId,
      ...r.fieldData
    }))
  } else if (Array.isArray(data)) {
    records = data
  } else if (typeof data === 'object') {
    records = [data]
  }

  if (records.length === 0) {
    return <div className="p-4 text-xs text-muted-foreground text-center">Empty array or no records</div>
  }

  // Get all unique keys
  const keys = Array.from(new Set(records.flatMap(r => Object.keys(r))))

  return (
    <div className="w-full h-full overflow-auto custom-scrollbar">
      <table className="w-full text-xs text-left">
        <thead className="bg-muted/50 text-muted-foreground sticky top-0 border-b backdrop-blur-sm">
          <tr>
            {keys.map((key) => (
              <th key={key} className="px-3 py-2 font-medium truncate max-w-[150px]">{key}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {records.map((r, i) => (
            <tr key={i} className="hover:bg-muted/30 transition-colors">
              {keys.map((key) => {
                let val = r[key]
                if (typeof val === 'object' && val !== null) {
                  val = JSON.stringify(val)
                }
                return (
                  <td key={key} className="px-3 py-2 truncate max-w-[200px]" title={String(val ?? '')}>
                    {String(val ?? '')}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
