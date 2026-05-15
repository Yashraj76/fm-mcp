'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Copy, Check, AlertTriangle, ShieldCheck, FileJson,
  Terminal, Wifi, Key, RefreshCw, Trash2, Eye, EyeOff,
  X, ChevronRight, Info, Loader2,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface ApiKeyMeta {
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
}

interface ConfigData {
  serverId: string
  serverName: string
  serverVersion: string
  hasApiKey: boolean
  endpoints: { streamableHttp: string; sse: string }
  streamableHttp: Record<string, unknown>
  sse: Record<string, unknown>
  mcpRemote: Record<string, unknown>
  proxy: Record<string, unknown>
  toolCount: number
  tools: Array<{ name: string; description: string; inputSchema: unknown }>
  connectedDatabases: Array<{ connectionId: string; databaseName: string; host: string; isActive: boolean }>
}

function CopyButton({ text, label, size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'icon' }) {
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
  if (size === 'icon') {
    return (
      <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={handleCopy}>
        {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
      </Button>
    )
  }
  return (
    <Button variant="secondary" size="sm" onClick={handleCopy} className="shrink-0 gap-1.5">
      {copied ? <><Check className="size-3.5 text-green-500" />{label ? `${label} Copied` : 'Copied'}</> : <><Copy className="size-3.5" />{label || 'Copy'}</>}
    </Button>
  )
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative group">
      <div className="flex items-center justify-between mb-1.5">
        {label && <span className="text-xs text-neutral-500">{label}</span>}
        <CopyButton text={code} size="sm" label="Copy" />
      </div>
      <div className="bg-black/50 rounded-lg p-4 font-mono text-xs overflow-x-auto whitespace-pre border border-white/10 text-neutral-200 max-h-48 overflow-y-auto leading-relaxed">
        <code>{code}</code>
      </div>
    </div>
  )
}

function RevealableToken({ value }: { value: string }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-2 border border-white/10 font-mono text-sm">
      <span className="flex-1 text-green-400 break-all">{shown ? value : '•'.repeat(Math.min(value.length, 48))}</span>
      <button onClick={() => setShown(s => !s)} className="text-neutral-500 hover:text-white transition-colors shrink-0">
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      <CopyButton text={value} size="icon" />
    </div>
  )
}

export function ConfigDialog() {
  const { showConfigDialog, setShowConfigDialog, currentServerId } = useAppStore()
  const queryClient = useQueryClient()
  const [newApiKey, setNewApiKey] = useState<string | null>(null)

  const { data: config, isLoading, isError } = useQuery<ConfigData>({
    queryKey: ['config', currentServerId],
    queryFn: () => fetch(`/api/servers/${currentServerId}/config`).then(r => r.json()).then(res => res.data),
    enabled: showConfigDialog && !!currentServerId,
  })

  const { data: apiKeyMeta, refetch: refetchKey } = useQuery<ApiKeyMeta | null>({
    queryKey: ['api-key-meta', currentServerId],
    queryFn: () => fetch(`/api/servers/${currentServerId}/api-key`).then(r => r.json()).then(res => res.data),
    enabled: showConfigDialog && !!currentServerId,
  })

  const generateKeyMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/servers/${currentServerId}/api-key`, { method: 'POST' }).then(r => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        setNewApiKey(res.data.apiKey)
        toast.success('API key generated — copy it now, it won\'t be shown again!')
        refetchKey()
        queryClient.invalidateQueries({ queryKey: ['config', currentServerId] })
      } else {
        toast.error(res.error || 'Failed to generate key')
      }
    },
    onError: () => toast.error('Failed to generate API key'),
  })

  const revokeKeyMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/servers/${currentServerId}/api-key`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        setNewApiKey(null)
        toast.success('API key revoked')
        refetchKey()
        queryClient.invalidateQueries({ queryKey: ['config', currentServerId] })
      } else {
        toast.error(res.error || 'Failed to revoke key')
      }
    },
    onError: () => toast.error('Failed to revoke key'),
  })

  const streamableJson = config?.streamableHttp ? JSON.stringify(config.streamableHttp, null, 2) : ''
  const sseJson = config?.sse ? JSON.stringify(config.sse, null, 2) : ''
  const mcpRemoteJson = config?.mcpRemote ? JSON.stringify(config.mcpRemote, null, 2) : ''
  const endpointUrl = config?.endpoints?.streamableHttp ?? ''

  return (
    <Dialog open={showConfigDialog} onOpenChange={(open) => { setShowConfigDialog(open); if (!open) setNewApiKey(null) }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-neutral-950 border-white/10 text-white p-0">
        <DialogHeader className="p-6 pb-0 sticky top-0 bg-neutral-950 z-10 border-b border-white/10 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-white flex items-center gap-2">
              <FileJson className="size-5 text-blue-400" />
              MCP Server Config
              {config && (
                <Badge variant="outline" className="border-white/20 text-neutral-400 text-xs font-mono">
                  v{config.serverVersion}
                </Badge>
              )}
            </DialogTitle>
            <button
              onClick={() => { setShowConfigDialog(false); setNewApiKey(null) }}
              className="size-8 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X className="size-4 text-white/60" />
            </button>
          </div>
          <DialogDescription className="text-neutral-400 mt-1 text-sm">
            {config ? (
              <span>
                <span className="text-white font-medium">{config.serverName}</span>
                {' · '}{config.toolCount} tools · {config.connectedDatabases.length} database{config.connectedDatabases.length !== 1 ? 's' : ''}
              </span>
            ) : 'Loading configuration...'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-6 mt-4">
          {/* Security warning */}
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2.5">
            <AlertTriangle className="size-4 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-500/80">
              Your API token grants access to all connected FileMaker data. Keep it secret — treat it like a password.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full bg-white/5" />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
              Failed to generate configuration. Make sure the server has an active branch.
            </div>
          ) : (
            <>
              {/* ── API KEY SECTION ── */}
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="size-4 text-amber-400" />
                    <span className="text-sm font-semibold text-white">API Token</span>
                    {apiKeyMeta ? (
                      <Badge className="bg-green-500/15 text-green-400 border-green-500/20 text-xs">Active</Badge>
                    ) : (
                      <Badge className="bg-neutral-500/15 text-neutral-400 border-neutral-500/20 text-xs">No token</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKeyMeta && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5 text-xs h-7"
                        onClick={() => {
                          if (confirm('Revoke this token? All clients using it will lose access.')) {
                            revokeKeyMutation.mutate()
                          }
                        }}
                        disabled={revokeKeyMutation.isPending}
                      >
                        {revokeKeyMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        Revoke
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs h-7 bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
                      onClick={() => generateKeyMutation.mutate()}
                      disabled={generateKeyMutation.isPending}
                    >
                      {generateKeyMutation.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      {apiKeyMeta ? 'Rotate Token' : 'Generate Token'}
                    </Button>
                  </div>
                </div>

                {apiKeyMeta && !newApiKey && (
                  <div className="flex items-center gap-3 text-xs text-neutral-400">
                    <span>Prefix: <code className="font-mono text-neutral-300">{apiKeyMeta.keyPrefix}…</code></span>
                    <span>·</span>
                    <span>Created {new Date(apiKeyMeta.createdAt).toLocaleDateString()}</span>
                    {apiKeyMeta.lastUsedAt && (
                      <><span>·</span><span>Last used {new Date(apiKeyMeta.lastUsedAt).toLocaleDateString()}</span></>
                    )}
                  </div>
                )}

                {newApiKey && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-amber-400">
                      <Info className="size-3.5" />
                      <span>Copy this token now. It will not be shown again.</span>
                    </div>
                    <RevealableToken value={newApiKey} />
                  </div>
                )}

                {!apiKeyMeta && !newApiKey && (
                  <p className="text-xs text-neutral-500">
                    Generate a token to authenticate MCP clients. The token is shown once at generation time.
                  </p>
                )}
              </div>

              <Separator className="bg-white/10" />

              {/* ── CONFIG TABS ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-blue-400" />
                  <span className="text-sm font-semibold text-white">Client Configuration</span>
                </div>

                {!config?.hasApiKey && (
                  <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-300">
                    <Info className="size-3.5 shrink-0" />
                    Generate a token above, then replace <code className="font-mono">&lt;your-api-key&gt;</code> in the configs below.
                  </div>
                )}

                <Tabs defaultValue="streamable">
                  <TabsList className="bg-white/5 border border-white/10 h-9">
                    <TabsTrigger
                      value="streamable"
                      className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 text-xs gap-1.5"
                    >
                      <Wifi className="size-3" />
                      Streamable HTTP
                    </TabsTrigger>
                    <TabsTrigger
                      value="sse"
                      className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 text-xs gap-1.5"
                    >
                      <ChevronRight className="size-3" />
                      SSE
                    </TabsTrigger>
                    <TabsTrigger
                      value="remote"
                      className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 text-xs gap-1.5"
                    >
                      <Terminal className="size-3" />
                      mcp-remote
                    </TabsTrigger>
                  </TabsList>

                  {/* Streamable HTTP */}
                  <TabsContent value="streamable" className="space-y-3 mt-4">
                    <div className="text-xs text-neutral-500 space-y-0.5">
                      <p className="font-medium text-neutral-300">Cursor · VS Code · ChatGPT · Claude Code</p>
                      <p>Use the Streamable HTTP transport — the modern MCP standard.</p>
                    </div>
                    <CodeBlock
                      code={streamableJson}
                      label="Add to your MCP client settings (mcp.json / .cursor/settings.json)"
                    />
                    <div className="bg-white/[0.03] rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-400">
                      <span className="text-neutral-300 font-medium">Endpoint: </span>
                      <code className="font-mono text-blue-400">{endpointUrl}</code>
                    </div>
                  </TabsContent>

                  {/* SSE */}
                  <TabsContent value="sse" className="space-y-3 mt-4">
                    <div className="text-xs text-neutral-500 space-y-0.5">
                      <p className="font-medium text-neutral-300">Claude Desktop · Claude.ai</p>
                      <p>Server-Sent Events transport. Requires <code className="font-mono">REDIS_URL</code> on the server.</p>
                    </div>
                    <CodeBlock
                      code={sseJson}
                      label="Add to your Claude Desktop config (claude_desktop_config.json)"
                    />
                  </TabsContent>

                  {/* mcp-remote */}
                  <TabsContent value="remote" className="space-y-3 mt-4">
                    <div className="text-xs text-neutral-500 space-y-0.5">
                      <p className="font-medium text-neutral-300">Any stdio client (Claude Desktop without native HTTP)</p>
                      <p>Bridges Streamable HTTP to stdio using <code className="font-mono">npx mcp-remote</code>.</p>
                    </div>
                    <CodeBlock
                      code={mcpRemoteJson}
                      label="Add to claude_desktop_config.json or any stdio-only client"
                    />
                  </TabsContent>
                </Tabs>
              </div>

              <Separator className="bg-white/10" />

              {/* ── TOOLS SUMMARY ── */}
              {(config?.tools?.length ?? 0) > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white flex items-center gap-2">
                      Tools exposed to clients
                    </span>
                    <Badge className="bg-white/5 text-neutral-400 border-white/10 text-xs">
                      {config?.tools?.length} tools
                    </Badge>
                  </div>
                  <div className="divide-y divide-white/5 rounded-lg border border-white/10 overflow-hidden">
                    {(config?.tools ?? []).slice(0, 10).map((tool) => (
                      <div key={tool.name} className="flex items-start gap-3 px-3 py-2.5 hover:bg-white/[0.03] transition-colors">
                        <code className="text-xs text-blue-400 font-mono whitespace-nowrap pt-0.5">{tool.name}</code>
                        <p className="text-xs text-neutral-400 leading-relaxed">{tool.description}</p>
                      </div>
                    ))}
                    {(config?.tools?.length ?? 0) > 10 && (
                      <div className="px-3 py-2 text-xs text-neutral-500 text-center">
                        + {(config?.tools?.length ?? 0) - 10} more tools
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
