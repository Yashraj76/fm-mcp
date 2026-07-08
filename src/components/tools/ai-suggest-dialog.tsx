'use client'

import { useState } from 'react'
import { api } from '@/lib/utils/api-client'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles, Brain, Database } from 'lucide-react'
import { useAppStore } from '@/lib/store'

interface ConnectionOption {
  id: string
  name: string
  database: string
}

export function AiSuggestDialog({ onSuggestionSuccess }: { onSuggestionSuccess: (data: any) => void }) {
  const showAiDialog = useAppStore((s) => s.showAiDialog)
  const setShowAiDialog = useAppStore((s) => s.setShowAiDialog)
  const currentServerId = useAppStore((s) => s.currentServerId)
  const [prompt, setPrompt] = useState('')
  const [availableConnections, setAvailableConnections] = useState<ConnectionOption[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)

  const suggestMutation = useMutation({
    mutationFn: ({ userPrompt, connectionId }: { userPrompt: string; connectionId?: string }) => {
      if (!currentServerId) throw new Error('No server selected. Please select a server before generating suggestions.')
      return api.post<any>(`/api/servers/${currentServerId}/ai/suggest`, {
        context: userPrompt,
        suggestionType: 'tool_suggestion',
        connectionId: connectionId ?? undefined,
      })
    },
    onSuccess: (data) => {
      const suggestions = data?.suggestions
      if (!suggestions || suggestions.length === 0) {
        toast.error('No suggestions were generated. Try refining your prompt.')
        return
      }

      toast.success('Tool suggestion generated!')

      const config = suggestions[0]?.proposedConfig || {}

      let parsedInputSchema = { type: 'object', properties: {} }
      try {
        if (typeof config.inputSchema === 'string') {
          parsedInputSchema = JSON.parse(config.inputSchema)
        } else if (config.inputSchema) {
          parsedInputSchema = config.inputSchema
        }
      } catch (e) {
        console.error('Failed to parse inputSchema from suggestion', e)
      }

      onSuggestionSuccess({
        name: config.name || '',
        description: config.description || '',
        fmMethod: config.fmMethod || 'custom',
        fmLayout: config.fmLayout || '',
        category: config.category || 'Custom',
        inputSchema: parsedInputSchema,
      })
      setShowAiDialog(false)
      setPrompt('')
    },
    onError: (err: any) => {
      if (err.code === 'CONNECTION_REQUIRED' && err.details?.connections?.length > 0) {
        setAvailableConnections(err.details.connections as ConnectionOption[])
        return // show picker inline, don't toast
      }
      toast.error(err.message || 'AI suggestion failed. Have you configured your API key in Settings?')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || !currentServerId) return
    if (availableConnections.length > 0 && !selectedConnectionId) {
      toast.error('Please select a connection first')
      return
    }
    suggestMutation.mutate({ userPrompt: prompt, connectionId: selectedConnectionId ?? undefined })
  }

  const handleConnectionSelect = (connId: string) => {
    setSelectedConnectionId(connId)
    // Re-submit automatically with the selected connection
    if (prompt.trim() && currentServerId) {
      suggestMutation.mutate({ userPrompt: prompt, connectionId: connId })
    }
  }

  const handleClose = (open: boolean) => {
    setShowAiDialog(open)
    if (!open) {
      setAvailableConnections([])
      setSelectedConnectionId(null)
      setPrompt('')
    }
  }

  return (
    <Dialog open={showAiDialog} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-indigo-500" />
            Generate Tool with AI
          </DialogTitle>
          <DialogDescription>
            Describe what you want the tool to do. The AI will generate the configuration and schema for you.
          </DialogDescription>
        </DialogHeader>

        {!currentServerId && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md mt-4">
            No server selected. Please open a server before generating tool suggestions.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Connection picker — only shown when server has multiple connections */}
          {availableConnections.length > 0 && (
            <div className="space-y-2">
              <Label>Select Connection</Label>
              <p className="text-xs text-muted-foreground">
                This server has multiple connections. Choose which database to use.
              </p>
              <div className="space-y-1.5">
                {availableConnections.map((conn) => (
                  <button
                    key={conn.id}
                    type="button"
                    onClick={() => handleConnectionSelect(conn.id)}
                    disabled={suggestMutation.isPending}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-all disabled:opacity-50 ${
                      selectedConnectionId === conn.id
                        ? 'bg-indigo-500/10 border-indigo-500/40'
                        : 'bg-muted/30 border hover:bg-muted/60'
                    }`}
                  >
                    <Database className={`size-4 mt-0.5 shrink-0 ${selectedConnectionId === conn.id ? 'text-indigo-400' : 'text-muted-foreground'}`} />
                    <div className="min-w-0">
                      <div className={`text-sm font-medium ${selectedConnectionId === conn.id ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {conn.name}
                      </div>
                      <div className="text-xs text-muted-foreground/70 mt-0.5">{conn.database}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="prompt">Tool Description</Label>
            <Textarea
              id="prompt"
              placeholder="e.g. A tool to search for contacts by email or phone number in the Contacts layout."
              className="min-h-[100px] resize-none"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={suggestMutation.isPending || !currentServerId}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAiDialog(false)}
              disabled={suggestMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!prompt.trim() || suggestMutation.isPending || !currentServerId}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {suggestMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Brain className="size-4" />
              )}
              {suggestMutation.isPending ? 'Generating...' : 'Generate Tool'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
