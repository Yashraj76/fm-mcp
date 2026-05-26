'use client'

import { useState, useRef, useEffect } from 'react'
import { api } from '@/lib/utils/api-client'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Bot, Send, User, Loader2, CheckCircle2, XCircle, Info } from 'lucide-react'
import { ResponseTable } from './response-table'

interface SessionStep {
  stepIndex: number
  toolName: string
  reason: string
  status: 'running' | 'done' | 'error'
  result?: any
  error?: string
  durationMs?: number
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sessionId?: string
  plan?: any
  steps?: SessionStep[]
  status?: 'pending' | 'running' | 'done' | 'error'
  finalOutput?: any
}

export function ServerPlayground() {
  const currentServerId = useAppStore((s) => s.currentServerId)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Polling logic for active session
  useEffect(() => {
    const activeMsg = messages.find(m => m.role === 'assistant' && (m.status === 'pending' || m.status === 'running'))
    if (!activeMsg || !activeMsg.sessionId) return

    const interval = setInterval(async () => {
      try {
        const data = await api.get<any>(`/api/playground/sessions/${activeMsg.sessionId}`)
        setMessages(prev => prev.map(m => m.id === activeMsg.id ? {
          ...m,
          status: data.status,
          steps: data.stepLog || [],
          finalOutput: data.finalResult
        } : m))
        if (data.status === 'done' || data.status === 'error') {
          setIsLoading(false)
        }
      } catch (err) {
        console.error('Polling error', err)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [messages])

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || !currentServerId) return
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: inputValue }
    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setIsLoading(true)

    try {
      const data = await api.post<any>('/api/playground/ai-run', {
        serverId: currentServerId,
        message: userMsg.content
      })
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Working on your request...',
        sessionId: data.sessionId,
        plan: data.plan,
        status: 'running',
        steps: []
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Error: Could not start orchestration.',
        status: 'error'
      }])
      setIsLoading(false)
    }
  }

  // Get active session or the last assistant message with plan/steps
  const activeSessionMsg = messages.findLast(m => m.role === 'assistant' && (m.plan || (m.steps && m.steps.length > 0)))

  return (
    <div className="flex h-full gap-4 overflow-hidden p-2">
      {/* Left Panel: Chat Interface (Primary Focus) */}
      <div className="flex-1 flex flex-col bg-background/60 backdrop-blur-md rounded-2xl border border-border shadow-xl overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        
        <ScrollArea className="flex-1 p-6 custom-scrollbar relative z-10">
          <div className="space-y-8">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-70 space-y-5 pt-24 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="size-20 bg-gradient-to-br from-primary/20 to-primary/5 text-primary rounded-3xl flex items-center justify-center shadow-inner border border-primary/10">
                  <Bot className="size-10" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground tracking-tight">AI Command Center</h3>
                  <p className="text-sm mt-1 text-muted-foreground max-w-[300px] mx-auto">
                    Ask me to perform multi-step tasks, cross-reference data, or generate insights across your databases.
                  </p>
                </div>
              </div>
            )}
            
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-4 group animate-in fade-in slide-in-from-bottom-4 duration-500 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 size-10 rounded-full flex items-center justify-center shadow-md border ${msg.role === 'user' ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-primary/20' : 'bg-gradient-to-br from-muted to-muted/50 border-border text-foreground'}`}>
                  {msg.role === 'user' ? <User className="size-5" /> : <Bot className="size-5" />}
                </div>
                
                <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-5 py-3.5 rounded-2xl text-sm shadow-sm leading-relaxed ${msg.role === 'user' ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-tr-sm' : 'bg-card/80 backdrop-blur-sm border border-border/50 text-card-foreground rounded-tl-sm'}`}>
                    {msg.content}
                  </div>
                  
                  {/* Final Output rendering */}
                  {msg.finalOutput && (
                    <div className="w-full mt-3 border border-border/50 rounded-xl overflow-hidden shadow-lg bg-card/90 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-500">
                      <div className="bg-muted/30 px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-500 flex items-center gap-2 tracking-wide uppercase">
                          <CheckCircle2 className="size-4" />
                          Final Output
                        </span>
                      </div>
                      <div className="p-0 max-h-[350px] overflow-auto custom-scrollbar">
                        <ResponseTable data={msg.finalOutput} tableConfig={msg.plan?.tableConfig} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} className="h-6" />
          </div>
        </ScrollArea>
        
        <Separator className="opacity-50" />
        
        <div className="p-4 bg-background/40 backdrop-blur-xl relative z-10">
          <div className="relative flex items-center group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/5 to-transparent rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-md pointer-events-none" />
            <Input 
              value={inputValue} 
              onChange={e => setInputValue(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              placeholder="E.g. Find customer 'John' and summarize their orders..." 
              disabled={isLoading || !currentServerId}
              className="pr-14 py-7 rounded-full bg-card/60 backdrop-blur-sm border-border/50 focus-visible:ring-primary/30 shadow-inner text-base transition-all"
              aria-label="Playground command input"
            />
            <Button 
              size="icon"
              onClick={handleSendMessage} 
              disabled={isLoading || !currentServerId || !inputValue.trim()}
              className={`absolute right-2 rounded-full h-10 w-10 transition-all duration-300 ${inputValue.trim() && !isLoading ? 'bg-primary hover:bg-primary/90 hover:scale-105 shadow-md' : ''}`}
              aria-label="Send command"
            >
              {isLoading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-4 ml-0.5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel: Progress Tracker & Workflow (Secondary Context) */}
      <div className="w-[380px] flex-shrink-0 flex flex-col bg-background/40 backdrop-blur-md rounded-2xl border border-border shadow-lg overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-muted/20 pointer-events-none" />
        
        <div className="p-4 bg-muted/10 border-b border-border/50 flex items-center justify-between backdrop-blur-sm relative z-10">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground/80 tracking-wide uppercase">
            <Loader2 className={`size-4 ${isLoading ? 'animate-spin text-primary' : 'text-muted-foreground/50 hidden'}`} />
            Workflow Tracker
          </h2>
          {isLoading && <span className="flex size-2 rounded-full bg-primary animate-pulse" />}
        </div>
        
        <ScrollArea className="flex-1 p-5 custom-scrollbar relative z-10">
          {!activeSessionMsg ? (
            <div className="text-center py-12 opacity-40 space-y-4">
              <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto border border-border">
                <Bot className="size-6 text-muted-foreground" />
              </div>
              <p className="text-xs max-w-[200px] mx-auto leading-relaxed">
                Execute a task in the chat to monitor the AI's real-time reasoning and tool execution sequence here.
              </p>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in duration-700">
              {activeSessionMsg.plan && (
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-violet-400" />
                    Agent Intent
                  </span>
                  <div className="text-sm bg-violet-500/10 text-violet-200/90 p-3.5 rounded-xl border border-violet-500/20 shadow-inner leading-relaxed">
                    {activeSessionMsg.plan.intent}
                  </div>
                </div>
              )}
              
              {activeSessionMsg.steps && activeSessionMsg.steps.length > 0 && (
                <div className="space-y-4">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-blue-400" />
                    Execution Sequence
                  </span>
                  <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[11px] before:h-full before:w-[2px] before:bg-gradient-to-b before:from-blue-500/20 before:via-border before:to-transparent">
                    {activeSessionMsg.steps.map((step, idx) => (
                      <div key={idx} className="relative flex items-start gap-4 group animate-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${idx * 100}ms`, animationFillMode: 'both' }}>
                        <div className={`flex items-center justify-center size-6 rounded-full border-[3px] border-background shadow-md shrink-0 mt-0.5 z-10 transition-colors duration-300
                          ${step.status === 'running' ? 'bg-blue-500 ring-4 ring-blue-500/20' : step.status === 'done' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                          {step.status === 'running' ? <Loader2 className="size-3 text-white animate-spin" /> : 
                           step.status === 'done' ? <CheckCircle2 className="size-3 text-white" /> : 
                           <XCircle className="size-3 text-white" />}
                        </div>
                        <div className={`flex-1 bg-card/60 backdrop-blur-sm border shadow-sm p-3.5 rounded-xl space-y-1.5 transition-all duration-300 ${step.status === 'running' ? 'border-blue-500/30 bg-blue-500/5' : 'border-border/50 group-hover:border-border'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-xs text-primary truncate" title={step.toolName}>{step.toolName}</span>
                            {step.durationMs && <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">{step.durationMs}ms</span>}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{step.reason}</p>
                          {step.error && (
                            <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                              <p className="text-[11px] text-rose-400 font-medium font-mono break-all">{step.error}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback / Improvements Section */}
              {activeSessionMsg.status === 'error' && (
                <div className="mt-8 border border-amber-500/30 bg-amber-500/10 rounded-xl p-4.5 space-y-3 shadow-sm animate-in zoom-in-95 duration-300">
                  <h3 className="text-sm font-semibold text-amber-500 flex items-center gap-2">
                    <Info className="size-4" />
                    Diagnostics & Recovery
                  </h3>
                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    The agent encountered an error during execution. This usually happens when a required tool is missing, authentication failed, or schema fields mismatched.
                  </p>
                  <ul className="text-xs text-amber-200/80 list-disc list-inside mt-2 space-y-1.5 pl-1">
                    <li>Review the error logs in the failed step above.</li>
                    <li>Verify database connectivity in settings.</li>
                    <li>Ensure AI tools accurately reflect your FileMaker relationships in the Schema Browser.</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
