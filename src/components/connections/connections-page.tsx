'use client'

import { useQuery, useInfiniteQuery, InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/utils/api-client'
import {
  Plus, Database, MoreVertical, Pencil, Zap, Trash2,
  Server, CircleDot, Layout, ServerIcon, ChevronRight, CheckCircle2,
} from 'lucide-react'
import { useState } from 'react'
import { SchemaBrowser } from './schema-browser'
import { ServerConnectionDialog } from './server-connection-dialog'
import { DatabasePicker } from './database-picker'
import {
  deriveConnectionBadgeState,
  deriveFMServerBadgeState,
  CONNECTION_BADGE,
  FM_SERVER_BADGE,
} from '@/lib/status/connection-status'

interface Connection {
  id: string
  name: string
  host: string
  port: number
  database: string
  authType: string
  sslVerify: boolean
  status: string
  lastTested: string | null
  lastError: string | null
  version: string | null
  hasBrowsedSchema: boolean
  schemaLayoutCount: number
  schemaTableCount: number
  createdAt: string
  updatedAt: string
}

interface FMServer {
  id: string
  name: string
  host: string
  port: number
  adminUsername: string
  sslVerify: boolean
  status: string
  lastTestedAt: string | null
  lastError: string | null
  _count?: { connections: number }
}

type ConnectionPage = {
  data: Connection[]
  pagination: { hasMore: boolean; nextCursor: string | null; limit: number }
}

export function ConnectionsPage() {
  const setShowConnectionDialog = useAppStore((s) => s.setShowConnectionDialog)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // State for dialogs
  const [deleteConnectionId, setDeleteConnectionId] = useState<string | null>(null)
  const [deleteServerId, setDeleteServerId] = useState<string | null>(null)
  const [schemaBrowserId, setSchemaBrowserId] = useState<string | null>(null)
  const [showServerDialog, setShowServerDialog] = useState(false)
  const [editServer, setEditServer] = useState<FMServer | null>(null)
  const [dbPickerServer, setDbPickerServer] = useState<FMServer | null>(null)

  // ── Queries ──
  const {
    data: connectionPages,
    isLoading: loadingConns,
    isError: isConnsError,
    error: connsError,
    fetchNextPage: fetchMoreConnections,
    hasNextPage: hasMoreConnections,
    isFetchingNextPage: isFetchingMoreConnections,
  } = useInfiniteQuery<ConnectionPage, Error, InfiniteData<ConnectionPage>, readonly ['connections'], string | null>({
    queryKey: ['connections'] as const,
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/api/connections?cursor=${pageParam}`
        : '/api/connections'
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok || json.success === false)
        throw new Error(json.error || 'Failed to load connections')
      return json as ConnectionPage
    },
    getNextPageParam: (lastPage): string | null | undefined =>
      lastPage.pagination.hasMore ? lastPage.pagination.nextCursor : undefined,
    initialPageParam: null,
  })
  const connections = connectionPages?.pages.flatMap((p) => p.data) ?? []
  const { data: servers, isLoading: loadingServers, isError: isServersError, error: serversError } = useQuery<FMServer[]>({
    queryKey: ['server-connections'],
    queryFn: () => api.get<FMServer[]>('/api/server-connections'),
  })

  // ── Mutations ──
  const testMutation = useMutation({
    mutationFn: (id: string) => api.post<any>(`/api/connections/${id}/test`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      toast({
        title: 'Connection Successful',
        description: 'Connected to FileMaker Server.',
        variant: 'default',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Connection Failed',
        description: err.message || 'Could not connect.',
        variant: 'destructive',
      })
    },
  })

  const testServerMutation = useMutation({
    mutationFn: (id: string) => api.post<any>(`/api/server-connections/${id}/test`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['server-connections'] })
      toast({
        title: 'Server Online',
        description: `Connected in ${data?.duration}ms`,
        variant: 'default',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Server Unreachable',
        description: err.message || 'Failed to connect',
        variant: 'destructive',
      })
    },
  })

  const deleteConnectionMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/connections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setDeleteConnectionId(null)
      toast({ title: 'Connection Deleted' })
    },
    onError: (err: any) => {
      toast({
        title: 'Delete Failed',
        description: err.message || 'Could not delete connection',
        variant: 'destructive',
      })
    },
  })

  const deleteServerMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/server-connections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-connections'] })
      setDeleteServerId(null)
      toast({ title: 'Server Removed' })
    },
    onError: (err: any) => {
      toast({
        title: 'Cannot Delete',
        description: err.message || 'Could not delete server',
        variant: 'destructive',
      })
    },
  })

  const isLoading = loadingConns || loadingServers

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-3">
              <Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-48" />
            </CardContent></Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-8">

      {/* ==== FM SERVERS SECTION ==== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <ServerIcon className="w-4 h-4 text-blue-400" />
              FileMaker Servers
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Admin API connections for browsing hosted databases
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditServer(null); setShowServerDialog(true) }}
            className="h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Server
          </Button>
        </div>

        {isServersError ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-destructive font-medium">Failed to load FM Servers</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(serversError as any)?.message || 'An unexpected error occurred'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['server-connections'] })}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : !servers?.length ? (
          <div className="border border-dashed border-border rounded-xl py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <ServerIcon className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No FM Servers added yet</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setEditServer(null); setShowServerDialog(true) }}
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-xs h-7"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add your first server
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {servers.map((server) => {
              const sc = FM_SERVER_BADGE[deriveFMServerBadgeState(server.status)]
              return (
                <Card key={server.id} className="py-0 gap-0 hover:border-foreground/20 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                          <Server className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium truncate">{server.name}</h3>
                          <p className="text-xs text-muted-foreground truncate">{server.host}:{server.port}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Server options">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditServer(server); setShowServerDialog(true) }}>
                            <Pencil className="size-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => testServerMutation.mutate(server.id)}>
                            <Zap className="size-4 mr-2" /> Test Connection
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDbPickerServer(server)}>
                            <Database className="size-4 mr-2" /> Browse Databases
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteServerId(server.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="size-4 mr-2" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[10px] ${sc.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} mr-1.5`} />
                        {sc.label}
                      </Badge>
                      <button
                        onClick={() => setDbPickerServer(server)}
                        className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                      >
                        Pick Database <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    {server.lastError && (
                      <p className="text-[10px] text-red-400/80 mt-1.5 truncate">{server.lastError}</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ==== FILE CONNECTIONS SECTION ==== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-400" />
              File Connections
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Direct file-level connections used by tools and servers
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowConnectionDialog(true, null)}
            className="h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Manual Connection
          </Button>
        </div>

        {isConnsError ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-destructive font-medium">Failed to load file connections</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(connsError as any)?.message || 'An unexpected error occurred'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['connections'] })}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : !connections?.length ? (
          <div className="border border-dashed border-border rounded-xl py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Database className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No connections yet</p>
            <p className="text-xs text-muted-foreground/60 max-w-xs">Add a server above and pick a database, or add a manual connection</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {connections.map((conn) => {
              const badgeState = deriveConnectionBadgeState(conn.status, conn.hasBrowsedSchema)
              const config = CONNECTION_BADGE[badgeState]
              const isTesting = testMutation.isPending && testMutation.variables === conn.id
              return (
                <Card key={conn.id} className="py-0 gap-0 hover:border-foreground/20 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10 shrink-0">
                          <Database className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold truncate">{conn.name}</h3>
                          <p className="text-xs text-muted-foreground truncate">{conn.host}:{conn.port}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Connection options">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setShowConnectionDialog(true, conn.id)}>
                            <Pencil className="size-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => testMutation.mutate(conn.id)} disabled={isTesting}>
                            <Zap className="size-4 mr-2" />
                            {isTesting ? 'Testing…' : 'Test Connection'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSchemaBrowserId(conn.id)}>
                            <Layout className="size-4 mr-2" /> Browse Schema
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteConnectionId(conn.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="size-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-end justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <Badge variant="outline" className={`text-[10px] ${config.badge}`}>
                            <CircleDot className="size-2.5 mr-1" />
                            {config.label}
                          </Badge>
                          {conn.lastError && (
                            <p className="text-[11px] text-red-400 truncate">{conn.lastError}</p>
                          )}
                          {conn.hasBrowsedSchema && (conn.schemaLayoutCount > 0 || conn.schemaTableCount > 0) ? (
                            <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="size-3 shrink-0" />
                              {[
                                conn.schemaLayoutCount > 0 && `${conn.schemaLayoutCount} layout${conn.schemaLayoutCount !== 1 ? 's' : ''}`,
                                conn.schemaTableCount > 0 && `${conn.schemaTableCount} OData table${conn.schemaTableCount !== 1 ? 's' : ''}`,
                              ].filter(Boolean).join(', ')} selected
                            </p>
                          ) : conn.hasBrowsedSchema ? (
                            <p className="text-[11px] text-amber-400">Schema browsed — no selection saved yet</p>
                          ) : (
                            <p className="text-[11px] text-muted-foreground/50">No schema loaded — click Browse Schema</p>
                          )}
                        </div>
                        <button
                          onClick={() => setSchemaBrowserId(conn.id)}
                          className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 shrink-0"
                        >
                          Browse Schema <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            </div>
            {hasMoreConnections && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchMoreConnections()}
                  disabled={isFetchingMoreConnections}
                >
                  {isFetchingMoreConnections ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ==== DIALOGS ==== */}

      {/* Server Connection Dialog */}
      <ServerConnectionDialog
        isOpen={showServerDialog}
        onClose={() => { setShowServerDialog(false); setEditServer(null) }}
        existingServer={editServer}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['server-connections'] })
          setShowServerDialog(false)
          setEditServer(null)
          toast({ title: editServer ? 'Server Updated' : 'Server Added' })
        }}
      />

      {/* Database Picker */}
      {dbPickerServer && (
        <DatabasePicker
          isOpen={!!dbPickerServer}
          onClose={() => setDbPickerServer(null)}
          serverId={dbPickerServer.id}
          serverName={dbPickerServer.name}
          serverHost={dbPickerServer.host}
          onCreateConnection={() => {
            queryClient.invalidateQueries({ queryKey: ['connections'] })
            setDbPickerServer(null)
            toast({ title: 'Connection Created', description: 'File connection added successfully.' })
          }}
        />
      )}

      {/* Schema Browser */}
      {schemaBrowserId && (
        <SchemaBrowser
          connectionId={schemaBrowserId}
          onClose={() => {
            setSchemaBrowserId(null)
            queryClient.invalidateQueries({ queryKey: ['connections'] })
          }}
        />
      )}

      {/* Delete Connection Confirm */}
      <AlertDialog open={!!deleteConnectionId} onOpenChange={(open) => !open && setDeleteConnectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? All associated servers and schemas will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConnectionId && deleteConnectionMutation.mutate(deleteConnectionId)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Server Confirm */}
      <AlertDialog open={!!deleteServerId} onOpenChange={(open) => !open && setDeleteServerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove FM Server</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the server admin entry. Existing file connections will be unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteServerId && deleteServerMutation.mutate(deleteServerId)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
