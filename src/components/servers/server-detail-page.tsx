'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import Link from 'next/link'
import { api } from '@/lib/utils/api-client'
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
  RotateCcw,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useState } from 'react'
import { AutoGeneratePreviewDialog } from './auto-generate-preview-dialog'
import { AiPromptToolDialog } from '@/components/ai/ai-prompt-tool-dialog'

interface ToolItem {
  id: string
  name: string
  isEnabled: boolean
  category: string | null
  _branchAction?: string
  _branchToolId?: string
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
  connections: { connection: { id: string; name: string; status: string; host: string; database: string; browsedSchema?: { compiledSchema: string } }; fileNames: string; isActive: boolean }[]
  branches: BranchItem[]
  tools: ToolItem[]
  deployments: { id: string; version: string; status: string; toolCount: number; changelog: string | null; deployedAt: string | null; createdAt: string; snapshot?: string; configSnapshot?: string }[]
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
    <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-200 group mb-2 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2 rounded-lg shrink-0 ${tool.isEnabled ? 'bg-blue-500/10 text-blue-400' : 'bg-neutral-500/10 text-neutral-500'}`}>
          <Wrench className="size-4" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-white truncate tracking-wide">{tool.name}</span>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {tool.category && (
              <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider py-0 px-1.5 bg-neutral-800 text-neutral-300 border-neutral-700">
                {tool.category}
              </Badge>
            )}
            {tool._branchAction && tool._branchAction !== 'inherited' && (
              <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider py-0 px-1.5 ${tool._branchAction === 'modified' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                {tool._branchAction}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!readOnly ? (
          <div className="flex items-center gap-1.5">
            {onEdit && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="size-8 rounded-lg border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/10 text-neutral-400 hover:text-blue-400 transition-all" 
                onClick={onEdit}
                title="Edit Tool"
                aria-label="Edit tool"
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="size-8 rounded-lg border border-white/5 hover:border-red-500/30 hover:bg-red-500/10 text-neutral-400 hover:text-red-400 transition-all" 
                onClick={onDelete}
                title="Delete Tool"
                aria-label="Delete tool"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
            {onToggle && (
              <Button
                variant="ghost"
                size="icon"
                className={`size-8 rounded-lg border transition-all ${
                  tool.isEnabled 
                    ? 'bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20' 
                    : 'bg-neutral-500/5 border-white/5 hover:border-neutral-500/30 text-neutral-500 hover:text-neutral-400 hover:bg-neutral-500/10'
                }`}
                onClick={onToggle}
                title={tool.isEnabled ? 'Disable Tool' : 'Enable Tool'}
                aria-label={tool.isEnabled ? 'Disable tool' : 'Enable tool'}
              >
                <Power className="size-3.5" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] uppercase font-bold tracking-wider py-0.5 px-2 rounded-full border ${
              tool.isEnabled 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-neutral-500/10 border-white/5 text-neutral-500'
            }`}>
              {tool.isEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

interface ServerDetailPageProps {
  serverId?: string
}

export function ServerDetailPage({ serverId }: ServerDetailPageProps) {
  const currentServerId = useAppStore((s) => s.currentServerId)
  const serverMode = useAppStore((s) => s.serverMode)
  const refreshServers = useAppStore((s) => s.refreshServers)
  const setServerMode = useAppStore((s) => s.setServerMode)
  const setCurrentServer = useAppStore((s) => s.setCurrentServer)
  const setCurrentBranch = useAppStore((s) => s.setCurrentBranch)
  const currentBranchId = useAppStore((s) => s.currentBranchId)
  const setShowToolDialog = useAppStore((s) => s.setShowToolDialog)
  const setShowBranchDialog = useAppStore((s) => s.setShowBranchDialog)
  const setShowConfigDialog = useAppStore((s) => s.setShowConfigDialog)
  const setShowServerDialog = useAppStore((s) => s.setShowServerDialog)
  const triggerRefreshTools = useAppStore((s) => s.triggerRefreshTools)

  useEffect(() => {
    if (serverId) {
      setCurrentServer(serverId)
    }
  }, [serverId, setCurrentServer])

  const queryClient = useQueryClient()
  const [localRefreshKey, setLocalRefreshKey] = useState(0)
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)

  // Auto-Generate preview dialog state
  const [showAutoGenerateDialog, setShowAutoGenerateDialog] = useState(false)

  // AI Prompt Tool dialog state
  const [showAiPromptDialog, setShowAiPromptDialog] = useState(false)

  // Toggle tool enabled mutation (Branch-aware)
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const url = currentBranchId
        ? `/api/branches/${currentBranchId}/tools/${id}`
        : `/api/servers/${currentServerId}/tools/${id}`
      const body = currentBranchId
        ? { enabled: !isEnabled }
        : { isEnabled: !isEnabled }
      return api.put<any>(url, body)
    },
    onMutate: async ({ id, isEnabled }) => {
      await queryClient.cancelQueries({ queryKey: ['branch-tools', currentBranchId, currentServerId] })
      const previousTools = queryClient.getQueryData(['branch-tools', currentBranchId, currentServerId])
      queryClient.setQueryData(['branch-tools', currentBranchId, currentServerId], (old: ToolItem[] | undefined) => {
        if (!old) return old
        return old.map(t => t.id === id ? { ...t, isEnabled: !isEnabled } : t)
      })
      return { previousTools }
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['branch-tools', currentBranchId, currentServerId], context?.previousTools)
      toast.error('Failed to toggle tool')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      queryClient.invalidateQueries({ queryKey: ['branch-tools', currentBranchId, currentServerId] })
    },
  })

  // Delete mutation (Branch-aware)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const url = currentBranchId
        ? `/api/branches/${currentBranchId}/tools/${id}`
        : `/api/servers/${currentServerId}/tools/${id}`
      return api.delete<void>(url)
    },
    onSuccess: () => {
      toast.success('Tool deleted')
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      queryClient.invalidateQueries({ queryKey: ['branch-tools', currentBranchId, currentServerId] })
      triggerRefreshTools()
    },
    onError: () => {
      toast.error('Failed to delete tool')
    },
  })

  // Branch operations mutations
  const mergeMutation = useMutation({
    mutationFn: (branchId: string) =>
      api.post<{ message: string }>(`/api/branches/${branchId}/merge`, { changelog: `Merged branch ${branchId}` }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      queryClient.invalidateQueries({ queryKey: ['branch-tools', currentBranchId, currentServerId] })
      toast.success(data.message || 'Branch merged successfully')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to merge branch'),
  })

  const archiveMutation = useMutation({
    mutationFn: (branchId: string) =>
      api.put<any>(`/api/branches/${branchId}`, { status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      toast.success('Branch archived')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to archive branch'),
  })

  const deleteMutationBranch = useMutation({
    mutationFn: (branchId: string) =>
      api.delete<any>(`/api/branches/${branchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      toast.success('Branch deleted')
      // If we deleted the current branch, reset selection
      if (currentBranchId) {
        const def = server?.branches.find(b => b.isDefault)
        if (def) setCurrentBranch(def.id)
      }
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete branch'),
  })

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      api.post<any>(`/api/deployments/${deploymentId}/rollback`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', currentServerId] })
      queryClient.invalidateQueries({ queryKey: ['branch-tools', currentBranchId, currentServerId] })
      toast.success('Rollback completed successfully')
      setLocalRefreshKey(k => k + 1)
    },
    onError: () => toast.error('Failed to rollback deployment'),
  })

  // Server detailed schema fetch
  const { data: server, isLoading, isError } = useQuery<ServerDetail>({
    queryKey: ['server', currentServerId, refreshServers, localRefreshKey],
    queryFn: () => api.get<ServerDetail>(`/api/servers/${currentServerId}`),
    enabled: !!currentServerId,
  })

  // Branch effective tools fetch
  const { data: branchTools = [], isLoading: isLoadingTools } = useQuery<ToolItem[]>({
    queryKey: ['branch-tools', currentBranchId, currentServerId],
    queryFn: async () => {
      if (!currentServerId) return []
      const url = currentBranchId
        ? `/api/branches/${currentBranchId}/tools`
        : `/api/servers/${currentServerId}/tools`
      return api.get<ToolItem[]>(url)
    },
    enabled: !!currentServerId,
  })

  // Auto-set the default branch only if no active branch is currently selected
  useEffect(() => {
    if (server?.branches && !currentBranchId) {
      const def = server.branches.find(b => b.isDefault)
      if (def) setCurrentBranch(def.id)
    }
  }, [server, currentBranchId, setCurrentBranch])

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
            aria-label="Back to Servers"
            asChild
          >
            <Link href="/servers" onClick={() => setCurrentServer(null)}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <Server className="size-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold tracking-tight text-white">{server.name}</h1>
              <StatusBadge status={server.status} />
            </div>
            {server.description && (
              <p className="text-muted-foreground text-sm mt-0.5">{server.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5 text-neutral-300 hover:text-white" onClick={() => setShowConfigDialog(true)}>
            <FileJson className="size-3.5" />
            Generate Config
          </Button>
          <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5 text-neutral-300 hover:text-white" onClick={() => setShowServerDialog(true, server.id)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* Server Info & Connections Container */}
      <Card className="border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="p-4 flex flex-wrap items-center gap-6 border-b border-white/[0.05] bg-white/[0.01]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-450">Version:</span>
            <span className="text-sm font-semibold text-white">v{server.version}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-450">Active Tools:</span>
            <span className="text-sm font-semibold text-white">{activeTools.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-450">Created:</span>
            <span className="text-sm font-semibold text-white">{format(new Date(server.createdAt), 'MMM d, yyyy')}</span>
          </div>
        </div>
        
        {server.connections.length > 0 && (
          <div className="p-4 flex flex-col gap-3">
            <span className="text-xs text-neutral-400 font-medium">Linked Connections</span>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(server.connections ?? []).filter(c => c.isActive).map((conn) => {
                let stats = { layouts: 0, tables: 0, scripts: 0, relationships: 0 }
                if (conn.connection.browsedSchema?.compiledSchema) {
                  try {
                    const schema = JSON.parse(conn.connection.browsedSchema.compiledSchema)
                    stats.layouts = schema.layouts?.length || 0
                    stats.tables = schema.odataTables?.length || 0
                    stats.scripts = schema.scripts?.length || 0
                    stats.relationships = schema.relationships?.length || 0
                  } catch {}
                }
                
                return (
                  <div key={conn.connection.id} className="flex flex-col gap-2.5 bg-white/[0.01] border border-white/[0.05] hover:border-white/10 transition-colors rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link2 className="size-4 text-blue-400 shrink-0" />
                        <span className="font-semibold text-sm text-neutral-200 truncate">{conn.connection.name}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] py-0 border-white/5 bg-white/[0.02] font-mono">
                        {conn.connection.database}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-neutral-450 flex-wrap">
                      <span title="Layouts">{stats.layouts} L</span>
                      <span title="OData Tables">{stats.tables} T</span>
                      <span title="Scripts">{stats.scripts} S</span>
                      <span title="Relationships">{stats.relationships} R</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Mode Tabs */}
      <Tabs value={serverMode} onValueChange={(v) => setServerMode(v as typeof serverMode)}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <TabsList className="bg-white/[0.02] border border-white/5 p-1 rounded-lg">
            <TabsTrigger value="edit" className="data-[state=active]:bg-white/5 data-[state=active]:text-white text-neutral-400 transition-all">
              <Pencil className="size-3.5 mr-1.5" />
              Edit
            </TabsTrigger>
            <TabsTrigger value="staging" className="data-[state=active]:bg-white/5 data-[state=active]:text-white text-neutral-400 transition-all">
              <Eye className="size-3.5 mr-1.5" />
              Staging
            </TabsTrigger>
            <TabsTrigger value="deployed" className="data-[state=active]:bg-white/5 data-[state=active]:text-white text-neutral-400 transition-all">
              <Rocket className="size-3.5 mr-1.5" />
              Deployed
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {serverMode === 'staging' && (
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5 shadow-lg shadow-blue-900/20"
                onClick={async () => {
                  try {
                    await api.post<any>(`/api/servers/${currentServerId}/deployments`, {
                      changelog: `Manual deployment - ${activeTools.length} tools`
                    })
                    toast.success('Server deployed to production!')
                    setLocalRefreshKey(k => k + 1)
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to deploy')
                  }
                }}
              >
                <Rocket className="size-3.5" />
                Deploy to Production
              </Button>
            )}
            
            {serverMode === 'deployed' && (
              <Button
                size="sm"
                variant="outline"
                className="border-white/10 hover:bg-white/5 text-neutral-300 hover:text-white gap-1.5"
                onClick={() => setShowBranchDialog(true)}
              >
                <GitBranch className="size-3.5" />
                Create Edit Branch
              </Button>
            )}
          </div>
        </div>

        {/* Edit Mode */}
        <TabsContent value="edit" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card className="border-white/10 bg-white/[0.02]">
                <CardHeader className="pb-3 border-b border-white/[0.05]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle className="text-sm font-semibold text-white">
                      Tools ({branchTools.length} total, {activeTools.length} active)
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5 text-neutral-350 hover:text-white" onClick={() => setShowAiPromptDialog(true)}>
                        <Sparkles className="size-3.5 mr-1.5 text-violet-400" />
                        AI Assistant
                      </Button>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 gap-1.5 border border-indigo-500/10" 
                        onClick={() => setShowAutoGenerateDialog(true)} 
                        disabled={!currentBranchId}
                      >
                        <Brain className="size-3.5" />
                        Auto-Generate Suite
                      </Button>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white" onClick={() => setShowToolDialog(true)}>
                        <Plus className="size-3.5 mr-1.5" />
                        Add Tool
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="max-h-[500px] overflow-y-auto pt-4 space-y-1">
                  {branchTools.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Wrench className="size-10 text-neutral-600 mb-3" />
                      <p className="text-sm font-semibold text-neutral-450">No tools configured yet</p>
                      <p className="text-xs text-neutral-500 mt-1">Add tools manually or use the AI Assistant</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
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
              <Card className="border-white/10 bg-white/[0.02]">
                <CardHeader className="pb-3 border-b border-white/[0.05]">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                      <GitBranch className="size-4 text-blue-400" />
                      Branches
                    </CardTitle>
                    <Button variant="outline" size="sm" className="h-7 px-2 border-white/10 hover:bg-white/5 text-neutral-300 hover:text-white" onClick={() => setShowBranchDialog(true)}>
                      <Plus className="size-3.5 mr-1" />
                      New
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-3 max-h-[400px] overflow-y-auto space-y-2.5">
                  {server.branches.length === 0 ? (
                    <p className="text-xs text-neutral-500 text-center py-6">No branches available</p>
                  ) : (
                    server.branches.map(branch => {
                      const isSelected = branch.id === currentBranchId
                      return (
                        <div 
                          key={branch.id} 
                          className={`group/branch flex flex-col p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                            isSelected 
                              ? 'bg-blue-500/5 border-blue-500/30 shadow-sm shadow-blue-500/5' 
                              : 'bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.03] hover:border-white/10'
                          }`}
                          onClick={() => setCurrentBranch(branch.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <GitBranch className={`size-3.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-neutral-400'}`} />
                              <span className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                                {branch.name}
                              </span>
                              {branch.isDefault && (
                                <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold py-0 px-1">
                                  default
                                </Badge>
                              )}
                            </div>
                            <StatusBadge status={branch.status} />
                          </div>
                          
                          {branch.commitMessage && (
                            <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2 italic">
                              &ldquo;{branch.commitMessage}&rdquo;
                            </p>
                          )}
                          
                          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.04]">
                            <span className="text-[10px] text-neutral-500">
                              {branch.createdAt ? format(new Date(branch.createdAt), 'MMM d, yyyy') : ''}
                            </span>
                            
                            {/* Branch actions */}
                            {branch.status === 'active' && !branch.isDefault && (
                              <div className="flex items-center gap-1.5 opacity-0 group-hover/branch:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 rounded hover:bg-blue-500/10 hover:text-blue-400 text-neutral-400"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (confirm(`Merge branch "${branch.name}" into production?`)) {
                                      mergeMutation.mutate(branch.id)
                                    }
                                  }}
                                  title="Merge into default branch"
                                  aria-label={`Merge branch ${branch.name} into default branch`}
                                >
                                  <GitBranch className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 rounded hover:bg-orange-500/10 hover:text-orange-400 text-neutral-400"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    archiveMutation.mutate(branch.id)
                                  }}
                                  title="Archive branch"
                                  aria-label={`Archive branch ${branch.name}`}
                                >
                                  <Clock className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 rounded hover:bg-red-500/10 hover:text-red-400 text-neutral-400"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (confirm(`Are you sure you want to delete branch "${branch.name}"?`)) {
                                      deleteMutationBranch.mutate(branch.id)
                                    }
                                  }}
                                  title="Delete branch"
                                  aria-label={`Delete branch ${branch.name}`}
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Staging Mode */}
        <TabsContent value="staging" className="mt-4">
          <div className="space-y-4">
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader className="pb-3 border-b border-white/[0.05]">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-white">Tools Preview (Staging)</CardTitle>
                  <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/20">
                    Read-Only Preview
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto pt-4 space-y-1">
                {branchTools.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Wrench className="size-10 text-neutral-600 mb-3" />
                    <p className="text-sm text-neutral-450">No tools to preview</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {branchTools.map(tool => (
                      <ToolRow key={tool.id} tool={tool} readOnly />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {lastDeployment && (
              <Card className="border-white/10 bg-white/[0.02]">
                <CardHeader className="pb-3 border-b border-white/[0.05]">
                  <CardTitle className="text-sm font-semibold text-white">Comparison with Current Deployment</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1 bg-white/[0.01] border border-white/5 rounded-xl p-3.5">
                      <span className="text-xs text-neutral-400 block">Current Deployment</span>
                      <p className="text-sm font-bold text-white">v{lastDeployment.version}</p>
                      <p className="text-xs text-neutral-500">{lastDeployment.toolCount} tools active</p>
                    </div>
                    <div className="space-y-1 bg-white/[0.01] border border-white/5 rounded-xl p-3.5">
                      <span className="text-xs text-neutral-400 block">Staging Version</span>
                      <p className="text-sm font-bold text-white">{activeTools.length} tools</p>
                      <p className="text-xs text-neutral-500">
                        {activeTools.length !== lastDeployment.toolCount
                          ? `${Math.abs(activeTools.length - lastDeployment.toolCount)} tool difference`
                          : 'Same tool count'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        </TabsContent>

        {/* Deployed Mode */}
        <TabsContent value="deployed" className="mt-4">
          <div className="space-y-4">
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader className="pb-3 border-b border-white/[0.05]">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-white">Deployed Tools</CardTitle>
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                    Production
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto pt-4 space-y-1">
                {lastDeployment ? (() => {
                  let snapshotTools: ToolItem[] = [];
                  try {
                    const snap = JSON.parse(lastDeployment.snapshot || lastDeployment.configSnapshot || '{}');
                    snapshotTools = snap.tools || [];
                  } catch (e) {
                    console.error('Failed to parse snapshot', e);
                  }
                  
                  return (
                    <>
                      <div className="flex items-center gap-3 mb-4 text-sm text-neutral-450 px-1 bg-white/[0.01] border border-white/5 p-2 rounded-lg">
                        <Clock className="size-4 text-blue-400" />
                        <span>
                          Version <strong className="text-white font-mono">v{lastDeployment.version}</strong> — Deployed{' '}
                          {lastDeployment.deployedAt 
                            ? format(new Date(lastDeployment.deployedAt), 'MMM d, yyyy HH:mm') 
                            : 'recently'}
                        </span>
                      </div>
                      {snapshotTools.length === 0 ? (
                        <p className="text-xs text-neutral-500 py-4 text-center">No tools found in deployment snapshot</p>
                      ) : (
                        <div className="space-y-2">
                          {snapshotTools.map(tool => (
                            <ToolRow key={tool.id} tool={tool} readOnly />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })() : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Rocket className="size-10 text-neutral-600 mb-3" />
                    <p className="text-sm font-semibold text-neutral-450">No deployments yet</p>
                    <p className="text-xs text-neutral-550 mt-1">Deploy from staging to see production tools here</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Deployment History */}
            {server.deployments.length > 0 && (
              <Card className="border-white/10 bg-white/[0.02]">
                <CardHeader className="pb-3 border-b border-white/[0.05]">
                  <CardTitle className="text-sm font-semibold text-white">Deployment History</CardTitle>
                </CardHeader>
                <CardContent className="max-h-64 overflow-y-auto pt-2">
                  <div className="divide-y divide-white/[0.04]">
                    {server.deployments.map((deployment, index) => (
                      <div key={deployment.id} className="flex items-center justify-between py-3 hover:bg-white/[0.01] px-2 rounded-lg transition-colors">
                        <div className="space-y-1 min-w-0 flex-1 pr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white font-mono">v{deployment.version}</span>
                            <StatusBadge status={deployment.status} />
                            {index === 0 && (
                              <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                                Current Live
                              </Badge>
                            )}
                          </div>
                          {deployment.changelog && (
                            <p className="text-xs text-neutral-450 line-clamp-1 italic">
                              &ldquo;{deployment.changelog}&rdquo;
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                            <span>
                              Deployed{' '}
                              {deployment.deployedAt
                                ? format(new Date(deployment.deployedAt), 'MMM d, yyyy HH:mm')
                                : format(new Date(deployment.createdAt), 'MMM d, yyyy HH:mm')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {index > 0 && deployment.status !== 'rolled_back' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 rounded-md border border-white/5 hover:border-orange-500/30 hover:bg-orange-500/10 text-neutral-450 hover:text-orange-400 transition-all"
                              onClick={() => {
                                if (confirm(`Are you sure you want to roll back to version v${deployment.version}?`)) {
                                  rollbackMutation.mutate(deployment.id)
                                }
                              }}
                              title="Rollback to this version"
                              aria-label={`Rollback to version ${deployment.version}`}
                            >
                              <RotateCcw className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        </TabsContent>
      </Tabs>

      {currentServerId && (
        <AutoGeneratePreviewDialog
          open={showAutoGenerateDialog}
          onOpenChange={setShowAutoGenerateDialog}
          serverId={currentServerId}
          branchId={currentBranchId}
        />
      )}

      {currentServerId && (
        <AiPromptToolDialog
          open={showAiPromptDialog}
          onOpenChange={setShowAiPromptDialog}
          serverId={currentServerId}
          branchId={currentBranchId}
        />
      )}
    </div>
  )
}
