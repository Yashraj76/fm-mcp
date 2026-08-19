'use client'

import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type ExtraParam } from '@/lib/tools/extra-params'

const TYPE_OPTIONS: ExtraParam['type'][] = ['string', 'number', 'integer', 'boolean', 'array', 'object']

interface ExtraParamsBuilderProps {
  params: ExtraParam[]
  onChange: (params: ExtraParam[]) => void
  /** Params the executor depends on by exact name (e.g. recordId) — name,
   * type, and required can't be edited or removed, only the description. */
  lockedNames?: string[]
}

export function ExtraParamsBuilder({ params, onChange, lockedNames = [] }: ExtraParamsBuilderProps) {
  function addParam() {
    onChange([...params, { name: '', type: 'string', description: '', required: false }])
  }
  function updateParam(index: number, patch: Partial<ExtraParam>) {
    onChange(params.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }
  function removeParam(index: number) {
    onChange(params.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide block">
        Extra Parameters
        <span className="ml-1 normal-case font-normal">
          (inputs that aren&rsquo;t a layout field — pagination, sort, record id, script args)
        </span>
      </label>

      {params.length === 0 && (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-3 text-center">
          No extra parameters yet — add one for <code className="font-mono">limit</code>,{' '}
          <code className="font-mono">offset</code>, <code className="font-mono">sort</code>, or anything else
          not tied to a mapped field.
        </div>
      )}

      {params.map((p, i) => {
        const locked = lockedNames.includes(p.name)
        return (
          <div key={i} className="flex items-center gap-2 group">
            <Input
              value={p.name}
              onChange={e => updateParam(i, { name: e.target.value })}
              placeholder="paramName"
              disabled={locked}
              className="flex-1 font-mono text-sm h-9"
            />
            <Select
              value={p.type}
              onValueChange={v => updateParam(i, { type: v as ExtraParam['type'] })}
              disabled={locked}
            >
              <SelectTrigger className="w-28 h-9 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(t => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={p.description}
              onChange={e => updateParam(i, { description: e.target.value })}
              placeholder="Description"
              className="flex-1 text-sm h-9"
            />
            <div className="flex items-center gap-1.5 shrink-0" title="Required">
              <Checkbox
                checked={p.required}
                onCheckedChange={c => updateParam(i, { required: !!c })}
                disabled={locked}
              />
              <span className="text-xs text-muted-foreground">req</span>
            </div>
            <button
              type="button"
              onClick={() => removeParam(i)}
              disabled={locked}
              aria-label="Remove parameter"
              className="shrink-0 w-4 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/70 text-xs transition-opacity disabled:opacity-0"
            >
              ✕
            </button>
          </div>
        )
      })}

      <button
        type="button"
        onClick={addParam}
        className="w-full py-2 border border-dashed border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
      >
        + Add Extra Parameter
      </button>
    </div>
  )
}
