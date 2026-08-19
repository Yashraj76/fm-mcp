'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
import { useAppStore } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Zap, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'

interface ConnectionFormData {
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string
  authType: string
  sslVerify: boolean
}

const emptyForm: ConnectionFormData = {
  name: '',
  host: '',
  port: 443,
  database: '',
  username: '',
  password: '',
  authType: 'basic',
  sslVerify: true,
}

export function ConnectionDialog() {
  const showConnectionDialog = useAppStore((s) => s.showConnectionDialog)
  const setShowConnectionDialog = useAppStore((s) => s.setShowConnectionDialog)
  const editingConnectionId = useAppStore((s) => s.editingConnectionId)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const isEditing = !!editingConnectionId

  // Single source of truth for the form — always controlled
  const [form, setForm] = useState<ConnectionFormData>(emptyForm)
  const [seeded, setSeeded] = useState(false) // tracks if we've applied server data to form
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof ConnectionFormData, string>>>({})
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  // Set when "Create & Test" saves a new connection while the dialog stays
  // open. Later saves in the same dialog session update this connection
  // instead of creating a duplicate.
  const [createdId, setCreatedId] = useState<string | null>(null)

  // Fetch connection data for editing
  const { data: existingConnection } = useQuery({
    queryKey: ['connection', editingConnectionId],
    queryFn: () => api.get<any>(`/api/connections/${editingConnectionId}`),
    enabled: isEditing && showConnectionDialog,
    placeholderData: () => {
      // ['connections'] is populated by connections-page.tsx's useInfiniteQuery,
      // so its cached shape is { pages: { data: any[] }[], pageParams }, not a
      // flat array — flatten it before searching.
      const cached = queryClient.getQueryData<{ pages: { data: any[] }[] }>(['connections'])
      const all = cached?.pages?.flatMap((p) => p?.data ?? []) ?? []
      return all.find((c) => c.id === editingConnectionId)
    }
  })

  // Seed form from server data ONCE when it arrives (edit mode only)
  useEffect(() => {
    if (isEditing && existingConnection && !seeded) {
      queueMicrotask(() => {
        setForm({
          name: existingConnection.name ?? '',
          host: existingConnection.host ?? '',
          port: existingConnection.port ?? 443,
          database: existingConnection.database ?? '',
          username: existingConnection.username ?? '',
          // Never pre-fill credentials — the API never returns ciphertext, and
          // even if it did, we must never render it in an input.
          // An empty value means "leave current password unchanged" on save.
          password: '',
          // Basic is the only implemented auth type — coerce legacy
          // 'oauth'/'clamid' rows so the Select always has a valid value.
          authType: 'basic',
          sslVerify: existingConnection.sslVerify ?? true,
        })
        setSeeded(true)
      })
    }
  }, [isEditing, existingConnection, seeded])

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!showConnectionDialog) {
      queueMicrotask(() => {
        setForm(emptyForm)
        setSeeded(false)
        setErrors({})
        setShowPassword(false)
        setTestResult(null)
        setCreatedId(null)
      })
    }
  }, [showConnectionDialog])

  // Update a single field without touching the rest
  const updateField = useCallback(
    <K extends keyof ConnectionFormData>(key: K, value: ConnectionFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      setErrors((prev) => {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    },
    []
  )

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ConnectionFormData, string>> = {}
    if (!form.name.trim()) newErrors.name = 'Name is required'
    if (!form.host.trim()) newErrors.host = 'Host is required'
    if (!form.database.trim()) newErrors.database = 'Database name is required'
    if (!form.username.trim()) newErrors.username = 'Username is required'
    if (!form.password.trim() && !isEditing) newErrors.password = 'Password is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // The id this dialog session writes to: the connection being edited, or the
  // one already created by an earlier "Create & Test" in this session.
  const effectiveId = editingConnectionId ?? createdId

  const saveMutation = useMutation({
    // `test` records the caller's intent so onSuccess knows whether to close
    // the dialog (plain save) or keep it open and run the connection test.
    mutationFn: ({ data }: { data: ConnectionFormData; test: boolean }) => {
      if (effectiveId) {
        return api.put<any>(`/api/connections/${effectiveId}`, data)
      } else {
        return api.post<any>('/api/connections', data)
      }
    },
    onSuccess: (res, { test }) => {
      const wasUpdate = !!effectiveId
      const savedId = effectiveId ?? (res?.id as string | undefined)
      if (!effectiveId && savedId) setCreatedId(savedId)
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      if (savedId) queryClient.invalidateQueries({ queryKey: ['connection', savedId] })
      toast({
        title: wasUpdate ? 'Connection Updated' : 'Connection Created',
        description: wasUpdate
          ? 'The connection has been updated successfully.'
          : 'New FileMaker connection has been added.',
      })
      if (test && savedId) {
        // Keep the dialog open so the inline testResult panel can render;
        // the user closes it once they've seen the outcome.
        testMutation.mutate(savedId)
      } else {
        setShowConnectionDialog(false)
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save connection',
        variant: 'destructive',
      })
    },
  })

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post<any>(`/api/connections/${id}/test`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setTestResult({ ok: true, message: 'Connected successfully to FileMaker Data API.' })
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      const raw = err.message || 'Could not connect.'
      const hint = raw.includes('401') || raw.toLowerCase().includes('auth')
        ? ' Check username and password.'
        : raw.includes('ECONNREFUSED') || raw.includes('ENOTFOUND') || raw.includes('timeout')
        ? ' Check host, port, and that FileMaker Server is reachable.'
        : raw.includes('ssl') || raw.includes('certificate')
        ? ' Try disabling SSL verification if using a self-signed certificate.'
        : ''
      setTestResult({ ok: false, message: raw + hint })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setTestResult(null)
    saveMutation.mutate({ data: form, test: false })
  }

  const handleTest = () => {
    if (!validate()) return
    setTestResult(null)
    saveMutation.mutate({ data: form, test: true })
  }

  const handleOpenChange = (open: boolean) => {
    setShowConnectionDialog(open)
  }

  return (
    <Dialog open={showConnectionDialog} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Connection' : 'New Connection'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update FileMaker Data API connection settings.'
              : 'Configure a new FileMaker Data API connection.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="conn-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="conn-name"
              placeholder="e.g., Production FM Server"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className={errors.name ? 'border-destructive' : ''}
              aria-invalid={errors.name ? "true" : "false"}
              aria-describedby={errors.name ? "conn-name-error" : undefined}
            />
            {errors.name && (
              <p id="conn-name-error" className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div className="space-y-2">
              <Label htmlFor="conn-host">
                Host <span className="text-destructive">*</span>
              </Label>
              <Input
                id="conn-host"
                placeholder="fm.example.com"
                value={form.host}
                onChange={(e) => updateField('host', e.target.value)}
                className={errors.host ? 'border-destructive' : ''}
                aria-invalid={errors.host ? "true" : "false"}
                aria-describedby={errors.host ? "conn-host-error" : undefined}
              />
              {errors.host && (
                <p id="conn-host-error" className="text-xs text-destructive">{errors.host}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-port">Port</Label>
              <Input
                id="conn-port"
                type="number"
                value={form.port}
                onChange={(e) => updateField('port', parseInt(e.target.value) || 443)}
              />
            </div>
          </div>

          {/* Database */}
          <div className="space-y-2">
            <Label htmlFor="conn-database">
              Database <span className="text-destructive">*</span>
            </Label>
            <Input
              id="conn-database"
              placeholder="MyDatabase"
              value={form.database}
              onChange={(e) => updateField('database', e.target.value)}
              className={errors.database ? 'border-destructive' : ''}
              aria-invalid={errors.database ? "true" : "false"}
              aria-describedby={errors.database ? "conn-database-error" : undefined}
            />
            {errors.database && (
              <p id="conn-database-error" className="text-xs text-destructive">{errors.database}</p>
            )}
          </div>

          {/* Auth Type */}
          <div className="space-y-2">
            <Label>Authentication Type</Label>
            <Select value={form.authType} onValueChange={(v) => updateField('authType', v)}>
              <SelectTrigger className="w-full" aria-label="Select Authentication Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Only Basic is implemented in FileMakerClient.login() — do not
                    re-add OAuth/Claris ID here without implementing those login
                    flows and widening the authType Zod schemas to match. */}
                <SelectItem value="basic">Basic Auth</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="conn-username">
              Username <span className="text-destructive">*</span>
            </Label>
            <Input
              id="conn-username"
              placeholder="db_username"
              value={form.username}
              onChange={(e) => updateField('username', e.target.value)}
              className={errors.username ? 'border-destructive' : ''}
              aria-invalid={errors.username ? "true" : "false"}
              aria-describedby={errors.username ? "conn-username-error" : undefined}
            />
            {errors.username && (
              <p id="conn-username-error" className="text-xs text-destructive">{errors.username}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="conn-password">
              Password <span className="text-destructive">*</span>
              {isEditing && (
                <span className="text-muted-foreground font-normal"> (leave blank to keep current)</span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="conn-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                className={`pr-9 ${errors.password ? 'border-destructive' : ''}`}
                aria-invalid={errors.password ? "true" : "false"}
                aria-describedby={errors.password ? "conn-password-error" : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-3.5 text-muted-foreground" />
                ) : (
                  <Eye className="size-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
            {errors.password && (
              <p id="conn-password-error" className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          {/* SSL Verify */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="conn-ssl" className="cursor-pointer">SSL Certificate Verify</Label>
              <p className="text-[11px] text-muted-foreground">
                Verify the server&apos;s SSL certificate
              </p>
            </div>
            <Switch
              id="conn-ssl"
              checked={form.sslVerify}
              onCheckedChange={(checked) => updateField('sslVerify', checked)}
            />
          </div>

          {testResult && (
            <div className={`rounded-lg border px-3 py-2.5 text-xs flex items-start gap-2 ${
              testResult.ok
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              {testResult.ok
                ? <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" />
                : <XCircle className="size-3.5 shrink-0 mt-0.5" />}
              <span>{testResult.message}</span>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saveMutation.isPending || testMutation.isPending}
            >
              {/* After a "& Test" save the connection already exists — closing
                  is no longer a cancellation. */}
              {testResult || createdId ? 'Close' : 'Cancel'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={saveMutation.isPending || testMutation.isPending}
            >
              {((saveMutation.isPending && saveMutation.variables?.test) || testMutation.isPending) ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Zap className="size-4 mr-2" />
              )}
              {effectiveId ? 'Save & Test' : 'Create & Test'}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || testMutation.isPending}>
              {saveMutation.isPending && !saveMutation.variables?.test && <Loader2 className="size-4 mr-2 animate-spin" />}
              {effectiveId ? 'Update Connection' : 'Create Connection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
