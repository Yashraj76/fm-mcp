'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
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
  Clock,
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
  server: { name: string }
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
  const { currentServerId, triggerRefreshDeployments, refreshDeployments } = useAppStore()
  const [showDeployDialog, setShowDeployDialog] = useState(false)
  const [changelog, setChangelog] = useState('')
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false)
  const [snapshotConfig, setSnapshotConfig] = useState<string>('')

  const { data: deployments = [], isLoading, isError } = useQuery<DeploymentItem[]>({
    queryKey: ['deployments', currentServerId, refreshDeployments],
    queryFn: () => fetch(`/api/servers/${currentServerId}/deployments`).then(r => r.json()),
    enabled: !!currentServerId,
  })

  const deployMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/servers/${currentServerId}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changelog: changelog || 'New deployment' }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      triggerRefreshDeployments()
      toast.success('Deployment created successfully')
      setShowDeployDialog(false)
      setChangelog('')
    },
    onError: () => toast.error('Failed to create deployment'),
  })

  const rollbackMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      fetch(`/api/servers/${currentServerId}/deployments/${deploymentId}/rollback`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      triggerRefreshDeployments()
      toast.success('Rollback completed successfully')
    },
    onError: () => toast.error('Failed to rollback deployment'),
  })

  const handleViewSnapshot = (deployment: DeploymentItem) => {
    try {
      const config = JSON.parse(deployment.configSnapshot)
      setSnapshotConfig(JSON.stringify(config, null, 2))
    } catch {
      setSnapshotConfig(deployment.configSnapshot)
    }
    setShowSnapshotDialog(true)
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
      <div className="p-6">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">
          Failed to load deployment history.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deployment History</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {deployments.length} {deployments.length === 1 ? 'deployment' : 'deployments'} total
          </p>
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
                    {/* Version & Status Row */}
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

                    {/* Details */}
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

                    {/* Changelog */}
                    {deployment.changelog && (
                      <div className="flex items-start gap-1.5">
                        <MessageSquare className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">{deployment.changelog}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewSnapshot(deployment)}
                      title="View config snapshot"
                    >
                      <Eye className="size-3.5" />
                      Config
                    </Button>
                    {(deployment.status === 'deployed' || deployment.status === 'rolled_back') && index > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" title="Rollback to this version">
                            <RotateCcw className="size-3.5" />
                            Rollback
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Rollback to v{deployment.version}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will roll back the current deployment to version {deployment.version} ({deployment.branchName}).
                              The current deployment will be marked as rolled back. This action will restore the tools
                              from that version&apos;s snapshot.
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
            <DialogDescription>
              The deployed configuration at the time of this deployment.
            </DialogDescription>
          </DialogHeader>
          <pre className="bg-muted rounded-lg p-4 font-mono text-sm overflow-auto max-h-96 whitespace-pre-wrap break-all">
            {snapshotConfig}
          </pre>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(snapshotConfig)
                toast.success('Copied to clipboard')
              }}
            >
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
