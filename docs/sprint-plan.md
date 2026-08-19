# Sprint Plan — Fixes from `docs/new-changes.md` (audited 2026-07-20)

Each item below was verified against the actual code before being turned into a task — this isn't a re-statement of the report, it's what's actually there. Classification legend: **BUG** (broken today), **MISSING FEATURE** (doesn't exist), **UX GAP** (exists but confusing/hard to find), **ALREADY OK** (works as requested; note only).

Sprints are ordered by dependency and risk, not by the original numbering — quick/safe fixes first, schema-changing work last.

---

## Sprint 1 — Quick fixes (bugs + cheap UI cleanup)

Low risk, no schema changes, each independently shippable in isolation.

### 1.1 Manual connection creation is broken — `BUG` (was item 3)
**Root cause:** `src/components/connections/connection-dialog.tsx:161` reads `res?.data?.id`, but `apiFetch` (`src/lib/utils/api-client.ts:35-47`) already unwraps the `{success, data}` envelope, so `res` *is* the connection record — `res.data` is always `undefined`. `createdId`/`effectiveId` never get set, so "Create & Test" silently skips the test step and re-clicking creates duplicate `FMConnection` rows. `database-picker.tsx:104-116` does this correctly for the sibling flow (`conn.id` directly) — use that as the reference.
**Fix prompt:**
> In `src/components/connections/connection-dialog.tsx` around line 161, change `const savedId = effectiveId ?? (res?.data?.id as string | undefined)` to read `res?.id` instead of `res?.data?.id`, matching the pattern already used in `src/components/connections/database-picker.tsx:104-116`. Verify by creating a new manual file connection with "Create & Test" checked — it should test immediately and not create a duplicate row on a second click.

### 1.2 Remove default math tools seeded on server creation — `BUG` (item 5)
**Root cause:** `src/lib/tools/default-tools.ts:4-33` defines `SYSTEM_TOOLS` (`add_numbers`, `subtract_numbers`, `calculate_average`, `calculate_percentage`) and `seedDefaultTools()` is called unconditionally from `src/lib/tools/job-runner.ts:71-73`, which runs both on server creation (`src/app/api/servers/route.ts:175-176`) and on "Generate Tools" (`src/app/api/servers/[id]/generate-tools/route.ts:82`). These are registered as real, callable MCP tools on every server, exactly as reported.
**Fix prompt:**
> Remove the `seedDefaultTools()` call in `src/lib/tools/job-runner.ts:71-73` so new/regenerated MCP servers no longer get `add_numbers`/`subtract_numbers`/`calculate_average`/`calculate_percentage` auto-registered as callable tools. Keep the `SYSTEM_TOOLS` definitions and the `category === 'system'` execution branch in `executor-service.ts:262` intact for now (Sprint 5 relocates them into the playground as an AI post-processing helper rather than deleting the logic outright). Add a migration-safe cleanup note or a one-off script to soft-delete existing `system`-category tools already seeded on live servers, since removing the seed call doesn't retroactively remove tools already created.

### 1.3 Remove the duplicate "Mode" picker from the left sidebar — `UX GAP` (item 2)
**Root cause:** `serverMode` (`edit|staging|deployed`) is real state (`src/lib/store.ts:30-31,65-66`) that legitimately drives the tab switcher on the server detail page (`src/components/servers/server-detail-page.tsx:525-576`). The complaint is a **second**, redundant control in `src/components/app-sidebar.tsx:129-157` — a global "Mode:" badge in the sidebar footer, visible on every page (dashboard, connections, tools...) where it has no effect, and which silently pre-sets the tab the next time any server detail page is opened.
**Fix prompt:**
> Delete the "Mode" picker block in `src/components/app-sidebar.tsx` (the footer badge control around lines 58-68 and 129-157) — it's a global duplicate of the Edit/Staging/Deployed tabs already on `server-detail-page.tsx`. Confirm nothing else reads `useAppStore().serverMode` besides those two files before removing. Optionally (not required for this ticket), consider making `serverMode` page-local state on `server-detail-page.tsx` instead of a persisted global store value, since it's really per-server-detail context, not app-wide.

### 1.4 Add a visible "Browse Schema" button to file connection cards — `MISSING FEATURE` (item 4)
**Root cause:** FM Server cards have a visible "Pick Database" button (`src/components/connections/connections-page.tsx:310-315`). The equivalent action for file connections (`FMConnection`) exists but is buried in an overflow dropdown menu (`connections-page.tsx:409-411`), with just a passive text hint ("No schema loaded — click Browse Schema") and no clickable button on the card face. Backend is fully intact (`/api/connections/[id]/browse-schema`, `/schema/compiled`, `/infer-relationships`, `/layout-fields` all present).
**Fix prompt:**
> In `src/components/connections/connections-page.tsx`, add a visible "Browse Schema" button on the face of each `FMConnection` card (mirroring the "Pick Database" button already on server cards at lines 310-315), calling `setSchemaBrowserId(conn.id)` (state already declared at line 80, already wired to `<SchemaBrowser>` at line 506). Keep the existing dropdown-menu entry for parity/discoverability but make the card-face button the primary action.

---

## Sprint 2 — Performance (dashboard/list load, edit dialog load)

### 2.1 Cut repeated Supabase auth round-trips — `BUG` (items 1 & 7, primary cause)
**Root cause:** every protected API call re-verifies the session via a network round-trip to Supabase (`getUserFromRequest()` → `supabase.auth.getUser()`, `src/lib/auth/get-user.ts:22-25`, wrapped by `withAuth` in `src/lib/auth/api-guard.ts:13`) — typically 100-300ms, *per request*. The dashboard alone fires 3 parallel queries (`dashboard-page.tsx:103-127`); the tool-edit dialog fires 3 sequential/parallel ones too. This is the dominant cost on a near-empty DB, not record volume.
**Fix prompt:**
> Reduce redundant Supabase auth verification round-trips in `src/lib/auth/get-user.ts`/`api-guard.ts`. Evaluate switching to local JWT claims verification (`supabase.auth.getClaims()` or manual JWT verification against the Supabase JWT secret) instead of `getUser()`'s network call, where session-revocation freshness requirements allow it. If a network call must stay, add a request-scoped memoization (e.g. `React.cache` or an in-request Map keyed by the auth header) so multiple API calls triggered by one page load don't each pay the round-trip independently. Benchmark dashboard load time before/after.

### 2.2 Add lightweight list variants for servers/connections/tools — `BUG` (item 1)
**Root cause:** `GET /api/servers` (`src/app/api/servers/route.ts:26-71`) does a heavy nested `include` (connections, active branches, enabled tools, last-5 deployments, `_count`) even for the plain list view, which only needs id/name/status. `GET /api/servers/[id]` (`src/app/api/servers/[id]/route.ts:26-93`) is similarly heavy and is fetched fully just to open the tool-edit dialog.
**Fix prompt:**
> Add a lightweight `select`-only response mode for list/dropdown consumers of `/api/servers` (e.g. a `?summary=true` query param, or a separate `/api/servers/summary` route) returning only `id, name, status, connectionCount` — reserve the full nested `include` for the server detail page. Update `servers-page.tsx` and any dropdown consumers to use the lightweight variant. Apply the same pattern to `/api/connections` if it has a similar over-fetch (verify during implementation).

### 2.3 Fix the sequential waterfall in the tool-edit dialog — `BUG` (item 7)
**Root cause:** Opening `tool-dialog.tsx` fires `existingTool`, `serverData` (heavy, see 2.2), and `useCompiledSchema(activeConnectionId)` — but `activeConnectionId` is derived from `serverData.connections[0]` (`tool-dialog.tsx:236-263`), so the schema fetch can't start until the heavy server fetch resolves. Each of the 3 requests also independently re-pays the auth cost from 2.1.
**Fix prompt:**
> In `src/components/tools/tool-dialog.tsx`, avoid deriving `activeConnectionId` from `serverData` when it's already known from the calling context (e.g. pass the connectionId as a prop from the tools list page, which already has it from its own list query) so the `useCompiledSchema` fetch can start in parallel with `serverData` rather than waiting on it. Depends on 2.1 and 2.2 landing first for full effect.

---

## Sprint 3 — Tool creation UX (the core feature, item 10)

This is the highest-leverage sprint per the report. Findings below correct a few assumptions in the original report — two sub-items are already implemented; the real gaps are narrower than described.

### 3.0 Corrections to the original report
- **Category field is already a required dropdown**, not free text (`tool-dialog.tsx:776-790`, `CATEGORIES` const, validated in `validate-tool.ts:33-34`, defaulted in `normalize-tool.ts:79-85`), and it already has runtime effect (`executor-service.ts:262` branches on it). **No fix needed** — verify AI-generated tools always populate a valid value as part of 3.4.
- **Layout/script dropdowns already exist** for `fm-layout`/`fm-script` tool types (`tool-dialog.tsx:974-1030`), sourced from `useCompiledSchema`/`/api/connections/[id]/schema/compiled`. No free-text entry point exists there. **No fix needed.**

### 3.1 Make schema-driven field-name selection the primary input UX — `UX GAP`
**Root cause:** `SchemaBuilder`/`PropertyRow` (`schema-builder.tsx:249-267`) has a free-text `Input` for field name with a small secondary "pick from layout fields" control that overwrites it — schema-awareness exists but is secondary, easy to miss, and only available once `formData.fmLayout` is already set (so unavailable for OData/multi-table tool types).
**Fix prompt:**
> In `src/components/tools/schema-builder.tsx` (`PropertyRow`, ~lines 249-267), invert the control priority: when layout fields are available (`layoutFields` from `tool-dialog.tsx:288-314`), make the dropdown the primary input and free text a fallback/"custom" option, not the reverse. Extend field-name sourcing to also work for OData/multi-table tool types by pulling field lists from the relevant tables in `compiledSchema`, not only from `formData.fmLayout`.

### 3.2 Constrain multi-table OData `$expand` to real relationships — `BUG` (correctness gap)
**Root cause:** `MultiTableBuilder` already uses `RelationshipGraph`-derived `relationships` to suggest joins between sequential steps (`multi-table-builder.tsx:199,261-267`) — but the separate OData `$expand` picker (`odata-filter-builder.tsx:116-136`) lets the user check *any* table in `compiledSchema.tables`, unfiltered by actual relationship edges, which produces a runtime OData error (`odata-executor.ts:134-163`) when there's no real navigation property.
**Fix prompt:**
> In `src/components/tools/odata-filter-builder.tsx` (~lines 116-136), filter the `$expand` table checklist to only tables that have a `RelationshipGraph` edge to the currently selected base table (same relationship data already used by `multi-table-builder.tsx:199`), instead of listing every table in `compiledSchema.tables`. Show a disabled/greyed state with a tooltip ("no relationship defined") for unrelated tables rather than hiding them outright, so users understand why a table isn't selectable.

### 3.3 Add output-shaping to the tool test section — `MISSING FEATURE`
**Root cause:** The Test tab (`tool-dialog.tsx` ~1150-1265) runs the tool and shows raw `JSON.stringify(testResult.data)`. The only related control, "Derive Schema" (`handleDeriveOutputSchema`, line 1224 → 667), only generates documentation metadata — `outputSchema` has zero runtime effect (confirmed unused in `executor-service.ts`/`execute-tool.ts`). There is no way to pick a field, list, or filtered subset as the tool's actual returned output.
**Fix prompt:**
> Add a response-shaping step to the Test tab in `src/components/tools/tool-dialog.tsx`: after a successful test execution, render the JSON response with clickable/selectable paths (a simple JSON tree view is enough) letting the user pick a field, an array, or a filtered projection as the tool's output shape. Persist that selection as a new `outputSelector` (e.g. a JSONPath or dot-path string) on the tool definition. Wire `outputSelector` into `src/lib/tools/executor-service.ts` so it actually projects the FileMaker/OData response before returning it to the MCP client — this closes the gap where `outputSchema` today is documentation-only with no runtime effect.

### 3.4 Bring AI-generated tools through the same editing/schema-aware flow — `MISSING FEATURE`
**Root cause:** The surviving AI tool-creation surface (`src/components/ai/ai-prompt-tool-dialog.tsx`, posting to `/api/servers/[id]/ai/generate-from-prompt` and `.../ai/generate-tools/save`) only supports checking/unchecking whole AI-suggested tools before saving — no per-field editing, no layout/script dropdown, no schema-aware input mapping. All gaps from 3.1-3.3 apply here too, worse, since there's no edit step at all.
**Fix prompt:**
> After a user selects AI-suggested tools to keep in `src/components/ai/ai-prompt-tool-dialog.tsx`, route each selected tool through `tool-dialog.tsx` (open it pre-filled with the AI-generated definition) instead of saving directly via `/ai/generate-tools/save`. This gives AI-generated tools the same category validation, schema-aware field/layout dropdowns (3.1), relationship-constrained multi-table joins (3.2), and output-shaping test step (3.3) as manually created tools, and lets the user review/adjust before committing. Depends on 3.1-3.3 landing first.

---

## Sprint 4 — Branching, staging/deploy clarity, and conflict safety (items 6 & 8)

### 4.1 Fix "Deploy to Production" to actually deploy the current branch's effective tools — `BUG` (item 6)
**Root cause:** `POST /api/servers/[id]/deployments` (`deployments/route.ts:76-79`) snapshots the raw base `Tool` table directly, **ignoring `currentBranchId`/`getEffectiveTools` entirely**. Branch tool edits live only in `BranchTool.overrideData` and only get written into base `Tool` rows via the separate `/merge` route. So editing a tool on a feature branch and clicking "Deploy to Production" silently deploys the *unmerged* base state — the edits are dropped, with no error or warning.
**Fix prompt:**
> In `src/app/api/servers/[id]/deployments/route.ts` (~lines 76-79), either (a) require deployment to originate from the `main` branch only — disable/hide "Deploy to Production" unless `currentBranchId === mainBranch.id`, with a clear message directing the user to "Merge" first — or (b) make the deploy snapshot call `getEffectiveTools(currentBranchId)` (`src/lib/branching.ts`) instead of the raw `Tool` table, so deploying from any branch deploys what's actually visible on that branch. Prefer option (a) for correctness and simplicity unless there's a product reason to allow deploying a non-main branch directly; confirm with product intent before choosing.

### 4.2 Add explanatory copy for Edit / Staging / Deployed and Merge vs. Deploy — `UX GAP` (item 6)
**Root cause:** The three tabs on `server-detail-page.tsx:525-576` imply a linear pipeline (edit → stage → deploy) that doesn't actually exist in the data model — "Staging" is just a read-only preview of whatever branch is currently selected, not a distinct pending state, and "Merge" (promotes branch → main) and "Deploy" (main/current branch → `Deployment` snapshot) are two unrelated write paths with no UI text distinguishing them.
**Fix prompt:**
> Add a short inline explainer (tooltip or persistent help text) near the Edit/Staging/Deployed tabs on `src/components/servers/server-detail-page.tsx` clarifying: "Edit" = modify tools on the currently selected branch; "Staging" = read-only preview of that branch's effective tools, not a separate pending state; "Deployed" = the live snapshot served to MCP clients, created by "Deploy to Production" (only from main, per 4.1) — separate from "Merge," which promotes a feature branch's tool changes into main but does not itself deploy anything. Depends on 4.1 for the copy to describe accurate behavior.

### 4.3 Add merge conflict detection — `MISSING FEATURE` (item 8)
**Root cause:** `merge/route.ts:127-149` applies `BranchTool` overrides onto base `Tool` rows with last-writer-wins semantics — no check for whether the base `Tool` changed since the branch diverged (e.g. another branch already merged a conflicting change to the same tool).
**Fix prompt:**
> In `src/app/api/branches/[id]/merge/route.ts`, before applying overrides (~line 127), compare each `BranchTool`'s recorded base state (add a `baseUpdatedAt`/`baseSnapshot` field captured when the branch was created or the override last synced, if not already present) against the current `Tool.updatedAt`/content. If they differ, surface a conflict list to the user (which tools, what changed) and require explicit confirmation before overwriting, rather than merging silently. This likely needs a small schema addition — scope it as its own task before implementation.

### 4.4 Clarify or replace "Revert" with true history-based revert — `MISSING FEATURE` / naming issue (item 8)
**Root cause:** `revert/route.ts:60-73` only resets a branch to *current main*, not to any prior historical state — despite the user asking for the ability to roll back to "a particular stage" using logs. `ActivityLog` already records before/after JSON per action but nothing reads it for this purpose.
**Fix prompt:**
> Either (a) rename the current "Revert" action to something accurate like "Reset to Main" to stop it being mistaken for historical rollback, and separately scope true history-based revert as a future task reading from `ActivityLog`'s before/after snapshots; or (b) if history-based revert is wanted this sprint, build a UI listing `ActivityLog` entries for a branch's tools with a "restore to this point" action that reconstructs `BranchTool.overrideData` from the logged `before` JSON. Recommend (a) now, (b) as a follow-up sprint — confirm which with the user before starting.

### 4.5 Per-branch/test FMConnection override — `MISSING FEATURE`, schema change (item 11)
**Root cause:** Neither `Branch` nor `Deployment` has any relation to `FMConnection`/`FMServerConnection` in `prisma/schema.prisma` — connections are managed only at the `McpServer` level via `FMConnectionServer`, shared by every branch and deployment. There is currently no way to point a test/feature branch at a sandbox FileMaker file distinct from what production uses — tool *definitions* are branch-scoped, but the underlying data connection is not.
**Fix prompt:**
> Add an optional `FMConnection` (or `FMConnectionServer`) override relation on `Branch` in `prisma/schema.prisma` (nullable — falls back to the server's default connection when unset). Update `src/lib/branching.ts`/tool execution (`executor-service.ts`) to resolve the connection from the branch override when present, otherwise from the server default. Add UI on `branches-page.tsx` to let a user pick a different connection for a given branch (e.g. pointing a "test" branch at a sandbox FileMaker file). This is the largest task in this plan — treat as its own mini-project with a migration plan, since it changes how every tool execution resolves its connection. Do this last, after 4.1-4.4 land, since it touches the same execution path.

---

## Sprint 5 — Playground AI: human-readable answers (item 9)

### 5.1 Add a natural-language synthesis turn after tool execution — `BUG` (prompt/UX gap)
**Root cause:** The orchestrator prompt (`src/lib/ai/prompts/playground-orchestrator.ts:41-45,120`) explicitly instructs the model to *"Return ONLY a valid JSON object... do not return any text outside the JSON object"* — it's a pure execution planner, never asked to write prose. `runPlaygroundSession` (`session-runner.ts:66-198`) executes tool calls and packages raw results (`buildFinalResult`) with no LLM call afterward. The UI (`server-playground.tsx:176,271`) shows a hardcoded "Working on your request…" bubble and renders raw data via `ResponseTable`/`JSON.stringify` — there's no prose-rendering surface at all today.
**Fix prompt:**
> After `runPlaygroundSession` (`src/lib/playground/session-runner.ts`) finishes executing all planned tool calls, add a second `callAI` invocation with a new "summarizer" system prompt (e.g. "Given the user's original request and these tool results, write a clear, human-readable answer in full sentences and short paragraphs — no JSON, no raw field dumps"), fed the original `intent` plus `allResults`. Store the result as a new field (e.g. `finalResult.answerText`) alongside the existing raw data. In `src/components/tools/server-playground.tsx`, replace the hardcoded "Working on your request…" bubble text with `answerText` (rendered via a markdown renderer, since existing UI has none), keeping `ResponseTable` underneath as a supplementary "view raw data" detail rather than the primary answer.

---

## Sequencing recommendation

1. **Sprint 1** (bug fixes + cleanup) — ship first, independent, low risk, immediate user-visible relief.
2. **Sprint 2** (performance) — ship second; addresses two of the loudest complaints (items 1 & 7) with mostly backend-only changes.
3. **Sprint 3** (tool creation UX) — the report calls this the most important feature; do it once Sprint 1/2 land so the dialog being reworked isn't also fighting perf/auth issues.
4. **Sprint 4** (branching/deploy model) — 4.1 and 4.2 are safe correctness/clarity fixes and should ship together; 4.3/4.4 are larger and can slip a sprint; 4.5 (per-branch connections) is the single largest task in this plan and should be scoped separately with its own migration review before starting.
5. **Sprint 5** (playground prose answers) — independent of everything else, can run in parallel with any sprint above once resourcing allows.

Everything above was verified against the current code, not assumed from the report — file:line references are included so implementation can start directly from each fix prompt without re-discovery.
