'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'
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
  Loader2,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useState } from 'react'

interface ToolItem {
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
  connections: { connection: { id: string; name: string; status: string; host: string; database: string }; fileNames: string; isActive: boolean }[]
  branches: BranchItem[]
  tools: ToolItem[]
  deployments: { id: string; version: string; status: string; toolCount: number; changelog: string | null; deployedAt: string | null; createdAt: string }[]
  createdAt: string
  updatedAt: string
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-blue-500/15 text-blue-500 border-blue-500/20' },
    staging: { label: 'Staging', className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20' },
    deployed: { label: 'Deployed', className: 'bg-green-500/15 text-green-500 border-green-500/20' },
    active: { label: 'Active', className: 'bg-green-500/15 text-green-500 border-green-500/20' },
    merged: { label: 'Merged', className: 'bg-muted text-muted-foreground' },
    archived: { label: 'Archived', className: 'bg-orange-500/15 text-orange-500 border-orange-500/20' },
  }
  const { label, className } = config[status] || { label: status, className: '' }
  return <Badge variant="outline" className={className}>{label}</Badge>
}

function ToolRow({ tool, onToggle, onEdit, onDelete, readOnly }: { tool: ToolItem; onToggle?: () => void; onEdit?: () => void; onDelete?: () => void; readOnly?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors group">
      <div className="flex items-center gap-3">
        <Wrench className="size-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{tool.name}</span>
        {tool.category && (
          <Badge variant="secondary" className="text-xs">{tool.category}</Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!readOnly && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mr-2">
            {onEdit && (
              <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
                <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" className="size-7" onClick={onDelete}>
                <Trash2 className="size-3.5 text-destructive hover:text-destructive/90" />
              </Button>
            )}
          </div>
        )}
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onToggle}
          >
            {tool.isEnabled ? (
              <Power className="size-3.5 text-green-500" />
            ) : (
              <PowerOff className="size-3.5 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

export function ServerDetailPage() {
  const currentServerId = useAppStore((s) => s.currentServerId)
  const serverMode = useAppStore((s) => s.serverMode)
  const refreshServers = useAppStore((s) => s.refreshServers)
  const setServerMode = useAppStore((s) => s.setServerMode)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setCurrentServer = useAppStore((s) => s.setCurrentServer)
  const setCurrentBranch = useAppStore((s) => s.setCurrentBranch)
  const currentBranchId = useAppStore((s) => s.currentBranchId)
  const setShowToolDialog = useAppStore((s) => s.setShowToolDialog)
  const setShowBranchDialog = useAppStore((s) => s.setShowBranchDialog)
  const setShowConfigDialog = useAppStore((s) => s.setShowConfigDialog)
  const setShowServerDialog = useAppStore((s) => s.setShowServerDialog)
  const setShowAiDialog = useAppStore((s) => s.setShowAiDialog)
  const triggerRefreshTools = useAppStore((s) => s.triggerRefreshTools)

  const queryClient = useQueryClient()
  const [localRefreshKey, setLocalRefreshKey] = useState(0)
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)

  // Generate All Tools Mutation (Async Job Polling)
  const generateAllMutation = useMutation({
    mutationFn: async () => {
      setIsGeneratingAll(true)
      
      // 1. Start the job
      const res = await fetch(`/api/servers/${currentServerId}/generate-tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: currentBranchId }) // though the backend might not use branchId right now
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start tool generation job')
      }
      
      const jobId = data.data.jobId
      
      // 2. Poll for completion
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
        
        const statusRes = await fetch(`/api/servers/${currentServerId}/generate-tools/status`)
        const statusData = await statusRes.json()
        
        if (!statusRes.ok || !statusData.success) {
          throw new Error(statusData.error || 'Failed to poll job status')
        }
        
        const job = statusData.data
        if (job.status === 'done') {
          return job // Return job data containing toolsCreated count
        }
        if (job.status === 'failed') {
          throw new Error(job.error || 'Tool generation failed during execution')
        }
        // If 'running' or 'pending', loop continues
      }
    },
    onSuccess: (jobData) => {
      setIsGeneratingAll(false)
      toast.success(`Generated ${jobData.toolsCreated || 'all'} tools successfully!`)
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      triggerRefreshTools()
    },
    onError: (err: any) => {
      setIsGeneratingAll(false)
      toast.error(err.message || 'Failed to generate tools')
    }
  })

  // Toggle tool enabled mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const res = await fetch(`/api/servers/${currentServerId}/tools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !isEnabled }),
      })
      if (!res.ok) throw new Error('Failed to toggle tool')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
    },
    onError: () => {
      toast.error('Failed to toggle tool')
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/servers/${currentServerId}/tools/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete tool')
    },
    onSuccess: () => {
      toast.success('Tool deleted')
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      triggerRefreshTools()
    },
    onError: () => {
      toast.error('Failed to delete tool')
    },
  })

  const { data: server, isLoading, isError } = useQuery<ServerDetail>({
    queryKey: ['server', currentServerId, refreshServers, localRefreshKey],
    queryFn: () => fetch(`/api/servers/${currentServerId}`).then(r => r.json()).then(res => res.data),
    enabled: !!currentServerId,
  })

  // Auto-set the default branch so tool creation always has a valid branchId
  // Must be ABOVE early returns to follow React rules of hooks
  useEffect(() => {
    if (server?.branches) {
      const def = server.branches.find(b => b.isDefault)
      if (def) setCurrentBranch(def.id)
    }
  }, [server, setCurrentBranch])

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

  const defaultBranch = server.branches.find(b => b.isDefault)
  const branchTools = defaultBranch?.tools ?? []
  const activeTools = branchTools.filter(t => t.isEnabled)
  const lastDeployment = server.deployments?.[0]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setCurrentServer(null)
              setCurrentView('servers')
            }}
          >
            <ArrowLeft className="size-4" />
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

      {/* Server Info Card */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Server Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-xs text-muted-foreground">Version</span>
              <p className="text-sm font-medium">v{server.version}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Connections</span>
              <p className="text-sm font-medium">{server.connections.length}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Active Tools</span>
              <p className="text-sm font-medium">{activeTools.length}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Created</span>
              <p className="text-sm font-medium">{format(new Date(server.createdAt), 'MMM d, yyyy')}</p>
            </div>
          </div>
          {server.connections.length > 0 && (
            <>
              <Separator className="my-4" />
              <div>
                <span className="text-xs text-muted-foreground mb-2 block">Connections</span>
                <div className="flex flex-wrap gap-2">
                  {(server.connections ?? []).filter(c => c.isActive).map((conn) => (
                    <div key={conn.connection.id} className="flex items-center gap-1.5 bg-muted rounded-md px-2.5 py-1 text-xs">
                      <Link2 className="size-3 text-muted-foreground" />
                      <span className="font-medium">{conn.connection.name}</span>
                      <span className="text-muted-foreground">({conn.connection.database})</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Mode Tabs */}
      <Tabs value={serverMode} onValueChange={(v) => setServerMode(v as typeof serverMode)}>
        <TabsList>
          <TabsTrigger value="edit">
            <Pencil className="size-3.5" />
            Edit
          </TabsTrigger>
          <TabsTrigger value="staging">
            <Eye className="size-3.5" />
            Staging
          </TabsTrigger>
          <TabsTrigger value="deployed">
            <Rocket className="size-3.5" />
            Deployed
          </TabsTrigger>
        </TabsList>

        {/* Edit Mode */}
        <TabsContent value="edit">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Tools ({activeTools.length} active)</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowAiDialog(true)}>
                        <Sparkles className="size-3.5" />
                        AI Assistant
                      </Button>
                      <Button size="sm" onClick={() => setShowToolDialog(true)}>
                        <Plus className="size-3.5" />
                        Add Tool
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="max-h-96 overflow-y-auto">
                  {branchTools.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Wrench className="size-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">No tools configured yet</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Add tools manually or use the AI Assistant</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {branchTools.map(tool => (
                        <ToolRow 
                          key={tool.id} 
                          tool={tool} 
                          onToggle={() => toggleMutation.mutate({ id: tool.id, isEnabled: tool.isEnabled })}
                          onEdit={() => setShowToolDialog(true, tool.id)}
                          onDelete={() => {
                            if (confirm('Are you sure you want to delete this tool?')) {
                              deleteMutation.mutate(tool.id)
                            }
                          }}
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
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Branches</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setShowBranchDialog(true)}>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="max-h-64 overflow-y-auto">
                  {server.branches.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No branches</p>
                  ) : (
                    <div className="divide-y">
                      {server.branches.map(branch => (
                        <div key={branch.id} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-2">
                            <GitBranch className="size-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{branch.name}</span>
                            {branch.isDefault && (
                              <Badge variant="secondary" className="text-xs">default</Badge>
                            )}
                          </div>
                          <StatusBadge status={branch.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start gap-2" size="sm" onClick={() => setShowConfigDialog(true)}>
                    <FileJson className="size-3.5" />
                    Generate Configuration
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" size="sm" onClick={() => setShowAiDialog(true)}>
                    <Sparkles className="size-3.5" />
                    AI-Powered Suggestions
                  </Button>
                  <Button 
                    variant="secondary" 
                    className="w-full justify-start gap-2 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20" 
                    size="sm" 
                    onClick={() => generateAllMutation.mutate()}
                    disabled={isGeneratingAll || !currentBranchId}
                  >
                    {isGeneratingAll ? <Loader2 className="size-3.5 animate-spin" /> : <Brain className="size-3.5" />}
                    {isGeneratingAll ? 'Generating...' : 'Auto-Generate Suite'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Staging Mode */}
        <TabsContent value="staging">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Tools Preview (Staging)</CardTitle>
                  <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/20">
                    Read-Only Preview
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                {branchTools.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Wrench className="size-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No tools to preview</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {branchTools.map(tool => (
                      <ToolRow key={tool.id} tool={tool} readOnly />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {lastDeployment && (
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-medium">Comparison with Current Deployment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Current Deployment</span>
                      <p className="text-sm font-medium">v{lastDeployment.version}</p>
                      <p className="text-xs text-muted-foreground">{lastDeployment.toolCount} tools</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Staging Version</span>
                      <p className="text-sm font-medium">{activeTools.length} tools</p>
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

            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/servers/${currentServerId}/deployments`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ changelog: `Deploy from staging - ${activeTools.length} tools` })
                    })
                    if (res.ok) {
                      toast.success('Server deployed to production!')
                      setLocalRefreshKey(k => k + 1)
                    } else {
                      toast.error('Failed to deploy')
                    }
                  } catch {
                    toast.error('Failed to deploy')
                  }
                }}
              >
                <Rocket className="size-4" />
                Deploy to Production
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Deployed Mode */}
        <TabsContent value="deployed">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Deployed Tools</CardTitle>
                  <Badge variant="outline" className="bg-green-500/15 text-green-500 border-green-500/20">
                    Production
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                {lastDeployment ? (
                  <>
                    <div className="flex items-center gap-3 mb-4 text-sm text-muted-foreground">
                      <Clock className="size-3.5" />
                      <span>Version {lastDeployment.version} — Deployed {lastDeployment.deployedAt ? format(new Date(lastDeployment.deployedAt), 'MMM d, yyyy HH:mm') : 'recently'}</span>
                    </div>
                    <div className="divide-y">
                      {branchTools.filter(t => t.isEnabled).map(tool => (
                        <ToolRow key={tool.id} tool={tool} readOnly />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Rocket className="size-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No deployments yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Deploy from staging to see production tools here</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Deployment History */}
            {server.deployments.length > 0 && (
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-medium">Deployment History</CardTitle>
                </CardHeader>
                <CardContent className="max-h-64 overflow-y-auto">
                  <div className="divide-y">
                    {server.deployments.map(deployment => (
                      <div key={deployment.id} className="flex items-center justify-between py-2.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">v{deployment.version}</span>
                            <StatusBadge status={deployment.status} />
                          </div>
                          {deployment.changelog && (
                            <p className="text-xs text-muted-foreground">{deployment.changelog}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {deployment.deployedAt
                            ? format(new Date(deployment.deployedAt), 'MMM d')
                            : format(new Date(deployment.createdAt), 'MMM d')}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => setShowBranchDialog(true)}
              >
                <GitBranch className="size-4" />
                Create Edit Branch
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
