'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import {
  Plus, Database, MoreVertical, Pencil, Zap, Trash2,
  Server, CircleDot, Layout, ServerIcon, ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { SchemaBrowser } from './schema-browser'
import { ServerConnectionDialog } from './server-connection-dialog'
import { DatabasePicker } from './database-picker'

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

const statusConfig: Record<string, { color: string; badge: string; label: string }> = {
  connected:    { color: 'text-emerald-500', badge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25', label: 'Connected' },
  disconnected: { color: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground border-border', label: 'Disconnected' },
  error:        { color: 'text-red-500', badge: 'bg-red-500/15 text-red-500 border-red-500/25', label: 'Error' },
}
const serverStatusConfig: Record<string, { dot: string; badge: string }> = {
  online:  { dot: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  error:   { dot: 'bg-red-500', badge: 'bg-red-500/15 text-red-400 border-red-500/25' },
  unknown: { dot: 'bg-white/20', badge: 'bg-white/10 text-white/40 border-white/15' },
}

export function ConnectionsPage() {
  const { setShowConnectionDialog } = useAppStore()
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
  const { data: connections, isLoading: loadingConns } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => fetch('/api/connections').then((r) => r.json()).then((d) => d.data ?? []),
  })
  const { data: servers, isLoading: loadingServers } = useQuery<FMServer[]>({
    queryKey: ['server-connections'],
    queryFn: () => fetch('/api/server-connections').then((r) => r.json()).then((d) => d.data ?? []),
  })

  // ── Mutations ──
  const testMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/connections/${id}/test`, { method: 'POST' }).then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      toast({
        title: data.success ? 'Connection Successful' : 'Connection Failed',
        description: data.success ? 'Connected to FileMaker Server.' : (data.error || 'Could not connect.'),
        variant: data.success ? 'default' : 'destructive',
      })
    },
  })

  const testServerMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/server-connections/${id}/test`, { method: 'POST' }).then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['server-connections'] })
      toast({
        title: data.success ? 'Server Online' : 'Server Unreachable',
        description: data.success ? `Connected in ${data.data?.duration}ms` : (data.error || 'Failed to connect'),
        variant: data.success ? 'default' : 'destructive',
      })
    },
  })

  const deleteConnectionMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/connections/${id}`, { method: 'DELETE' }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setDeleteConnectionId(null)
      toast({ title: 'Connection Deleted' })
    },
  })

  const deleteServerMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/server-connections/${id}`, { method: 'DELETE' }).then((r) => r.json()),
    onSuccess: (data) => {
      if (!data.success) {
        toast({ title: 'Cannot Delete', description: data.error, variant: 'destructive' })
        return
      }
      queryClient.invalidateQueries({ queryKey: ['server-connections'] })
      setDeleteServerId(null)
      toast({ title: 'Server Removed' })
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

      {/* ════ FM SERVERS SECTION ════ */}
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
            className="h-8 text-xs border-white/15 text-white/70 hover:text-white hover:bg-white/8"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Server
          </Button>
        </div>

        {!servers?.length ? (
          <div className="border border-dashed border-white/15 rounded-xl py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <ServerIcon className="w-5 h-5 text-white/30" />
            </div>
            <p className="text-sm text-white/40">No FM Servers added yet</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setEditServer(null); setShowServerDialog(true) }}
              className="text-blue-400 hover:text-blue-300 text-xs h-7"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add your first server
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {servers.map((server) => {
              const sc = serverStatusConfig[server.status] || serverStatusConfig.unknown
              return (
                <Card key={server.id} className="py-0 gap-0 bg-[#0d1017] border-white/10 hover:border-white/20 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                          <Server className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium truncate text-white/90">{server.name}</h3>
                          <p className="text-xs text-white/40 truncate">{server.host}:{server.port}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7 text-white/30 hover:text-white shrink-0">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-[#0f1117] border-white/10">
                          <DropdownMenuItem onClick={() => { setEditServer(server); setShowServerDialog(true) }} className="text-white/70">
                            <Pencil className="size-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => testServerMutation.mutate(server.id)} className="text-white/70">
                            <Zap className="size-4 mr-2" /> Test Connection
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDbPickerServer(server)} className="text-white/70">
                            <Database className="size-4 mr-2" /> Browse Databases
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-white/10" />
                          <DropdownMenuItem onClick={() => setDeleteServerId(server.id)} className="text-red-400">
                            <Trash2 className="size-4 mr-2" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[10px] ${sc.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} mr-1.5`} />
                        {server.status}
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

      {/* ════ FILE CONNECTIONS SECTION ════ */}
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
            onClick={() => setShowConnectionDialog(true, null)}
            className="h-8 text-xs bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Manual Connection
          </Button>
        </div>

        {!connections?.length ? (
          <div className="border border-dashed border-white/15 rounded-xl py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <Database className="w-5 h-5 text-white/30" />
            </div>
            <p className="text-sm text-white/40">No connections yet</p>
            <p className="text-xs text-white/25 max-w-xs">Add a server above and pick a database, or add a manual connection</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {connections.map((conn) => {
              const config = statusConfig[conn.status] || statusConfig.disconnected
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
                          <Button variant="ghost" size="icon" className="size-8 shrink-0">
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
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Server className="size-3" />
                        <span className="truncate">{conn.database}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={`text-[10px] ${config.badge}`}>
                          <CircleDot className="size-2.5 mr-1" />
                          {config.label}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {conn.lastTested
                            ? <span suppressHydrationWarning>{formatDistanceToNow(new Date(conn.lastTested), { addSuffix: false })} ago</span>
                            : 'Not tested'}
                        </span>
                      </div>
                      {conn.lastError && (
                        <p className="text-[11px] text-red-400 truncate">{conn.lastError}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ════ DIALOGS ════ */}

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
          onClose={() => setSchemaBrowserId(null)}
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
