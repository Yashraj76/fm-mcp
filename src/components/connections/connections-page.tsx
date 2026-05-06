'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { useToast } from '@/hooks/use-toast'
import {
  Plus,
  Database,
  MoreVertical,
  Pencil,
  Zap,
  Trash2,
  Eye,
  Server,
  CircleDot,
} from 'lucide-react'
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { SchemaExplorerInline } from './schema-explorer'

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

const statusConfig: Record<string, { icon: typeof CircleDot; color: string; badge: string; label: string }> = {
  connected: {
    icon: CircleDot,
    color: 'text-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
    label: 'Connected',
  },
  disconnected: {
    icon: CircleDot,
    color: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground border-border',
    label: 'Disconnected',
  },
  error: {
    icon: CircleDot,
    color: 'text-red-500',
    badge: 'bg-red-500/15 text-red-500 border-red-500/25',
    label: 'Error',
  },
}

export function ConnectionsPage() {
  const { setShowConnectionDialog } = useAppStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [schemaConnectionId, setSchemaConnectionId] = useState<string | null>(null)

  const { data: connections, isLoading } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => fetch('/api/connections').then((r) => r.json()),
  })

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/connections/${id}/test`)
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      toast({
        title: data.success ? 'Connection Successful' : 'Connection Failed',
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to test connection',
        variant: 'destructive',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/connections/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setDeleteId(null)
      toast({
        title: 'Connection Deleted',
        description: 'The connection has been removed.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete connection',
        variant: 'destructive',
      })
    },
  })

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Skeleton className="h-6 w-48 mb-1" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold">FileMaker Connections</h2>
          <p className="text-sm text-muted-foreground">
            Manage your FileMaker Data API connections
          </p>
        </div>
        <Button onClick={() => setShowConnectionDialog(true, null)}>
          <Plus className="size-4 mr-2" />
          New Connection
        </Button>
      </div>

      {/* Connection Cards */}
      {!connections || connections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted mb-4">
              <Database className="size-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No connections yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Add a FileMaker Data API connection to start building MCP tools.
            </p>
            <Button onClick={() => setShowConnectionDialog(true, null)}>
              <Plus className="size-4 mr-2" />
              Add Connection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {connections.map((conn) => {
            const config = statusConfig[conn.status] || statusConfig.disconnected
            const StatusIcon = config.icon
            const isTesting = testMutation.isPending && testMutation.variables === conn.id

            return (
              <Card
                key={conn.id}
                className="py-0 gap-0 hover:border-foreground/20 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10 shrink-0">
                        <Database className="size-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{conn.name}</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {conn.host}:{conn.port}
                        </p>
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
                          <Pencil className="size-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => testMutation.mutate(conn.id)}
                          disabled={isTesting}
                        >
                          <Zap className="size-4 mr-2" />
                          {isTesting ? 'Testing...' : 'Test Connection'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSchemaConnectionId(conn.id)}>
                          <Eye className="size-4 mr-2" />
                          Browse Schema
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteId(conn.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Server className="size-3" />
                      <span className="truncate">{conn.database}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[10px] ${config.badge}`}>
                        <StatusIcon className="size-2.5 mr-1" />
                        {config.label}
                      </Badge>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        {conn.lastTested ? (
                          <span>
                            {formatDistanceToNow(new Date(conn.lastTested), { addSuffix: false })}
                          </span>
                        ) : (
                          <span>Not tested</span>
                        )}
                      </div>
                    </div>

                    {conn.lastError && (
                      <p className="text-[11px] text-red-400 truncate" title={conn.lastError}>
                        {conn.lastError}
                      </p>
                    )}

                    {conn.version && (
                      <p className="text-[11px] text-muted-foreground">
                        FM {conn.version} &middot; {conn.authType}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this connection? This action cannot be undone.
              All associated servers and configurations will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schema Explorer */}
      {schemaConnectionId && (
        <SchemaExplorerInline
          connectionId={schemaConnectionId}
          onClose={() => setSchemaConnectionId(null)}
        />
      )}
    </div>
  )
}
