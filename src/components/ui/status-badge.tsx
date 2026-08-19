import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  // Server lifecycle
  draft:       { label: 'Draft',       className: 'bg-blue-500/15 text-blue-500 border-blue-500/20' },
  staging:     { label: 'Staging',     className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20' },
  deployed:    { label: 'Deployed',    className: 'bg-green-500/15 text-green-500 border-green-500/20' },
  error:       { label: 'Error',       className: 'bg-red-500/15 text-red-500 border-red-500/20' },

  // Branch lifecycle
  active:      { label: 'Active',      className: 'bg-green-500/15 text-green-500 border-green-500/20' },
  merged:      { label: 'Merged',      className: 'bg-muted text-muted-foreground border-border' },
  archived:    { label: 'Archived',    className: 'bg-orange-500/15 text-orange-500 border-orange-500/20' },
  deleted:     { label: 'Deleted',     className: 'bg-red-500/15 text-red-500 border-red-500/20' },

  // Deployment lifecycle
  pending:     { label: 'Pending',     className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20' },
  deploying:   { label: 'Deploying',   className: 'bg-blue-500/15 text-blue-500 border-blue-500/20' },
  superseded:  { label: 'Superseded',  className: 'bg-muted text-muted-foreground border-border' },
  rolled_back: { label: 'Rolled Back', className: 'bg-orange-500/15 text-orange-500 border-orange-500/20' },
  failed:      { label: 'Failed',      className: 'bg-red-500/15 text-red-500 border-red-500/20' },

  // Connection / MCP health
  connected:      { label: 'Connected',    className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20' },
  disconnected:   { label: 'Disconnected', className: 'bg-muted text-muted-foreground border-border' },
  auth_failed:    { label: 'Auth Failed',  className: 'bg-amber-500/15 text-amber-500 border-amber-500/20' },
  schema_missing: { label: 'No Schema',    className: 'bg-sky-500/15 text-sky-500 border-sky-500/20' },
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={cn(cfg.className, className)}>
      {cfg.label}
    </Badge>
  )
}
