'use client'

import { FieldMappingRow } from './field-mapping-row'
import { type FieldMeta } from '@/hooks/use-compiled-schema'

interface Mapping {
  inputParam: string
  fmField: string
}

interface FieldMappingBuilderProps {
  mappings: Mapping[]
  fields: FieldMeta[]
  onChange: (mappings: Mapping[]) => void
}

export function FieldMappingBuilder({ mappings, fields, onChange }: FieldMappingBuilderProps) {
  const noLayout = fields.length === 0

  function addMapping() {
    onChange([...mappings, { inputParam: '', fmField: '' }])
  }

  function updateMapping(index: number, updated: Mapping) {
    const next = [...mappings]
    next[index] = updated
    onChange(next)
  }

  function removeMapping(index: number) {
    onChange(mappings.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Field Mappings
          <span className="ml-1 normal-case font-normal">(inputParam → FM Field)</span>
        </label>
        {noLayout && (
          <span className="text-xs text-amber-500">Select a layout first</span>
        )}
      </div>

      {/* Empty state */}
      {mappings.length === 0 && (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-3 text-center">
          No mappings yet — click below to add one.
        </div>
      )}

      {/* Rows */}
      {mappings.map((m, i) => (
        <FieldMappingRow
          key={i}
          mapping={m}
          fields={fields}
          onChange={updated => updateMapping(i, updated)}
          onRemove={() => removeMapping(i)}
        />
      ))}

      {/* Add button */}
      <button
        type="button"
        disabled={noLayout}
        onClick={addMapping}
        className="w-full py-2 border border-dashed border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        + Add Field Mapping
      </button>
    </div>
  )
}

/**
 * Converts the visual Mapping[] format to the Record<inputParam, fmField>
 * format expected by handlerConfig.fieldMappings.
 */
export function mappingsToRecord(mappings: Mapping[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of mappings) {
    if (m.inputParam && m.fmField) out[m.inputParam] = m.fmField
  }
  return out
}

/**
 * Converts a Record<inputParam, fmField> from handlerConfig back to the
 * visual Mapping[] format.
 */
export function recordToMappings(record: Record<string, string> | undefined | null): Mapping[] {
  if (!record) return []
  return Object.entries(record).map(([inputParam, fmField]) => ({ inputParam, fmField }))
}
