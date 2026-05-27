'use client'

import { FieldSelector } from './field-selector'
import { fmFieldToParamName } from '@/lib/utils/field-name-utils'
import { type FieldMeta } from '@/hooks/use-compiled-schema'

interface Mapping {
  inputParam: string
  fmField: string
}

interface FieldMappingRowProps {
  mapping: Mapping
  fields: FieldMeta[]
  onChange: (updated: Mapping) => void
  onRemove: () => void
}

export function FieldMappingRow({ mapping, fields, onChange, onRemove }: FieldMappingRowProps) {
  /** When FM field changes, auto-generate the input param name */
  function handleFmFieldChange(fmField: string) {
    const autoParam = fmFieldToParamName(fmField)
    onChange({ fmField, inputParam: autoParam })
  }

  return (
    <div className="flex items-center gap-2 group">
      {/* Input Param */}
      <div className="flex-1">
        <input
          value={mapping.inputParam}
          onChange={e => onChange({ ...mapping, inputParam: e.target.value })}
          placeholder="inputParam"
          aria-label="Input parameter name"
          className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Arrow */}
      <span className="flex-shrink-0 text-muted-foreground text-sm select-none px-0.5">→</span>

      {/* FM Field selector */}
      <div className="flex-1">
        <FieldSelector
          fields={fields}
          value={mapping.fmField}
          onChange={handleFmFieldChange}
          placeholder="FM Field"
        />
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove mapping"
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/70 text-xs px-1 transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}
