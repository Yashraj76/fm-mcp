'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { Loader2, Zap, Eye, EyeOff } from 'lucide-react'

interface ConnectionFormData {
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string
  authType: string
  clientId: string
  clientSecret: string
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
  clientId: '',
  clientSecret: '',
  sslVerify: true,
}

export function ConnectionDialog() {
  const {
    showConnectionDialog,
    setShowConnectionDialog,
    editingConnectionId,
  } = useAppStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const isEditing = !!editingConnectionId

  const [draft, setDraft] = useState<ConnectionFormData>(emptyForm)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof ConnectionFormData, string>>>({})
  const [dirty, setDirty] = useState(false)

  // Fetch connection data for editing
  const { data: existingConnection } = useQuery({
    queryKey: ['connection', editingConnectionId],
    queryFn: () => fetch(`/api/connections/${editingConnectionId}`).then((r) => r.json()),
    enabled: isEditing && showConnectionDialog,
  })

  // Compute the effective form data: use draft if dirty, otherwise use server data
  const form = useMemo<ConnectionFormData>(() => {
    if (!showConnectionDialog) return emptyForm
    if (isEditing && existingConnection && !dirty) {
      return {
        name: existingConnection.name,
        host: existingConnection.host,
        port: existingConnection.port,
        database: existingConnection.database,
        username: existingConnection.username,
        password: existingConnection.password || '',
        authType: existingConnection.authType,
        clientId: existingConnection.clientId || '',
        clientSecret: existingConnection.clientSecret || '',
        sslVerify: existingConnection.sslVerify,
      }
    }
    return draft
  }, [showConnectionDialog, isEditing, existingConnection, dirty, draft])

  const updateField = useCallback(
    <K extends keyof ConnectionFormData>(key: K, value: ConnectionFormData[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }))
      setDirty(true)
      setErrors((prev) => {
        if (prev[key]) {
          const next = { ...prev }
          delete next[key]
          return next
        }
        return prev
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
    if (form.authType === 'oauth') {
      if (!form.clientId.trim()) newErrors.clientId = 'Client ID is required for OAuth'
      if (!form.clientSecret.trim()) newErrors.clientSecret = 'Client Secret is required for OAuth'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const saveMutation = useMutation({
    mutationFn: async (data: ConnectionFormData) => {
      const url = isEditing
        ? `/api/connections/${editingConnectionId}`
        : '/api/connections'
      const method = isEditing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Request failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['connection', editingConnectionId] })
      setShowConnectionDialog(false)
      toast({
        title: isEditing ? 'Connection Updated' : 'Connection Created',
        description: isEditing
          ? 'The connection has been updated successfully.'
          : 'New FileMaker connection has been added.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save connection',
        variant: 'destructive',
      })
    },
  })

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/connections/${id}/test`)
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      toast({
        title: data.success ? 'Connection Successful' : 'Connection Failed',
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    saveMutation.mutate(form)
  }

  const handleTest = () => {
    if (isEditing && editingConnectionId) {
      if (!validate()) return
      saveMutation.mutate(form, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['connections'] })
          testMutation.mutate(editingConnectionId)
        },
      })
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDraft(emptyForm)
      setErrors({})
      setShowPassword(false)
      setDirty(false)
    }
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
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
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
              />
              {errors.host && (
                <p className="text-xs text-destructive">{errors.host}</p>
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
            />
            {errors.database && (
              <p className="text-xs text-destructive">{errors.database}</p>
            )}
          </div>

          {/* Auth Type */}
          <div className="space-y-2">
            <Label>Authentication Type</Label>
            <Select value={form.authType} onValueChange={(v) => updateField('authType', v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic Auth</SelectItem>
                <SelectItem value="oauth">OAuth 2.0</SelectItem>
                <SelectItem value="clamid">Claris ID</SelectItem>
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
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username}</p>
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
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="size-3.5 text-muted-foreground" />
                ) : (
                  <Eye className="size-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          {/* OAuth fields (conditional) */}
          {form.authType === 'oauth' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="conn-client-id">
                  Client ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="conn-client-id"
                  placeholder="your-client-id"
                  value={form.clientId}
                  onChange={(e) => updateField('clientId', e.target.value)}
                  className={errors.clientId ? 'border-destructive' : ''}
                />
                {errors.clientId && (
                  <p className="text-xs text-destructive">{errors.clientId}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="conn-client-secret">
                  Client Secret <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="conn-client-secret"
                  type="password"
                  placeholder="your-client-secret"
                  value={form.clientSecret}
                  onChange={(e) => updateField('clientSecret', e.target.value)}
                  className={errors.clientSecret ? 'border-destructive' : ''}
                />
                {errors.clientSecret && (
                  <p className="text-xs text-destructive">{errors.clientSecret}</p>
                )}
              </div>
            </>
          )}

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

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            {isEditing && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={saveMutation.isPending || testMutation.isPending}
              >
                {testMutation.isPending ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="size-4 mr-2" />
                )}
                Save & Test
              </Button>
            )}
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              {isEditing ? 'Update Connection' : 'Create Connection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
