---
trigger: always_on
---

# Rules File 4: Multi-Table & OData Tool Rules

## RULE: Strategy Selection Decision Tree
When building a tool that touches multiple tables, choose a strategy using this decision tree:

```
Does the tool need to WRITE to multiple tables?
  YES → Use OData $batch
  NO  ↓

Do the tables have a FileMaker relationship defined?
  YES → Use OData $expand (single call, cleaner response)
  NO  ↓

Does the tool filter one table then use results in another?
  YES → Use sequential multi-step (FM Data API, 2 steps)
  NO  ↓

Is the filter complex (AND+OR across multiple fields)?
  YES → Use OData $filter
  NO  → Use FM Data API /_find (simpler, token-based)
```

---

## RULE: Sequential Multi-Table — Always Extract the Foreign Key
In step 0, set `extractField` to the field that links to the next table. Set `useExtractedAs` to the input param name step 1 expects.

```json
{
  "stepIndex": 0,
  "layout": "Customers",
  "extractField": "CustomerID",
  "useExtractedAs": "customerId"
},
{
  "stepIndex": 1,
  "layout": "Orders",
  "fieldMappings": { "customerId": "CustomerID" }
}
```

---

## RULE: Sequential Multi-Table — Handle Empty Step 0 Results
If step 0 returns no records, do not execute step 1. Return `{ data: [], message: "No matching records in step 0" }`.

```typescript
if (!step0Result?.data || step0Result.data.length === 0) {
  return { data: [], stepResults: [step0Result], message: 'No records found' };
}
```

---

## RULE: OData `$expand` Requires FM Relationship
Only use `$expand` on tables that have a real FileMaker relationship. The relationship must be visible in the schema `relationships` array. If no relationship exists, fall back to sequential.

---

## RULE: OData Auth is Always Basic — Never FM Token
```typescript
// CORRECT for OData
Authorization: `Basic ${base64(username:password)}`

// WRONG for OData
Authorization: `Bearer ${fmToken}`
```

---

## RULE: OData Table Names vs FM Layout Names
- OData operates on **table names** (FM table occurrences)
- FM Data API operates on **layout names**
- They are often different — never assume they match
- Schema cache must store both: `layout` for Data API, `table` for OData

---

## RULE: OData String Literals Must Be Single-Quoted
```
// CORRECT
$filter=Status eq 'Active'

// WRONG
$filter=Status eq "Active"
$filter=Status eq Active
```
Single-quotes inside values must be escaped as `''`:
```
$filter=Name eq 'O''Brien'
```

---

## RULE: FM Find OR vs AND
- AND: put all criteria **in the same object** `[{ "A": "x", "B": "y" }]`
- OR: put criteria in **separate objects** `[{ "A": "x" }, { "B": "y" }]`
- Never conflate these — AND/OR behavior depends entirely on array structure

---

## RULE: OData $batch — Writes Must Be in a Changeset
Read operations (GET) go outside the changeset. Write operations (POST, PATCH, DELETE) must be grouped inside a `multipart/mixed` changeset boundary for atomicity.

---

## RULE: Multi-Step Tool inputSchema — Only Expose Top-Level Params
The `inputSchema` should only contain fields the USER provides. Fields extracted between steps (like `customerId` extracted from step 0) must NOT appear in `inputSchema`.

```json
// CORRECT - user only provides email
"inputSchema": {
  "properties": {
    "email": { "type": "string" }
  }
}

// WRONG - exposes internal step field
"inputSchema": {
  "properties": {
    "email": { "type": "string" },
    "customerId": { "type": "string" }  ← internal, not user-facing
  }
}
```

---

## RULE: Tool Name Prefix Convention by Category
| Category | Prefix |
|----------|--------|
| Search/find one table | `search_` |
| Get cross-table data | `get_` |
| Create record | `create_` |
| Update record | `update_` |
| Delete record | `delete_` |
| List/paginate | `list_` |
| Run FM script | `execute_` |
| Complex multi-table | `get_` or `find_` (describe the output, not the join) |

---

## RULE: Generated Tools Must Be Idempotent Where Possible
`search_`, `get_`, `list_` tools must never have side effects. Only `create_`, `update_`, `delete_`, `execute_` tools may modify data.

---

## RULE: OData `$filter` Placeholder Format
Use `{paramName}` as the placeholder in stored `filterExpression`. The executor will interpolate at runtime:
```json
"filterExpression": "Email eq {email} and Status eq {status}"
```
String values get single-quoted automatically. Numbers get injected as-is.

---

## RULE: Limit Multi-Step Depth to 3 Steps Maximum
More than 3 sequential FM API calls per tool = performance problem. If the logic requires 4+ tables, consider building a FileMaker script that does the join server-side and expose it as a `script` tool instead.