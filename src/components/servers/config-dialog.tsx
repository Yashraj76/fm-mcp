'use client'

import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Copy, Check, AlertTriangle, ShieldCheck, FileJson, Zap, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface ConfigData {
  serverId: string
  serverName: string
  serverVersion: string
  sse: Record<string, unknown>
  proxy: Record<string, unknown>
  claudeDesktop: Record<string, unknown>
  toolCount: number
  connectedDatabases: Array<{ connectionId: string; databaseName: string; host: string; isActive: boolean }>
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleCopy}
      className="shrink-0 gap-1.5"
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-green-500" />
          {label ? `${label} Copied` : 'Copied'}
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          {label || 'Copy'}
        </>
      )}
    </Button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <div className="bg-black/40 dark:bg-black/60 rounded-lg p-4 font-mono text-sm overflow-x-auto whitespace-pre-wrap break-all border border-white/10 text-neutral-200 max-h-64 overflow-y-auto">
        <code>{code}</code>
      </div>
    </div>
  )
}

export function ConfigDialog() {
  const { showConfigDialog, setShowConfigDialog, currentServerId } = useAppStore()

  const { data: config, isLoading, isError } = useQuery<ConfigData>({
    queryKey: ['config', currentServerId],
    queryFn: () => fetch(`/api/servers/${currentServerId}/config`).then(r => r.json()).then(res => res.data),
    enabled: showConfigDialog && !!currentServerId,
  })

  // Build Server Entry JSON (SSE direct config)
  const serverEntryJson = config?.sse
    ? JSON.stringify(config.sse, null, 2)
    : ''

  // Build Server File JSON (file-based config)
  const serverFileJson = config?.claudeDesktop
    ? JSON.stringify(config.claudeDesktop, null, 2)
    : ''

  // Build Proxy config JSON
  const proxyJson = config?.proxy
    ? JSON.stringify(config.proxy, null, 2)
    : ''

  return (
    <Dialog open={showConfigDialog} onOpenChange={(open) => setShowConfigDialog(open)}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-neutral-950 border-white/10 text-white p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-white flex items-center gap-2">
              <FileJson className="size-5 text-blue-400" />
              Generate Configuration
            </DialogTitle>
            <button
              onClick={() => setShowConfigDialog(false)}
              className="size-8 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X className="size-4 text-white/60" />
            </button>
          </div>
          <DialogDescription className="text-neutral-400 mt-1.5 text-sm">
            Your MCP configuration is ready to use. Copy the configuration below to your MCP client settings.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* Important Warning */}
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
            <AlertTriangle className="size-4 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-500">Important</p>
              <p className="text-xs text-yellow-500/80 mt-0.5">
                Store configurations securely, as token in the configuration allows access to your connected FileMaker data.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-5 w-48 bg-white/10" />
              <Skeleton className="h-40 w-full bg-white/10" />
              <Skeleton className="h-5 w-32 bg-white/10" />
              <Skeleton className="h-40 w-full bg-white/10" />
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
              Failed to generate configuration. Make sure the server has at least one active branch.
            </div>
          ) : (
            <div className="space-y-6">
              {/* SSE Configuration (Direct Connection) */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="size-4 text-blue-400" />
                  SSE Configuration (Direct Connection)
                </h3>

                <Tabs defaultValue="entry">
                  <TabsList className="bg-white/5 border border-white/10">
                    <TabsTrigger value="entry" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60">
                      Server Entry
                    </TabsTrigger>
                    <TabsTrigger value="file" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60">
                      Server File
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="entry" className="space-y-2 mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">
                        Add this entry to your MCP client configuration
                      </span>
                      <CopyButton text={serverEntryJson} label="Entry" />
                    </div>
                    <CodeBlock code={serverEntryJson} />
                  </TabsContent>

                  <TabsContent value="file" className="space-y-2 mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">
                        Claude Desktop / file-based configuration
                      </span>
                      <CopyButton text={serverFileJson} label="File" />
                    </div>
                    <CodeBlock code={serverFileJson} />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Separator */}
              <div className="border-t border-white/10" />

              {/* Proxy Configuration (Command-based) */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Zap className="size-4 text-purple-400" />
                  Proxy Configuration (Command-based)
                </h3>
                <div className="flex items-center justify-end">
                  <CopyButton text={proxyJson} label="Proxy" />
                </div>
                <CodeBlock code={proxyJson} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
