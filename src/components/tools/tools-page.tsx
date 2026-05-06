'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { ToolDialog } from '@/components/tools/tool-dialog'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  Plus,
  Sparkles,
  Search,
  Wrench,
  Play,
  Copy,
  Trash2,
  History,
  MoreHorizontal,
  Filter,
  LayoutGrid,
  List,
  ChevronDown,
  Zap,
  Database,
  FileCode,
  Puzzle,
  PackageOpen,
} from 'lucide-react'

const CATEGORY_COLORS: Record<string, string> = {
  CRUD: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Find: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Script: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  Custom: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

const CATEGORY_ICONS: Record<string, typeof Database> = {
  CRUD: Database,
  Find: Search,
  Script: FileCode,
  Custom: Puzzle,
}

export function ToolsPage() {
  const { currentServerId, setShowToolDialog, setShowAiDialog, setCurrentView, triggerRefreshTools, refreshTools } =
    useAppStore()
  const queryClient = useQueryClient()

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Fetch tools
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ['tools', currentServerId, refreshTools],
    queryFn: async () => {
      if (!currentServerId) return []
      const res = await fetch(`/api/servers/${currentServerId}/tools`)
      if (!res.ok) throw new Error('Failed to fetch tools')
      return res.json()
    },
    enabled: !!currentServerId,
  })

  // Toggle enabled mutation
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
      queryClient.invalidateQueries({ queryKey: ['tools', currentServerId] })
    },
    onError: () => {
      toast.error('Failed to toggle tool')
    },
  })

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: async (tool: Record<string, unknown>) => {
      const res = await fetch(`/api/servers/${currentServerId}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(tool as Record<string, string>),
          name: `${(tool.name as string)} (Copy)`,
          isAiGenerated: false,
        }),
      })
      if (!res.ok) throw new Error('Failed to duplicate tool')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Tool duplicated')
      queryClient.invalidateQueries({ queryKey: ['tools', currentServerId] })
      triggerRefreshTools()
    },
    onError: () => {
      toast.error('Failed to duplicate tool')
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
      queryClient.invalidateQueries({ queryKey: ['tools', currentServerId] })
      triggerRefreshTools()
    },
    onError: () => {
      toast.error('Failed to delete tool')
    },
  })

  // Filter tools
  const filteredTools = useMemo(() => {
    return tools.filter((tool: Record<string, unknown>) => {
      const name = (tool.name as string).toLowerCase()
      const desc = (tool.description as string).toLowerCase()
      const category = tool.category as string
      const enabled = tool.isEnabled as boolean

      const matchesSearch =
        !searchQuery || name.includes(searchQuery.toLowerCase()) || desc.includes(searchQuery.toLowerCase())

      const matchesCategory = categoryFilter === 'all' || category === categoryFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'enabled' && enabled) ||
        (statusFilter === 'disabled' && !enabled)

      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [tools, searchQuery, categoryFilter, statusFilter])

  const enabledCount = tools.filter((t: Record<string, unknown>) => t.isEnabled as boolean).length
  const totalCount = tools.length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="size-6" />
            Tools
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount} tools defined · {enabledCount} enabled
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAiDialog(true)}
            className="gap-1.5"
          >
            <Sparkles className="size-3.5" />
            <span className="hidden sm:inline">AI Suggest</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setShowToolDialog(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            New Tool
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools by name or description..."
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <Filter className="size-3 mr-1" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="CRUD">CRUD</SelectItem>
              <SelectItem value="Find">Find</SelectItem>
              <SelectItem value="Script">Script</SelectItem>
              <SelectItem value="Custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="h-8 w-8 p-0 rounded-r-none"
            >
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="h-8 w-8 p-0 rounded-l-none"
            >
              <List className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tools Content */}
      {isLoading ? (
        <div className={cn('grid gap-3 flex-1', viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1')}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : filteredTools.length === 0 ? (
        <EmptyState
          hasTools={tools.length > 0}
          onCreateNew={() => setShowToolDialog(true)}
          onAiSuggest={() => setShowAiDialog(true)}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {filteredTools.map((tool: Record<string, unknown>) => (
            <ToolCard
              key={tool.id as string}
              tool={tool}
              onEdit={() => setShowToolDialog(true, tool.id as string)}
              onTest={() => setCurrentView('playground')}
              onDuplicate={() => duplicateMutation.mutate(tool)}
              onDelete={() => deleteMutation.mutate(tool.id as string)}
              onToggle={() =>
                toggleMutation.mutate({
                  id: tool.id as string,
                  isEnabled: tool.isEnabled as boolean,
                })
              }
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2 flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {filteredTools.map((tool: Record<string, unknown>) => (
            <ToolListItem
              key={tool.id as string}
              tool={tool}
              onEdit={() => setShowToolDialog(true, tool.id as string)}
              onTest={() => setCurrentView('playground')}
              onDuplicate={() => duplicateMutation.mutate(tool)}
              onDelete={() => deleteMutation.mutate(tool.id as string)}
              onToggle={() =>
                toggleMutation.mutate({
                  id: tool.id as string,
                  isEnabled: tool.isEnabled as boolean,
                })
              }
            />
          ))}
        </div>
      )}

      <ToolDialog />
    </div>
  )
}

// ===== Tool Card (Grid View) =====
function ToolCard({
  tool,
  onEdit,
  onTest,
  onDuplicate,
  onDelete,
  onToggle,
}: {
  tool: Record<string, unknown>
  onEdit: () => void
  onTest: () => void
  onDuplicate: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const category = (tool.category as string) || 'Custom'
  const CategoryIcon = CATEGORY_ICONS[category] || Puzzle
  const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.Custom

  return (
    <Card
      className={cn(
        'group hover:border-primary/40 transition-all duration-200',
        !(tool.isEnabled as boolean) && 'opacity-60'
      )}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <div className={cn('flex-shrink-0 size-8 rounded-lg flex items-center justify-center mt-0.5', categoryColor)}>
              <CategoryIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate flex items-center gap-1.5">
                {tool.name as string}
                {(tool.isAiGenerated as boolean) && (
                  <Zap className="size-3 text-violet-400 flex-shrink-0" />
                )}
              </h3>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {tool.description as string}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onEdit} className="gap-2">
                <Wrench className="size-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onTest} className="gap-2">
                <Play className="size-3.5" />
                Test in Playground
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate} className="gap-2">
                <Copy className="size-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2 text-destructive focus:text-destructive">
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn('text-[10px]', categoryColor)}>
            {category}
          </Badge>
          {(tool.fmLayout as string) && (
            <Badge variant="secondary" className="text-[10px] gap-0.5">
              <Database className="size-2.5" />
              {tool.fmLayout as string}
            </Badge>
          )}
          {(tool.fmScript as string) && (
            <Badge variant="secondary" className="text-[10px] gap-0.5">
              <FileCode className="size-2.5" />
              {tool.fmScript as string}
            </Badge>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px] font-mono">
              v{tool.version as number}
            </Badge>
          </div>
          <Switch
            checked={tool.isEnabled as boolean}
            onCheckedChange={onToggle}
            className="scale-75"
          />
        </div>
      </CardContent>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Tool</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{tool.name as string}&quot;? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </Card>
  )
}

// ===== Tool List Item =====
function ToolListItem({
  tool,
  onEdit,
  onTest,
  onDuplicate,
  onDelete,
  onToggle,
}: {
  tool: Record<string, unknown>
  onEdit: () => void
  onTest: () => void
  onDuplicate: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const category = (tool.category as string) || 'Custom'
  const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.Custom

  return (
    <Card className={cn('hover:border-primary/40 transition-colors', !(tool.isEnabled as boolean) && 'opacity-60')}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate">
                {tool.name as string}
                {(tool.isAiGenerated as boolean) && (
                  <Zap className="size-3 text-violet-400 inline ml-1" />
                )}
              </h3>
              <Badge variant="outline" className={cn('text-[10px]', categoryColor)}>
                {category}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {tool.description as string}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {(tool.fmLayout as string) && (
              <Badge variant="secondary" className="text-[10px] gap-0.5 hidden sm:inline-flex">
                <Database className="size-2.5" />
                {tool.fmLayout as string}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] font-mono">
              v{tool.version as number}
            </Badge>
            <Switch checked={tool.isEnabled as boolean} onCheckedChange={onToggle} className="scale-75" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Wrench className="size-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onTest} className="gap-2">
                  <Play className="size-3.5" />
                  Test in Playground
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate} className="gap-2">
                  <Copy className="size-3.5" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2 text-destructive focus:text-destructive">
                    <Trash2 className="size-3.5" />
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Tool</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{tool.name as string}&quot;?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </Card>
  )
}

// ===== Empty State =====
function EmptyState({
  hasTools,
  onCreateNew,
  onAiSuggest,
}: {
  hasTools: boolean
  onCreateNew: () => void
  onAiSuggest: () => void
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md space-y-4">
        <div className="mx-auto size-16 rounded-2xl bg-muted/30 flex items-center justify-center">
          <PackageOpen className="size-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {hasTools ? 'No tools match your filters' : 'No tools defined yet'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {hasTools
              ? 'Try adjusting your search or filter criteria to find what you are looking for.'
              : 'Tools are the building blocks of your MCP server. Create your first tool to get started, or let AI suggest tools based on your FileMaker schema.'}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          {!hasTools && (
            <Button variant="outline" onClick={onAiSuggest} className="gap-1.5">
              <Sparkles className="size-3.5" />
              AI Suggest Tools
            </Button>
          )}
          <Button onClick={onCreateNew} className="gap-1.5">
            <Plus className="size-3.5" />
            New Tool
          </Button>
        </div>
      </div>
    </div>
  )
}
