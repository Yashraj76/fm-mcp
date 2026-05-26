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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles, Brain } from 'lucide-react'
import { useAppStore } from '@/lib/store'

export function AiSuggestDialog({ onSuggestionSuccess }: { onSuggestionSuccess: (data: any) => void }) {
  const showAiDialog = useAppStore((s) => s.showAiDialog)
  const setShowAiDialog = useAppStore((s) => s.setShowAiDialog)
  const [prompt, setPrompt] = useState('')

  const suggestMutation = useMutation({
    mutationFn: (userPrompt: string) =>
      api.post<any>('/api/tools/suggest', { prompt: userPrompt }),
    onSuccess: (data) => {
      toast.success('Tool suggestion generated!')
      
      const suggestion = data.suggestion
      // Parse schemas since they are returned as string from the API
      let parsedInputSchema = { type: 'object', properties: {} }
      try {
        if (typeof suggestion.inputSchema === 'string') {
          parsedInputSchema = JSON.parse(suggestion.inputSchema)
        } else if (suggestion.inputSchema) {
          parsedInputSchema = suggestion.inputSchema
        }
      } catch (e) {
        console.error('Failed to parse inputSchema from suggestion', e)
      }

      onSuggestionSuccess({
        name: suggestion.name || '',
        description: suggestion.description || '',
        fmMethod: suggestion.fmMethod || 'custom',
        fmLayout: suggestion.fmLayout || '',
        category: suggestion.category || 'Custom',
        inputSchema: parsedInputSchema,
      })
      setShowAiDialog(false)
      setPrompt('')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'AI suggestion failed. Have you configured your API key in Settings?')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    suggestMutation.mutate(prompt)
  }

  return (
    <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-indigo-500" />
            Generate Tool with AI
          </DialogTitle>
          <DialogDescription>
            Describe what you want the FileMaker MCP tool to do. The AI will generate the configuration and schema for you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="prompt">Tool Description</Label>
            <Textarea
              id="prompt"
              placeholder="e.g. A tool to search for contacts by email or phone number in the Contacts layout."
              className="min-h-[100px] resize-none"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={suggestMutation.isPending}
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
              disabled={!prompt.trim() || suggestMutation.isPending}
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
