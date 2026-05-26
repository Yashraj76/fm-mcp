'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  RefreshCw,
  Layout,
  FileCode,
  Table2,
  Columns3,
  GitFork,
  ChevronRight,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface SchemaData {
  databaseName: string
  cachedAt: string
  layouts: LayoutItem[]
  scripts: ScriptItem[]
  tables: TableItem[]
  fields: FieldItem[]
  relationships: RelationshipItem[]
}

interface LayoutItem {
  name: string
  recordCount: number
  fields: number
  modifiable: boolean
}

interface ScriptItem {
  name: string
  type: string
  description: string
}

interface TableItem {
  name: string
  fieldCount: number
  primaryKey: string
}

interface FieldItem {
  name: string
  table: string
  type: string
  global: boolean
  autoEnter: boolean
}

interface RelationshipItem {
  name: string
  table: string
  relatedTable: string
  type: string
  keyMatch: string
}

const fieldTypeIcons: Record<string, typeof Type> = {
  text: Type,
  number: Hash,
  date: Calendar,
  timestamp: Calendar,
  container: ToggleLeft,
}

const fieldTypeColors: Record<string, string> = {
  text: 'text-sky-500',
  number: 'text-amber-500',
  date: 'text-emerald-500',
  timestamp: 'text-emerald-600',
  container: 'text-purple-500',
  boolean: 'text-rose-500',
}

interface SchemaExplorerInlineProps {
  connectionId: string
  onClose: () => void
}

export function SchemaExplorerInline({ connectionId, onClose }: SchemaExplorerInlineProps) {
  const {
    data: schema,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<SchemaData>({
    queryKey: ['schema', connectionId],
    queryFn: () => api.get<SchemaData>(`/api/connections/${connectionId}/schema`),
    enabled: !!connectionId,
  })

  return (
    <Sheet open={!!connectionId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        <SheetHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-base">Schema Explorer</SheetTitle>
              <SheetDescription>
                {schema?.databaseName && `Database: ${schema.databaseName}`}
                {schema?.cachedAt && (
                  <span className="block text-[11px] mt-0.5" suppressHydrationWarning>
                    Cached {formatDistanceToNow(new Date(schema.cachedAt), { addSuffix: true })}
                  </span>
                )}
              </SheetDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh Schema"
            >
              <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </SheetHeader>

        <div className="mt-2 px-4">
          <Tabs defaultValue="layouts" className="w-full">
            <TabsList className="w-full grid grid-cols-5">
              <TabsTrigger value="layouts" className="text-xs gap-1">
                <Layout className="size-3" />
                <span className="hidden sm:inline">Layouts</span>
              </TabsTrigger>
              <TabsTrigger value="scripts" className="text-xs gap-1">
                <FileCode className="size-3" />
                <span className="hidden sm:inline">Scripts</span>
              </TabsTrigger>
              <TabsTrigger value="tables" className="text-xs gap-1">
                <Table2 className="size-3" />
                <span className="hidden sm:inline">Tables</span>
              </TabsTrigger>
              <TabsTrigger value="fields" className="text-xs gap-1">
                <Columns3 className="size-3" />
                <span className="hidden sm:inline">Fields</span>
              </TabsTrigger>
              <TabsTrigger value="relationships" className="text-xs gap-1">
                <GitFork className="size-3" />
                <span className="hidden sm:inline">Relations</span>
              </TabsTrigger>
            </TabsList>

            <div className="mt-3">
              {isLoading ? (
                <SchemaLoading />
              ) : isError || !schema ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">Failed to load schema</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => refetch()}
                  >
                    <RefreshCw className="size-3.5 mr-1" />
                    Retry
                  </Button>
                </div>
              ) : (
                <>
                  <TabsContent value="layouts" className="mt-0">
                    <ScrollArea className="h-[calc(100vh-220px)]">
                      <div className="space-y-1">
                        {schema.layouts.map((layout) => (
                          <div
                            key={layout.name}
                            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Layout className="size-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{layout.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {layout.recordCount.toLocaleString()} records &middot; {layout.fields} fields
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[10px] shrink-0 ${
                                layout.modifiable
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                  : 'bg-muted text-muted-foreground border-border'
                              }`}
                            >
                              {layout.modifiable ? 'R/W' : 'Read'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="scripts" className="mt-0">
                    <ScrollArea className="h-[calc(100vh-220px)]">
                      <div className="space-y-1">
                        {schema.scripts.map((script) => (
                          <div
                            key={script.name}
                            className="p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <FileCode className="size-4 text-amber-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{script.name}</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {script.description}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="tables" className="mt-0">
                    <ScrollArea className="h-[calc(100vh-220px)]">
                      <div className="space-y-1">
                        {schema.tables.map((table) => (
                          <div
                            key={table.name}
                            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Table2 className="size-4 text-sky-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{table.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {table.fieldCount} fields &middot; PK: {table.primaryKey}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="fields" className="mt-0">
                    <ScrollArea className="h-[calc(100vh-220px)]">
                      <div className="space-y-1">
                        {schema.fields.map((field, idx) => {
                          const Icon = fieldTypeIcons[field.type] || Type
                          const color = fieldTypeColors[field.type] || 'text-muted-foreground'
                          return (
                            <div
                              key={`${field.table}-${field.name}-${idx}`}
                              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Icon className={`size-4 ${color} shrink-0`} />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{field.name}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {field.table} &middot; {field.type}
                                    {field.global && ' (global)'}
                                    {field.autoEnter && ' (auto)'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="relationships" className="mt-0">
                    <ScrollArea className="h-[calc(100vh-220px)]">
                      <div className="space-y-1">
                        {schema.relationships.map((rel) => (
                          <div
                            key={rel.name}
                            className="p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <GitFork className="size-4 text-purple-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{rel.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {rel.table} → {rel.relatedTable}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] bg-purple-500/10 text-purple-500 border-purple-500/20"
                                  >
                                    {rel.type}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground font-mono truncate">
                                    {rel.keyMatch}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </>
              )}
            </div>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SchemaLoading() {
  return (
    <div className="space-y-2 py-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="size-4 rounded" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  )
}
