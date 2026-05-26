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

  // Fetch connection data for editing
  const { data: existingConnection } = useQuery({
    queryKey: ['connection', editingConnectionId],
    queryFn: () => api.get<any>(`/api/connections/${editingConnectionId}`),
    enabled: isEditing && showConnectionDialog,
    placeholderData: () => {
      const all = queryClient.getQueryData<any[]>(['connections'])
      return all?.find(c => c.id === editingConnectionId)
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
          password: existingConnection.password ?? '',
          authType: existingConnection.authType ?? 'basic',
          clientId: existingConnection.clientId ?? '',
          clientSecret: existingConnection.clientSecret ?? '',
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
    if (form.authType === 'oauth') {
      if (!form.clientId.trim()) newErrors.clientId = 'Client ID is required for OAuth'
      if (!form.clientSecret.trim()) newErrors.clientSecret = 'Client Secret is required for OAuth'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const saveMutation = useMutation({
    mutationFn: (data: ConnectionFormData) => {
      if (isEditing) {
        return api.put<any>(`/api/connections/${editingConnectionId}`, data)
      } else {
        return api.post<any>('/api/connections', data)
      }
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
      toast({
        title: 'Connection Successful',
        description: 'Successfully connected to FileMaker Server.',
        variant: 'default',
      })
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast({
        title: 'Connection Failed',
        description: err.message || 'Could not connect to FileMaker Server.',
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    saveMutation.mutate(form)
  }

  const handleTest = () => {
    if (!validate()) return
    if (isEditing && editingConnectionId) {
      saveMutation.mutate(form, {
        onSuccess: (res) => {
          const id = res?.data?.id || editingConnectionId
          testMutation.mutate(id)
        },
      })
    } else {
      saveMutation.mutate(form, {
        onSuccess: (res) => {
          const id = res?.data?.id
          if (id) testMutation.mutate(id)
        },
      })
    }
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
                  aria-invalid={errors.clientId ? "true" : "false"}
                  aria-describedby={errors.clientId ? "conn-client-id-error" : undefined}
                />
                {errors.clientId && (
                  <p id="conn-client-id-error" className="text-xs text-destructive">{errors.clientId}</p>
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
                  aria-invalid={errors.clientSecret ? "true" : "false"}
                  aria-describedby={errors.clientSecret ? "conn-client-secret-error" : undefined}
                />
                {errors.clientSecret && (
                  <p id="conn-client-secret-error" className="text-xs text-destructive">{errors.clientSecret}</p>
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
              disabled={saveMutation.isPending || testMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={saveMutation.isPending || testMutation.isPending}
            >
              {((saveMutation.isPending && testMutation.isPending) || testMutation.isPending) ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Zap className="size-4 mr-2" />
              )}
              {isEditing ? 'Save & Test' : 'Create & Test'}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || testMutation.isPending}>
              {saveMutation.isPending && !testMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              {isEditing ? 'Update Connection' : 'Create Connection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
