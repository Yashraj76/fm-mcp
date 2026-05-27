---
description: # Workflow 22: Field Population, Auto-Mapping & Dialog Data Layer
---

## Overview
Fixes Problems 1, 2, and 3. Makes the dialog schema-aware — every field dropdown is populated from the real layout metadata. Input params drive field mappings, and selecting an FM field auto-fills the input param name.

---

## Step 1: Load Compiled Schema When Dialog Opens

The dialog needs the compiled schema to populate all dropdowns. Add this hook:

**File**: `src/hooks/use-compiled-schema.ts`

```typescript
import { useQuery } from '@tanstack/react-query';

export function useCompiledSchema(connectionId: string | null) {
  return useQuery({
    queryKey: ['compiled-schema', connectionId],
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000, // 5 min cache
    queryFn: async () => {
      const res = await fetch(`/api/connections/${connectionId}/schema/compiled`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as CompiledSchema;
    },
  });
}

export interface CompiledSchema {
  layouts: LayoutMeta[];
  tables: ODataTable[];
  scripts: string[];
  relationships: RelationshipEdge[];
  primaryKeys: Record<string, string>;  // { layoutName: primaryKeyFieldName }
}

export interface LayoutMeta {
  name: string;
  fields: FieldMeta[];
  portals: { table: string; fields: { name: string; type: string }[] }[];
}

export interface FieldMeta {
  name: string;
  type: string;      // "normal" | "calculation" | "summary"
  result: string;    // "text" | "number" | "date" | "timestamp" | "container"
  global: boolean;
  autoEnter: boolean;
  notEmpty: boolean;
}

export interface ODataTable {
  name: string;
  fields: { name: string; type: string }[];
}

export interface RelationshipEdge {
  id: string;
  fromLayout: string;
  toLayout: string;
  fromKey: string;
  toKey: string;
  type: string;
  confidence: string;
  usableInTools: boolean;
}
```

---

## Step 2: FieldSelector Component

Replaces every free-text FM field input with a searchable dropdown.

**File**: `src/components/tools/field-selector.tsx`

```tsx
'use client';

import { useState } from 'react';
import { FieldMeta } from '@/hooks/use-compiled-schema';

interface FieldSelectorProps {
  fields: FieldMeta[];
  value: string;
  onChange: (fieldName: string) => void;
  placeholder?: string;
  disabled?: boolean;
  showType?: boolean;
}

const RESULT_TYPE_COLORS: Record<string, string> = {
  text: 'text-blue-400',
  number: 'text-green-400',
  date: 'text-yellow-400',
  timestamp: 'text-yellow-400',
  container: 'text-purple-400',
  calculation: 'text-orange-400',
};

export function FieldSelector({
  fields,
  value,
  onChange,
  placeholder = 'Select a field...',
  disabled = false,
  showType = true,
}: FieldSelectorProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = fields.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = fields.find(f => f.name === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-input border border-border rounded-md text-sm text-left disabled:opacity-50"
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? (
            <span className="flex items-center gap-2">
              {selected.name}
              {showType && (
                <span className={`text-xs ${RESULT_TYPE_COLORS[selected.result] ?? 'text-muted-foreground'}`}>
                  {selected.result}
                </span>
              )}
            </span>
          ) : placeholder}
        </span>
        <span className="text-muted-foreground">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search fields..."
              className="w-full px-2 py-1.5 text-sm bg-input border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">No fields found</div>
            )}
            {filtered.map(field => (
              <button
                key={field.name}
                type="button"
                onClick={() => { onChange(field.name); setOpen(false); setSearch(''); }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent text-left"
              >
                <span className="text-foreground">{field.name}</span>
                <span className={`text-xs ${RESULT_TYPE_COLORS[field.result] ?? 'text-muted-foreground'}`}>
                  {field.result}
                  {field.autoEnter && ' · auto'}
                  {field.notEmpty && ' · required'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Step 3: Auto-Convert FM Field Name to lowerCamelCase Input Param

**File**: `src/lib/utils/field-name-utils.ts`

```typescript
/**
 * Converts a FileMaker field name to a lowerCamelCase input parameter name.
 *
 * Examples:
 *   "EmailAddress"   → "emailAddress"
 *   "First Name"     → "firstName"
 *   "CUSTOMER_ID"    → "customerId"
 *   "Phone_Number"   → "phoneNumber"
 *   "date_of_birth"  → "dateOfBirth"
 *   "ZIP"            → "zip"
 */
export function fmFieldToParamName(fmFieldName: string): string {
  return fmFieldName
    // Split on spaces, underscores, hyphens, or PascalCase boundaries
    .replace(/([a-z])([A-Z])/g, '$1 $2')       // PascalCase → words
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // ABBRWord → ABBR Word
    .split(/[\s_\-]+/)                           // split on separators
    .filter(Boolean)
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}

// Examples for test:
// fmFieldToParamName("EmailAddress")  → "emailAddress"
// fmFieldToParamName("First Name")    → "firstName"
// fmFieldToParamName("CUSTOMER_ID")   → "customerId"
// fmFieldToParamName("ZIP")           → "zip"
```

---

## Step 4: FieldMappingRow — FM Field Picker with Auto-Fill

**File**: `src/components/tools/field-mapping-row.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import { FieldSelector } from './field-selector';
import { fmFieldToParamName } from '@/lib/utils/field-name-utils';
import { FieldMeta } from '@/hooks/use-compiled-schema';

interface FieldMappingRowProps {
  mapping: { inputParam: string; fmField: string };
  fields: FieldMeta[];
  onChange: (updated: { inputParam: string; fmField: string }) => void;
  onRemove: () => void;
  inputParams?: string[];  // existing input params for reference
}

export function FieldMappingRow({
  mapping,
  fields,
  onChange,
  onRemove,
  inputParams = [],
}: FieldMappingRowProps) {
  // When FM field changes, auto-generate input param name
  function handleFmFieldChange(fmField: string) {
    const autoParam = fmFieldToParamName(fmField);
    onChange({ fmField, inputParam: autoParam });
  }

  return (
    <div className="flex items-center gap-2 group">
      {/* Input Param (left side) */}
      <div className="flex-1">
        <input
          value={mapping.inputParam}
          onChange={e => onChange({ ...mapping, inputParam: e.target.value })}
          placeholder="inputParam"
          className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Arrow */}
      <div className="flex-shrink-0 text-muted-foreground text-sm px-1">→</div>

      {/* FM Field (right side) */}
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
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 text-sm px-1 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}
```

---

## Step 5: FieldMappingBuilder — Full Mapper with Add Button

**File**: `src/components/tools/field-mapping-builder.tsx`

```tsx
'use client';

import { FieldMappingRow } from './field-mapping-row';
import { FieldMeta } from '@/hooks/use-compiled-schema';

interface Mapping { inputParam: string; fmField: string; }

interface FieldMappingBuilderProps {
  mappings: Mapping[];
  fields: FieldMeta[];
  onChange: (mappings: Mapping[]) => void;
  // When input schema params change, pass them here for reference
  inputParams?: string[];
}

export function FieldMappingBuilder({
  mappings,
  fields,
  onChange,
  inputParams = [],
}: FieldMappingBuilderProps) {
  function addMapping() {
    onChange([...mappings, { inputParam: '', fmField: '' }]);
  }

  function updateMapping(index: number, updated: Mapping) {
    const next = [...mappings];
    next[index] = updated;
    onChange(next);
  }

  function removeMapping(index: number) {
    onChange(mappings.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Field Mappings
          <span className="ml-1 normal-case font-normal">(inputParam → FM Field)</span>
        </label>
        {fields.length === 0 && (
          <span className="text-xs text-amber-500">Select a layout first</span>
        )}
      </div>

      {mappings.length === 0 && (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-3 text-center">
          No mappings yet. Click below to add one.
        </div>
      )}

      {mappings.map((m, i) => (
        <FieldMappingRow
          key={i}
          mapping={m}
          fields={fields}
          onChange={updated => updateMapping(i, updated)}
          onRemove={() => removeMapping(i)}
          inputParams={inputParams}
        />
      ))}

      <button
        type="button"
        disabled={fields.length === 0}
        onClick={addMapping}
        className="w-full py-2 border border-dashed border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        + Add Field Mapping
      </button>
    </div>
  );
}
```

---

## Step 6: HandlerPreview — Live JSON Readout

**File**: `src/components/tools/handler-preview.tsx`

```tsx
'use client';

import { useState } from 'react';

interface HandlerPreviewProps {
  handlerConfig: Record<string, any>;
}

export function HandlerPreview({ handlerConfig }: HandlerPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  const json = JSON.stringify(handlerConfig, null, 2);
  const lines = json.split('\n');
  const preview = lines.slice(0, 8).join('\n');
  const hasMore = lines.length > 8;

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Handler Config Preview
        </span>
        <div className="f