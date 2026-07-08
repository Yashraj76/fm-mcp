'use client'

import { AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryViewProps {
  error: Error & { digest?: string }
  reset: () => void
  /** When true, wraps content in a full-screen centering shell (root layout). */
  fullPage?: boolean
}

export function ErrorBoundaryView({ error, reset, fullPage = false }: ErrorBoundaryViewProps) {
  const isDev = process.env.NODE_ENV === 'development'

  const content = (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center gap-6 max-w-md w-full text-center"
    >
      {/* Brand */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground select-none">
          kilink
        </span>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="w-6 h-6" aria-hidden="true" />
        </div>
      </div>

      {/* Heading */}
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          An unexpected error occurred. You can try again — if the problem persists,
          please contact{' '}
          <a
            href="mailto:support@kibizsystems.com"
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            support@kibizsystems.com
          </a>
          .
        </p>
      </div>

      {/* Dev-only error detail — never shown in production */}
      {isDev && error?.message && (
        <div className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-left">
          <p className="text-xs font-mono text-destructive break-words whitespace-pre-wrap">
            {error.message}
          </p>
        </div>
      )}

      {/* Reference ID — safe in production (digest is a hash, not a stack trace) */}
      {error?.digest && (
        <p className="text-xs text-muted-foreground">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
        <Button onClick={reset} className="gap-2">
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          Try again
        </Button>
        <Button variant="outline" onClick={() => window.location.assign('/')}>
          Go to dashboard
        </Button>
      </div>
    </div>
  )

  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        {content}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      {content}
    </div>
  )
}
