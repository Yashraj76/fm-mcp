'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
} from 'lucide-react'
import { format } from 'date-fns'
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

export function BranchesPage() {
  const queryClient = useQueryClient()
  const { currentServerId, setCurrentServer, setCurrentView, setShowBranchDialog, triggerRefreshBranches, refreshBranches } = useAppStore()

  const { data: servers = [] } = useQuery<ServerItem[]>({
    queryKey: ['servers'],
    queryFn: () => fetch('/api/servers').then(r => r.json()),
  })

  const { data: branches = [], isLoading, isError, error } = useQuery<BranchItem[]>({
    queryKey: ['branches', currentServerId, refreshBranches],
    queryFn: async () => {
      const res = await fetch(`/api/servers/${currentServerId}/branches`)
      if (!res.ok) throw new Error('Failed to load branches')
      return res.json()
    },
    enabled: !!currentServerId,
    retry: 1,
  })

  const server = servers.find(s => s.id === currentServerId)

  const mergeMutation = useMutation({
    mutationFn: (branchId: string) =>
      fetch(`/api/servers/${currentServerId}/branches/${branchId}/merge`, { method: 'POST' }).then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Merge failed') })
        return r.json()
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      triggerRefreshBranches()
      toast.success(data.message || 'Branch merged successfully')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to merge branch'),
  })

  const revertMutation = useMutation({
    mutationFn: (branchId: string) =>
      fetch(`/api/servers/${currentServerId}/branches/${branchId}/revert`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      triggerRefreshBranches()
      toast.success('Branch reverted successfully')
    },
    onError: () => toast.error('Failed to revert branch'),
  })

  const archiveMutation = useMutation({
    mutationFn: (branchId: string) =>
      fetch(`/api/servers/${currentServerId}/branches/${branchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      triggerRefreshBranches()
      toast.success('Branch archived')
    },
    onError: () => toast.error('Failed to archive branch'),
  })

  const deleteMutation = useMutation({
    mutationFn: (branchId: string) =>
      fetch(`/api/servers/${currentServerId}/branches/${branchId}`, {
        method: 'DELETE',
      }).then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Delete failed') })
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      triggerRefreshBranches()
      toast.success('Branch deleted')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete branch'),
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
            <Button variant="outline" onClick={() => setCurrentView('servers')}>
              <ArrowLeft className="size-4" />
              Go to Servers
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
          <Button variant="ghost" size="icon" onClick={() => { setCurrentServer(null); setCurrentView('servers') }}>
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
          <Button variant="ghost" size="icon" onClick={() => { setCurrentServer(null); setCurrentView('servers') }}>
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
        <Button size="sm" onClick={() => setShowBranchDialog(true)}>
          <Plus className="size-4" />
          New Branch
        </Button>
      </div>

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
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => archiveMutation.mutate(branch.id)}
                          title="Archive branch"
                        >
                          <Archive className="size-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" title="Delete branch">
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
                          fetch(`/api/servers/${currentServerId}/branches/${branch.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'active' }),
                          }).then(() => {
                            queryClient.invalidateQueries({ queryKey: ['branches'] })
                            triggerRefreshBranches()
                            toast.success('Branch restored')
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
  )
}
