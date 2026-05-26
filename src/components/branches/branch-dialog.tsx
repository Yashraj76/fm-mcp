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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GitBranch, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useCallback } from 'react'

interface BranchOption {
  id: string
  name: string
  isDefault: boolean
  status: string
}

export function BranchDialog() {
  const queryClient = useQueryClient()
  const showBranchDialog = useAppStore((s) => s.showBranchDialog)
  const setShowBranchDialog = useAppStore((s) => s.setShowBranchDialog)
  const currentServerId = useAppStore((s) => s.currentServerId)
  const triggerRefreshBranches = useAppStore((s) => s.triggerRefreshBranches)

  const [name, setName] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [parentBranchId, setParentBranchId] = useState<string>('')
  const [createFromCurrent, setCreateFromCurrent] = useState(true)
  const [duplicateTools, setDuplicateTools] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: branches = [] } = useQuery<BranchOption[]>({
    queryKey: ['branches-options', currentServerId],
    queryFn: () => api.get<BranchOption[]>(`/api/servers/${currentServerId}/branches`),
    enabled: showBranchDialog && !!currentServerId,
  })

  const resetForm = useCallback(() => {
    setName('')
    setCommitMessage('')
    setCreateFromCurrent(true)
    setDuplicateTools(true)
  }, [])

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      resetForm()
      // Set parent to default branch
      const defaultBranch = branches.find(b => b.isDefault)
      setParentBranchId(defaultBranch?.id || '')
    }
    setShowBranchDialog(open)
  }, [setShowBranchDialog, resetForm, branches])

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<any>(`/api/servers/${currentServerId}/branches`, {
        name,
        commitMessage: commitMessage || `Create branch ${name}`,
        parentBranchId,
        createFromCurrent,
        duplicateToolsFromParent: duplicateTools,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      triggerRefreshBranches()
      toast.success('Branch created successfully')
      setShowBranchDialog(false)
      setIsSubmitting(false)
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create branch')
      setIsSubmitting(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Branch name is required')
      return
    }
    setIsSubmitting(true)
    createMutation.mutate()
  }

  return (
    <Dialog open={showBranchDialog} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="size-5 text-primary" />
            Create New Branch
          </DialogTitle>
          <DialogDescription>
            Create a new branch to work on changes independently from the default branch.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="branch-name">Branch Name *</Label>
            <Input
              id="branch-name"
              placeholder="feature/my-new-branch"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="commit-message">Commit Message</Label>
            <Textarea
              id="commit-message"
              placeholder="Describe the purpose of this branch..."
              rows={2}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent-branch">Parent Branch</Label>
            <Select value={parentBranchId} onValueChange={setParentBranchId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select parent branch" />
              </SelectTrigger>
              <SelectContent>
                {branches
                  .filter(b => b.status === 'active')
                  .map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      <div className="flex items-center gap-2">
                        <span>{branch.name}</span>
                        {branch.isDefault && (
                          <span className="text-xs text-muted-foreground">(default)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="create-from-current"
                checked={createFromCurrent}
                onCheckedChange={(checked) => setCreateFromCurrent(checked === true)}
              />
              <label htmlFor="create-from-current" className="text-sm cursor-pointer">
                Create from current state
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="duplicate-tools"
                checked={duplicateTools}
                onCheckedChange={(checked) => setDuplicateTools(checked === true)}
              />
              <label htmlFor="duplicate-tools" className="text-sm cursor-pointer flex items-center gap-1.5">
                <Copy className="size-3.5 text-muted-foreground" />
                Duplicate tools from parent branch
              </label>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBranchDialog(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? 'Creating...' : 'Create Branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
