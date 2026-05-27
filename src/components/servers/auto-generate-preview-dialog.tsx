import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
import { safeParseJSON } from '@/lib/utils/safe-parse'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { Loader2, Brain, Wrench, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface AutoGeneratePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverId: string
  branchId?: string | null
}

export function AutoGeneratePreviewDialog({ open, onOpenChange, serverId, branchId }: AutoGeneratePreviewDialogProps) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<'idle' | 'generating' | 'preview'>('idle')
  const [tools, setTools] = useState<any[]>([])
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())

  // Generate All Tools Mutation (Async Job Polling)
  const generateMutation = useMutation({
    mutationFn: async () => {
      setStep('generating')
      
      const data = await api.post<{ jobId: string }>(`/api/servers/${serverId}/generate-tools`, { branchId })
      const jobId = data.jobId
      
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Pass jobId to always poll the correct job (not a stale previous one)
        const job = await api.get<any>(`/api/servers/${serverId}/generate-tools/status?jobId=${jobId}`)
        
        if (job.status === 'done') {
          return job
        }
        if (job.status === 'failed') {
          throw new Error(job.error || 'Tool generation failed during execution')
        }
      }
    },
    onSuccess: (jobData) => {
      if (jobData.generatedTools) {
        try {
          const parsed = safeParseJSON(jobData.generatedTools, [])
          setTools(parsed)
          setSelectedIndices(new Set(parsed.map((_: any, i: number) => i)))
          setStep('preview')
        } catch (e) {
          toast.error('Failed to parse generated tools')
          onOpenChange(false)
        }
      } else {
        toast.error('No tools were generated')
        onOpenChange(false)
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to generate tools')
      setStep('idle')
      onOpenChange(false)
    }
  })

  const saveMutation = useMutation({
    mutationFn: (selectedTools: any[]) =>
      api.post<{ saved: number }>(`/api/servers/${serverId}/generate-tools/save`, { tools: selectedTools, branchId }),
    onSuccess: (data) => {
      toast.success(`Successfully added ${data.saved} tools`)
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
      queryClient.invalidateQueries({ queryKey: ['branch-tools', branchId, serverId] })
      onOpenChange(false)
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save selected tools')
    }
  })

  // Start generating when opened if idle
  useEffect(() => {
    if (open && step === 'idle') {
      generateMutation.mutate()
    }
    if (!open) {
      setTimeout(() => {
        setStep('idle')
        setTools([])
        setSelectedIndices(new Set())
      }, 300)
    }
  }, [open, step])

  const toggleSelection = (index: number) => {
    const next = new Set(selectedIndices)
    if (next.has(index)) {
      next.delete(index)
    } else {
      next.add(index)
    }
    setSelectedIndices(next)
  }

  const toggleAll = () => {
    if (selectedIndices.size === tools.length) {
      setSelectedIndices(new Set())
    } else {
      setSelectedIndices(new Set(tools.map((_, i) => i)))
    }
  }

  const handleSave = () => {
    const selected = tools.filter((_, i) => selectedIndices.has(i))
    if (selected.length === 0) {
      toast.error('Please select at least one tool to save')
      return
    }
    saveMutation.mutate(selected)
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val && (step === 'generating' || saveMutation.isPending)) return // prevent closing while working
      onOpenChange(val)
    }}>
      <DialogContent className="sm:max-w-[700px] bg-neutral-900 border-white/10 text-white shadow-2xl p-0 flex flex-col" style={{ maxHeight: '85vh', height: '85vh' }}>
        <DialogHeader className="p-6 pb-4 border-b border-white/5 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="size-5 text-indigo-400" />
            Auto-Generate Suite
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            {step === 'generating' ? 'Analyzing schema and generating tools...' : 'Select the tools you want to add to your server.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          {step === 'generating' && (
            <div className="p-8 space-y-6 overflow-y-auto">
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full" />
                  <Loader2 className="size-12 animate-spin text-indigo-400 relative z-10" />
                </div>
                <p className="text-sm text-neutral-400 max-w-[250px]">
                  This usually takes 15-30 seconds depending on schema size...
                </p>
              </div>
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl bg-white/5" />
                <Skeleton className="h-16 w-full rounded-xl bg-white/5" />
                <Skeleton className="h-16 w-full rounded-xl bg-white/5" />
              </div>
            </div>
          )}

          {step === 'preview' && (
            <>
              <div className="px-6 py-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="select-all" 
                    checked={selectedIndices.size === tools.length && tools.length > 0}
                    onCheckedChange={toggleAll}
                    className="border-white/20 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                  />
                  <label htmlFor="select-all" className="text-sm font-medium text-neutral-300 cursor-pointer">
                    Select All ({selectedIndices.size} of {tools.length})
                  </label>
                </div>
                <span className="text-xs text-neutral-500">{tools.length} tools generated</span>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-3">
                  {tools.map((tool, idx) => {
                    const isSelected = selectedIndices.has(idx)
                    return (
                      <div 
                        key={idx}
                        className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-indigo-500/10 border-indigo-500/30 shadow-sm shadow-indigo-500/5' 
                            : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.05]'
                        }`}
                        onClick={() => toggleSelection(idx)}
                      >
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => toggleSelection(idx)}
                          className="mt-1 border-white/20 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Wrench className={`size-3.5 ${isSelected ? 'text-indigo-400' : 'text-neutral-500'}`} />
                            <h4 className={`text-sm font-semibold tracking-wide ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                              {tool.name}
                            </h4>
                            {tool.category && (
                              <Badge variant="outline" className="text-[9px] uppercase font-bold py-0 h-4 bg-black/40 text-neutral-400 border-white/10">
                                {tool.category}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-neutral-400 line-clamp-2">
                            {tool.description}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="p-6 pt-4 border-t border-white/5 shrink-0 bg-neutral-900">
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            disabled={step === 'generating' || saveMutation.isPending}
            className="text-neutral-400 hover:text-white"
          >
            Cancel
          </Button>
          <Button 
            className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[120px]"
            disabled={step === 'generating' || selectedIndices.size === 0 || saveMutation.isPending}
            onClick={handleSave}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="size-4 mr-2" />
                Add {selectedIndices.size} Tools
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
