'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/utils/api-client'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Server, ExternalLink, Pencil, Rocket, FileJson, Trash2, Link2, Wrench, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import { deriveServerHealthFlags, SERVER_HEALTH_BADGE } from '@/lib/status/connection-status'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ServerFromAPI {
  id: string
  name: string
  description: string | null
  version: string
  status: string
  connections: { isActive: boolean }[]
  tools: { isEnabled: boolean }[]
  deployments: { status: string }[]
  _count: { tools: number; deployments: number; branches: number; connections: number }
  createdAt: string
  updatedAt: string
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
  const router = useRouter()
  const setCurrentServer = useAppStore((s) => s.setCurrentServer)
  const setShowServerDialog = useAppStore((s) => s.setShowServerDialog)
  const setShowConfigDialog = useAppStore((s) => s.setShowConfigDialog)

  const [serverToDelete, setServerToDelete] = useState<ServerFromAPI | null>(null)

  const { data: servers = [], isLoading, isError, error } = useQuery<ServerFromAPI[]>({
    queryKey: ['servers', 'summary'],
    queryFn: () => api.get<ServerFromAPI[]>('/api/servers?summary=true'),
    retry: 1,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/servers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Server deleted successfully')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete server'),
  })

  const deployMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<any>(`/api/servers/${id}/deployments`, {
        changelog: 'Quick deploy from server card',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Server deployed successfully')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to deploy server'),
  })

  const handleOpen = (id: string) => {
    router.push(`/servers/${id}`)
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
            const healthFlags = deriveServerHealthFlags({
              connections: server.connections ?? [],
              tools: server.tools ?? [],
              deployments: server.deployments ?? [],
            })
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
                  {healthFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {healthFlags.map((flag) => (
                        <Badge
                          key={flag}
                          variant="outline"
                          className={`text-[10px] py-0 px-1.5 ${SERVER_HEALTH_BADGE[flag].className}`}
                        >
                          {SERVER_HEALTH_BADGE[flag].label}
                        </Badge>
                      ))}
                    </div>
                  )}
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="px-2">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(server.id)}>
                        <Pencil className="mr-2 size-4" />
                        Edit Server
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => deployMutation.mutate(server.id)} 
                        disabled={server.status === 'deployed'}
                      >
                        <Rocket className="mr-2 size-4" />
                        Deploy
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleGenerateConfig(server.id)}>
                        <FileJson className="mr-2 size-4" />
                        Generate Config
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => setServerToDelete(server)} 
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="mr-2 size-4" />
                        Delete Server
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!serverToDelete} onOpenChange={(open) => !open && setServerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{serverToDelete?.name}&quot;? This will permanently
              remove the server, all its branches, tools, and deployment history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (serverToDelete) deleteMutation.mutate(serverToDelete.id)
                setServerToDelete(null)
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
