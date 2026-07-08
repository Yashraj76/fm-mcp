'use client'

import { useState } from 'react'
import { type ODataTable } from '@/hooks/use-compiled-schema'
import { fmFieldToParamName } from '@/lib/utils/field-name-utils'
import { cn } from '@/lib/utils'

const ODATA_OPERATORS = [
  { value: 'eq', label: 'equals (eq)' },
  { value: 'ne', label: 'not equals (ne)' },
  { value: 'gt', label: 'greater than (gt)' },
  { value: 'lt', label: 'less than (lt)' },
  { value: 'ge', label: 'greater or equal (ge)' },
  { value: 'le', label: 'less or equal (le)' },
  { value: 'contains', label: 'contains(field, value)' },
  { value: 'startswith', label: 'startswith(field, value)' },
]

interface FilterClause {
  id: string
  field: string
  operator: string
  paramName: string
  logic: 'and' | 'or'
}

interface ODataFilterBuilderProps {
  tables: ODataTable[]
  table: string
  filterExpression: string
  expandTables: string[]
  onTableChange: (table: string) => void
  onFilterChange: (expr: string) => void
  onExpandChange: (tables: string[]) => void
}

export function ODataFilterBuilder({
  tables,
  table,
  filterExpression,
  expandTables,
  onTableChange,
  onFilterChange,
  onExpandChange,
}: ODataFilterBuilderProps) {
  const [mode, setMode] = useState<'visual' | 'raw'>('visual')
  const [clauses, setClauses] = useState<FilterClause[]>([])

  const selectedTable = tables.find(t => t.name === table)
  const tableFields = selectedTable?.fields ?? []

  function buildExpression(cs: FilterClause[]): string {
    return cs
      .map((c, i) => {
        const prefix = i > 0 ? `${c.logic} ` : ''
        if (c.operator === 'contains' || c.operator === 'startswith') {
          return `${prefix}${c.operator}(${c.field}, {${c.paramName}})`
        }
        return `${prefix}${c.field} ${c.operator} {${c.paramName}}`
      })
      .join(' ')
  }

  function addClause() {
    const newClause: FilterClause = {
      id: Math.random().toString(36).slice(2),
      field: tableFields[0]?.name ?? '',
      operator: 'eq',
      paramName: tableFields[0]?.name ? fmFieldToParamName(tableFields[0].name) : '',
      logic: 'and',
    }
    const next = [...clauses, newClause]
    setClauses(next)
    onFilterChange(buildExpression(next))
  }

  function updateClause(id: string, patch: Partial<FilterClause>) {
    const next = clauses.map(c => {
      if (c.id !== id) return c
      const updated = { ...c, ...patch }
      // Auto-generate paramName from field name when field changes
      if (patch.field && !patch.paramName) {
        updated.paramName = fmFieldToParamName(patch.field)
      }
      return updated
    })
    setClauses(next)
    onFilterChange(buildExpression(next))
  }

  function removeClause(id: string) {
    const next = clauses.filter(c => c.id !== id)
    setClauses(next)
    onFilterChange(buildExpression(next))
  }

  return (
    <div className="space-y-4">
      {/* Table selector */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">OData Table</label>
        <select
          value={table}
          onChange={e => onTableChange(e.target.value)}
          className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Select table…</option>
          {tables.map(t => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.fields.length} fields)
            </option>
          ))}
        </select>
      </div>

      {/* $expand selector */}
      {table && tables.filter(t => t.name !== table).length > 0 && (
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            $expand Related Tables
            <span className="ml-1 opacity-60">(optional — fetches related records in one call)</span>
          </label>
          <div className="flex flex-wrap gap-3">
            {tables
              .filter(t => t.name !== table)
              .map(t => (
                <label key={t.name} className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={expandTables.includes(t.name)}
                    onChange={e => {
                      onExpandChange(
                        e.target.checked
                          ? [...expandTables, t.name]
                          : expandTables.filter(x => x !== t.name),
                      )
                    }}
                    className="accent-primary"
                  />
                  <span className="text-foreground">{t.name}</span>
                </label>
              ))}
          </div>
        </div>
      )}

      {/* Filter expression */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted-foreground">$filter Expression</label>
          <div className="flex items-center gap-1 rounded bg-muted p-0.5">
            {(['visual', 'raw'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded transition-colors capitalize',
                  mode === m
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {mode === 'visual' ? (
          <div className="space-y-2">
            {clauses.length === 0 && (
              <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3 text-center">
                No filter conditions yet. Click below to add one.
              </div>
            )}

            {clauses.map((clause, i) => (
              <div key={clause.id} className="flex items-center gap-2">
                {/* AND / OR logic connector */}
                {i > 0 && (
                  <select
                    value={clause.logic}
                    onChange={e => updateClause(clause.id, { logic: e.target.value as 'and' | 'or' })}
                    className="w-16 px-1 py-1.5 bg-input border border-border rounded text-xs text-foreground focus:outline-none"
                  >
                    <option value="and">AND</option>
                    <option value="or">OR</option>
                  </select>
                )}
                {i === 0 && <div className="w-16 shrink-0" />}

                {/* Field */}
                <select
                  value={clause.field}
                  onChange={e => updateClause(clause.id, { field: e.target.value })}
                  className="flex-1 px-2 py-1.5 bg-input border border-border rounded text-xs text-foreground font-mono focus:outline-none"
                >
                  <option value="">Field…</option>
                  {tableFields.map(f => (
                    <option key={f.name} value={f.name}>{f.name}</option>
                  ))}
                </select>

                {/* Operator */}
                <select
                  value={clause.operator}
                  onChange={e => updateClause(clause.id, { operator: e.target.value })}
                  className="w-40 px-2 py-1.5 bg-input border border-border rounded text-xs text-foreground focus:outline-none"
                >
                  {ODATA_OPERATORS.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>

                {/* Param name */}
                <input
                  value={clause.paramName}
                  onChange={e => updateClause(clause.id, { paramName: e.target.value })}
                  placeholder="paramName"
                  className="w-32 px-2 py-1.5 bg-input border border-border rounded text-xs text-foreground font-mono focus:outline-none"
                />

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeClause(clause.id)}
                  aria-label="Remove filter clause"
                  className="text-destructive hover:text-destructive/70 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              disabled={!table}
              onClick={addClause}
              className="w-full py-1.5 border border-dashed border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              + Add Filter Condition
            </button>

            {/* Generated expression preview */}
            {clauses.length > 0 && (
              <div className="mt-2 px-2 py-1.5 bg-muted/30 rounded border border-border text-xs font-mono text-foreground/80 break-all">
                {buildExpression(clauses) || '(no expression yet)'}
              </div>
            )}
          </div>
        ) : (
          <div>
            <input
              value={filterExpression}
              onChange={e => onFilterChange(e.target.value)}
              placeholder="Email eq {email} and Status eq {status}"
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Use{' '}
              <code className="bg-muted px-1 rounded">{'{'+'paramName'+'}'}</code>
              {' '}as placeholders — do not add surrounding quotes; strings are automatically quoted at runtime.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
