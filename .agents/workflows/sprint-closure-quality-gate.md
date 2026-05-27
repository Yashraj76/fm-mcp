---
description: # Workflow 22: Sprint Closure Quality Gate
---

## Overview
Use this workflow before marking any sprint, implementation pass, or remediation task as complete. It converts recurring review issues into a repeatable closure checklist.

---

## Step 1: Identify the Sprint Scope
Search for sprint/task/workflow references before judging completion:

```bash
rg -n "Sprint N|sprint N|Task N|Workflow N|workflow N" .
find .agents -maxdepth 3 -type f -print
```

If no explicit sprint definition exists, infer scope from changed files and relevant `.agents/rules` / `.agents/workflows`, then state the assumption.

---

## Step 2: Run Mandatory Verification
Run all commands:

```bash
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

Closure rule:
- All four must pass.
- If network is blocked and a command legitimately needs network, rerun with approved access.
- If any command fails, the sprint is not closed.

---

## Step 3: Frontend Regression Checks
Run:

```bash
rg -n "useAppStore\\(\\)" src/components src/app src/lib
rg -n "fetch\\((`|\"|')/api" src/components src/app
rg -n "dangerouslySetInnerHTML|localStorage|sessionStorage|getSession\\(|auth_token|passcode" src/app src/components src/lib
```

Pass criteria:
- No broad Zustand subscriptions.
- No raw internal app API fetches from frontend code.
- No browser auth token storage.
- No legacy passcode/auth-cookie flows.
- `dangerouslySetInnerHTML` must be limited to vetted library/system components only.

---

## Step 4: API Safety Checks
Run:

```bash
rg -n "JSON\\.parse\\(" src/app/api
rg -n "export async function (GET|POST|PUT|DELETE|PATCH)|export const (GET|POST|PUT|DELETE|PATCH)" src/app/api
rg -n "findUnique\\(|where:\\s*\\{\\s*id\\s*\\}|server:\\s*\\{\\s*userId\\s*\\}|userId" src/app/api src/lib
```

Pass criteria:
- No direct `JSON.parse` in API routes.
- All user-owned API routes use `withAuth()`.
- First user-owned reads are scoped by `userId` or parent ownership relation.
- Post-auth primary-key mutations are allowed only after ownership is proven.
- Public MCP transport remains the only intentionally unauthenticated app API route, and it must use API-key auth.

---

## Step 5: Execution Path Ownership Check
Inspect tool execution paths:

```bash
rg -n "executeTool\\(|executeODataTool\\(|executeMultiStepTool\\(|executeToolWithParams|getTool\\(" src/app/api src/lib
```

Pass criteria:
- Routes either pass an already-authorized tool/connection object or pass `userId` to helpers that re-fetch.
- Helpers that accept `userId` must scope re-fetches by `server: { userId }` or `userId`.
- No fallback may select an unrelated user-owned connection or tool.

---

## Step 6: MCP Transport Closure Check
For MCP/transport work, inspect:

```bash
nl -ba 'src/app/api/mcp/[serverId]/[transport]/route.ts' | sed -n '1,230p'
nl -ba 'src/app/api/servers/[id]/connection-status/route.ts' | sed -n '1,220p'
nl -ba 'src/app/api/servers/[id]/test-mcp-endpoint/route.ts' | sed -n '1,220p'
rg -n "Access-Control-Expose-Headers|Mcp-Session-Id|INTERNAL_TEST_SECRET|REDIS_URL|streamableHttpAvailable|sseAvailable|postinstall" src/app package.json
```

Pass criteria:
- MCP route exports `GET`, `POST`, `DELETE`, and `OPTIONS`.
- `runtime = 'nodejs'` and `maxDuration` are set.
- CORS exposes `Mcp-Session-Id`.
- API keys are bcrypt-validated.
- Development no-token bypass exists only for `NODE_ENV === 'development'`.
- Self-test uses `x-internal-test-secret`, not the user API key.
- `connection-status` returns readiness, API-key metadata, endpoints, and transport status.
- `postinstall: prisma generate` exists.

---

## Step 7: Type Safety and DTO Check
Run:

```bash
rg -n "\\bany\\b|as any|Record<string, any>" src/app/api src/components src/lib
```

Pass criteria:
- No new `any` in touched high-traffic files unless justified.
- New route responses use DTOs or Zod-inferred types.
- Tool handler config changes use explicit config types.

If existing `any` remains, record it as follow-up debt instead of expanding it.

---

## Step 8: Accessibility Check for UI Work
For any UI work, manually verify:
- Dialog opens/closes by keyboard.
- Tab controls are keyboard reachable.
- Icon buttons have accessible names.
- Form controls have labels.
- Focus is visible.
- Text does not overflow or overlap at mobile and desktop sizes.

Do not close UI-heavy work if keyboard navigation breaks.

---

## Step 9: Completion Statement Format
When reporting completion, use this format:

```text
Sprint N is closed/not closed.

Completed:
- ...

Blocking issues:
- [file](absolute path:line): one sentence.

Verification:
- npm run lint: pass/fail
- npx tsc --noEmit: pass/fail
- npm test -- --runInBand: pass/fail
- npm run build: pass/fail

Residual non-blocking debt:
- ...
```

Never say "closed" if any blocking item or mandatory verification failure remains.
