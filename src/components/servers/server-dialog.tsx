'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { useState, useCallback } from 'react'

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
  const { showServerDialog, editingServerId, setShowServerDialog, triggerRefreshServers } = useAppStore()
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>([])
  const [fileNamesPerConnection, setFileNamesPerConnection] = useState<Record<string, string>>({})

  const isEditing = !!editingServerId

  const { data: connections = [], isLoading: loadingConnections } = useQuery<ConnectionItem[]>({
    queryKey: ['connections'],
    queryFn: () => fetch('/api/connections').then(r => r.json()).then(res => res.data ?? []),
  })

  const { data: existingServer } = useQuery({
    queryKey: ['server', editingServerId],
    queryFn: () => fetch(`/api/servers/${editingServerId}`).then(r => r.json()).then(res => res.data),
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

  const handleOpenChange = useCallback((open: boolean) => {
    if (open && existingServer && isEditing) {
      reset({
        name: existingServer.name,
        description: existingServer.description || '',
        version: existingServer.version,
      })
      setSelectedConnectionIds(existingServer.connections?.map((c: { connection: { id: string } }) => c.connection.id) || [])
      const fnMap: Record<string, string> = {}
      existingServer.connections?.forEach((c: { connection: { id: string }; fileNames: string }) => {
        try { fnMap[c.connection.id] = JSON.parse(c.fileNames).join(', ') } catch { fnMap[c.connection.id] = '' }
      })
      setFileNamesPerConnection(fnMap)
    } else if (open) {
      reset({ name: '', description: '', version: '1.0.0' })
      setSelectedConnectionIds([])
      setFileNamesPerConnection({})
    }
    setShowServerDialog(open)
  }, [setShowServerDialog, reset, existingServer, isEditing])

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          connectionIds: selectedConnectionIds,
          fileNamesPerConnection: selectedConnectionIds.map(id => fileNamesPerConnection[id] || ''),
        }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      triggerRefreshServers()
      toast.success('Server created successfully')
      setShowServerDialog(false)
    },
    onError: () => toast.error('Failed to create server'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) =>
      fetch(`/api/servers/${editingServerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          connectionIds: selectedConnectionIds,
          fileNamesPerConnection: selectedConnectionIds.map(id => fileNamesPerConnection[id] || ''),
        }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', editingServerId] })
      triggerRefreshServers()
      toast.success('Server updated successfully')
      setShowServerDialog(false)
    },
    onError: () => toast.error('Failed to update server'),
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
                      {isSelected && (
                        <Input
                          placeholder="File names (comma-separated)"
                          className="ml-6 h-7 text-xs"
                          value={fileNamesPerConnection[conn.id] || ''}
                          onChange={(e) =>
                            setFileNamesPerConnection(prev => ({
                              ...prev,
                              [conn.id]: e.target.value,
                            }))
                          }
                        />
                      )}
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
      </DialogContent>
    </Dialog>
  )
}
