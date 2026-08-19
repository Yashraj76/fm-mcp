'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import Link from 'next/link'
import { api } from '@/lib/utils/api-client'
import { cn } from '@/lib/utils'
import { toolKeys, invalidateToolLists } from '@/lib/query-keys'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Server,
  Link2,
  Wrench,
  Pencil,
  Rocket,
  FileJson,
  Sparkles,
  GitBranch,
  Eye,
  Lock,
  Clock,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Brain,
  RotateCcw,
  Info,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useState } from 'react'
import { AutoGeneratePreviewDialog } from './auto-generate-preview-dialog'
import { AiPromptToolDialog } from '@/components/ai/ai-prompt-tool-dialog'
import { StatusBadge } from '@/components/ui/status-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface ToolItem {
  id: string
  name: string
  isEnabled: boolean
  category: string | null
  _branchAction?: string
  _branchToolId?: string
}

interface BranchItem {
  id: string
  name: string
  status: string
  isDefault: boolean
  tools?: ToolItem[]
  commitMessage: string | null
  createdAt: string
}

interface ServerDetail {
  id: string
  name: string
  description: string | null
  version: string
  status: string
  connections: { connection: { id: string; name: string; status: string; host: string; database: string; browsedSchema?: { selectedLayouts: string; selectedTables: string } }; fileNames: string; isActive: boolean }[]
  branches: BranchItem[]
  deployments: { id: string; version: string; status: string; toolCount: number; changelog: string | null; deployedAt: string | null; createdAt: string; snapshot?: string }[]
  createdAt: string
  updatedAt: string
}


function ToolRow({ tool, onToggle, onEdit, onDelete, readOnly }: { tool: ToolItem; onToggle?: () => void; onEdit?: () => void; onDelete?: () => void; readOnly?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-3 px-4 rounded-xl border bg-muted/30 hover:bg-muted/60 transition-all duration-200 group mb-2 shadow-sm',
        !tool.isEnabled && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2 rounded-lg shrink-0 ${tool.isEnabled ? 'bg-blue-500/10 text-blue-500 dark:text-blue-400' : 'bg-muted text-muted-foreground'}`}>
          <Wrench className="size-4" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate tracking-wide">{tool.name}</span>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {tool.category && (
              <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider py-0 px-1.5">
                {tool.category}
              </Badge>
            )}
            {tool._branchAction && tool._branchAction !== 'inherited' && (
              <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider py-0 px-1.5 ${tool._branchAction === 'modified' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                {tool._branchAction}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!readOnly ? (
          <div className="flex items-center gap-1.5">
            {onEdit && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="size-8 rounded-lg border hover:border-blue-500/30 hover:bg-blue-500/10 text-muted-foreground hover:text-blue-400 transition-all" 
                onClick={onEdit}
                title="Edit Tool"
                aria-label="Edit tool"
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="size-8 rounded-lg border hover:border-red-500/30 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all" 
                onClick={onDelete}
                title="Delete Tool"
                aria-label="Delete tool"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
            {onToggle && (
              <Button
                variant="ghost"
                size="icon"
                className={`size-8 rounded-lg border transition-all ${
                  tool.isEnabled 
                    ? 'bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20' 
                    : 'bg-muted border hover:border-muted-foreground/30 text-muted-foreground hover:bg-muted/80'
                }`}
                onClick={onToggle}
                title={tool.isEnabled ? 'Disable Tool' : 'Enable Tool'}
                aria-label={tool.isEnabled ? 'Disable tool' : 'Enable tool'}
              >
                <Power className="size-3.5" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] uppercase font-bold tracking-wider py-0.5 px-2 rounded-full border ${
              tool.isEnabled 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-muted border text-muted-foreground'
            }`}>
              {tool.isEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

interface ServerDetailPageProps {
  serverId?: string
}

export function ServerDetailPage({ serverId }: ServerDetailPageProps) {
  const currentServerId = useAppStore((s) => s.currentServerId)
  const serverMode = useAppStore((s) => s.serverMode)

  const setServerMode = useAppStore((s) => s.setServerMode)
  const setCurrentServer = useAppStore((s) => s.setCurrentServer)
  const setCurrentBranch = useAppStore((s) => s.setCurrentBranch)
  const currentBranchId = useAppStore((s) => s.currentBranchId)
  const setShowToolDialog = useAppStore((s) => s.setShowToolDialog)
  const setShowBranchDialog = useAppStore((s) => s.setShowBranchDialog)
  const setShowConfigDialog = useAppStore((s) => s.setShowConfigDialog)
  const setShowServerDialog = useAppStore((s) => s.setShowServerDialog)


  useEffect(() => {
    if (serverId) {
      setCurrentServer(serverId)
    }
  }, [serverId, setCurrentServer])

  const queryClient = useQueryClient()
  const [localRefreshKey, setLocalRefreshKey] = useState(0)
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)

  // Auto-Generate preview dialog state
  const [showAutoGenerateDialog, setShowAutoGenerateDialog] = useState(false)

  // AI Prompt Tool dialog state
  const [showAiPromptDialog, setShowAiPromptDialog] = useState(false)

  // Generic confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void
  } | null>(null)

  const openConfirm = (cfg: Omit<NonNullable<typeof confirmDialog>, 'open'>) =>
    setConfirmDialog({ open: true, ...cfg })
  const closeConfirm = () => setConfirmDialog(null)

  // Toggle tool enabled mutation (Branch-aware)
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const url = currentBranchId
        ? `/api/branches/${currentBranchId}/tools/${id}`
        : `/api/servers/${currentServerId}/tools/${id}`
      const body = currentBranchId
        ? { enabled: !isEnabled }
        : { isEnabled: !isEnabled }
      return api.put<any>(url, body)
    },
    onMutate: async ({ id, isEnabled }) => {
      const queryKey = toolKeys.view(currentServerId, currentBranchId)
      await queryClient.cancelQueries({ queryKey })
      const previousTools = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (old: ToolItem[] | undefined) => {
        if (!old) return old
        return old.map(t => t.id === id ? { ...t, isEnabled: !isEnabled } : t)
      })
      return { previousTools, queryKey }
    },
    onError: (err, variables, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previousTools)
      toast.error('Failed to toggle tool')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      invalidateToolLists(queryClient, currentServerId, currentBranchId)
    },
  })

  // Delete mutation (Branch-aware). The branch-scoped DELETE route rejects
  // deletes on the default/main branch (it only supports per-tool overrides,
  // not removing the base Tool row) — route to the server-scoped endpoint
  // whenever the current branch is main, not just when no branch is set.
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const url = currentBranchId && !isOnMainBranch
        ? `/api/branches/${currentBranchId}/tools/${id}`
        : `/api/servers/${currentServerId}/tools/${id}`
      return api.delete<void>(url)
    },
    onSuccess: () => {
      toast.success('Tool deleted')
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      invalidateToolLists(queryClient, currentServerId, currentBranchId)
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to delete tool')
    },
  })

  // Branch operations mutations
  const mergeMutation = useMutation({
    mutationFn: ({ branchId, force }: { branchId: string; force?: boolean }) =>
      api.post<{ message: string }>(`/api/branches/${branchId}/merge`, {
        changelog: `Merged branch ${branchId}`,
        force,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      // Merge creates a deployment and rewrites main's tools — refresh the
      // server-list cards and dashboard stats too.
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      invalidateToolLists(queryClient, currentServerId, currentBranchId)
      toast.success(data.message || 'Branch merged successfully')
    },
    onError: (err: any, { branchId }) => {
      if (err.code === 'MERGE_CONFLICT' && err.details?.conflicts) {
        const names = err.details.conflicts.map((c: { toolName: string }) => c.toolName).join(', ')
        openConfirm({
          title: 'Merge conflicts detected',
          description: `${names} changed on main since this branch last edited them. Merging anyway overwrites those tools with this branch's version. Go to Branches for a detailed diff, or confirm to merge anyway.`,
          confirmLabel: 'Merge Anyway',
          onConfirm: () => mergeMutation.mutate({ branchId, force: true }),
        })
        return
      }
      toast.error(err.message || 'Failed to merge branch')
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (branchId: string) =>
      api.put<any>(`/api/branches/${branchId}`, { status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      // Server-list cards show branch counts.
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Branch archived')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to archive branch'),
  })

  const deleteMutationBranch = useMutation({
    mutationFn: (branchId: string) =>
      api.delete<any>(`/api/branches/${branchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      // Server-list cards show branch counts.
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Branch deleted')
      // If we deleted the current branch, reset selection
      if (currentBranchId) {
        const def = server?.branches.find(b => b.isDefault)
        if (def) setCurrentBranch(def.id)
      }
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete branch'),
  })

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      api.post<any>(`/api/deployments/${deploymentId}/rollback`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      // Refresh the server-list cards (version / live deployment changed).
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      invalidateToolLists(queryClient, currentServerId, currentBranchId)
      toast.success('Rollback completed successfully')
      setLocalRefreshKey(k => k + 1)
    },
    onError: () => toast.error('Failed to rollback deployment'),
  })

  // Server detailed schema fetch
  const { data: server, isLoading, isError } = useQuery<ServerDetail>({
    queryKey: ['server', currentServerId, localRefreshKey],
    queryFn: () => api.get<ServerDetail>(`/api/servers/${currentServerId}`),
    enabled: !!currentServerId,
  })

  const mainBranchId = server?.branches.find(b => b.isDefault)?.id ?? null
  const isOnMainBranch = !currentBranchId || currentBranchId === mainBranchId

  // Branch effective tools fetch
  const { data: branchTools = [], isLoading: isLoadingTools } = useQuery<ToolItem[]>({
    queryKey: toolKeys.view(currentServerId, currentBranchId),
    queryFn: async () => {
      if (!currentServerId) return []
      const url = currentBranchId
        ? `/api/branches/${currentBranchId}/tools`
        : `/api/servers/${currentServerId}/tools`
      return api.get<ToolItem[]>(url)
    },
    enabled: !!currentServerId,
  })

  // Auto-set the default branch if none is selected, or the selected one
  // doesn't belong to this server (e.g. left over from a previously viewed
  // server).
  useEffect(() => {
    if (server?.branches) {
      const isValidBranch = server.branches.some(b => b.id === currentBranchId)
      if (!isValidBranch) {
        const def = server.branches.find(b => b.isDefault)
        if (def) setCurrentBranch(def.id)
      }
    }
  }, [server, currentBranchId, setCurrentBranch])

  if (isLoading || !server) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="size-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !server) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">
          Failed to load server details.
        </div>
      </div>
    )
  }

  const activeTools = branchTools.filter(t => t.isEnabled)
  // Disabled tools sink to the bottom of the list — enabled tools are what
  // you're actively working with; disabled ones are there for reference.
  const sortedBranchTools = [...branchTools].sort((a, b) => Number(b.isEnabled) - Number(a.isEnabled))
  const lastDeployment = server.deployments?.[0]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to Servers"
            asChild
          >
            <Link href="/servers" onClick={() => setCurrentServer(null)}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <Server className="size-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold tracking-tight">{server.name}</h1>
              <StatusBadge status={server.status} />
            </div>
            {server.description && (
              <p className="text-muted-foreground text-sm mt-0.5">{server.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConfigDialog(true)}>
            <FileJson className="size-3.5" />
            Generate Config
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowServerDialog(true, server.id)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* Server Info & Connections — a single compact row so the tools list
          below gets most of the vertical space. */}
      <Card className="overflow-hidden">
        <div className="p-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Version:</span>
            <span className="text-sm font-semibold">v{server.version}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Active Tools:</span>
            <span className="text-sm font-semibold">{activeTools.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Created:</span>
            <span className="text-sm font-semibold">{format(new Date(server.createdAt), 'MMM d, yyyy')}</span>
          </div>

          {server.connections.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-xs text-muted-foreground shrink-0">Connections:</span>
                {(server.connections ?? []).filter(c => c.isActive).map((conn) => {
                  let layouts = 0, tables = 0
                  const bs = conn.connection.browsedSchema
                  if (bs) {
                    try { layouts = JSON.parse(bs.selectedLayouts || '[]').length } catch {}
                    try { tables = JSON.parse(bs.selectedTables || '[]').length } catch {}
                  }

                  return (
                    <div
                      key={conn.connection.id}
                      className="flex items-center gap-1.5 bg-muted/30 border hover:border-foreground/10 transition-colors rounded-md px-2 py-1 text-xs"
                    >
                      <Link2 className="size-3 text-blue-400 shrink-0" />
                      <span className="font-medium truncate max-w-[120px]">{conn.connection.name}</span>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">{conn.connection.database}</Badge>
                      <span className="text-muted-foreground whitespace-nowrap" title={`${layouts} layouts, ${tables} OData tables`}>
                        {layouts}L · {tables}T
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Mode Tabs */}
      <Tabs value={serverMode} onValueChange={(v) => setServerMode(v as typeof serverMode)}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <TabsList className="border p-1 rounded-lg">
              <TabsTrigger value="edit" className="data-[state=active]:bg-accent data-[state=active]:text-foreground text-muted-foreground transition-all">
                <Pencil className="size-3.5 mr-1.5" />
                Edit
              </TabsTrigger>
              <TabsTrigger value="staging" className="data-[state=active]:bg-accent data-[state=active]:text-foreground text-muted-foreground transition-all">
                <Eye className="size-3.5 mr-1.5" />
                Staging
              </TabsTrigger>
              <TabsTrigger value="deployed" className="data-[state=active]:bg-accent data-[state=active]:text-foreground text-muted-foreground transition-all">
                <Rocket className="size-3.5 mr-1.5" />
                Deployed
              </TabsTrigger>
            </TabsList>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="What do these tabs mean?" className="text-muted-foreground hover:text-foreground">
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs space-y-1.5">
                <p><strong>Edit</strong> — modify tools on the branch selected below (defaults to main).</p>
                <p><strong>Staging</strong> — a read-only preview of that same branch's effective tools, not a separate pending state.</p>
                <p><strong>Deployed</strong> — the live snapshot MCP clients actually call.</p>
                <p><strong>Merge</strong> (on a feature branch) folds its changes into main and immediately creates a new live deployment — merging already deploys.</p>
                <p><strong>Deploy to Production</strong> creates an additional deployment snapshot of main's current state, e.g. after editing main directly without a branch.</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            {serverMode === 'staging' && (
              isOnMainBranch ? (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5 shadow-lg shadow-blue-900/20"
                  onClick={async () => {
                    try {
                      await api.post<any>(`/api/servers/${currentServerId}/deployments`, {
                        changelog: `Manual deployment - ${activeTools.length} tools`,
                        branchId: currentBranchId,
                      })
                      toast.success('Server deployed to production!')
                      setLocalRefreshKey(k => k + 1)
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to deploy')
                    }
                  }}
                >
                  <Rocket className="size-3.5" />
                  Deploy to Production
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-muted-foreground"
                  disabled
                  title="Deploying always ships main. Merge this branch into main first, then deploy."
                >
                  <Rocket className="size-3.5" />
                  Merge to main to deploy
                </Button>
              )
            )}
            
            {serverMode === 'deployed' && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowBranchDialog(true)}
              >
                <GitBranch className="size-3.5" />
                Create Edit Branch
              </Button>
            )}
          </div>
        </div>

        {/* Edit Mode */}
        <TabsContent value="edit" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3 border-b">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle className="text-sm font-semibold text-foreground">
                      Tools ({branchTools.length} total, {activeTools.length} active)
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => setShowAiPromptDialog(true)}>
                        <Sparkles className="size-3.5 mr-1.5 text-violet-400" />
                        AI Assistant
                      </Button>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 gap-1.5 border border-indigo-500/10" 
                        onClick={() => setShowAutoGenerateDialog(true)} 
                        disabled={!currentBranchId}
                      >
                        <Brain className="size-3.5" />
                        Auto-Generate Suite
                      </Button>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white" onClick={() => setShowToolDialog(true, null, server?.connections?.[0]?.connection?.id ?? null)}>
                        <Plus className="size-3.5 mr-1.5" />
                        Add Tool
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="max-h-[500px] overflow-y-auto pt-4 space-y-1">
                  {branchTools.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Wrench className="size-10 text-muted-foreground mb-3" />
                      <p className="text-sm font-semibold text-muted-foreground">No tools configured yet</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Add tools manually or use the AI Assistant</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {sortedBranchTools.map(tool => (
                        <ToolRow
                          key={tool.id}
                          tool={tool}
                          onToggle={() => toggleMutation.mutate({ id: tool.id, isEnabled: tool.isEnabled })}
                          onEdit={() => setShowToolDialog(true, tool.id, server?.connections?.[0]?.connection?.id ?? null)}
                          onDelete={() =>
                            openConfirm({
                              title: 'Delete Tool',
                              description: 'Remove this tool from the server? Execution history is preserved.',
                              confirmLabel: 'Delete',
                              onConfirm: () => deleteMutation.mutate(tool.id),
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Branch Sidebar */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <GitBranch className="size-4 text-blue-400" />
                      Branches
                    </CardTitle>
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setShowBranchDialog(true)}>
                      <Plus className="size-3.5 mr-1" />
                      New
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-3 max-h-[400px] overflow-y-auto space-y-2.5">
                  {server.branches.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No branches available</p>
                  ) : (
                    server.branches.map(branch => {
                      const isSelected = branch.id === currentBranchId
                      return (
                        <div 
                          key={branch.id} 
                          className={`group/branch flex flex-col p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                            isSelected 
                              ? 'bg-blue-500/5 border-blue-500/30 shadow-sm shadow-blue-500/5' 
                              : 'bg-card border hover:bg-muted/50 hover:border-foreground/10'
                          }`}
                          onClick={() => setCurrentBranch(branch.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <GitBranch className={`size-3.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-muted-foreground'}`} />
                              <span className={`text-sm font-semibold truncate ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {branch.name}
                              </span>
                              {branch.isDefault && (
                                <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold py-0 px-1">
                                  default
                                </Badge>
                              )}
                            </div>
                            <StatusBadge status={branch.status} />
                          </div>
                          
                          {branch.commitMessage && (
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 italic">
                              &ldquo;{branch.commitMessage}&rdquo;
                            </p>
                          )}
                          
                          <div className="flex items-center justify-between mt-2.5 pt-2 border-t">
                            <span className="text-[10px] text-muted-foreground">
                              {branch.createdAt ? format(new Date(branch.createdAt), 'MMM d, yyyy') : ''}
                            </span>
                            
                            {/* Branch actions */}
                            {branch.status === 'active' && !branch.isDefault && (
                              <div className="flex items-center gap-1.5 opacity-0 group-hover/branch:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 rounded hover:bg-blue-500/10 hover:text-blue-400 text-muted-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openConfirm({
                                      title: `Merge "${branch.name}"`,
                                      description: `Merge this branch into the default branch? Tool changes will become the new production state.`,
                                      confirmLabel: 'Merge',
                                      onConfirm: () => mergeMutation.mutate({ branchId: branch.id }),
                                    })
                                  }}
                                  title="Merge into default branch"
                                  aria-label={`Merge branch ${branch.name} into default branch`}
                                >
                                  <GitBranch className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 rounded hover:bg-orange-500/10 hover:text-orange-400 text-muted-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    archiveMutation.mutate(branch.id)
                                  }}
                                  title="Archive branch"
                                  aria-label={`Archive branch ${branch.name}`}
                                >
                                  <Clock className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 rounded hover:bg-red-500/10 hover:text-red-400 text-muted-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openConfirm({
                                      title: `Delete "${branch.name}"`,
                                      description: 'This branch and its tool overrides will be permanently deleted.',
                                      confirmLabel: 'Delete',
                                      onConfirm: () => deleteMutationBranch.mutate(branch.id),
                                    })
                                  }}
                                  title="Delete branch"
                                  aria-label={`Delete branch ${branch.name}`}
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Staging Mode */}
        <TabsContent value="staging" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-foreground">Tools Preview (Staging)</CardTitle>
                  <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/20">
                    Read-Only Preview
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto pt-4 space-y-1">
                {branchTools.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Wrench className="size-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">No tools to preview</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sortedBranchTools.map(tool => (
                      <ToolRow key={tool.id} tool={tool} readOnly />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {lastDeployment && (
              <Card>
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-sm font-semibold text-foreground">Comparison with Current Deployment</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1 bg-muted/30 border rounded-xl p-3.5">
                      <span className="text-xs text-muted-foreground block">Current Deployment</span>
                      <p className="text-sm font-bold text-foreground">v{lastDeployment.version}</p>
                      <p className="text-xs text-muted-foreground">{lastDeployment.toolCount} tools active</p>
                    </div>
                    <div className="space-y-1 bg-muted/30 border rounded-xl p-3.5">
                      <span className="text-xs text-muted-foreground block">Staging Version</span>
                      <p className="text-sm font-bold text-foreground">{activeTools.length} tools</p>
                      <p className="text-xs text-muted-foreground">
                        {activeTools.length !== lastDeployment.toolCount
                          ? `${Math.abs(activeTools.length - lastDeployment.toolCount)} tool difference`
                          : 'Same tool count'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        </TabsContent>

        {/* Deployed Mode */}
        <TabsContent value="deployed" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-foreground">Deployed Tools</CardTitle>
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                    Production
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto pt-4 space-y-1">
                {lastDeployment ? (() => {
                  let snapshotTools: ToolItem[] = [];
                  try {
                    const snap = JSON.parse(lastDeployment.snapshot || '{}');
                    snapshotTools = snap.tools || [];
                  } catch (e) {
                    console.error('Failed to parse snapshot', e);
                  }
                  // Disabled tools sink to the bottom, same as the Edit/Staging lists.
                  snapshotTools = [...snapshotTools].sort((a, b) => Number(b.isEnabled) - Number(a.isEnabled))
                  
                  return (
                    <>
                      <div className="flex items-center gap-3 mb-4 text-sm text-muted-foreground px-1 bg-muted/30 border p-2 rounded-lg">
                        <Clock className="size-4 text-blue-400" />
                        <span>
                          Version <strong className="text-foreground font-mono">v{lastDeployment.version}</strong> — Deployed{' '}
                          {lastDeployment.deployedAt 
                            ? format(new Date(lastDeployment.deployedAt), 'MMM d, yyyy HH:mm') 
                            : 'recently'}
                        </span>
                      </div>
                      {snapshotTools.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">No tools found in deployment snapshot</p>
                      ) : (
                        <div className="space-y-2">
                          {snapshotTools.map(tool => (
                            <ToolRow key={tool.id} tool={tool} readOnly />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })() : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Rocket className="size-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm font-semibold text-muted-foreground">No deployments yet</p>
                    <p className="text-xs text-muted-foreground/75 mt-1">Deploy from staging to see production tools here</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Deployment History */}
            {server.deployments.length > 0 && (
              <Card>
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-sm font-semibold text-foreground">Deployment History</CardTitle>
                </CardHeader>
                <CardContent className="max-h-64 overflow-y-auto pt-2">
                  <div className="divide-y">
                    {server.deployments.map((deployment, index) => (
                      <div key={deployment.id} className="flex items-center justify-between py-3 hover:bg-muted/30 px-2 rounded-lg transition-colors">
                        <div className="space-y-1 min-w-0 flex-1 pr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-foreground font-mono font-bold">v{deployment.version}</span>
                            <StatusBadge status={deployment.status} />
                            {index === 0 && (
                              <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                                Current Live
                              </Badge>
                            )}
                          </div>
                          {deployment.changelog && (
                            <p className="text-xs text-muted-foreground line-clamp-1 italic">
                              &ldquo;{deployment.changelog}&rdquo;
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>
                              Deployed{' '}
                              {deployment.deployedAt
                                ? format(new Date(deployment.deployedAt), 'MMM d, yyyy HH:mm')
                                : format(new Date(deployment.createdAt), 'MMM d, yyyy HH:mm')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {index > 0 && deployment.status !== 'rolled_back' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 rounded-md border hover:border-orange-500/30 hover:bg-orange-500/10 text-muted-foreground hover:text-orange-400 transition-all"
                              onClick={() =>
                                openConfirm({
                                  title: `Roll back to v${deployment.version}`,
                                  description: 'The server will revert to this deployment snapshot. The current live state will be replaced.',
                                  confirmLabel: 'Roll Back',
                                  onConfirm: () => rollbackMutation.mutate(deployment.id),
                                })
                              }
                              title="Rollback to this version"
                              aria-label={`Rollback to version ${deployment.version}`}
                            >
                              <RotateCcw className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        </TabsContent>
      </Tabs>

      {currentServerId && (
        <AutoGeneratePreviewDialog
          open={showAutoGenerateDialog}
          onOpenChange={setShowAutoGenerateDialog}
          serverId={currentServerId}
          branchId={currentBranchId}
        />
      )}

      {currentServerId && (
        <AiPromptToolDialog
          open={showAiPromptDialog}
          onOpenChange={setShowAiPromptDialog}
          serverId={currentServerId}
          branchId={currentBranchId}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => { if (!open) closeConfirm() }}
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={() => { confirmDialog.onConfirm(); closeConfirm() }}
        />
      )}
    </div>
  )
}
