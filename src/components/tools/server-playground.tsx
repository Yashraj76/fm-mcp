'use client'

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Bot, Send, User, Loader2, CheckCircle2, XCircle, Play } from 'lucide-react'

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
  const { currentServerId } = useAppStore()
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
        const res = await fetch(`/api/playground/sessions/${activeMsg.sessionId}`)
        if (res.ok) {
          const { data } = await res.json()
          setMessages(prev => prev.map(m => m.id === activeMsg.id ? {
            ...m,
            status: data.status,
            steps: data.stepLog || [],
            finalOutput: data.finalResult
          } : m))
          if (data.status === 'done' || data.status === 'error') {
            setIsLoading(false)
          }
        }
      } catch (err) {
        console.error('Polling error', err)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [messages])

  // Auto-scroll
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
      const res = await fetch('/api/playground/ai-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: currentServerId, message: userMsg.content })
      })
      
      if (!res.ok) throw new Error('Failed to start session')
      const { data } = await res.json()
      
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

  return (
    <div className="flex flex-col h-full bg-muted/10 rounded-lg border">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10 opacity-50">
              <Bot className="size-10 mx-auto mb-3" />
              <p>Ask the agent to perform multi-step tasks across your server.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`flex-shrink-0 size-8 rounded-lg flex items-center justify-center ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-violet-500/20 text-violet-400'}`}>
                {msg.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
              </div>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 border'}`}>
                <div>{msg.content}</div>
                
                {msg.plan && (
                  <div className="mt-3 text-xs bg-black/20 p-2 rounded">
                    <span className="font-semibold text-violet-300">Plan:</span> {msg.plan.intent}
                  </div>
                )}
                
                {msg.steps && msg.steps.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.steps.map((step, idx) => (
                      <div key={idx} className="flex flex-col gap-1 text-xs bg-black/20 p-2 rounded border border-white/5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-blue-300 flex items-center gap-1">
                            {step.status === 'running' ? <Loader2 className="size-3 animate-spin" /> : step.status === 'done' ? <CheckCircle2 className="size-3 text-green-400" /> : <XCircle className="size-3 text-red-400" />}
                            {step.toolName}
                          </span>
                          {step.durationMs && <span className="text-white/40">{step.durationMs}ms</span>}
                        </div>
                        <span className="text-white/50">{step.reason}</span>
                        {step.error && <span className="text-red-400 break-all">{step.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
                
                {msg.finalOutput && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <span className="text-xs font-semibold text-green-400 mb-1 block">Final Result:</span>
                    <pre className="text-xs overflow-auto max-h-40 bg-black/30 p-2 rounded custom-scrollbar">
                      {JSON.stringify(msg.finalOutput, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <Separator />
      <div className="p-3 bg-muted/20 flex gap-2">
        <Input 
          value={inputValue} 
          onChange={e => setInputValue(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
          placeholder="e.g. Find Customer 1 and sum their order totals..." 
          disabled={isLoading || !currentServerId}
        />
        <Button onClick={handleSendMessage} disabled={isLoading || !currentServerId || !inputValue.trim()}>
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  )
}
