---
description: # Workflow 25: OData Filter Builder & Dialog UX Improvements
---

## Overview
Fixes Problems 5 and 7 in detail. Builds the OData filter builder UI and documents all UX improvements to make the tool dialog cleaner and easier to use.

---

## Step 1: OData Filter Builder Component

**File**: `src/components/tools/odata-filter-builder.tsx`

```tsx
'use client';

import { useState } from 'react';
import { ODataTable } from '@/hooks/use-compiled-schema';

const ODATA_OPERATORS = [
  { value: 'eq', label: 'equals (eq)' },
  { value: 'ne', label: 'not equals (ne)' },
  { value: 'gt', label: 'greater than (gt)' },
  { value: 'lt', label: 'less than (lt)' },
  { value: 'ge', label: 'greater or equal (ge)' },
  { value: 'le', label: 'less or equal (le)' },
  { value: 'contains', label: 'contains(field, value)' },
  { value: 'startswith', label: 'startswith(field, value)' },
];

interface FilterClause {
  id: string;
  field: string;
  operator: string;
  paramName: string;    // the {paramName} placeholder
  logic: 'and' | 'or';
}

interface ODataFilterBuilderProps {
  tables: ODataTable[];
  table: string;
  filterExpression: string;
  expandTables: string[];
  onTableChange: (table: string) => void;
  onFilterChange: (expr: string) => void;
  onExpandChange: (tables: string[]) => void;
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
  const [mode, setMode] = useState<'visual' | 'raw'>('visual');
  const [clauses, setClauses] = useState<FilterClause[]>([]);

  const selectedTable = tables.find(t => t.name === table);
  const tableFields = selectedTable?.fields ?? [];

  // Build filter expression from visual clauses
  function buildExpression(cs: FilterClause[]): string {
    return cs
      .map((c, i) => {
        const prefix = i > 0 ? `${c.logic} ` : '';
        if (c.operator === 'contains' || c.operator === 'startswith') {
          return `${prefix}${c.operator}(${c.field}, '{${c.paramName}}')`;
        }
        return `${prefix}${c.field} ${c.operator} '{${c.paramName}}'`;
      })
      .join(' ');
  }

  function addClause() {
    const newClause: FilterClause = {
      id: Math.random().toString(36).slice(2),
      field: tableFields[0]?.name ?? '',
      operator: 'eq',
      paramName: '',
      logic: clauses.length === 0 ? 'and' : 'and',
    };
    const next = [...clauses, newClause];
    setClauses(next);
    onFilterChange(buildExpression(next));
  }

  function updateClause(id: string, patch: Partial<FilterClause>) {
    const next = clauses.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, ...patch };
      // Auto-generate paramName from field name
      if (patch.field && !patch.paramName) {
        updated.paramName = patch.field.charAt(0).toLowerCase() + patch.field.slice(1);
      }
      return updated;
    });
    setClauses(next);
    onFilterChange(buildExpression(next));
  }

  function removeClause(id: string) {
    const next = clauses.filter(c => c.id !== id);
    setClauses(next);
    onFilterChange(buildExpression(next));
  }

  return (
    <div className="space-y-4">
      {/* Table Selector */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">OData Table</label>
        <select
          value={table}
          onChange={e => onTableChange(e.target.value)}
          className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground"
        >
          <option value="">Select table...</option>
          {tables.map(t => (
            <option key={t.name} value={t.name}>{t.name} ({t.fields.length} fields)</option>
          ))}
        </select>
      </div>

      {/* $expand selector */}
      {table && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            $expand Related Tables
            <span className="ml-1 text-muted-foreground/60">(optional — fetches related records in one call)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {tables.filter(t => t.name !== table).map(t => (
              <label key={t.name} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={expandTables.includes(t.name)}
                  onChange={e => {
                    onExpandChange(
                      e.target.checked
                        ? [...expandTables, t.name]
                        : expandTables.filter(x => x !== t.name)
                    );
                  }}
                  className="accent-primary"
                />
                <span className="text-sm text-foreground">{t.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Filter Builder */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted-foreground">$filter Expression</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('visual')}
              className={`text-xs px-2 py-0.5 rounded ${mode === 'visual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Visual
            </button>
            <button
              type="button"
              onClick={() => setMode('raw')}
              className={`text-xs px-2 py-0.5 rounded ${mode === 'raw' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Raw
            </button>
          </div>
        </div>

        {mode === 'visual' && (
          <div className="space-y-2">
            {clauses.length === 0 && (
              <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-3 text-center">
                Add filter conditions below
              </div>
            )}

            {clauses.map((clause, i) => (
              <div key={clause.id} className="flex items-center gap-2">
                {/* AND/OR */}
                {i > 0 && (
                  <select
                    value={clause.logic}
                    onChange={e => updateClause(clause.id, { logic: e.target.value as 'and' | 'or' })}
                    className="w-16 px-2 py-1.5 bg-input border border-border rounded text-xs text-foreground"
                  >
                    <option value="and">AND</option>
                    <option value="or">OR</option>
                  </select>
                )}
                {i === 0 && <div className="w-16 text-xs text-muted-foreground text-center">WHERE</div>}

                {/* Field */}
                <select
                  value={clause.field}
                  onChange={e => updateClause(clause.id, { field: e.target.value })}
                  className="flex-1 px-2 py-1.5 bg-input border border-border rounded text-xs text-foreground"
                >
                  <option value="">Field...</option>
                  {tableFields.map(f => (
                    <option key={f.name} value={f.name}>{f.name}</option>
                  ))}
                </select>

                {/* Operator */}
                <select
                  value={clause.operator}
                  onChange={e => updateClause(clause.id, { operator: e.target.value })}
                  className="w-36 px-2 py-1.5 bg-input border border-border rounded text-xs text-foreground"
                >
                  {ODATA_OPERATORS.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>

                {/* Param name (the {placeholder}) */}
                <div className="flex-1 flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{`{`}</span>
                  <input
                    value={clause.paramName}
                    onChange={e => updateClause(clause.id, { paramName: e.target.value })}
                    placeholder="paramName"
                    className="flex-1 px-2 py-1.5 bg-input border border-border rounded text-xs font-mono text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">{`}`}</span>
                </div>

                <button type="button" onClick={() => removeClause(clause.id)} className="text-destructive text-xs px-1">✕</button>
              </div>
            ))}

            <button
              type="button"
              disabled={!table}
              onClick={addClause}
              className="w-full py-1.5 border border-dashed border-border rounded text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add Filter Condition
            </button>

            {/* Preview the generated expression */}
            {filterExpression && (
              <div className="mt-2 px-3 py-2 rounded bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Generated expression:</p>
                <code className="text-xs font-mono text-green-400">{filterExpression}</code>
              </div>
            )}
          </div>
        )}

        {mode === 'raw' && (
          <div>
            <input
              value={filterExpression}
              onChange={e => onFilterChange(e.target.value)}
              placeholder="Email eq '{email}' and Status eq 'Active'"
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm font-mono text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use <code className="bg-muted px-1 rounded">{`{paramName}`}</code> as input placeholders.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Step 2: Dialog UX Improvements — Checklist

Apply all of these changes to `src/components/tools/tool-dialog.tsx`:

### 2a. Hide Advanced JSON Behind Toggle
```tsx
const [showAdvanced, setShowAdvanced] = useState(false);

// In FileMaker tab:
<button
  type="button"
  onClick={() => setShowAdvanced(!showAdvanced)}
  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
>
  <span>{showAdvanced ? '▾' : '▸'}</span>
  Advanced Handler JSON {showAdvanced ? '(hide)' : '(show)'}
</button>
{showAdvanced && (
  <textarea
    value={handlerConfigStr}
    onChange={e => setHandlerConfigStr(e.target.value)}
    rows={8}
    className="w-full px-3 py-2 bg-input border border-border rounded-md text-xs font-mono text-foreground"
  />
)}
```

### 2b. Category Auto-Syncs with fmMethod
```typescript
useEffect(() => {
  const map: Record<string, string> = {
    find: 'Find', create: 'CRUD', update: 'CRUD',
    delete: 'CRUD', list: 'CRUD', get: 'CRUD',
    script: 'Script',
    'sequential-multi-table': 'Multi-Table',
    'odata-filter': 'Custom',
    'odata-expand': 'Multi-Table',
  };
  if (fmMethod && map[fmMethod]) setCategory(map[fmMethod]);
}, [fmMethod]);
```

### 2c. Live handlerConfig Reflects Form State
Build `handlerConfig` object from form state reactively — don't wait for save:

```typescript
const handlerConfigPreview = useMemo(() => {
  const base: Record<string, any> = {
    connectionId: selectedConnectionId,
    method: useOData ? `odata-${odataOperation}` : fmMethod,
    layout: useOData ? undefined : selectedLayout || undefined,
    table: useOData ? selectedODataTable || undefined : undefined,
    script: fmMethod === 'script' ? selectedScript || undefined : undefined,
    filterExpression: useOData ? filterExpression || undefined : undefined,
    expandTables: useOData && expandTables.length > 0 ? expandTables : undefined,
    fieldMappings: fieldMappings.length 