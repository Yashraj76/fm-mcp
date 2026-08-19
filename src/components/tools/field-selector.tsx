'use client'

import { useState, useRef, useEffect } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { type FieldMeta } from '@/hooks/use-compiled-schema'
import { cn } from '@/lib/utils'

const RESULT_TYPE_COLORS: Record<string, string> = {
  text: 'text-blue-400',
  number: 'text-green-400',
  date: 'text-yellow-400',
  timestamp: 'text-yellow-400',
  container: 'text-purple-400',
  calculation: 'text-orange-400',
  summary: 'text-pink-400',
}

interface FieldSelectorProps {
  fields: FieldMeta[]
  value: string
  onChange: (fieldName: string) => void
  placeholder?: string
  disabled?: boolean
  showType?: boolean
  className?: string
}

export function FieldSelector({
  fields,
  value,
  onChange,
  placeholder = 'Select a field…',
  disabled = false,
  showType = true,
  className,
}: FieldSelectorProps) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = fields.find(f => f.name === value)

  const filtered = fields.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  )

  // Focus the search box on open; clear it on close so the next open starts fresh.
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 10)
    } else {
      queueMicrotask(() => setSearch(''))
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2',
            'bg-input border border-border rounded-md text-sm text-left',
            'transition-colors focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            open && 'border-ring ring-1 ring-ring',
            className,
          )}
        >
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
            {selected ? (
              <span className="flex items-center gap-2">
                <span className="font-mono">{selected.name}</span>
                {showType && (
                  <span className={cn('text-xs', RESULT_TYPE_COLORS[selected.result] ?? 'text-muted-foreground')}>
                    {selected.result}
                    {selected.autoEnter && ' · auto'}
                    {selected.notEmpty && ' · req'}
                  </span>
                )}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <svg
            className={cn('size-3.5 text-muted-foreground transition-transform shrink-0', open && 'rotate-180')}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </PopoverTrigger>

      {/* Portaled to document.body (via PopoverContent) so it isn't clipped
          by the dialog's scrollable content area — a hand-rolled absolutely
          positioned div here would render behind/under later sections. */}
      <PopoverContent
        align="start"
        className="w-[var(--radix-popper-anchor-width)] min-w-[200px] p-0"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div className="p-2 border-b border-border">
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search fields…"
            className="w-full px-2 py-1.5 text-sm bg-input border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground text-center">
              {fields.length === 0 ? 'No fields — select a layout first' : 'No fields match'}
            </div>
          ) : (
            filtered.map(field => (
              <button
                key={field.name}
                type="button"
                onClick={() => {
                  onChange(field.name)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-sm text-left',
                  'hover:bg-accent transition-colors',
                  field.name === value && 'bg-accent/60',
                )}
              >
                <span className="font-mono text-foreground">{field.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {field.autoEnter && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">auto</span>
                  )}
                  {field.notEmpty && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">req</span>
                  )}
                  <span className={cn('text-xs', RESULT_TYPE_COLORS[field.result] ?? 'text-muted-foreground')}>
                    {field.result}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
