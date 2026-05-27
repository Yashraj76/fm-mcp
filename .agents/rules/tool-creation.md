---
trigger: always_on
---

# Rules File 11: Tool Creation, Field Mapping & Dialog Rules

---

## RULE: Field Dropdowns Must Come from compiledSchema — Never Free Text
Anywhere the user needs to enter a FileMaker layout name or FM field name, it must be a **dropdown or searchable combobox** populated from `compiledSchema.layouts`. Free-text inputs for FM field names are banned because typos cause silent runtime failures.

```
WRONG: <input placeholder="e.g. CustomerID" />  ← user can typo
RIGHT: <FieldSelector fields={layoutFields} />   ← only real field names selectable
```

The only exception: if `compiledSchema` is null (schema not yet browsed), fall back to free text with a warning banner.

---

## RULE: Selecting an FM Field Always Auto-Generates the Input Param Name
The moment a user selects an FM field from the dropdown in a FieldMappingRow, `fmFieldToParamName()` fires and pre-fills the input param name. The user can then edit it — but they must never have to start from blank.

```typescript
// CORRECT pattern in FieldMappingRow:
function handleFmFieldChange(fmField: string) {
  const autoParam = fmFieldToParamName(fmField);  // auto-generate
  onChange({ fmField, inputParam: autoParam });    // both set at once
}
```

---

## RULE: Tab Order Is Fixed — Input Before FileMaker
The dialog tabs must always be in this order: `Basic → Input → FileMaker → Multi-Table → Test → Output`. Input params must be defined before field mappings, because the mapping builder uses the input param list.

---

## RULE: handlerConfig Preview Is Always Live
The `HandlerPreview` component must update reactively as the user changes any field. It uses `useMemo` computed from form state — never reads from the database or a stale ref. This gives the user continuous feedback on what JSON they're building.

---

## RULE: compiledSchema Is Loaded Once Per Dialog Session
Load via `useCompiledSchema(connectionId)` on dialog open. Cache with TanStack Query `staleTime: 5 * 60 * 1000`. Do not reload on every tab switch. Do not reload when the user types in a field.

---

## RULE: Relationship Auto-Detection Does Not Block the User
`RelationshipDetector` runs as a side effect (`useEffect`) and calls `onRelationshipDetected`. If no relationship is found, it passes `null` and the user fills in Extract Field / Inject As manually. The absence of a detected relationship must never prevent the user from proceeding.

---

## RULE: OData Is Only Offered When Available
The "Use OData API" toggle only appears when `compiledSchema.tables.length > 0`. If OData metadata was not fetched (OData disabled on the FM server), the toggle is hidden entirely. Never show OData options when no OData tables are available.

---

## RULE: normalizeTool() Runs on Every AI-Generated Tool Before Save
No AI-generated tool should ever be saved directly from the raw AI response. The pipeline is always:
```
AI response → parseAIResponse() → normalizeTool() → validateToolForSave() → prisma.tool.create()
```
If `validateToolForSave()` returns errors, the tool is skipped (auto-generate) or the user is shown the errors (manual save).

---

## RULE: fmMethod and category Must Always Be Consistent
These two fields must be derived from each other when one is missing:

| fmMethod | category |
|----------|---------|
| find | Find |
| create, update, delete, list, get | CRUD |
| script | Script |
| sequential-multi-table, odata-expand, odata-batch | Multi-Table |
| odata-filter | Custom |
| system | system |

`normalizeTool()` enforces this. The dialog's `useEffect` also auto-sets category when fmMethod changes. They must never be out of sync when a tool is saved.

---

## RULE: recordId Must Be in inputSchema for update/delete/get Tools
Any tool with `fmMethod` of `update`, `delete`, or `get` must have `recordId` as a required string field in `inputSchema.properties`. Both `normalizeTool()` and `validateToolForSave()` enforce this. The dialog must also show a read-only "recordId" row in the Input Schema tab for these methods.

---

## RULE: FieldMappingBuilder Shows Empty State When No Layout Selected
When no layout is selected, the "Add Field Mapping" button is disabled and an amber warning says "Select a layout first". No field mappings can be added without a layout because the FM field dropdown would be empty.

---

## RULE: Advanced JSON Override Is Hidden by Default
The raw `handlerConfig` textarea is collapsed behind an "Advanced" toggle. It opens only when the user explicitly requests it. When it is open and the user edits raw JSON, the form fields must not conflict — raw JSON wins on save if it is valid JSON. Show a warning: "Advanced JSON will override the form fields above."

---

## RULE: AI Prompts Must Output All Required Tool Fields
The AI prompts (`CREATE_TOOLS_PROMPT`, `SINGLE_TOOL_FROM_PROMPT`, `FLOW_TOOLS_FROM_PROMPT`) must all include the complete required fields section. Any prompt that doesn't explicitly require `fmMethod`, `category`, `handlerConfig.connectionId`, and `handlerConfig.method` must be updated. See Workflow 24 for the enforcement section to add.

---

## RULE: lowerCamelCase Conversion for Input Param Names
`fmFieldToParamName()` must handle:
- PascalCase: `EmailAddress` → `emailAddress`
- Space-separated: `First Name` → `firstName`
- SCREAMING_SNAKE_CASE: `CUSTOMER_ID` → `customerId`
- ALL_CAPS single word: `ZIP` → `zip`
- Mixed: `Phone_Number` → `phoneNumber`

Test all these cases when implementing. A wrong conversion causes a broken `fieldMappings` that silently doesn't find records.

---

## RULE: Multi-Table Steps Are Numbered 0-Based in stepIndex
When saving or sending steps to the executor, `stepIndex` must always be the array position (0-based). When the user adds or removes steps, all subsequent `stepIndex` values must be recomputed:

```typescript
onChange(steps.filter((_, i) => i !== indexToRemove).map((s, i) => ({ ...s, stepIndex: i })));
```

---

## RULE: OData filterExpression Uses {paramName} Placeholders — Never Hardcoded Values
The `filterExpression` stored in `handlerConfig` uses `{email}` not `'john@example.com'`. The executor resolves these at runtime. The visual filter builder must generate expressions with placeholders, and the raw input must display the placeholder syntax hint.

---

## RULE: Tool Completeness Badge
In the tool list and tool card, AI-generated tools that are missing `fmMethod` or `category` must display an amber "⚠ Incomplete" badge. Clicking it opens the tool in edit mode with a notice at the top explaining what was auto-filled. This helps users understand and review AI-generated tools rather than having silent bad configs.