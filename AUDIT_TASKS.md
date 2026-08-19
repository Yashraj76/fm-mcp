# kilink — Audit Fix Tasks (July 2026)

Prioritized task list from the July 2026 health audit. Each open task has a **ready-to-paste prompt** — hand it to Claude Code / an agent to implement the fix.

**Status: Wave 1 (T1–T20) completed 2026-07-15 → 2026-07-17** on the `dev` branch. All changes verified with `npx tsc --noEmit && npm test && npm run build`. Wave 2 (T21+) below is the remaining path to production readiness, compiled from loose ends discovered during Wave 1.

Legend: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low

---

## ✅ Wave 1 — Completed (T1–T20)

| # | Task | Outcome & notes |
|---|------|-----------------|
| T1 🔴 | setImmediate broken on Vercel | ✅ `ai-run` + `servers` routes now await their runners (`maxDuration=300`), with safety-net catches marking session `'error'` / job `'failed'`. |
| T2 🔴 | Dependency vulnerabilities | ✅ 13 → 8 via `npm audit fix`. undici → 6.27.0, qs → 6.15.3, hono, js-cookie fixed. **Remaining 8 moderates need major bumps → T29.** |
| T3 🟠 | SSRF protection | ✅ `src/lib/net/ssrf-guard.ts` (blocked ranges + DNS re-check + obfuscated-IP normalization). Applied in connection Zod (async), test-ai allow-list, `FileMakerClient.fetch` defense-in-depth. Env knobs: `SSRF_ALLOW_PRIVATE_HOSTS`, `AI_BASE_URL_ALLOWED_HOSTS` → **T23**. |
| T4 🟠 | XFF spoof + fail-open | ✅ `extractClientIp` takes right-most XFF after `TRUSTED_PROXY_COUNT` (default 1, `0` = distrust headers); auth tier fails closed via `rateLimitFailureResult`. |
| T5 🟠 | Null-server log leak | ✅ `buildLogEntryAccessWhere` scopes global logs to `actorUserId`. Note: actorless (MCP-written) global logs are now unreachable via this endpoint by design. |
| T6 🟠 | Fake auth-type options | ✅ Basic-only everywhere (dialog, both Zod schemas via `z.literal('basic')`, `login()` fails loudly on legacy `oauth`/`clamid` rows). OAuth fields removed. |
| T7 🟠 | Create & Test closes dialog | ✅ Save mutation carries intent via variables; dialog stays open showing the result; also fixed duplicate-POST on re-test (remembers created id → PUT). |
| T8 🟠 | Rollback unreachable | ✅ `deployment-ui-state.ts` predicates keyed off `isLive`/`active`; added missing `superseded` StatusBadge mapping; card highlight fixed too. |
| T9 🟡 | Duplicate ToolDialog | ✅ Single global mount; dead `aiPrefilledData` removed. |
| T10 🟡 | Query-key collisions | ✅ Central `src/lib/query-keys.ts` (`toolKeys`, `invalidateToolLists`) — all 7 consumer files migrated; keys documented against payload shapes. |
| T11 🟡 | Stale server cards | ✅ `['servers']`/`['stats']` invalidations added to deploy/merge/rollback/archive/delete in all three pages (incl. server-detail, same bug). |
| T12 🟡 | Dashboard queries | ✅ Six queries in one `Promise.all`; `snapshot` excluded from all deployment lists; server-detail grafts back only the latest snapshot (Deployed Tools tab needs it). |
| T13 🟡 | undici Agent leaks | ✅ `close()` on `FileMakerClient` + `FMAdminClient` (called in both session wrappers, login moved inside try); OData executor + metadata destroy per-call Agents after body consumption. |
| T14 🟡 | Missing DB indexes | ✅ 5 indexes added + pushed (`Deployment.serverId`, `AiSuggestion.serverId`, `ToolGenerationJob[userId,serverId,status]`, `PlaygroundSession.userId`/`.serverId`), each verified against real where clauses. |
| T15 🟡 | MCP serial log writes | ✅ `Promise.all` batch, still awaited — true fire-and-forget would hit the same Vercel freeze as T1 (documented in code). |
| T16 ⚪ | Orphaned features | ✅ Wired: branch-diff merge preview + real changelog, playground persisted history, MCP self-test button. Deleted: 3 dead AI dialog components + store state. **Left `/api/servers/[id]/ai/suggest` orphaned → T30.** |
| T17 ⚪ | Dead API routes | ✅ All 9 deleted (none qualified for API-key exemption); stale error-message pointer to `/api/tools/[id]` fixed. |
| T18 ⚪ | AES-256-GCM migration | ✅ GCM `iv:tag:ciphertext` for all writes; legacy CBC decrypt kept; `scripts/reencrypt-credentials.ts` (dry-run/--apply). **Dry-run found 10 rows undecryptable with the local key → T22.** |
| T19 ⚪ | Accessibility | ✅ SchemaBrowser wrapped in Radix Dialog (focus trap, Escape, labels; outside-click blocked to protect unsaved selections); `role="alert" aria-live="assertive"` on all 4 auth banners. |
| T20 ⚪ | Hardening trio | ✅ Numeric recordId validation + encoding; playground error messages generic unless `FileMakerError`/`ZodError`; security headers + env-derived CSP verified live on a prod build. **`npm start` found broken → T21.** |

---

## Wave 2 — Production readiness (open)

### P0 — Blockers before go-live

### ✅ T21 🔴 `npm start` is broken (standalone output not configured) — DONE 2026-07-17
**Files:** `package.json:11`, `CLAUDE.md`
**Resolution:** Chose the `next start` path — the app deploys to Vercel (which ignores the start script), and the local Caddyfile just proxies to port 3000, which `next start` serves fine. The bun-standalone path was never functional (no `output: 'standalone'` was ever configured, and the static-copy steps were never scripted). Script is now `next start 2>&1 | tee server.log`; CLAUDE.md updated. Verified `npm run build && npm start` boots and `/login` returns 200 with all five security headers and the production CSP (no `'unsafe-eval'`). Note: local verification must use `PORT=xxxx npm start` when the dev server holds port 3000.

### ⏸ T22 🔴 Undecryptable legacy credential rows — env keys confirmed set (2026-07-17)
**Status:** Owner confirmed environment variables (including `ENCRYPTION_KEY`) are properly set in Vercel, so production decrypts its own rows. **Remaining caveat for local dev:** the local `.env` key differs from the one that wrote the 10 legacy rows, so those connections fail `bad decrypt` when exercised from a local dev server against the shared DB. If that ever bites, run `npx tsx scripts/reencrypt-credentials.ts` with the prod key (dry-run first) to normalize to GCM, or re-enter the affected credentials. No further action planned.

### ✅ T23 🔴 Production env vars — confirmed set in Vercel (2026-07-17)
**Status:** Owner verified all environment variables are properly configured in Vercel. Env knobs the code reads, for reference: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ENCRYPTION_KEY`, `TRUSTED_PROXY_COUNT` (default 1), `SSRF_ALLOW_PRIVATE_HOSTS` (LAN deployments only), `AI_BASE_URL_ALLOWED_HOSTS`, `INTERNAL_TEST_SECRET` (dev/preview only). Optional follow-up: commit a `.env.example` documenting these for new contributors.

---

### P1 — Should land before real traffic

### ✅ T24 🟠 Redis rate limiting — REMOVED instead of provisioned (2026-07-17)
**Files:** `src/lib/rate-limit.ts`, `src/lib/rate-limit.test.ts`, `package.json`
**Resolution:** Owner decision: Redis is not necessary at current traffic. Removed the optional Upstash backend entirely — deleted the Redis limiters, `resolveRateLimitMode`, and its tests; uninstalled `@upstash/ratelimit` + `@upstash/redis`. The in-memory sliding window is now the sole backend, with the per-instance limitation documented in the module header (limits multiply by concurrent serverless instances and reset on deploy — reintroduce a distributed limiter from git history if traffic grows). Fail-closed auth behavior (`rateLimitFailureResult`) unchanged. Full suite + build verified.

### T25 🟠 Error tracking & job-failure alerting
**Files:** `src/lib/logger.ts`, `instrumentation.ts` (create), Vercel project
**Why:** pino logs go to stdout only. Failed tool-generation jobs, playground sessions, and unhandled route errors are invisible unless someone reads Vercel logs. No alerting exists.

> **Prompt:** Add production error observability. (1) Wire an error-tracking service (Sentry via `@sentry/nextjs`, or Vercel's log drains + alerts if we want to stay platform-native — pick one and justify briefly) so unhandled route errors and `logger.error` calls are captured with request context but WITHOUT credentials — verify the pino redact list (`src/lib/logger.ts`) is applied before anything leaves the process. (2) Add a lightweight daily check or alert for stuck work: `ToolGenerationJob` rows in `pending`/`running` older than 15 minutes and `PlaygroundSession` rows in `running` older than 15 minutes (these indicate a regression of the T1 class of bug). A cron route + notification, or a Sentry cron monitor, both acceptable.

### T26 🟠 CI pipeline (the repo has none)
**Files:** `.github/workflows/ci.yml` (create)
**Why:** All verification in Wave 1 was manual. Nothing stops a future PR from breaking type-checks, tests, or reintroducing vulnerable deps.

> **Prompt:** Add a GitHub Actions workflow running on PRs and pushes to `dev`/`main`: (1) `npm ci`, (2) `npx prisma generate`, (3) `npx tsc --noEmit`, (4) `npm test`, (5) `npm run build` (provide dummy `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` and a random `ENCRYPTION_KEY` as workflow env — the build must not need real secrets; fix anything that does), (6) `npm audit --audit-level=high` as a non-blocking warning step. Cache node_modules. Keep total runtime under ~5 minutes.

### T27 🟠 Adopt Prisma migrations for production schema changes
**Files:** `prisma/`, `package.json` scripts
**Why:** The project uses `prisma db push` (no migration history) directly against the shared Supabase database — no rollback, no drift detection, and T14's indexes went in the same way. Fine for prototyping, risky for production.

> **Prompt:** Move from `prisma db push` to migration-based workflow: run `npx prisma migrate diff` to confirm schema and database are in sync, then create a baseline migration (`prisma migrate diff --from-empty --to-schema-datamodel` → `migrations/0_init/migration.sql` + `prisma migrate resolve --applied`). Add `db:migrate` (dev) and `db:deploy` (`prisma migrate deploy`) scripts; keep `db:push` documented as dev-only. Document the flow in CLAUDE.md. Do NOT reset or modify existing data.

---

### P2 — Robustness & polish

### T28 🟡 Move long-running AI work off the request thread (durable execution)
**Files:** `src/app/api/playground/ai-run/route.ts`, `src/app/api/servers/route.ts`, `src/app/api/servers/[id]/generate-tools/route.ts`
**Why:** The T1 fix makes these correct but synchronous — the client holds an open request for up to 300 s, and a browser refresh mid-run orphans nothing but gives no progress. Job records + polling endpoints already exist; the runners just need to execute durably.

> **Prompt:** The three long-running routes (playground ai-run, server-create tool generation, generate-tools) currently await their runners inline for up to 300 s. Migrate them to durable background execution using Vercel Workflow (workflow DevKit) or Vercel Queues — the route should enqueue, return the existing job/session id immediately (202, as the API originally intended), and the runner should execute in a durable function that survives the response. Keep the existing DB job/session status records as the source of truth for the existing polling UI (`status/route.ts`, playground poll-backoff). Do not regress the T1 guarantee: work must never be silently lost — if the queue/workflow product isn't available on our plan, keep the current synchronous behavior and say so.

### T29 🟡 Clear the remaining 8 moderate npm vulnerabilities (major bumps)
**Files:** `package.json`
**Why:** Left from T2: `@mdxeditor/editor` ≤4.0.3 (vulnerable js-yaml), `react-syntax-highlighter` ≤15.6.6 (vulnerable prismjs/refractor), plus postcss nested inside next (waits for a Next.js release).

> **Prompt:** Upgrade `@mdxeditor/editor` to ^4.0.4 and `react-syntax-highlighter` to ^16.1.1 (both major bumps flagged by `npm audit`). After upgrading, find every usage of each (grep imports), fix breaking API changes, and manually exercise the affected surfaces: any markdown/MDX editing UI and every code-block/syntax-highlight render (tool schema viewers, snapshot dialogs). Run `npm audit` (expect only the postcss-in-next advisory to remain — leave that one; it resolves with a future Next upgrade), then `npx tsc --noEmit && npm test && npm run build`.

### T30 🟡 Decide the fate of the stranded AI-suggest backend
**Files:** `src/app/api/servers/[id]/ai/suggest/route.ts`, `prisma/schema.prisma` (`AiSuggestion`), dashboard counts
**Why:** T16 deleted the only UI consumers. The route, the `AiSuggestion` model, and the dashboard's suggestion counters now serve nothing.

> **Prompt:** The AI-suggest feature has no UI since the dead dialogs were removed. Either (a) delete `src/app/api/servers/[id]/ai/suggest/route.ts`, remove the `totalSuggestions`/`pendingSuggestions` counters from `src/app/api/dashboard/route.ts` and any frontend display of them, and leave the `AiSuggestion` table in place (data preservation — add a schema comment marking it dormant); or (b) rebuild a minimal trigger UI on the tools page that calls the route and renders suggestions. Default to (a) unless told otherwise. Run the standard verification afterwards.

### T31 🟡 End-to-end smoke tests
**Files:** `e2e/` (create), `package.json`, optionally CI (T26)
**Why:** The tsx unit suite covers libs well but nothing exercises real HTTP + auth + UI. Every Wave-1 UI bug (T7, T8, T9) was invisible to the existing tests.

> **Prompt:** Add Playwright with a small production-realistic smoke suite: (1) signup/login flow against a Supabase test project (or storage-state fixture), (2) create a connection with the SSRF guard exercised (assert a private-IP host is rejected with the field error), (3) create a server → main branch exists → create a tool via the dialog → it appears in the list, (4) deploy → deployment page shows Current badge; older deployment shows rollback button, (5) MCP endpoint: provision an API key and assert `tools/list` returns the tool over HTTP. Mock or stub the FileMaker Data API (e.g. a tiny fixture server) — tests must not require a real FM server. Add `npm run test:e2e`; wire into CI as a separate job if T26 is done.

### T32 ⚪ CSP: replace `'unsafe-inline'` script-src with nonces
**Files:** `next.config.ts`, `src/middleware.ts`
**Why:** The T20 baseline CSP allows inline scripts, which neuters much of its XSS value. Next.js supports nonce-based CSP via middleware.

> **Prompt:** Harden the CSP from T20: generate a per-request nonce in `src/middleware.ts`, forward it via the `x-nonce` request header and a `Content-Security-Policy` response header using `script-src 'self' 'nonce-…' 'strict-dynamic'`, and remove `'unsafe-inline'` for scripts (styles may keep it — Tailwind). Follow the official Next.js CSP guide. Note the header must move from `next.config.ts` `headers()` (static) to middleware (dynamic) for the script-src directive only — keep the other security headers where they are. Verify the dashboard, playground, and schema browser render with zero CSP violations in the browser console, in both dev and a production build.

### T33 ⚪ Encryption key rotation support
**Files:** `src/lib/crypto.ts`, `scripts/reencrypt-credentials.ts`
**Why:** The T22 incident (rows written under a different key) shows single-key operation is fragile. Rotation currently requires downtime or breakage.

> **Prompt:** Add key-rotation support to `src/lib/crypto.ts`: keep `ENCRYPTION_KEY` as the sole write key, and add optional `ENCRYPTION_KEYS_PREVIOUS` (comma-separated hex keys) that `decrypt` tries in order when the primary key fails GCM auth / CBC padding. Preserve all existing guards and the fail-loud behavior when NO key works. Update `scripts/reencrypt-credentials.ts` to use the same fallback chain so `--apply` migrates rows from old keys to the current one. Extend `crypto.test.ts`: decrypt succeeds with a previous key, re-encrypt writes with the current key, and garbage still throws. Document the rotation runbook (set new key + move old to PREVIOUS → run script → remove PREVIOUS) in the module header.

### T34 ⚪ MCP self-test in production via provisioned key
**Files:** `src/app/api/servers/[id]/test-mcp-endpoint/route.ts`, server-detail checklist
**Why:** The T16 "Run test" button returns 503 in production by design (the internal-secret bypass is dev-only). A production-safe variant would use a real API key.

> **Prompt:** Extend the MCP self-test to work in production: when `NODE_ENV === 'production'`, instead of the internal-secret bypass, accept an optional `apiKeyId` in the request body, mint nothing — require the caller to have at least one active `McpApiKey` for the server, and perform the `tools/list` call using a short-lived internally-generated token OR document clearly why this is unsafe and instead have the UI show copy-paste `curl` instructions with the user's key prefix. Keep the dev path unchanged. Whichever route, the server-detail button must render a useful outcome in production rather than the current 503 toast.

---

## Suggested execution order (Wave 2)
1. ~~T21, T22, T23~~ — ✅ done/resolved 2026-07-17 (npm start fixed; env vars confirmed in Vercel).
2. **T25, T26, T27** — operational safety net (alerting, CI, migrations). ~~T24~~ resolved by removing Redis.
3. **T28, T29, T30, T31** — robustness and cleanup.
4. **T32, T33, T34** — hardening depth, schedule as capacity allows.

Run `npx tsc --noEmit && npm test && npm run build` after each task.
