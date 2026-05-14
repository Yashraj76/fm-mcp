'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Server, ExternalLink, Pencil, Rocket, FileJson, Trash2, Link2, Wrench } from 'lucide-react'
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

interface ServerFromAPI {
  id: string
  name: string
  description: string | null
  version: string
  status: string
  connections: { connection: { id: string; name: string; host: string; status: string; database: string }; fileNames: string; isActive: boolean }[]
  branches: { id: string; name: string; status: string; isDefault: boolean }[]
  tools: { id: string; name: string; isEnabled: boolean; category: string | null }[]
  deployments: { id: string; version: string; status: string; toolCount: number; changelog: string | null; deployedAt: string | null; createdAt: string }[]
  _count: { tools: number; deployments: number; branches: number; connections: number }
  createdAt: string
  updatedAt: string
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-blue-500/15 text-blue-500 border-blue-500/20' },
    staging: { label: 'Staging', className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20' },
    deployed: { label: 'Deployed', className: 'bg-green-500/15 text-green-500 border-green-500/20' },
    error: { label: 'Error', className: 'bg-red-500/15 text-red-500 border-red-500/20' },
  }
  const { label, className } = config[status] || config.draft
  return <Badge variant="outline" className={className}>{label}</Badge>
}

function ServerCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </CardFooter>
    </Card>
  )
}

export function ServersPage() {
  const queryClient = useQueryClient()
  const { setCurrentView, setCurrentServer, setShowServerDialog, setShowConfigDialog, refreshServers } = useAppStore()

  const { data: servers = [], isLoading, isError, error } = useQuery<ServerFromAPI[]>({
    queryKey: ['servers', refreshServers],
    queryFn: async () => {
      const res = await fetch('/api/servers')
      if (!res.ok) throw new Error('Failed to fetch servers')
      return res.json().then(r => r.data)
    },
    retry: 1,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/servers/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Delete failed') })
      return r.json()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Server deleted successfully')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete server'),
  })

  const deployMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/servers/${id}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changelog: 'Quick deploy from server card' }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Server deployed successfully')
    },
    onError: () => toast.error('Failed to deploy server'),
  })

  const handleOpen = (id: string) => {
    setCurrentServer(id)
    setCurrentView('server-detail')
  }

  const handleEdit = (id: string) => {
    setCurrentServer(id)
    setShowServerDialog(true, id)
  }

  const handleGenerateConfig = (id: string) => {
    setCurrentServer(id)
    setShowConfigDialog(true)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MCP Servers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your MCP servers for FileMaker database connections
          </p>
        </div>
        <Button onClick={() => setShowServerDialog(true)} size="sm">
          <Plus className="size-4" />
          New Server
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ServerCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-destructive font-medium">Failed to load servers</p>
            <p className="text-xs text-muted-foreground mt-1">{error?.message || 'An unexpected error occurred'}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ['servers'] })}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : servers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <Server className="size-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No servers yet</h3>
          <p className="text-muted-foreground text-sm mb-4 text-center max-w-md">
            Create your first MCP server to start building tools for FileMaker database interactions.
          </p>
          <Button onClick={() => setShowServerDialog(true)} variant="outline">
            <Plus className="size-4" />
            Create your first server
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => {
            const connCount = server.connections?.length ?? server._count?.connections ?? 0
            const toolCount = server.tools?.filter(t => t.isEnabled).length ?? server._count?.tools ?? 0
            return (
              <Card
                key={server.id}
                className="group hover:border-primary/30 transition-colors"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="flex items-center gap-2 truncate">
                        <Server className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{server.name}</span>
                      </CardTitle>
                      {server.description && (
                        <CardDescription className="mt-1 line-clamp-2">
                          {server.description}
                        </CardDescription>
                      )}
                    </div>
                    <StatusBadge status={server.status} />
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Link2 className="size-3.5" />
                      {connCount} {connCount === 1 ? 'connection' : 'connections'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Wrench className="size-3.5" />
                      {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground/70">
                    v{server.version}
                  </div>
                </CardContent>

                <CardFooter className="gap-2 flex-wrap">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleOpen(server.id)}
                    className="flex-1"
                  >
                    <ExternalLink className="size-3.5" />
                    Open
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(server.id)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deployMutation.mutate(server.id)}
                    disabled={server.status === 'deployed'}
                  >
                    <Rocket className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenerateConfig(server.id)}
                  >
                    <FileJson className="size-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Server</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete &quot;{server.name}&quot;? This will permanently
                          remove the server, all its branches, tools, and deployment history.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(server.id)}
                          className="bg-destructive text-white hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
