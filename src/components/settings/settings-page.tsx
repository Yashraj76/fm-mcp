'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Settings,
  Palette,
  Database,
  Bot,
  Shield,
  Key,
  Zap,
  Globe,
  Brain,
  Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface SettingsData {
  general: { theme: string; autoSave: boolean; connectionTimeout: number }
  filemakerApi: { dataApiVersion: string; maxRecordsPerRequest: number; portalDepthLimit: number; defaultLayout: string }
  ai: {
    provider: string; apiKey?: string; apiKeyMasked?: string; model: string; baseUrl: string;
    maxTokens: number | null; temperature: number; maxSuggestions: number;
    autoSuggestOnSchemaLoad: boolean; toolGenerationEnabled: boolean; schemaAnalysisEnabled: boolean;
    rateLimitPerMinute: number | null; monthlyBudget: number | null;
    enableToolTesting: boolean; verboseLogging: boolean;
  }
  security: { encryptCredentials: boolean; tokenExpiryMinutes: number; auditLogging: boolean; allowedOrigins: string[] }
}

const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', icon: '🤖', desc: 'GPT-4, GPT-4o, GPT-3.5' },
  { id: 'anthropic', name: 'Anthropic', icon: '🧠', desc: 'Claude 3.5 Sonnet, Claude 3 Opus' },
  { id: 'google', name: 'Google AI', icon: '💎', desc: 'Gemini 1.5 Pro, Gemini Flash' },
  { id: 'ollama', name: 'Ollama (Local)', icon: '🦙', desc: 'Llama, Mistral, CodeLlama' },
  { id: 'custom', name: 'Custom Provider', icon: '🔧', desc: 'Any OpenAI-compatible API' },
]

const MODEL_MAP: Record<string, string[]> = {
  openai: ['gpt-4', 'gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
  ollama: ['llama3.2', 'codellama', 'mistral', 'mixtral', 'qwen2.5-coder'],
  custom: [],
}

const defaults: SettingsData = {
  general: { theme: 'dark', autoSave: true, connectionTimeout: 30 },
  filemakerApi: { dataApiVersion: 'v2', maxRecordsPerRequest: 100, portalDepthLimit: 5, defaultLayout: '' },
  ai: {
    provider: 'openai', model: '', baseUrl: '', maxTokens: 4096, temperature: 0.7,
    maxSuggestions: 10, autoSuggestOnSchemaLoad: true, toolGenerationEnabled: true,
    schemaAnalysisEnabled: true, rateLimitPerMinute: 60, monthlyBudget: null,
    enableToolTesting: true, verboseLogging: false,
  },
  security: { encryptCredentials: true, tokenExpiryMinutes: 15, auditLogging: true, allowedOrigins: [] },
}

// ─── API Tokens Card ───────────────────────────────────────────────────────

interface ServerListItem { id: string; name: string }
interface ApiKeyMeta { keyPrefix: string; createdAt: string; lastUsedAt: string | null }

function ApiTokensCard() {
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: servers, isLoading: serversLoading } = useQuery<ServerListItem[]>({
    queryKey: ['servers-list-for-tokens'],
    queryFn: async () => {
      const data = await api.get<any[]>('/api/servers')
      return data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))
    },
  })

  const { data: apiKeyMeta, refetch: refetchMeta } = useQuery<ApiKeyMeta | null>({
    queryKey: ['api-key-meta-settings', selectedServerId],
    queryFn: () => api.get<ApiKeyMeta | null>(`/api/servers/${selectedServerId}/api-key`),
    enabled: !!selectedServerId,
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post<{ apiKey: string }>(`/api/servers/${selectedServerId}/api-key`),
    onSuccess: (data) => {
      setNewKey(data.apiKey)
      setShown(false)
      setCopied(false)
      toast.success('Token generated — copy it now!')
      refetchMeta()
      queryClient.invalidateQueries({ queryKey: ['config', selectedServerId] })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to generate token')
    },
  })

  const revokeMutation = useMutation({
    mutationFn: () =>
      api.delete<void>(`/api/servers/${selectedServerId}/api-key`),
    onSuccess: () => {
      setNewKey(null)
      toast.success('Token revoked')
      refetchMeta()
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to revoke token')
    },
  })

  const handleCopy = async () => {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    setCopied(true)
    toast.success('Token copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Key className="size-4 text-muted-foreground" />
          API Tokens
        </CardTitle>
        <CardDescription>Generate bearer tokens to authenticate MCP clients with your servers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
          <Info className="size-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-300">
            Each MCP server has one active API token. Generate a token here and paste it into your MCP client
            config (<code className="font-mono">Authorization: Bearer &lt;token&gt;</code>). Rotating creates a new token and immediately invalidates the old one.
          </p>
        </div>

        {/* Server picker */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Select Server</Label>
          {serversLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={selectedServerId} onValueChange={(v) => { setSelectedServerId(v); setNewKey(null) }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Choose an MCP server..." />
              </SelectTrigger>
              <SelectContent>
                {(servers ?? []).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedServerId && (
          <>
            <Separator />
            {/* Current token status */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Current Token</Label>
                {apiKeyMeta ? (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">Active</Badge>
                    <span>Prefix: <code className="font-mono">{apiKeyMeta.keyPrefix}…</code></span>
                    <span>Created {new Date(apiKeyMeta.createdAt).toLocaleDateString()}</span>
                    {apiKeyMeta.lastUsedAt && <span>· Used {new Date(apiKeyMeta.lastUsedAt).toLocaleDateString()}</span>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No token generated yet for this server.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {apiKeyMeta && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
                    onClick={() => setRevokeOpen(true)}
                    disabled={revokeMutation.isPending}
                  >
                    {revokeMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    Revoke
                  </Button>
                )}
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  {apiKeyMeta ? 'Rotate Token' : 'Generate Token'}
                </Button>
              </div>
            </div>

            {/* Newly generated token reveal */}
            {newKey && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-amber-500">
                  <Info className="size-3.5" />
                  <span>Copy this token now — it will not be shown again after you leave this page.</span>
                </div>
                <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 border font-mono text-sm">
                  <span className="flex-1 text-green-500 break-all">
                    {shown ? newKey : '•'.repeat(Math.min(newKey.length, 48))}
                  </span>
                  <button onClick={() => setShown(s => !s)} className="text-muted-foreground hover:text-foreground shrink-0" aria-label={shown ? "Hide API token" : "Show API token"}>
                    {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={handleCopy} aria-label="Copy token to clipboard">
                    {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="Revoke API token?"
        description="All clients using this token will lose access immediately. This cannot be undone."
        confirmLabel="Revoke"
        onConfirm={() => revokeMutation.mutate()}
      />
    </Card>
  )
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const { theme: activeTheme, setTheme } = useTheme()
  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: async () => { 
      const d = await api.get<any>('/api/settings'); 
      // map flat to nested
      return {
        general: defaults.general,
        filemakerApi: defaults.filemakerApi,
        ai: {
          ...defaults.ai,
          provider: d.aiProvider ?? defaults.ai.provider,
          model: d.aiModel ?? defaults.ai.model,
          apiKeyMasked: d.aiApiKeyMasked,
          baseUrl: d.aiBaseUrl ?? defaults.ai.baseUrl,
          maxTokens: d.aiMaxTokens ?? defaults.ai.maxTokens,
          temperature: d.aiTemperature ?? defaults.ai.temperature,
        },
        security: defaults.security
      };
    },
    retry: 1,
  })

  const saveMutation = useMutation({
    mutationFn: (s: Record<string, unknown>) =>
      api.put<any>('/api/settings', s),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setLocalSettings(null)
      setTempApiKey('')
      toast.success('Settings saved')
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save settings')
    },
  })

  const testAiMutation = useMutation({
    mutationFn: (d: { provider: string; apiKey: string; baseUrl: string }) =>
      api.post<{ ok: boolean; provider: string }>('/api/settings/test-ai', d),
    onSuccess: (data) => {
      toast.success(`Connected to ${data.provider} — ${data.ok ? 'OK' : 'Failed'}`)
    },
    onError: (err: any) => {
      toast.error(err.message || 'Connection test failed')
    },
  })

  const [localSettings, setLocalSettings] = useState<Partial<SettingsData> | null>(null)
  const [tempApiKey, setTempApiKey] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')

  const base = { ...defaults, ...(settings || {}) }
  const edited: SettingsData = {
    ...base,
    general: { ...base.general, ...localSettings?.general },
    filemakerApi: { ...base.filemakerApi, ...localSettings?.filemakerApi },
    ai: { ...base.ai, ...localSettings?.ai },
    security: { ...base.security, ...localSettings?.security },
  }

  const update = (section: string, key: string, value: unknown) => {
    setLocalSettings(prev => ({
      ...prev,
      [section]: { ...(prev?.[section as keyof SettingsData] as Record<string, unknown> ?? {}), [key]: value },
    }))
  }

  const handleSave = () => {
    // map nested to flat for API
    const aiSettings = (localSettings?.ai || {}) as Partial<SettingsData['ai']>;
    const payload: Record<string, unknown> = {};
    if (aiSettings.provider !== undefined) payload.aiProvider = aiSettings.provider;
    if (aiSettings.model !== undefined) payload.aiModel = aiSettings.model;
    if (aiSettings.baseUrl !== undefined) payload.aiBaseUrl = aiSettings.baseUrl;
    if (aiSettings.maxTokens !== undefined) payload.aiMaxTokens = aiSettings.maxTokens;
    if (aiSettings.temperature !== undefined) payload.aiTemperature = aiSettings.temperature;
    
    if (tempApiKey) {
      payload.aiApiKey = tempApiKey;
    }
    
    // Only save if there's something to save
    if (Object.keys(payload).length > 0) {
      saveMutation.mutate(payload)
    } else {
      setLocalSettings(null);
      toast.success('No changes to save');
    }
  }

  const handleTestAi = async () => {
    const key = tempApiKey || ''
    if (!key && edited.ai.provider !== 'ollama') { toast.error('Enter an API key first'); return }
    setTestStatus('testing')
    try {
      const res = await testAiMutation.mutateAsync({ provider: edited.ai.provider, apiKey: key, baseUrl: edited.ai.baseUrl })
      setTestStatus(res.ok ? 'success' : 'error')
    } catch {
      setTestStatus('error')
    }
    setTimeout(() => setTestStatus('idle'), 3000)
  }

  const hasChanges = localSettings !== null || tempApiKey !== ''

  if (isLoading) return <div className="p-6 space-y-6"><Skeleton className="h-8 w-48" /><div className="grid gap-6 md:grid-cols-2">{[0,1,2,3].map(i=><Skeleton key={i} className="h-64"/>)}</div></div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Settings className="size-6" />Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure platform behavior, AI providers, and security</p>
        </div>
        <div className="flex gap-2">
          {hasChanges && <Button variant="ghost" size="sm" onClick={() => { setLocalSettings(null); setTempApiKey('') }}>Discard</Button>}
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* General */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Palette className="size-4 text-muted-foreground" />General</CardTitle>
            <CardDescription>Appearance and behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div><Label className="text-sm font-medium">Theme</Label><p className="text-xs text-muted-foreground">Interface color scheme</p></div>
              <Select
                value={activeTheme ?? edited.general.theme}
                onValueChange={v => {
                  setTheme(v)
                  update('general', 'theme', v)
                }}
              >
                <SelectTrigger className="w-32" id="theme-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">🌙 Dark</SelectItem>
                  <SelectItem value="light">☀️ Light</SelectItem>
                  <SelectItem value="system">💻 System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div><Label className="text-sm font-medium">Auto-Save</Label><p className="text-xs text-muted-foreground">Automatically save changes</p></div>
              <Switch checked={edited.general.autoSave} onCheckedChange={v => update('general', 'autoSave', v)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div><Label className="text-sm font-medium">Connection Timeout</Label><p className="text-xs text-muted-foreground">Seconds before timeout</p></div>
                <span className="text-sm font-mono text-muted-foreground">{edited.general.connectionTimeout}s</span>
              </div>
              <Slider value={[edited.general.connectionTimeout]} onValueChange={v => update('general', 'connectionTimeout', v[0])} min={5} max={120} step={5} />
            </div>
          </CardContent>
        </Card>

        {/* FileMaker API */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Database className="size-4 text-muted-foreground" />FileMaker API</CardTitle>
            <CardDescription>Data API and OData configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div><Label className="text-sm font-medium">API Version</Label><p className="text-xs text-muted-foreground">FileMaker Data API version</p></div>
              <Select value={edited.filemakerApi.dataApiVersion} onValueChange={v => update('filemakerApi', 'dataApiVersion', v)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="v2">v2</SelectItem><SelectItem value="v1">v1</SelectItem><SelectItem value="latest">Latest</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div><Label className="text-sm font-medium">Max Records per Request</Label><p className="text-xs text-muted-foreground">Limit for find/GET queries</p></div>
                <span className="text-sm font-mono text-muted-foreground">{edited.filemakerApi.maxRecordsPerRequest}</span>
              </div>
              <Slider value={[edited.filemakerApi.maxRecordsPerRequest]} onValueChange={v => update('filemakerApi', 'maxRecordsPerRequest', v[0])} min={1} max={10000} step={50} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div><Label className="text-sm font-medium">Portal Depth Limit</Label><p className="text-xs text-muted-foreground">Max portal recursion depth</p></div>
                <span className="text-sm font-mono text-muted-foreground">{edited.filemakerApi.portalDepthLimit}</span>
              </div>
              <Slider value={[edited.filemakerApi.portalDepthLimit]} onValueChange={v => update('filemakerApi', 'portalDepthLimit', v[0])} min={1} max={10} step={1} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Default Layout</Label>
              <Input placeholder="e.g. Contacts_API" value={edited.filemakerApi.defaultLayout} onChange={e => update('filemakerApi', 'defaultLayout', e.target.value)} className="h-8 text-sm" />
              <p className="text-xs text-muted-foreground">Fallback layout when none specified in tool config</p>
            </div>
          </CardContent>
        </Card>

        {/* AI Configuration */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Bot className="size-4 text-muted-foreground" />AI Configuration</CardTitle>
                <CardDescription>Select AI provider, set API key, and manage usage limits</CardDescription>
              </div>
              {hasChanges && <Badge variant="outline" className="text-xs">Unsaved changes</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Provider Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">AI Provider</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {AI_PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => update('ai', 'provider', p.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-colors ${edited.ai.provider === p.id ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'}`}>
                    <span className="text-lg">{p.icon}</span>
                    <span className="text-xs font-medium">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <Separator />
            {/* API Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5"><Key className="size-3.5" />API Key</Label>
                {edited.ai.apiKeyMasked && !tempApiKey && <span className="text-xs text-muted-foreground font-mono">{edited.ai.apiKeyMasked}</span>}
              </div>
              <div className="flex gap-2">
                <Input type="password" placeholder={edited.ai.apiKeyMasked ? 'Enter new key to replace...' : 'Enter your API key...'} value={tempApiKey} onChange={e => setTempApiKey(e.target.value)} className="flex-1 h-9 text-sm font-mono" />
                <Button variant="outline" size="sm" onClick={handleTestAi} disabled={testStatus === 'testing'}>
                  {testStatus === 'testing' ? <Loader2 className="size-3.5 animate-spin" /> : testStatus === 'success' ? <CheckCircle2 className="size-3.5 text-green-500" /> : testStatus === 'error' ? <XCircle className="size-3.5 text-red-500" /> : <Zap className="size-3.5" />}
                  Test
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">API keys are encrypted at rest and masked in the UI.</p>
            </div>
            {/* Base URL for ollama/custom */}
            {(edited.ai.provider === 'ollama' || edited.ai.provider === 'custom') && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5"><Globe className="size-3.5" />{edited.ai.provider === 'ollama' ? 'Ollama Server URL' : 'Custom Base URL'}</Label>
                <Input placeholder={edited.ai.provider === 'ollama' ? 'http://localhost:11434' : 'https://your-api.example.com/v1'} value={edited.ai.baseUrl} onChange={e => update('ai', 'baseUrl', e.target.value)} className="h-9 text-sm font-mono" />
              </div>
            )}
            <Separator />
            {/* Model + Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Model</Label>
                {MODEL_MAP[edited.ai.provider]?.length ? (
                  <Select value={edited.ai.model} onValueChange={v => update('ai', 'model', v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select model..." /></SelectTrigger>
                    <SelectContent>{MODEL_MAP[edited.ai.provider].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <Input placeholder="Enter model name..." value={edited.ai.model} onChange={e => update('ai', 'model', e.target.value)} className="h-9 text-sm" />}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Max Tokens</Label>
                <Input type="number" placeholder="4096" value={edited.ai.maxTokens ?? ''} onChange={e => update('ai', 'maxTokens', e.target.value ? Number(e.target.value) : null)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Temperature</Label>
                <div className="flex items-center gap-2"><Slider value={[edited.ai.temperature ?? 0.7]} onValueChange={v => update('ai', 'temperature', v[0])} min={0} max={2} step={0.1} className="flex-1" /><span className="text-xs font-mono text-muted-foreground w-8 text-right">{(edited.ai.temperature ?? 0.7).toFixed(1)}</span></div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Max Suggestions</Label>
                <Input type="number" placeholder="10" value={edited.ai.maxSuggestions} onChange={e => update('ai', 'maxSuggestions', Number(e.target.value) || 10)} className="h-9 text-sm" />
              </div>
            </div>
            <Separator />
            {/* AI Feature Toggles */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1.5"><Brain className="size-3.5" />AI Features</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                {[
                  { key: 'autoSuggestOnSchemaLoad', label: 'Auto-suggest Tools', desc: 'Suggest tools when schema loads' },
                  { key: 'toolGenerationEnabled', label: 'Tool Generation', desc: 'Allow AI to generate tool configs' },
                  { key: 'schemaAnalysisEnabled', label: 'Schema Analysis', desc: 'AI analysis of FM schemas' },
                  { key: 'enableToolTesting', label: 'Tool Testing', desc: 'AI can execute test calls' },
                  { key: 'verboseLogging', label: 'Verbose Logging', desc: 'Log full AI requests/responses' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div><p className="text-sm">{item.label}</p><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                    <Switch checked={edited.ai[item.key as keyof typeof edited.ai] as boolean} onCheckedChange={v => update('ai', item.key, v)} />
                  </div>
                ))}
              </div>
            </div>
            <Separator />
            {/* Usage Limits */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1.5"><Wrench className="size-3.5" />Usage Limits</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Rate Limit (per minute)</Label>
                    {edited.ai.rateLimitPerMinute === null ? <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">No limit</Badge> : <span className="text-xs font-mono text-muted-foreground">{edited.ai.rateLimitPerMinute}/min</span>}
                  </div>
                  <Slider value={[edited.ai.rateLimitPerMinute ?? 0]} onValueChange={v => update('ai', 'rateLimitPerMinute', v[0] === 0 ? null : v[0])} min={0} max={1000} step={10} />
                  <p className="text-xs text-muted-foreground">Set to 0 for no rate limit</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Monthly Budget (tokens)</Label>
                    {(edited.ai.monthlyBudget === null || edited.ai.monthlyBudget === undefined) ? <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">No limit</Badge> : <span className="text-xs font-mono text-muted-foreground">{(edited.ai.monthlyBudget / 1000).toFixed(0)}K</span>}
                  </div>
                  <Slider value={[edited.ai.monthlyBudget ?? 0]} onValueChange={v => update('ai', 'monthlyBudget', v[0] === 0 ? null : v[0])} min={0} max={10000000} step={100000} />
                  <p className="text-xs text-muted-foreground">Set to 0 for no budget limit</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="size-4 text-muted-foreground" />Security</CardTitle>
            <CardDescription>Encryption, tokens, and access control</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div><Label className="text-sm font-medium">Encrypt Credentials</Label><p className="text-xs text-muted-foreground">AES-256 for stored passwords</p></div>
              <Switch checked={edited.security.encryptCredentials} onCheckedChange={v => update('security', 'encryptCredentials', v)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div><Label className="text-sm font-medium">Token Expiry</Label><p className="text-xs text-muted-foreground">MCP token validity</p></div>
                <span className="text-sm font-mono text-muted-foreground">{edited.security.tokenExpiryMinutes} min</span>
              </div>
              <Slider value={[edited.security.tokenExpiryMinutes]} onValueChange={v => update('security', 'tokenExpiryMinutes', v[0])} min={1} max={1440} step={5} />
            </div>
            <div className="flex items-center justify-between">
              <div><Label className="text-sm font-medium">Audit Logging</Label><p className="text-xs text-muted-foreground">Log all tool executions and changes</p></div>
              <Switch checked={edited.security.auditLogging} onCheckedChange={v => update('security', 'auditLogging', v)} />
            </div>
          </CardContent>
        </Card>

        {/* API Tokens */}
        <ApiTokensCard />
      </div>
    </div>
  )
}
