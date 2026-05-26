'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
import { useAppStore } from '@/lib/store'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Rocket,
  RotateCcw,
  Eye,
  Wrench,
  Calendar,
  MessageSquare,
  Tag,
  Plus,
  FileJson,
  Server,
  ArrowLeft,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useState } from 'react'
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

interface DeploymentItem {
  id: string
  serverId: string
  branchId: string
  branchName: string
  status: string
  version: string
  changelog: string | null
  deployedAt: string | null
  rolledBackAt: string | null
  rollbackFrom: string | null
  toolCount: number
  createdAt: string
  configSnapshot: string
  branchSnapshot: string
}

interface ServerItem {
  id: string
  name: string
  status: string
  _count: { tools: number; branches: number; deployments: number }
}

function DeploymentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    deployed: { label: 'Deployed', className: 'bg-green-500/15 text-green-500 border-green-500/20' },
    pending: { label: 'Pending', className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20' },
    deploying: { label: 'Deploying', className: 'bg-blue-500/15 text-blue-500 border-blue-500/20' },
    failed: { label: 'Failed', className: 'bg-red-500/15 text-red-500 border-red-500/20' },
    rolled_back: { label: 'Rolled Back', className: 'bg-orange-500/15 text-orange-500 border-orange-500/20' },
  }
  const { label, className } = config[status] || { label: status, className: '' }
  return <Badge variant="outline" className={className}>{label}</Badge>
}

export function DeploymentsPage() {
  const queryClient = useQueryClient()
  const currentServerId = useAppStore((s) => s.currentServerId)
  const setCurrentServer = useAppStore((s) => s.setCurrentServer)
  const triggerRefreshDeployments = useAppStore((s) => s.triggerRefreshDeployments)
  const refreshDeployments = useAppStore((s) => s.refreshDeployments)
  const [showDeployDialog, setShowDeployDialog] = useState(false)
  const [changelog, setChangelog] = useState('')
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false)
  const [snapshotConfig, setSnapshotConfig] = useState<string>('')

  const { data: servers = [] } = useQuery<ServerItem[]>({
    queryKey: ['servers'],
    queryFn: () => api.get<ServerItem[]>('/api/servers'),
  })

  const { data: deployments = [], isLoading, isError, error } = useQuery<DeploymentItem[]>({
    queryKey: ['deployments', currentServerId, refreshDeployments],
    queryFn: async () => {
      try {
        return await api.get<DeploymentItem[]>(`/api/servers/${currentServerId}/deployments`)
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

  const server = servers.find(s => s.id === currentServerId)

  const deployMutation = useMutation({
    mutationFn: () =>
      api.post<any>(`/api/servers/${currentServerId}/deployments`, {
        changelog: changelog || 'New deployment',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      triggerRefreshDeployments()
      toast.success('Deployment created successfully')
      setShowDeployDialog(false)
      setChangelog('')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create deployment'),
  })

  const rollbackMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      api.post<any>(`/api/deployments/${deploymentId}/rollback`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      triggerRefreshDeployments()
      toast.success('Rollback completed successfully')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to rollback deployment'),
  })

  const handleViewSnapshot = (deployment: DeploymentItem) => {
    try {
      const config = JSON.parse(deployment.configSnapshot || '{}')
      setSnapshotConfig(JSON.stringify(config, null, 2))
    } catch {
      setSnapshotConfig(deployment.configSnapshot || 'No snapshot available')
    }
    setShowSnapshotDialog(true)
  }

  // No server selected
  if (!currentServerId) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deployment History</h1>
          <p className="text-muted-foreground text-sm mt-1">Select a server to view deployments</p>
        </div>
        {servers.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16">
            <Server className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No servers available</h3>
            <p className="text-muted-foreground text-sm mb-4 text-center max-w-md">
              Create an MCP server first before managing deployments.
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
                        {s._count?.deployments ?? 0} deployments
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
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to Servers" asChild>
            <Link href="/servers" onClick={() => setCurrentServer(null)}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Deployment History</h1>
        </div>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-destructive font-medium">Failed to load deployment history</p>
            <p className="text-xs text-muted-foreground mt-1">{error?.message || 'An unexpected error occurred'}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ['deployments'] })}>
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
          <Button variant="ghost" size="icon" aria-label="Back to Servers" asChild>
            <Link href="/servers" onClick={() => setCurrentServer(null)}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Deployment History</h1>
            {server && (
              <p className="text-muted-foreground text-sm mt-0.5">
                Server: <span className="font-medium text-foreground">{server.name}</span> — {deployments.length} {deployments.length === 1 ? 'deployment' : 'deployments'}
              </p>
            )}
          </div>
        </div>
        <Button size="sm" onClick={() => setShowDeployDialog(true)}>
          <Rocket className="size-4" />
          Deploy Current
        </Button>
      </div>

      {/* Deployments List */}
      {deployments.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <Rocket className="size-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No deployments yet</h3>
          <p className="text-muted-foreground text-sm mb-4 text-center max-w-md">
            Deploy your server to create a production version with version tracking and rollback support.
          </p>
          <Button variant="outline" onClick={() => setShowDeployDialog(true)}>
            <Plus className="size-4" />
            Create First Deployment
          </Button>
        </Card>
      ) : (
        <div className="space-y-3 max-h-[calc(100vh-16rem)] overflow-y-auto">
          {deployments.map((deployment, index) => (
            <Card key={deployment.id} className={index === 0 ? 'border-primary/30' : ''}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Tag className="size-3.5 text-muted-foreground" />
                        <span className="text-sm font-bold">v{deployment.version}</span>
                      </div>
                      <DeploymentStatusBadge status={deployment.status} />
                      {index === 0 && deployment.status === 'deployed' && (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                          Current
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Wrench className="size-3" />
                        {deployment.toolCount} tools
                      </span>
                      <span className="flex items-center gap-1">
                        <FileJson className="size-3" />
                        {deployment.branchName}
                      </span>
                      {deployment.deployedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {format(new Date(deployment.deployedAt), 'MMM d, yyyy HH:mm')}
                        </span>
                      )}
                      {deployment.rolledBackAt && (
                        <span className="flex items-center gap-1 text-orange-500">
                          <RotateCcw className="size-3" />
                          Rolled back {format(new Date(deployment.rolledBackAt), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>

                    {deployment.changelog && (
                      <div className="flex items-start gap-1.5">
                        <MessageSquare className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">{deployment.changelog}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewSnapshot(deployment)}
                      title="View config snapshot"
                      aria-label="View config snapshot"
                    >
                      <Eye className="size-3.5" />
                    </Button>
                    {(deployment.status === 'deployed' || deployment.status === 'rolled_back') && index > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" title="Rollback to this version" aria-label={`Rollback to version ${deployment.version}`}>
                            <RotateCcw className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Rollback to v{deployment.version}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will roll back the current deployment to version {deployment.version} ({deployment.branchName}).
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => rollbackMutation.mutate(deployment.id)}
                              className="bg-orange-500 text-white hover:bg-orange-500/90"
                            >
                              Confirm Rollback
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Deploy Dialog */}
      <Dialog open={showDeployDialog} onOpenChange={setShowDeployDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="size-5 text-primary" />
              Deploy Current Version
            </DialogTitle>
            <DialogDescription>
              Create a new deployment with the current server configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="changelog">Changelog</Label>
              <Textarea
                id="changelog"
                placeholder="Describe the changes in this deployment..."
                rows={3}
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeployDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending}
            >
              {deployMutation.isPending ? 'Deploying...' : 'Deploy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snapshot Dialog */}
      <Dialog open={showSnapshotDialog} onOpenChange={setShowSnapshotDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="size-5 text-primary" />
              Configuration Snapshot
            </DialogTitle>
            <DialogDescription>The deployed configuration at the time of this deployment.</DialogDescription>
          </DialogHeader>
          <pre className="bg-muted rounded-lg p-4 font-mono text-sm overflow-auto max-h-96 whitespace-pre-wrap break-all">
            {snapshotConfig}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              navigator.clipboard.writeText(snapshotConfig)
              toast.success('Copied to clipboard')
            }}>
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
