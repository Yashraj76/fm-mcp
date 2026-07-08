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
  GitFork,
  Database,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

/**
 * Read-only panel showing the last browse result for a connection.
 *
 * Reads from GET /api/connections/[id]/schema, which returns the data persisted
 * by POST /browse-schema — never makes a live FileMaker call itself.
 *
 * For the interactive Schema Browser (selection + save), use SchemaBrowser instead.
 */

interface BrowsedSchemaData {
  layouts: string[]
  scripts: string[]
  odataTables: string[]
  layoutMeta: Record<string, { fields: string[]; portals: string[] }>
  odataMeta: Record<string, { fields: { name: string; type: string }[] }>
  fetchedAt: string
  updatedAt: string
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
    error,
    refetch,
    isFetching,
  } = useQuery<BrowsedSchemaData>({
    queryKey: ['browse-schema-snapshot', connectionId],
    queryFn: () => api.get<BrowsedSchemaData>(`/api/connections/${connectionId}/schema`),
    enabled: !!connectionId,
    retry: false, // NOT_BROWSED_YET is not retryable
  })

  const errorCode = (error as any)?.code

  return (
    <Sheet open={!!connectionId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        <SheetHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-base">Schema Explorer</SheetTitle>
              <SheetDescription>
                {schema?.fetchedAt && (
                  <span className="block text-[11px] mt-0.5" suppressHydrationWarning>
                    Last browsed {formatDistanceToNow(new Date(schema.fetchedAt), { addSuffix: true })}
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
              aria-label="Refresh"
            >
              <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </SheetHeader>

        <div className="mt-2 px-4">
          {isLoading ? (
            <SchemaLoading />
          ) : errorCode === 'NOT_BROWSED_YET' ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Database className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Schema not browsed yet</p>
              <p className="text-xs text-muted-foreground/70">
                Open Schema Browser on this connection to fetch layouts and tables from FileMaker.
              </p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <p className="text-sm text-muted-foreground">Failed to load schema</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="size-3.5 mr-1" /> Retry
              </Button>
            </div>
          ) : schema ? (
            <Tabs defaultValue="layouts" className="w-full">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="layouts" className="text-xs gap-1">
                  <Layout className="size-3" />
                  <span className="hidden sm:inline">Layouts</span>
                  <Badge variant="secondary" className="text-[10px] ml-0.5">{schema.layouts.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="scripts" className="text-xs gap-1">
                  <FileCode className="size-3" />
                  <span className="hidden sm:inline">Scripts</span>
                  <Badge variant="secondary" className="text-[10px] ml-0.5">{schema.scripts.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="tables" className="text-xs gap-1">
                  <Table2 className="size-3" />
                  <span className="hidden sm:inline">OData</span>
                  <Badge variant="secondary" className="text-[10px] ml-0.5">{schema.odataTables.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="portals" className="text-xs gap-1">
                  <GitFork className="size-3" />
                  <span className="hidden sm:inline">Portals</span>
                </TabsTrigger>
              </TabsList>

              <div className="mt-3">
                <TabsContent value="layouts" className="mt-0">
                  <ScrollArea className="h-[calc(100vh-240px)]">
                    <div className="space-y-1">
                      {schema.layouts.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8">No layouts found</p>
                      )}
                      {schema.layouts.map((name) => {
                        const meta = schema.layoutMeta[name]
                        return (
                          <div
                            key={name}
                            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Layout className="size-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{name}</p>
                                {meta && (
                                  <p className="text-[11px] text-muted-foreground">
                                    {meta.fields.length} fields
                                    {meta.portals.length > 0 && ` · ${meta.portals.length} portals`}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="scripts" className="mt-0">
                  <ScrollArea className="h-[calc(100vh-240px)]">
                    <div className="space-y-1">
                      {schema.scripts.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8">No scripts found</p>
                      )}
                      {schema.scripts.map((name) => (
                        <div
                          key={name}
                          className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <FileCode className="size-4 text-amber-500 shrink-0" />
                          <p className="text-sm font-medium truncate">{name}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="tables" className="mt-0">
                  <ScrollArea className="h-[calc(100vh-240px)]">
                    <div className="space-y-1">
                      {schema.odataTables.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8">No OData tables found</p>
                      )}
                      {schema.odataTables.map((name) => {
                        const meta = schema.odataMeta[name]
                        return (
                          <div
                            key={name}
                            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Table2 className="size-4 text-sky-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{name}</p>
                                {meta?.fields && (
                                  <p className="text-[11px] text-muted-foreground">
                                    {meta.fields.length} fields
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="portals" className="mt-0">
                  <ScrollArea className="h-[calc(100vh-240px)]">
                    <div className="space-y-1">
                      {Object.entries(schema.layoutMeta)
                        .filter(([, meta]) => meta.portals.length > 0)
                        .flatMap(([layoutName, meta]) =>
                          meta.portals.map((portal) => ({ layoutName, portal }))
                        )
                        .map(({ layoutName, portal }, i) => (
                          <div
                            key={`${layoutName}-${portal}-${i}`}
                            className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <GitFork className="size-4 text-purple-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{portal}</p>
                              <p className="text-[11px] text-muted-foreground">
                                via {layoutName}
                              </p>
                            </div>
                          </div>
                        ))}
                      {Object.values(schema.layoutMeta).every((m) => m.portals.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-8">No portals found</p>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          ) : null}
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
