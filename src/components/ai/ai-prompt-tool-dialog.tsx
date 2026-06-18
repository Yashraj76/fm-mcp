'use client'

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Loader2,
  Sparkles,
  Wrench,
  CheckCircle2,
  Zap,
  Layers,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/utils/api-client'

type Mode = 'single' | 'flow'
type Step = 'input' | 'generating' | 'preview'

interface GeneratedTool {
  name: string
  description: string
  category?: string
  inputSchema: Record<string, unknown>
  handlerConfig: Record<string, unknown>
  enabled?: boolean
  executionStrategy?: string
}

interface AiPromptToolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverId: string
  branchId?: string | null
}

const MODE_OPTIONS: { id: Mode; icon: React.ElementType; label: string; sublabel: string }[] = [
  {
    id: 'single',
    icon: Wrench,
    label: 'Single Tool',
    sublabel: 'Generate one specific tool for a focused action',
  },
  {
    id: 'flow',
    icon: Layers,
    label: 'Workflow',
    sublabel: 'Generate a set of coordinated tools for a complete workflow',
  },
]

export function AiPromptToolDialog({
  open,
  onOpenChange,
  serverId,
  branchId,
}: AiPromptToolDialogProps) {
  const queryClient = useQueryClient()
  const triggerRefreshTools = useAppStore((s) => s.triggerRefreshTools)

  const [step, setStep] = useState<Step>('input')
  const [mode, setMode] = useState<Mode>('single')
  const [prompt, setPrompt] = useState('')
  const [tools, setTools] = useState<GeneratedTool[]>([])
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('input')
        setPrompt('')
        setTools([])
        setSelectedIndices(new Set())
        setMode('single')
      }, 300)
    } else {
      setTimeout(() => textareaRef.current?.focus(), 300)
    }
  }, [open])

  // Generate tools mutation
  const generateMutation = useMutation({
    mutationFn: () =>
      api.post<{ tools: GeneratedTool[]; mode: Mode }>(`/api/servers/${serverId}/ai/generate-from-prompt`, { prompt, mode, branchId }),
    onSuccess: (result) => {
      if (!result.tools || result.tools.length === 0) {
        toast.error('No tools were generated. Try rephrasing your prompt.')
        setStep('input')
        return
      }
      setTools(result.tools)
      setSelectedIndices(new Set(result.tools.map((_, i) => i)))
      setStep('preview')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to generate tools')
      setStep('input')
    },
  })

  // Save tools mutation
  const saveMutation = useMutation({
    mutationFn: (selectedTools: GeneratedTool[]) =>
      api.post<{ success: boolean; saved: number }>(`/api/servers/${serverId}/generate-tools/save`, { tools: selectedTools, branchId }),
    onSuccess: (data) => {
      toast.success(`Successfully added ${data.saved} tool${data.saved !== 1 ? 's' : ''}`)
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
      queryClient.invalidateQueries({ queryKey: ['branch-tools', branchId, serverId] })
      triggerRefreshTools()
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save tools')
    },
  })

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt first')
      return
    }
    setStep('generating')
    generateMutation.mutate()
  }

  const toggleSelection = (index: number) => {
    const next = new Set(selectedIndices)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setSelectedIndices(next)
  }

  const toggleAll = () => {
    if (selectedIndices.size === tools.length) setSelectedIndices(new Set())
    else setSelectedIndices(new Set(tools.map((_, i) => i)))
  }

  const handleSave = () => {
    const selected = tools.filter((_, i) => selectedIndices.has(i))
    if (selected.length === 0) {
      toast.error('Please select at least one tool to add')
      return
    }
    saveMutation.mutate(selected)
  }

  const isBusy = step === 'generating' || saveMutation.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val && isBusy) return
        onOpenChange(val)
      }}
    >
      <DialogContent
        className="sm:max-w-[680px] shadow-2xl p-0 flex flex-col"
        style={{ maxHeight: '85vh', height: step === 'preview' ? '85vh' : 'auto' }}
      >
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-violet-400" />
            AI Tool Generator
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            {step === 'input' && 'Describe what you need and choose a generation mode.'}
            {step === 'generating' && 'Analyzing schema and generating tools…'}
            {step === 'preview' && 'Select the tools you want to add to your server.'}
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── STEP: INPUT ── */}
          {step === 'input' && (
            <div className="p-6 space-y-6">
              {/* Mode selector */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Generation Mode
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {MODE_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    const isActive = mode === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMode(opt.id)}
                        className={`relative flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all duration-200 ${
                          isActive
                            ? 'bg-violet-500/10 border-violet-500/40 shadow-sm shadow-violet-500/10'
                            : 'bg-muted/50 border hover:bg-muted hover:border-foreground/20'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg ${isActive ? 'bg-violet-500/20' : 'bg-muted'}`}>
                          <Icon className={`size-4 ${isActive ? 'text-violet-400' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {opt.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground/70 leading-snug mt-0.5">
                            {opt.sublabel}
                          </p>
                        </div>
                        {isActive && (
                          <div className="absolute top-3 right-3">
                            <div className="size-2 rounded-full bg-violet-400 shadow-[0_0_6px_2px_rgba(167,139,250,0.4)]" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Prompt textarea */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {mode === 'single' ? 'Describe the tool you want' : 'Describe the workflow to enable'}
                </p>
                <Textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      handleGenerate()
                    }
                  }}
                  placeholder={
                    mode === 'single'
                      ? 'e.g. Search for a customer by their email address or name'
                      : 'e.g. I need to look up a customer, check their open invoices, and mark an invoice as paid'
                  }
                  className="min-h-[120px] bg-muted/50 border focus:border-violet-500/40 focus:ring-violet-500/20 resize-none text-sm leading-relaxed"
                />
                <p className="text-[11px] text-neutral-600">
                  {mode === 'single'
                    ? 'Be specific — mention the layout, action, or data you need.'
                    : 'Describe the end-to-end flow. AI will generate all tools needed.'}
                  {' '}<span className="text-neutral-500">⌘↵ to generate</span>
                </p>
              </div>
            </div>
          )}

          {/* ── STEP: GENERATING ── */}
          {step === 'generating' && (
            <div className="p-8 space-y-6">
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full" />
                  <Loader2 className="size-12 animate-spin text-violet-400 relative z-10" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {mode === 'single' ? 'Designing your tool…' : 'Planning your workflow tools…'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Analyzing schema and crafting precise tool definitions…
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                {mode === 'flow' && (
                  <>
                    <Skeleton className="h-16 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── STEP: PREVIEW ── */}
          {step === 'preview' && (
            <>
              {/* Select-all bar */}
              <div className="px-6 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all-prompt"
                    checked={selectedIndices.size === tools.length && tools.length > 0}
                    onCheckedChange={toggleAll}
                    className="border-white/20 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                  />
                  <label htmlFor="select-all-prompt" className="text-sm font-medium text-muted-foreground cursor-pointer">
                    Select All ({selectedIndices.size} of {tools.length})
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] font-bold uppercase ${
                    mode === 'single'
                      ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  }`}>
                    {mode === 'single' ? 'Single Tool' : 'Workflow'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{tools.length} tool{tools.length !== 1 ? 's' : ''} generated</span>
                </div>
              </div>

              {/* Tool list */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Prompt recap */}
                <div className="mb-4 p-3 rounded-lg bg-muted/30 border flex items-start gap-2.5">
                  <Sparkles className="size-3.5 text-violet-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 italic">"{prompt}"</p>
                </div>

                <div className="space-y-3">
                  {tools.map((tool, idx) => {
                    const isSelected = selectedIndices.has(idx)
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-violet-500/10 border-violet-500/30 shadow-sm shadow-violet-500/5'
                            : 'bg-muted/30 border hover:bg-muted/60'
                        }`}
                        onClick={() => toggleSelection(idx)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelection(idx)}
                          className="mt-1 border-white/20 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {/* Step number for flow mode */}
                            {mode === 'flow' && (
                              <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${
                                isSelected ? 'bg-violet-500/20 text-violet-300' : 'bg-muted text-muted-foreground'
                              }`}>
                                {idx + 1}
                              </span>
                            )}
                            <Wrench className={`size-3.5 ${isSelected ? 'text-violet-400' : 'text-muted-foreground'}`} />
                            <h4 className={`text-sm font-semibold tracking-wide ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {tool.name}
                            </h4>
                            {tool.category && (
                              <Badge variant="outline" className="text-[9px] uppercase font-bold py-0 h-4 bg-muted text-muted-foreground">
                                {tool.category}
                              </Badge>
                            )}
                            {tool.executionStrategy && (
                              <Badge variant="outline" className="text-[9px] uppercase font-bold py-0 h-4 bg-muted text-muted-foreground">
                                {tool.executionStrategy}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {tool.description}
                          </p>
                        </div>
                      </div>
                    )
                  })}

                  {/* Flow connector hint */}
                  {mode === 'flow' && tools.length > 1 && (
                    <div className="flex items-center gap-2 px-4 py-2 text-[11px] text-neutral-600">
                      <ChevronRight className="size-3" />
                      These tools work together as a complete workflow
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-6 pt-4 border-t shrink-0">
          {step === 'input' && (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              <Button
                className="bg-violet-600 hover:bg-violet-500 text-white min-w-[140px] gap-2"
                disabled={!prompt.trim() || generateMutation.isPending}
                onClick={handleGenerate}
              >
                <Sparkles className="size-4" />
                Generate
                <ArrowRight className="size-3.5" />
              </Button>
            </>
          )}

          {step === 'generating' && (
            <Button
              variant="ghost"
              disabled
              className="text-muted-foreground cursor-not-allowed"
            >
              <Loader2 className="size-4 animate-spin mr-2" />
              Generating…
            </Button>
          )}

          {step === 'preview' && (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep('input')}
                disabled={saveMutation.isPending}
                className="text-muted-foreground hover:text-foreground"
              >
                ← Back
              </Button>
              <Button
                className="bg-violet-600 hover:bg-violet-500 text-white min-w-[140px]"
                disabled={selectedIndices.size === 0 || saveMutation.isPending}
                onClick={handleSave}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="size-4 mr-2" />
                    Add {selectedIndices.size} Tool{selectedIndices.size !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
