/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
import { useAppStore } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Link2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ConnectionItem {
  id: string
  name: string
  host: string
  port: number
  database: string
  status: string
  authType: string
}

interface FormValues {
  name: string
  description: string
  version: string
}

export function ServerDialog() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const showServerDialog = useAppStore((s) => s.showServerDialog)
  const editingServerId = useAppStore((s) => s.editingServerId)
  const setShowServerDialog = useAppStore((s) => s.setShowServerDialog)

  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>([])

  const isEditing = !!editingServerId

  const { data: connections = [], isLoading: loadingConnections } = useQuery<ConnectionItem[]>({
    queryKey: ['connections'],
    queryFn: () => api.get<ConnectionItem[]>('/api/connections'),
    enabled: showServerDialog,
  })

  const { data: existingServer, isLoading: loadingServer } = useQuery({
    queryKey: ['server', editingServerId],
    queryFn: () => api.get<any>(`/api/servers/${editingServerId}`),
    enabled: isEditing,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { name: '', description: '', version: '1.0.0' },
  })

  useEffect(() => {
    if (isEditing && existingServer) {
      reset({
        name: existingServer.name,
        description: existingServer.description || '',
        version: existingServer.version,
      })
      setSelectedConnectionIds(existingServer.connections?.map((c: { connection: { id: string } }) => c.connection.id) || [])
    }
  }, [isEditing, existingServer, reset])

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      if (!isEditing) {
        reset({ name: '', description: '', version: '1.0.0' })
        setSelectedConnectionIds([])
      }
    }
    setShowServerDialog(open)
  }, [setShowServerDialog, reset, isEditing])

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.post<any>('/api/servers', {
        ...data,
        connectionIds: selectedConnectionIds,
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Server created')
      setShowServerDialog(false)
      if (data?.id) router.push(`/servers/${data.id}`)
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create server'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.put<any>(`/api/servers/${editingServerId}`, {
        ...data,
        connectionIds: selectedConnectionIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', editingServerId] })
      toast.success('Server updated')
      setShowServerDialog(false)
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update server'),
  })

  const onSubmit = (data: FormValues) => {
    if (isEditing) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  const toggleConnection = (id: string) => {
    setSelectedConnectionIds(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={showServerDialog} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Server' : 'Create New Server'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the server configuration and connections.'
              : 'Configure a new MCP server with FileMaker database connections.'}
          </DialogDescription>
        </DialogHeader>

        {isEditing && loadingServer ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-10 w-full" /></div>
            <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-24 w-full" /></div>
            <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-16 w-full" /></div>
          </div>
        ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="My MCP Server"
              {...register('name', { required: 'Server name is required' })}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the purpose of this MCP server..."
              rows={3}
              {...register('description')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="version">Version</Label>
            <Input
              id="version"
              placeholder="1.0.0"
              {...register('version')}
            />
          </div>

          <div className="space-y-3">
            <Label>FileMaker Connections</Label>
            {loadingConnections ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : connections.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No FileMaker connections configured. Create connections first.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto rounded-md border p-2">
                {connections.map((conn) => {
                  const isSelected = selectedConnectionIds.includes(conn.id)
                  return (
                    <div key={conn.id} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`conn-${conn.id}`}
                          checked={isSelected}
                          onCheckedChange={() => toggleConnection(conn.id)}
                        />
                        <label
                          htmlFor={`conn-${conn.id}`}
                          className="flex-1 text-sm cursor-pointer flex items-center gap-2"
                        >
                          <Link2 className="size-3.5 text-muted-foreground" />
                          <span className="font-medium">{conn.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {conn.status}
                          </Badge>
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowServerDialog(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}>
              {isSubmitting || createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : isEditing
                  ? 'Update Server'
                  : 'Create Server'}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
