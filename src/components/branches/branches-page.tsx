'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
import { useAppStore } from '@/lib/store'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  GitBranch,
  GitMerge,
  RotateCcw,
  Archive,
  Trash2,
  ChevronRight,
  Star,
  Wrench,
  Calendar,
  MessageSquare,
  Server,
  ArrowLeft,
  Clock,
  History,
  Activity,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
  CheckCircle,
  Rocket,
  Database,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface BranchTool {
  id: string
  name: string
  isEnabled: boolean
  category: string | null
}

interface BranchItem {
  id: string
  name: string
  status: string
  isDefault: boolean
  tools: BranchTool[]
  commitMessage: string | null
  createdAt: string
  updatedAt: string
  parent: { id: string; name: string } | null
  children: { id: string }[]
}

interface ServerItem {
  id: string
  name: string
  status: string
  _count: { tools: number; branches: number }
}

function BranchStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-green-500/15 text-green-500 border-green-500/20' },
    merged: { label: 'Merged', className: 'bg-muted text-muted-foreground' },
    archived: { label: 'Archived', className: 'bg-orange-500/15 text-orange-500 border-orange-500/20' },
    deleted: { label: 'Deleted', className: 'bg-red-500/15 text-red-500 border-red-500/20' },
  }
  const { label, className } = config[status] || { label: status, className: '' }
  return <Badge variant="outline" className={className}>{label}</Badge>
}

interface LogItem {
  id: string
  action: string
  entityType: string
  entityId: string
  entityName: string
  branchId: string | null
  deploymentId: string | null
  hasDiff: boolean
  meta: any
  createdAt: string
}

function LogTimelineItem({ log, isExpanded, onToggle, logDetail, isLoadingDetail }: {
  log: LogItem
  isExpanded: boolean
  onToggle: () => void
  logDetail: any
  isLoadingDetail: boolean
}) {
  const isError = log.action.toLowerCase().includes('fail') || log.action.toLowerCase().includes('error') || log.action.toLowerCase().includes('delete')
  const isWarning = log.action.toLowerCase().includes('warn') || log.action.toLowerCase().includes('suggest')
  
  const statusColor = isError 
    ? 'border-red-500/20 bg-red-500/10 text-red-500' 
    : isWarning 
      ? 'border-amber-500/20 bg-amber-500/10 text-amber-500' 
      : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'

  let Icon = Activity
  if (log.entityType === 'branch') Icon = GitBranch
  if (log.entityType === 'tool') Icon = Wrench
  if (log.entityType === 'deployment') Icon = Rocket
  if (log.entityType === 'connection' || log.entityType === 'schema') Icon = Database
  if (log.entityType === 'server') Icon = Server

  return (
    <Card className="hover:border-foreground/10 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-lg border ${statusColor} shrink-0`}>
            <Icon className="size-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <span className="text-sm font-semibold">
                  {log.entityName}
                </span>
                <span className="text-xs text-muted-foreground ml-2 bg-muted px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                  {log.action.replace(/_/g, ' ')}
                </span>
              </div>
              <span className="text-xs text-neutral-400 flex items-center gap-1 shrink-0">
                <Clock className="size-3" />
                {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
              </span>
            </div>

            <p className="text-xs text-neutral-500 mt-1 font-mono">
              Entity ID: {log.entityId} {log.branchId ? `· Branch: ${log.branchId}` : ''}
            </p>

            {(log.hasDiff || log.meta) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground p-0 h-auto gap-1"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="size-3" /> Hide details
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3" /> Show details {log.hasDiff ? ' & changes' : ''}
                  </>
                )}
              </Button>
            )}

            {isExpanded && (
              <div className="mt-3 pt-3 border-t space-y-3">
                {isLoadingDetail ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : logDetail ? (
                  <>
                    {logDetail.meta && Object.keys(logDetail.meta).length > 0 && (
                      <div className="bg-muted/50 border rounded-lg p-3 space-y-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                          <FileText className="size-3" />
                          Metadata Context
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {Object.entries(logDetail.meta).map(([key, val]) => (
                            <div key={key} className="flex flex-col p-1.5 rounded bg-muted/30">
                              <span className="text-neutral-500 font-mono text-[10px]">{key}</span>
                              <span className="text-neutral-300 font-medium truncate">
                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {logDetail.diff ? (
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                          <Activity className="size-3" />
                          Changes & Modifications
                        </div>
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                          {Object.entries(logDetail.diff).map(([field, values]: [string, any]) => (
                            <div key={field} className="border rounded-lg overflow-hidden bg-background text-xs">
                              <div className="bg-muted px-2.5 py-1 text-[11px] font-semibold font-mono border-b">
                                {field}
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border font-mono">
                                <div className="p-2 bg-destructive/5 text-destructive">
                                  <div className="text-[9px] uppercase tracking-wider opacity-70 mb-1 font-sans font-bold">Before</div>
                                  <pre className="whitespace-pre-wrap break-all text-[11px]">
                                    {typeof values.before === 'object' ? JSON.stringify(values.before, null, 2) : String(values.before)}
                                  </pre>
                                </div>
                                <div className="p-2 bg-emerald-500/5 text-emerald-600">
                                  <div className="text-[9px] uppercase tracking-wider opacity-70 mb-1 font-sans font-bold">After</div>
                                  <pre className="whitespace-pre-wrap break-all text-[11px]">
                                    {typeof values.after === 'object' ? JSON.stringify(values.after, null, 2) : String(values.after)}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : logDetail.after ? (
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                          <FileText className="size-3" />
                          Snapshot Data
                        </div>
                        <pre className="bg-muted border rounded-lg p-3 text-[11px] font-mono overflow-x-auto max-h-60">
                          {JSON.stringify(logDetail.after, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-neutral-500">Failed to load log details</p>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function BranchesPage() {
  const queryClient = useQueryClient()
  const currentServerId = useAppStore((s) => s.currentServerId)
  const setCurrentServer = useAppStore((s) => s.setCurrentServer)
  const setShowBranchDialog = useAppStore((s) => s.setShowBranchDialog)
  const triggerRefreshBranches = useAppStore((s) => s.triggerRefreshBranches)
  const refreshBranches = useAppStore((s) => s.refreshBranches)

  const { data: servers = [] } = useQuery<ServerItem[]>({
    queryKey: ['servers'],
    queryFn: () => api.get<ServerItem[]>('/api/servers'),
  })

  const { data: branches = [], isLoading, isError, error } = useQuery<BranchItem[]>({
    queryKey: ['branches', currentServerId, refreshBranches],
    queryFn: async () => {
      try {
        return await api.get<BranchItem[]>(`/api/servers/${currentServerId}/branches`)
      } catch (err: any) {
        if (err.status === 404) {
          // Server no longer exists, reset selection
          setCurrentServer(null)
          return []
        }
        throw err
      }
    },
    enabled: !!currentServerId,
    retry: 1,
  })

  const [branchTab, setBranchTab] = useState<'branches' | 'activity'>('branches')
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  // Fetch activity logs for this server
  const { data: serverLogs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ['server-logs', currentServerId],
    queryFn: () => api.get<any[]>(`/api/servers/${currentServerId}/logs?limit=100`),
    enabled: !!currentServerId && branchTab === 'activity',
  })

  // Fetch specific log detail for diff display
  const { data: logDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['log-detail', expandedLogId],
    queryFn: () => api.get<any>(`/api/logs/${expandedLogId}`),
    enabled: !!expandedLogId,
  })

  const server = servers.find(s => s.id === currentServerId)

  const mergeMutation = useMutation({
    mutationFn: (branchId: string) =>
      api.post<{ message: string }>(`/api/branches/${branchId}/merge`, {
        changelog: `Merged branch ${branchId}`,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      triggerRefreshBranches()
      toast.success(data.message || 'Branch merged successfully')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to merge branch'),
  })

  const revertMutation = useMutation({
    mutationFn: (branchId: string) =>
      api.post<any>(`/api/branches/${branchId}/revert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      triggerRefreshBranches()
      toast.success('Branch reverted successfully')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to revert branch'),
  })

  const archiveMutation = useMutation({
    mutationFn: (branchId: string) =>
      api.put<any>(`/api/branches/${branchId}`, { status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      triggerRefreshBranches()
      toast.success('Branch archived')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to archive branch'),
  })

  const deleteMutation = useMutation({
    mutationFn: (branchId: string) =>
      api.delete<any>(`/api/branches/${branchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      triggerRefreshBranches()
      toast.success('Branch deleted')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete branch'),
  })

  const defaultBranch = branches.find(b => b.isDefault)
  const otherBranches = branches.filter(b => !b.isDefault)

  // No server selected - show server selector
  if (!currentServerId) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branch Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Select a server to manage its branches
          </p>
        </div>
        {servers.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16">
            <Server className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No servers available</h3>
            <p className="text-muted-foreground text-sm mb-4 text-center max-w-md">
              Create an MCP server first before managing branches.
            </p>
            <Button variant="outline" asChild>
              <Link href="/servers" className="flex items-center gap-2">
                <ArrowLeft className="size-4" />
                Go to Servers
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((s) => (
              <Card
                key={s.id}
                className="hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setCurrentServer(s.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Server className="size-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s._count?.branches ?? 0} branches
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to Server List" onClick={() => { setCurrentServer(null) }}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Branch Management</h1>
        </div>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-destructive font-medium">Failed to load branches</p>
            <p className="text-xs text-muted-foreground mt-1">{error?.message || 'An unexpected error occurred'}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ['branches'] })}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to Server List" onClick={() => { setCurrentServer(null) }}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Branch Management</h1>
            {server && (
              <p className="text-muted-foreground text-sm mt-0.5">
                Server: <span className="font-medium text-foreground">{server.name}</span> — {branches.length} {branches.length === 1 ? 'branch' : 'branches'}
              </p>
            )}
          </div>
        </div>
        {branchTab === 'branches' && (
          <Button size="sm" onClick={() => setShowBranchDialog(true)}>
            <Plus className="size-4" />
            New Branch
          </Button>
        )}
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b pb-px">
        <button
          onClick={() => setBranchTab('branches')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-all flex items-center gap-2 -mb-px ${
            branchTab === 'branches'
              ? 'border-primary text-foreground bg-muted/30'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <GitBranch className="size-4" />
          Active Branches
        </button>
        <button
          onClick={() => setBranchTab('activity')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-all flex items-center gap-2 -mb-px ${
            branchTab === 'activity'
              ? 'border-primary text-foreground bg-muted/30'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Activity className="size-4" />
          Activity & Logs
          {serverLogs.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {serverLogs.length}
            </Badge>
          )}
        </button>
      </div>

      {branchTab === 'branches' ? (
        <div className="space-y-6">
          {/* Default Branch */}
          {defaultBranch && (
            <Card className="border-primary/30">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="size-4 text-yellow-500" />
                    <CardTitle className="text-sm font-medium">Default Branch</CardTitle>
                  </div>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                    Main
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <GitBranch className="size-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm font-semibold">{defaultBranch.name}</span>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Wrench className="size-3" />
                          {defaultBranch.tools?.length ?? 0} tools
                        </span>
                        {defaultBranch.commitMessage && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="size-3" />
                            {defaultBranch.commitMessage}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {format(new Date(defaultBranch.createdAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <BranchStatusBadge status={defaultBranch.status} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Separator */}
          {defaultBranch && otherBranches.length > 0 && (
            <div className="flex items-center gap-4">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Other Branches
              </span>
              <Separator className="flex-1" />
            </div>
          )}

          {/* Other Branches */}
          {otherBranches.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-12">
              <GitBranch className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {defaultBranch ? 'No additional branches' : 'No branches yet'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {defaultBranch ? 'Create a branch to start working on features' : 'Create a server first to start using branches'}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {otherBranches.map((branch) => (
                <Card key={branch.id} className="hover:border-muted-foreground/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <GitBranch className="size-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{branch.name}</span>
                            <BranchStatusBadge status={branch.status} />
                            {branch.children?.length > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {branch.children.length} {branch.children.length === 1 ? 'child' : 'children'}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Wrench className="size-3" />
                              {branch.tools?.length ?? 0} tools
                            </span>
                            {branch.commitMessage && (
                              <span className="flex items-center gap-1 truncate max-w-48">
                                <MessageSquare className="size-3" />
                                {branch.commitMessage}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              {format(new Date(branch.createdAt), 'MMM d, yyyy')}
                            </span>
                            {branch.parent && (
                              <span className="flex items-center gap-1">
                                from <ChevronRight className="size-3" />
                                {branch.parent.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 ml-2 shrink-0">
                        {branch.status === 'active' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => mergeMutation.mutate(branch.id)}
                              disabled={mergeMutation.isPending}
                              title="Merge into default branch"
                            >
                              <GitMerge className="size-3.5" />
                              Merge
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => revertMutation.mutate(branch.id)}
                              disabled={revertMutation.isPending}
                              title="Revert to snapshot"
                              aria-label="Revert branch to snapshot"
                            >
                              <RotateCcw className="size-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => archiveMutation.mutate(branch.id)}
                              title="Archive branch"
                              aria-label="Archive branch"
                            >
                              <Archive className="size-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" title="Delete branch" aria-label="Delete branch">
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Branch</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete &quot;{branch.name}&quot;? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(branch.id)}
                                    className="bg-destructive text-white hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                        {branch.status === 'merged' && (
                          <Badge variant="secondary" className="text-xs">Already merged</Badge>
                        )}
                        {branch.status === 'archived' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              api.put(`/api/branches/${branch.id}`, { status: 'active' })
                                .then(() => {
                                  queryClient.invalidateQueries({ queryKey: ['branches'] })
                                  triggerRefreshBranches()
                                  toast.success('Branch restored')
                                })
                                .catch((err: any) => {
                                  toast.error(err.message || 'Failed to restore branch')
                                })
                            }}
                          >
                            Restore
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {isLoadingLogs ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Card key={idx}>
                  <CardContent className="p-4 flex gap-4">
                    <Skeleton className="size-10 rounded-lg shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-1/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : serverLogs.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16">
              <Activity className="size-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold mb-1">No Activity Logged</h3>
              <p className="text-muted-foreground text-sm max-w-md text-center">
                Operations performed on branches, tools, or deployments for this server will appear here.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {serverLogs.map((log: LogItem) => (
                <LogTimelineItem
                  key={log.id}
                  log={log}
                  isExpanded={expandedLogId === log.id}
                  onToggle={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                  logDetail={logDetail}
                  isLoadingDetail={isLoadingDetail}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
