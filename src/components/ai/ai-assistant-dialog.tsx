'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/utils/api-client'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { AiSuggestionCard, type AiSuggestion } from '@/components/ai/ai-suggestion-card'
import { cn } from '@/lib/utils'
import {
  Send,
  Sparkles,
  Database,
  FileCode,
  LayoutDashboard,
  Loader2,
  Bot,
  User,
  Table,
  Lightbulb,
  Wand2,
  RefreshCw,
  Zap,
} from 'lucide-react'

interface ConnectionOption {
  id: string
  name: string
  database: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  suggestions?: AiSuggestion[]
  connectionPicker?: ConnectionOption[]  // set when CONNECTION_REQUIRED response received
  timestamp: Date
}

interface SchemaInfo {
  databaseName: string
  layouts: Array<{ name: string; table?: string; fields?: Array<{ name: string; type: string }> }>
  scripts: Array<{ name: string }>
  tables: Array<{ name: string }>
}

const PRE_BUILT_SUGGESTIONS = [
  {
    icon: Lightbulb,
    label: 'Suggest tools for this schema',
    message: 'Analyze my FileMaker schema and suggest the most useful MCP tools I should create.',
  },
  {
    icon: Wand2,
    label: 'Optimize tool configurations',
    message: 'Review my existing tools and suggest optimizations to improve performance and reduce redundancy.',
  },
  {
    icon: Database,
    label: 'Generate CRUD tools',
    message: 'Generate a complete set of CRUD tools (Create, Read, Update, Delete, Find) for all my layouts.',
  },
  {
    icon: RefreshCw,
    label: 'Identify missing tools',
    message: 'Compare my existing tools with what my FileMaker schema supports and identify gaps.',
  },
]

export function AiAssistantDialog() {
  const showAiDialog = useAppStore((s) => s.showAiDialog)
  const currentServerId = useAppStore((s) => s.currentServerId)
  const setShowAiDialog = useAppStore((s) => s.setShowAiDialog)
  const setShowToolDialog = useAppStore((s) => s.setShowToolDialog)

  const queryClient = useQueryClient()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(new Set())
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch server schemas (tools only now, backend handles schema context)
  const { data: schemaData, isLoading: isLoadingSchemas } = useQuery<{ schemas: any[]; tools: string[] }>({
    queryKey: ['ai-schemas', currentServerId],
    queryFn: async () => {
      if (!currentServerId) return { schemas: [], tools: [] }

      // Fetch tools
      const tools = await api.get<any[]>(`/api/servers/${currentServerId}/tools`)

      return {
        schemas: [], // Deprecated, backend handles schema context now
        tools: tools.map((t: Record<string, unknown>) => t.name as string),
      }
    },
    enabled: showAiDialog && !!currentServerId,
  })

  // Accept suggestion mutation
  const acceptMutation = useMutation({
    mutationFn: async (suggestion: AiSuggestion) => {
      // The new AI prompt returns a single tool in proposedConfig, or sometimes an array
      const proposed = suggestion.proposedConfig as any
      const tools = Array.isArray(proposed.tools) ? proposed.tools : [proposed]

      const results: any[] = []
      for (const toolDef of tools) {
        if (!toolDef.name) continue // Skip if invalid

        const payload = {
          name: toolDef.name,
          description: toolDef.description,
          category: toolDef.category || suggestion.category || suggestion.suggestionType,
          fmMethod: suggestion.fmMethod || toolDef.fmMethod || toolDef.handlerConfig?.type || 'find',
          fmLayout: suggestion.fmLayout || toolDef.fmLayout || toolDef.handlerConfig?.layout || null,
          fmScript: suggestion.fmScript || toolDef.fmScript || toolDef.handlerConfig?.script || null,
          inputSchema: typeof toolDef.inputSchema === 'string'
            ? toolDef.inputSchema
            : JSON.stringify(toolDef.inputSchema || { type: 'object', properties: {} }),
          outputSchema: JSON.stringify({ type: 'object', properties: {} }),
          handlerConfig: typeof toolDef.handlerConfig === 'string'
            ? toolDef.handlerConfig
            : JSON.stringify(toolDef.handlerConfig || {
                method: suggestion.fmMethod || 'find',
                layout: suggestion.fmLayout || '',
              }),
          isAiGenerated: true,
          branchId: useAppStore.getState().currentBranchId,
        }

        const currentBranchId = useAppStore.getState().currentBranchId;
        const endpoint = currentBranchId 
          ? `/api/branches/${currentBranchId}/tools`
          : `/api/servers/${currentServerId}/tools`;

        const res = await api.post<any>(endpoint, payload)
        results.push(res)
      }
      return results
    },
    onSuccess: (_data, suggestion) => {
      const toolCount = (suggestion.proposedConfig.tools as unknown[])?.length || 1
      toast.success(`Created ${toolCount} tool(s) from AI suggestion`)
      
      const currentBranchId = useAppStore.getState().currentBranchId
      queryClient.invalidateQueries({ queryKey: ['tools', currentServerId, currentBranchId] })
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      queryClient.invalidateQueries({ queryKey: ['branch-tools', currentBranchId, currentServerId] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create tools from suggestion')
    },
  })

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: ({ message, connectionId }: { message: string; connectionId?: string }) =>
      api.post<any>(`/api/servers/${currentServerId}/ai/suggest`, {
        suggestionType: 'tool_suggestion',
        context: message,
        connectionId: connectionId ?? undefined,
      }),
  })

  const handleSendMessage = useCallback(
    async (content: string, overrideConnectionId?: string) => {
      if (!content.trim() || isLoading) return

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInputValue('')
      setIsLoading(true)

      try {
        const result = await sendMessageMutation.mutateAsync({
          message: content,
          connectionId: overrideConnectionId ?? selectedConnectionId ?? undefined,
        })

        const aiMsg: ChatMessage = {
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: result.message || 'Here are my suggestions based on your schema:',
          suggestions: result.suggestions || [],
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, aiMsg])
      } catch (err: any) {
        if (err.code === 'CONNECTION_REQUIRED' && err.details?.connections?.length > 0) {
          const pickerMsg: ChatMessage = {
            id: `msg_${Date.now() + 1}`,
            role: 'assistant',
            content: 'This server has multiple connections. Select which one to use:',
            connectionPicker: err.details.connections as ConnectionOption[],
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, pickerMsg])
        } else {
          const errorMsg: ChatMessage = {
            id: `msg_${Date.now() + 1}`,
            role: 'assistant',
            content: err.message || 'Sorry, I encountered an error. Please try again.',
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, errorMsg])
        }
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, sendMessageMutation]
  )

  const handlePrebuiltSuggestion = useCallback(
    (message: string) => {
      handleSendMessage(message)
    },
    [handleSendMessage]
  )

  const handleAcceptSuggestion = useCallback(
    (suggestion: AiSuggestion) => {
      acceptMutation.mutate(suggestion)
    },
    [acceptMutation]
  )

  const handleRejectSuggestion = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((msg) => ({
        ...msg,
        suggestions: msg.suggestions?.filter((s) => s.id !== id),
      }))
    )
  }, [])

  const handleModifySuggestion = useCallback(
    (suggestion: AiSuggestion) => {
      const tools = (suggestion.proposedConfig.tools as Array<Record<string, unknown>>) || []
      if (tools.length > 0) {
        const firstTool = tools[0]
        setShowToolDialog(true)
        // Store prefilled data - the dialog will pick it up
        useAppStore.getState().setShowToolDialog(true, undefined)
      }
    },
    [setShowToolDialog]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSendMessage(inputValue)
      }
    },
    [inputValue, handleSendMessage]
  )

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when dialog opens
  useEffect(() => {
    if (showAiDialog) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [showAiDialog])

  // Reset on close
  useEffect(() => {
    if (!showAiDialog) {
      queueMicrotask(() => {
        setMessages([])
        setInputValue('')
      })
    }
  }, [showAiDialog])

  const schemas: SchemaInfo[] = (schemaData?.schemas || []) as unknown as SchemaInfo[]

  return (
    <Dialog open={showAiDialog} onOpenChange={(open) => setShowAiDialog(open)}>
      <DialogContent className="sm:max-w-6xl max-w-[calc(100vw-2rem)] h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-violet-400" />
            AI Assistant
          </DialogTitle>
          <DialogDescription>
            Get AI-powered suggestions for tools based on your FileMaker schema
          </DialogDescription>
        </DialogHeader>

        <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0 px-6 pb-6">
          {/* Left: Schema Context */}
          <ResizablePanel defaultSize={28} minSize={20}>
            <div className="flex flex-col h-full pr-3">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Database className="size-3.5" />
                Schema Context
              </h3>

              {isLoadingSchemas ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
              ) : schemas.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  <Database className="size-6 mx-auto mb-2 opacity-50" />
                  <p>No schema data available</p>
                  <p className="mt-1">Connect a FileMaker database to see schema context</p>
                </div>
              ) : (
                <ScrollArea className="flex-1">
                  <div className="space-y-3">
                    {schemas.map((schema, idx) => (
                      <SchemaCard
                        key={idx}
                        schema={schema}
                        selectedSchemas={selectedSchemas}
                        onToggle={(name) => {
                          setSelectedSchemas((prev) => {
                            const next = new Set(prev)
                            if (next.has(name)) next.delete(name)
                            else next.add(name)
                            return next
                          })
                        }}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: AI Chat */}
          <ResizablePanel defaultSize={72} minSize={40}>
            <div className="flex flex-col h-full pl-3">
              {/* Messages area */}
              <ScrollArea className="flex-1 mb-3">
                <div className="space-y-4 pr-2">
                  {messages.length === 0 && !isLoading && (
                    <div className="space-y-4">
                      <div className="text-center py-6">
                        <div className="mx-auto size-12 rounded-xl bg-violet-500/20 flex items-center justify-center mb-3">
                          <Bot className="size-6 text-violet-400" />
                        </div>
                        <h3 className="text-sm font-semibold">How can I help you?</h3>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                          I can analyze your FileMaker schema and suggest MCP tools to create,
                          optimize your existing tools, or help you identify gaps.
                        </p>
                      </div>

                      <Separator />

                      {/* Pre-built suggestions */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground px-1">
                          Quick suggestions
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {PRE_BUILT_SUGGESTIONS.map((suggestion) => (
                            <button
                              key={suggestion.label}
                              onClick={() => handlePrebuiltSuggestion(suggestion.message)}
                              className="flex items-start gap-2 p-3 rounded-lg border bg-muted/10 hover:bg-muted/30 transition-colors text-left group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <suggestion.icon className="size-4 text-violet-400 mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" />
                              <span className="text-xs text-foreground">{suggestion.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div key={msg.id}>
                      {/* Message bubble */}
                      <div
                        className={cn(
                          'flex items-start gap-2',
                          msg.role === 'user' ? 'flex-row-reverse' : ''
                        )}
                      >
                        <div
                          className={cn(
                            'flex-shrink-0 size-7 rounded-lg flex items-center justify-center',
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-violet-500/20'
                          )}
                        >
                          {msg.role === 'user' ? (
                            <User className="size-3.5" />
                          ) : (
                            <Bot className="size-3.5 text-violet-400" />
                          )}
                        </div>
                        <div
                          className={cn(
                            'max-w-[80%] rounded-xl px-3 py-2 text-sm',
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted/40'
                          )}
                        >
                          {msg.content}
                        </div>
                      </div>

                      {/* AI suggestion cards */}
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-3 ml-9 space-y-2">
                          {msg.suggestions.map((suggestion) => (
                            <AiSuggestionCard
                              key={suggestion.id}
                              suggestion={suggestion}
                              onAccept={handleAcceptSuggestion}
                              onReject={handleRejectSuggestion}
                              onModify={handleModifySuggestion}
                            />
                          ))}
                        </div>
                      )}

                      {/* Connection picker — shown when server has multiple connections */}
                      {msg.connectionPicker && msg.connectionPicker.length > 0 && (
                        <div className="mt-3 ml-9 space-y-1.5">
                          {msg.connectionPicker.map((conn) => (
                            <button
                              key={conn.id}
                              onClick={() => {
                                setSelectedConnectionId(conn.id)
                                // Re-send the last user message with the selected connection
                                const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
                                if (lastUserMsg) handleSendMessage(lastUserMsg.content, conn.id)
                              }}
                              className={`flex items-start gap-2.5 w-full text-left p-3 rounded-lg border transition-all text-sm ${
                                selectedConnectionId === conn.id
                                  ? 'bg-violet-500/10 border-violet-500/40'
                                  : 'bg-muted/30 border hover:bg-muted/60'
                              }`}
                            >
                              <Database className={`size-4 mt-0.5 shrink-0 ${selectedConnectionId === conn.id ? 'text-violet-400' : 'text-muted-foreground'}`} />
                              <div className="min-w-0">
                                <div className="font-medium text-foreground">{conn.name}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{conn.database}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Loading indicator */}
                  {isLoading && (
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <Bot className="size-3.5 text-violet-400" />
                      </div>
                      <div className="bg-muted/40 rounded-xl px-3 py-2">
                        <span className="flex items-center gap-1.5 text-sm">
                          <Loader2 className="size-3 animate-spin" />
                          Analyzing schema...
                        </span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input area */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your FileMaker schema..."
                  disabled={isLoading}
                  className="text-sm"
                  aria-label="Ask about your FileMaker schema"
                />
                <Button
                  onClick={() => handleSendMessage(inputValue)}
                  disabled={isLoading || !inputValue.trim()}
                  size="icon"
                  className="flex-shrink-0"
                  aria-label="Send message"
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </DialogContent>
    </Dialog>
  )
}

// ===== Schema Card =====
function SchemaCard({
  schema,
  selectedSchemas,
  onToggle,
}: {
  schema: SchemaInfo
  selectedSchemas: Set<string>
  onToggle: (name: string) => void
}) {
  const isSelected = selectedSchemas.has(schema.databaseName)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => onToggle(schema.databaseName)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(schema.databaseName)
        }
      }}
      className={cn(
        'rounded-lg border p-3 cursor-pointer transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isSelected
          ? 'border-violet-500/50 bg-violet-500/10'
          : 'hover:border-border/80 bg-muted/10'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            'size-6 rounded-md flex items-center justify-center',
            isSelected ? 'bg-violet-500/30' : 'bg-muted/40'
          )}
        >
          <LayoutDashboard className="size-3" />
        </div>
        <span className="text-xs font-semibold truncate">{schema.databaseName}</span>
        {isSelected && <Zap className="size-3 text-violet-400 ml-auto" />}
      </div>

      <div className="space-y-1.5">
        {/* Layouts */}
        {schema.layouts.length > 0 && (
          <div>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Layouts
            </span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {schema.layouts.slice(0, 4).map((layout) => (
                <Badge key={layout.name} variant="secondary" className="text-[10px] px-1.5 py-0">
                  <Table className="size-2 mr-0.5" />
                  {layout.name}
                </Badge>
              ))}
              {schema.layouts.length > 4 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  +{schema.layouts.length - 4}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Scripts */}
        {schema.scripts.length > 0 && (
          <div>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Scripts
            </span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {schema.scripts.slice(0, 3).map((script) => (
                <Badge key={script.name} variant="secondary" className="text-[10px] px-1.5 py-0">
                  <FileCode className="size-2 mr-0.5" />
                  {script.name}
                </Badge>
              ))}
              {schema.scripts.length > 3 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  +{schema.scripts.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
