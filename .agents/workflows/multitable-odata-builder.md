---
description: # Workflow 23: Multi-Table Relationship Auto-Detection & OData Filter Builder
---

## Overview
Fixes Problems 4 and 7. When two steps are added to the multi-table builder, the relationship between their layouts is auto-detected from the saved relationship graph. OData gets a proper visual builder on the FileMaker tab.

---

## Step 1: Relationship Detector Component

**File**: `src/components/tools/relationship-detector.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import { RelationshipEdge } from '@/hooks/use-compiled-schema';

interface RelationshipDetectorProps {
  fromLayout: string;
  toLayout: string;
  relationships: RelationshipEdge[];
  onRelationshipDetected: (rel: {
    extractField: string;
    useExtractedAs: string;
    toKeyField: string;
  } | null) => void;
}

export function RelationshipDetector({
  fromLayout,
  toLayout,
  relationships,
  onRelationshipDetected,
}: RelationshipDetectorProps) {
  useEffect(() => {
    if (!fromLayout || !toLayout) { onRelationshipDetected(null); return; }

    // Find relationship: fromLayout → toLayout
    const rel = relationships.find(
      r => r.usableInTools && (
        (r.fromLayout === fromLayout && r.toLayout === toLayout) ||
        (r.fromLayout === toLayout && r.toLayout === fromLayout)
      )
    );

    if (!rel) { onRelationshipDetected(null); return; }

    // Determine direction
    const isForward = rel.fromLayout === fromLayout;
    const extractField = isForward ? rel.fromKey : rel.toKey;
    const toKeyField = isForward ? rel.toKey : rel.fromKey;
    const useExtractedAs = toKeyField.charAt(0).toLowerCase() + toKeyField.slice(1);

    onRelationshipDetected({ extractField, useExtractedAs, toKeyField });
  }, [fromLayout, toLayout, relationships]);

  // Find the relationship for display
  const rel = relationships.find(
    r => r.usableInTools && (
      (r.fromLayout === fromLayout && r.toLayout === toLayout) ||
      (r.fromLayout === toLayout && r.toLayout === fromLayout)
    )
  );

  if (!fromLayout || !toLayout) return null;

  if (!rel) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
        <span>⚠️</span>
        <span>No saved relationship found between <strong>{fromLayout}</strong> and <strong>{toLayout}</strong>. You can set the join manually below.</span>
      </div>
    );
  }

  const confidenceColor = {
    certain: 'text-green-400 border-green-500/20 bg-green-500/10',
    high: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
    medium: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10',
    low: 'text-orange-400 border-orange-500/20 bg-orange-500/10',
  }[rel.confidence] ?? 'text-muted-foreground border-border bg-muted/20';

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs ${confidenceColor}`}>
      <span>🔗</span>
      <span>
        Auto-detected join: <strong>{rel.fromLayout}.{rel.fromKey}</strong>
        {' → '}
        <strong>{rel.toLayout}.{rel.toKey}</strong>
        {' '}
        <span className="opacity-70">({rel.confidence} confidence · {rel.source})</span>
      </span>
      <span className="ml-auto opacity-60">Override below if needed</span>
    </div>
  );
}
```

---

## Step 2: Updated Multi-Table Step Builder

Update `src/components/tools/multi-table-builder.tsx` to use RelationshipDetector:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { RelationshipDetector } from './relationship-detector';
import { FieldSelector } from './field-selector';
import { FieldMappingBuilder } from './field-mapping-builder';
import { CompiledSchema } from '@/hooks/use-compiled-schema';

interface MultiTableStep {
  stepIndex: number;
  api: 'data-api' | 'odata';
  operation: string;
  layout?: string;
  table?: string;
  fieldMappings: { inputParam: string; fmField: string }[];
  filterExpression?: string;
  expandTables?: string[];
  extractField?: string;
  useExtractedAs?: string;
}

interface MultiTableBuilderProps {
  steps: MultiTableStep[];
  compiledSchema: CompiledSchema;
  onChange: (steps: MultiTableStep[]) => void;
}

export function MultiTableBuilder({ steps, compiledSchema, onChange }: MultiTableBuilderProps) {
  function updateStep(index: number, patch: Partial<MultiTableStep>) {
    const next = steps.map((s, i) => i === index ? { ...s, ...patch } : s);
    onChange(next);
  }

  function addStep() {
    onChange([...steps, {
      stepIndex: steps.length,
      api: 'data-api',
      operation: 'find',
      fieldMappings: [],
    }]);
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepIndex: i })));
  }

  // When relationship is detected between step N and step N+1, auto-fill join fields
  function handleRelationshipDetected(
    stepIndex: number,
    rel: { extractField: string; useExtractedAs: string; toKeyField: string } | null
  ) {
    if (!rel) return;
    const next = [...steps];

    // Fill extractField on the FROM step
    next[stepIndex] = { ...next[stepIndex], extractField: rel.extractField, useExtractedAs: rel.useExtractedAs };

    // Pre-fill the TO step's fieldMappings with the join key
    if (next[stepIndex + 1]) {
      const toStep = next[stepIndex + 1];
      const alreadyMapped = toStep.fieldMappings.some(m => m.fmField === rel.toKeyField);
      if (!alreadyMapped) {
        next[stepIndex + 1] = {
          ...toStep,
          fieldMappings: [
            { inputParam: rel.useExtractedAs, fmField: rel.toKeyField },
            ...toStep.fieldMappings,
          ],
        };
      }
    }

    onChange(next);
  }

  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const layoutFields = step.layout
          ? (compiledSchema.layouts.find(l => l.name === step.layout)?.fields ?? [])
          : [];

        const nextStep = steps[index + 1];
        const showRelDetector =
          step.api === 'data-api' &&
          step.layout &&
          nextStep?.api === 'data-api' &&
          nextStep?.layout;

        return (
          <div key={index}>
            <div className={`rounded-lg border p-4 space-y-4 ${step.api === 'data-api' ? 'border-blue-500/20 bg-blue-950/10' : 'border-purple-500/20 bg-purple-950/10'}`}>
              {/* Step Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${step.api === 'data-api' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    Step {index}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {step.api === 'data-api' ? '🗄️ FM Data API' : '🌐 OData'}
                    {step.layout && ` → ${step.layout}`}
                    {step.table && ` → ${step.table}`}
                    {step.operation && ` [${step.operation}]`}
                  </span>
                </div>
                <button type="button" onClick={() => removeStep(index)} className="text-destructive text-xs hover:underline">
                  Remove
                </button>
              </div>

              {/* API Type + Operation */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">API Type</label>
                  <select
                    value={step.api}
                    onChange={e => updateStep(index, { api: e.target.value as 'data-api' | 'odata' })}
                    className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground"
                  >
                    <option value="data-api">FM Data API</option>
                    <option value="odata" disabled={compiledSchema.tables.length === 0}>
                      OData {compiledSchema.tables.length === 0 ? '(not available)' : ''}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Operation</label>
                  <select
                    value={step.operation}
                    onChange={e => updateStep(index, { operation: e.target.value })}
                    className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground"
                  >
                    {step.api === 'data-api' ? (
                      <>
                        <option value="find">Find Records (/_find)</option>
                        <option value="list">List Records</option>
                        <option value="create">Create Record</option>
                        <option value="update">Update Record</option>
                        <option value="delete">Delete Record</option>
                        <option value="script">Run Script</option>
                      </>
                    ) : (
                      <>
                        <option value="odata-get">OData GET ($filter / $expand)</option>
                        <option value="odata-batch">OData Batch (multi-write)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Layout / Table Selector */}
              {step.api === 'data-api' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">FM Layout</label>
                  <select
                    value={step.layout ?? ''}
                    onChange={e => updateStep(index, { layout: e.target.value, fieldMappings: [] })}
                    className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground"
                  >
                    <option value="">Select layout...</option>
                    {compiledSchema.layouts.map(l => (
                      <option key={l.name} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {step.api === 'odata' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">OData Table</label>
                  <select
                    value={step.table ?? ''}
                    onChange={e => updateStep(index, { table: e.target.value })}
                    className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground"
                  >
                    <option value="">Select table...</option>
                    {compiledSchema.tables.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Field Mappings (data-api only) */}
              {step.api === 'data-api' && (
                <FieldMappingBuilder
                  mappings={step.fieldMappings}
                  fields={layoutFields}
                  onChange={mappings => updateStep(index, { fieldMappings: mappings })}
                />
              )}

              {/* OData filter expression */}
              {step.api === 'odata' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    $filter Expression
                  </label>
                  <input
                    value={step.filterExpression ?? ''}
                    onChange={e => updateStep(index, { filterExpression: e.target.value })}
                    placeholder="Email eq '{email}' and Status eq 'Active'"
                    className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm font-mono text-foreground"
                  />
                  <p clas