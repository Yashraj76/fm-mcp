/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
import { invalidateToolLists } from '@/lib/query-keys'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Loader2,
  Brain,
  Wrench,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Circle,
  Database,
  Settings,
  AlertTriangle,
} from 'lucide-react'
import { progressToPhase } from '@/lib/tools/job-progress'
import { nextIntervalMs, isPollTimedOut } from '@/lib/playground/poll-backoff'
import { cn } from '@/lib/utils'

// ─── Pipeline Steps ────────────────────────────────────────────────────────

const PIPELINE = [
  { key: 'schema',     label: 'Schema Check' },
  { key: 'ai',        label: 'AI Generation' },
  { key: 'validate',  label: 'Validation' },
  { key: 'preview',   label: 'Preview' },
  { key: 'save',      label: 'Save' },
] as const

type PipelineKey = typeof PIPELINE[number]['key']

function progressToStepIndex(progress: number): number {
  if (progress >= 70) return 2 // validation
  if (progress >= 20) return 1 // AI generation
  return 0                      // schema check
}

function errorToStepIndex(msg: string): number {
  const m = msg.toLowerCase()
  if (m.includes('layout') || m.includes('schema') || m.includes('no layout') || m.includes('compiled')) return 0
  if (m.includes('ai provider') || m.includes('api key') || m.includes('not configured') || m.includes('ai generation')) return 1
  if (m.includes('parse') || m.includes('json') || m.includes('validation')) return 2
  return 1
}

type StepState = 'pending' | 'active' | 'done' | 'failed'

function getStepStates(
  uiStep: 'idle' | 'select-connection' | 'generating' | 'preview' | 'saving' | 'failed',
  progress: number,
  failedIndex: number,
): StepState[] {
  if (uiStep === 'failed') {
    return PIPELINE.map((_, i) => {
      if (i < failedIndex) return 'done'
      if (i === failedIndex) return 'failed'
      return 'pending'
    })
  }
  if (uiStep === 'saving') {
    return ['done', 'done', 'done', 'done', 'active']
  }
  if (uiStep === 'preview') {
    return ['done', 'done', 'done', 'active', 'pending']
  }
  if (uiStep === 'generating') {
    const active = progressToStepIndex(progress)
    return PIPELINE.map((_, i) => {
      if (i < active) return 'done'
      if (i === active) return 'active'
      return 'pending'
    })
  }
  return PIPELINE.map(() => 'pending')
}

// ─── Operation labels ──────────────────────────────────────────────────────

const OP_META: Record<string, { label: string; color: string }> = {
  find:          { label: 'Find',        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  create:        { label: 'Create',      color: 'text-green-400 bg-green-500/10 border-green-500/20' },
  update:        { label: 'Update',      color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  delete:        { label: 'Delete',      color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  list:          { label: 'List',        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  get:           { label: 'Get',         color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  script:        { label: 'Script',      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  'odata-filter':{ label: 'OData Filter',color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  'odata-batch': { label: 'OData Batch', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  'multi-step':  { label: 'Multi-Step',  color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  custom:        { label: 'Custom',      color: 'text-muted-foreground bg-muted border-border' },
}

function opMeta(method: string) {
  return OP_META[method] ?? { label: method, color: 'text-muted-foreground bg-muted border-border' }
}

// ─── Actionable hint for errors ────────────────────────────────────────────

function errorHint(msg: string): { icon: React.ElementType; text: string } | null {
  const m = msg.toLowerCase()
  if (m.includes('layout') || m.includes('no layout') || m.includes('schema') || m.includes('compiled')) {
    return {
      icon: Database,
      text: 'Go to Connections → Schema Browser for this server\'s connection and select at least one layout.',
    }
  }
  if (m.includes('ai provider') || m.includes('api key') || m.includes('not configured')) {
    return {
      icon: Settings,
      text: 'Go to Settings → AI and add an API key for your chosen provider.',
    }
  }
  return null
}

// ─── Step indicator component ──────────────────────────────────────────────

function StepIndicator({ states }: { states: StepState[] }) {
  return (
    <div className="flex items-center gap-0 px-6 py-4 border-b bg-muted/20">
      {PIPELINE.map((step, i) => {
        const state = states[i]
        return (
          <div key={step.key} className="flex items-center gap-0 flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={cn(
                'size-6 rounded-full flex items-center justify-center border transition-all',
                state === 'done'    && 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400',
                state === 'active'  && 'bg-indigo-500/30 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20',
                state === 'failed'  && 'bg-red-500/20 border-red-500/40 text-red-400',
                state === 'pending' && 'bg-muted/30 border-border/50 text-muted-foreground/40',
              )}>
                {state === 'done'   && <CheckCircle2 className="size-3.5" />}
                {state === 'active' && <Loader2 className="size-3.5 animate-spin" />}
                {state === 'failed' && <XCircle className="size-3.5" />}
                {state === 'pending'&& <Circle className="size-3 fill-current opacity-30" />}
              </div>
              <span className={cn(
                'text-[9px] font-medium whitespace-nowrap leading-none',
                state === 'done'   && 'text-indigo-400/80',
                state === 'active' && 'text-indigo-300',
                state === 'failed' && 'text-red-400',
                state === 'pending'&& 'text-muted-foreground/40',
              )}>
                {step.label}
              </span>
            </div>
            {i < PIPELINE.length - 1 && (
              <div className={cn(
                'flex-1 h-px mx-1 transition-all',
                states[i] === 'done' ? 'bg-indigo-500/30' : 'bg-border/30',
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

type UiStep = 'idle' | 'select-connection' | 'generating' | 'preview' | 'saving' | 'failed'

interface ConnectionOption {
  id: string
  name: string
  database: string
}

interface AutoGeneratePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverId: string
  branchId?: string | null
}

export function AutoGeneratePreviewDialog({ open, onOpenChange, serverId, branchId }: AutoGeneratePreviewDialogProps) {
  const queryClient = useQueryClient()
  const [uiStep, setUiStep] = useState<UiStep>('idle')
  const [tools, setTools] = useState<any[]>([])
  const [connectionMap, setConnectionMap] = useState<Record<string, string>>({})
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('Queued...')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [failedStepIndex, setFailedStepIndex] = useState(1)
  const [availableConnections, setAvailableConnections] = useState<ConnectionOption[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  type PollState = { timeoutId: ReturnType<typeof setTimeout> | null; attempts: number; startedAt: number; aborted: boolean; baselineJobId: string | null }
  const pollRef = useRef<PollState | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      pollRef.current.aborted = true
      if (pollRef.current.timeoutId) clearTimeout(pollRef.current.timeoutId)
      pollRef.current = null
    }
  }, [])

  // baselineJobId: the most-recent job id for this server *before* this run
  // started. The status endpoint has no way to scope to "this" run's job
  // until the long-running POST below finally returns, so without a
  // baseline, a poll landing before the new job row exists would read the
  // previous run's (possibly failed) job and freeze the UI on stale data.
  const startPolling = useCallback((baselineJobId: string | null) => {
    stopPolling()
    const state: PollState = { timeoutId: null, attempts: 0, startedAt: Date.now(), aborted: false, baselineJobId }
    pollRef.current = state

    function schedule() {
      const delay = nextIntervalMs(state.attempts)
      state.timeoutId = setTimeout(doPoll, delay)
    }

    async function doPoll() {
      if (state.aborted) return

      // Timeout: job never reached a terminal state — stop polling and surface the error.
      if (isPollTimedOut(state.startedAt, Date.now())) {
        stopPolling()
        setErrorMessage('Tool generation timed out after 5 minutes. Please try again.')
        setFailedStepIndex(1)
        setUiStep('failed')
        return
      }

      try {
        const statusData = await api.get<any>(`/api/servers/${serverId}/generate-tools/status`)
        if (state.aborted) return

        // Still seeing the pre-run job (or none yet) — this run's job row
        // hasn't landed yet. Keep waiting without touching progress/phase.
        if (statusData.jobId === state.baselineJobId) {
          state.attempts++
          schedule()
          return
        }

        state.attempts++
        const p: number = statusData.progress ?? 0
        setProgress(p)
        setPhase(progressToPhase(p, statusData.status))
        // Terminal: job finished — POST response will handle final state
        if (statusData.status === 'done' || statusData.status === 'failed') return
      } catch {
        if (state.aborted) return
        state.attempts++ // count errors toward backoff
      }
      schedule()
    }

    schedule()
  }, [serverId, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  const generateMutation = useMutation({
    mutationFn: async (connectionId?: string) => {
      setUiStep('generating')
      setProgress(0)
      setPhase('Queued...')

      // Snapshot whatever job currently exists (if any) so polling can tell
      // it apart from the job this run is about to create.
      let baselineJobId: string | null = null
      try {
        const baseline = await api.get<any>(`/api/servers/${serverId}/generate-tools/status`)
        baselineJobId = baseline?.jobId ?? null
      } catch {
        // No prior job (404) or a transient error — treat as no baseline.
      }

      startPolling(baselineJobId)
      try {
        return await api.post<any>(`/api/servers/${serverId}/generate-tools`, {
          branchId,
          connectionId: connectionId ?? undefined,
        })
      } finally {
        stopPolling()
      }
    },
    onSuccess: (data) => {
      const parsed = safeParseJSON<Record<string, unknown>[]>(data.generatedTools, [])
      if (parsed.length === 0) {
        const msg = data.error || 'The AI did not generate any tools. Make sure the connection has a compiled schema selected.'
        setErrorMessage(msg)
        setFailedStepIndex(errorToStepIndex(msg))
        setUiStep('failed')
        return
      }
      setTools(parsed)
      setConnectionMap(data.connectionMap ?? {})
      setSelectedIndices(new Set(parsed.map((_: any, i: number) => i)))
      setProgress(100)
      setPhase('Ready to review')
      setUiStep('preview')
    },
    onError: (err: any) => {
      stopPolling()
      // Multi-connection server: the API tells us which connections are available.
      if (err.code === 'CONNECTION_REQUIRED' && err.details?.connections?.length > 0) {
        setAvailableConnections(err.details.connections as ConnectionOption[])
        setUiStep('select-connection')
        return
      }
      const msg =
        err.code === 'NO_CONNECTIONS'
          ? (err.message || 'No connections are linked to this server. Go to Connections and attach a FileMaker database first.')
          : (err.message || 'Tool generation failed. Please try again.')
      setErrorMessage(msg)
      setFailedStepIndex(errorToStepIndex(msg))
      setUiStep('failed')
    },
  })

  const saveMutation = useMutation({
    mutationFn: (selectedTools: any[]) => {
      setUiStep('saving')
      return api.post<{ saved: number; skipped: number; failed: number; failedNames: string[] }>(
        `/api/servers/${serverId}/generate-tools/save`,
        { tools: selectedTools, branchId }
      )
    },
    onSuccess: (data) => {
      const parts: string[] = []
      if (data.saved > 0) parts.push(`${data.saved} tool${data.saved === 1 ? '' : 's'} created`)
      if (data.skipped > 0) parts.push(`${data.skipped} already existed`)
      if (data.failed > 0) parts.push(`${data.failed} failed`)
      const msg = parts.join(', ')
      if (data.saved > 0) toast.success(msg)
      else if (data.skipped > 0) toast.info(msg)
      else toast.error(msg || 'No tools were saved')
      invalidateToolLists(queryClient, serverId, branchId)
      onOpenChange(false)
    },
    onError: (err: any) => {
      setUiStep('preview')
      toast.error(err.message || 'Failed to save selected tools')
    },
  })

  // Auto-start on open; reset on close.
  useEffect(() => {
    if (open && uiStep === 'idle') {
      generateMutation.mutate(undefined)
    }
    if (!open) {
      stopPolling()
      const t = setTimeout(() => {
        setUiStep('idle')
        setTools([])
        setConnectionMap({})
        setSelectedIndices(new Set())
        setProgress(0)
        setPhase('Queued...')
        setErrorMessage(null)
        setFailedStepIndex(1)
        setAvailableConnections([])
        setSelectedConnectionId(null)
      }, 300)
      return () => clearTimeout(t)
    }
  }, [open, uiStep])

  const handleRetry = () => {
    setErrorMessage(null)
    setFailedStepIndex(1)
    generateMutation.mutate(selectedConnectionId ?? undefined)
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
      toast.error('Select at least one tool to save')
      return
    }
    saveMutation.mutate(selected)
  }

  const isWorking = uiStep === 'generating' || uiStep === 'saving'
  const stepStates = getStepStates(uiStep, progress, failedStepIndex)

  const hint = errorMessage ? errorHint(errorMessage) : null

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val && isWorking) return
        onOpenChange(val)
      }}
    >
      <DialogContent className="sm:max-w-[700px] shadow-2xl p-0 flex flex-col" style={{ maxHeight: '85vh', height: '85vh' }}>
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="size-5 text-indigo-400" />
            Auto-Generate Tools
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <StepIndicator states={stepStates} />

        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── Generating ────────────────────────────────────────────────── */}
          {uiStep === 'generating' && (
            <div className="p-8 space-y-6 overflow-y-auto flex-1">
              <div className="flex flex-col items-center justify-center py-4 text-center space-y-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full" />
                  <Loader2 className="size-10 animate-spin text-indigo-400 relative z-10" />
                </div>

                <div className="w-full max-w-sm space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{phase}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${Math.max(3, progress)}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Typically 15–30 seconds depending on schema size.
                </p>
              </div>

              <div className="space-y-3">
                <Skeleton className="h-[72px] w-full rounded-xl" />
                <Skeleton className="h-[72px] w-full rounded-xl" />
                <Skeleton className="h-[72px] w-full rounded-xl" />
              </div>
            </div>
          )}

          {/* ── Select Connection ─────────────────────────────────────────── */}
          {uiStep === 'select-connection' && (
            <div className="flex-1 flex flex-col p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Select a Connection</p>
                <p className="text-xs text-muted-foreground">
                  This server has {availableConnections.length} connections. Choose which database to generate tools from.
                </p>
              </div>
              <div className="space-y-2">
                {availableConnections.map((conn) => (
                  <button
                    key={conn.id}
                    onClick={() => {
                      setSelectedConnectionId(conn.id)
                      generateMutation.mutate(conn.id)
                    }}
                    disabled={generateMutation.isPending}
                    className="w-full text-left p-4 rounded-xl border border-border hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-start gap-3">
                      <Database className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{conn.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{conn.database}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Failed ────────────────────────────────────────────────────── */}
          {uiStep === 'failed' && (
            <div className="flex flex-col items-center justify-center flex-1 py-10 text-center space-y-4 px-8">
              <XCircle className="size-10 text-destructive shrink-0" />
              <div className="space-y-1.5 max-w-md">
                <p className="text-sm font-medium">Generation Failed</p>
                {errorMessage && (
                  <p className="text-xs text-muted-foreground">{errorMessage}</p>
                )}
              </div>
              {hint && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-left max-w-sm">
                  <hint.icon className="size-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-300">{hint.text}</p>
                </div>
              )}
              <Button
                onClick={handleRetry}
                variant="outline"
                size="sm"
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="size-3.5 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5 mr-2" />
                )}
                Try Again
              </Button>
            </div>
          )}

          {/* ── Saving ────────────────────────────────────────────────────── */}
          {uiStep === 'saving' && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4">
              <Loader2 className="size-8 animate-spin text-indigo-400" />
              <p className="text-sm text-muted-foreground">Saving {selectedIndices.size} tools…</p>
            </div>
          )}

          {/* ── Preview ───────────────────────────────────────────────────── */}
          {uiStep === 'preview' && (
            <>
              <div className="px-6 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedIndices.size === tools.length && tools.length > 0}
                    onCheckedChange={toggleAll}
                    className="border-white/20 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                  />
                  <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    Select All ({selectedIndices.size} of {tools.length})
                  </label>
                </div>
                <span className="text-xs text-muted-foreground">{tools.length} tools generated</span>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-2.5">
                  {tools.map((tool, idx) => {
                    const isSelected = selectedIndices.has(idx)
                    const hc = safeParseJSON<Record<string, any>>(tool.handlerConfig, {})
                    const fmMethod: string = tool.fmMethod || hc.method || 'custom'
                    const fmLayout: string | null = tool.fmLayout || hc.layout || null
                    const connId: string | undefined = hc.connectionId
                    const connName: string | null = connId ? (connectionMap[connId] || null) : null
                    const op = opMeta(fmMethod)
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'flex items-start gap-3.5 p-4 rounded-xl border transition-all cursor-pointer',
                          isSelected
                            ? 'bg-indigo-500/10 border-indigo-500/30 shadow-sm shadow-indigo-500/5'
                            : 'bg-muted/20 border-border/50 hover:bg-muted/40',
                        )}
                        onClick={() => toggleSelection(idx)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelection(idx)}
                          className="mt-1 border-white/20 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* Name + operation */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Wrench className={cn('size-3.5 shrink-0', isSelected ? 'text-indigo-400' : 'text-muted-foreground')} />
                            <span className={cn('text-sm font-semibold', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                              {tool.name}
                            </span>
                            <Badge variant="outline" className={cn('text-[10px] font-medium px-1.5 py-0 h-4 border', op.color)}>
                              {op.label}
                            </Badge>
                            {tool.category && tool.category.toLowerCase() !== fmMethod && (
                              <Badge variant="outline" className="text-[9px] uppercase font-bold py-0 h-4 bg-muted text-muted-foreground">
                                {tool.category}
                              </Badge>
                            )}
                          </div>
                          {/* Description */}
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {tool.description}
                          </p>
                          {/* Layout / connection metadata */}
                          <div className="flex items-center gap-3 flex-wrap pt-0.5">
                            {fmLayout && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                                <Database className="size-2.5" />
                                {fmLayout}
                              </span>
                            )}
                            {connName && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                                <AlertTriangle className="size-2.5 hidden" />
                                via {connName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="p-6 pt-4 border-t shrink-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isWorking}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          {uiStep === 'preview' && (
            <Button
              className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[120px]"
              disabled={selectedIndices.size === 0}
              onClick={handleSave}
            >
              <CheckCircle2 className="size-4 mr-2" />
              Add {selectedIndices.size} Tool{selectedIndices.size === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
