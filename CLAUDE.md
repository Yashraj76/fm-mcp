# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Next.js dev server on port 3000 (logs to dev.log)

# Build & production
npm run build        # prisma generate + next build
npm run start        # Production server via bun standalone

# Database
npm run db:push      # Apply schema changes (prisma db push)
npm run db:generate  # Generate Prisma client only

# Lint
npm run lint         # ESLint

# Tests (tsx-based, no test runner — each file is standalone)
npm test             # Runs all test files sequentially via npx tsx
npx tsx src/lib/tools/executor-service.test.ts  # Run a single test file
```

TypeScript build errors are **not** suppressed — `next.config.ts` has no `ignoreBuildErrors` flag. Run `tsc --noEmit` to surface type errors without a full build.

## Architecture

This is a **Next.js 16 App Router** application that bridges **Claris FileMaker** databases with the **Model Context Protocol (MCP)**. Users define MCP servers with tools that map to FileMaker layouts/scripts; AI agents execute those tools via a live HTTP endpoint.

### Route Groups

- `src/app/(auth)/` — Supabase auth pages (login, signup, forgot-password, update-password)
- `src/app/(protected)/` — All authenticated UI pages. `layout.tsx` calls `requireUser()` which redirects to `/login` if no Supabase session.
- `src/app/api/` — API routes. All protected routes call `getUserFromRequest()` and enforce `userId` scoping.

### Core Data Flow

```
Browser → Zustand store (useAppStore) → TanStack Query → /api/* routes
                                                            ↓
                                          Prisma (PostgreSQL via Supabase)
                                                            ↓
                                         FileMaker Data API (via FileMakerClient)
```

### Key Libraries

- **`src/lib/filemaker/client.ts`** — `FileMakerClient`: wraps FileMaker Data API v1 (`find`, `createRecord`, `updateRecord`, `deleteRecord`, `runScript`, `listRecords`). Uses `undici` for HTTP.
- **`src/lib/filemaker/session.ts`** — `withFMSession`: wraps any FM operation in login/logout lifecycle to prevent session leaks.
- **`src/lib/crypto.ts`** — AES-256-CBC encryption for all stored credentials. Passwords are decrypted in-memory only at execution time.
- **`src/lib/db/user-scoped.ts`** — All DB query helpers enforce `userId` ownership. Use these instead of raw `prisma.*` calls in API routes.
- **`src/lib/branching.ts`** — `getEffectiveTools(branchId)`: resolves the effective tool set for a branch by merging base tools with branch overrides (`BranchTool.overrideData`).
- **`src/lib/tools/executor-service.ts`** — `executeSingleStepTool`: dispatches to the correct FM operation based on `fmMethod` (`find`, `create`, `update`, `delete`, `list`, `script`, `odata-*`).
- **`src/lib/tools/normalize-tool.ts`** — Normalizes AI-generated or raw tool definitions to the canonical `NormalizedTool` shape before saving.
- **`src/lib/tools/validate-tool.ts`** — `validateToolForSave`: validates a tool definition and returns a list of field-level errors.
- **`src/lib/settings.ts`** — `getAppSettings(userId?)`: reads AI provider settings from `AppSettings`; falls back to global singleton row if no per-user row exists.

### MCP Transport Endpoint

`src/app/api/mcp/[serverId]/[transport]/route.ts` — The live MCP endpoint consumed by AI agents (Claude Desktop, etc.).
- Auth: Bearer token checked against `McpApiKey.keyHash`. Dev mode bypasses auth when no token is provided.
- Uses `mcp-handler` to handle SSE/HTTP transport.
- Calls `getEffectiveTools(branchId)` to resolve which tools are live.

### Database Models (Prisma / PostgreSQL)

Key relationships:
- `FMServerConnection` → `FMConnection[]` (Admin API server → file-level connections)
- `FMConnection` → `BrowsedSchema`, `RelationshipGraph` (schema cache per connection)
- `McpServer` → `Branch[]`, `Tool[]`, `Deployment[]`
- `Branch` → `BranchTool[]` (tool overrides; `action` = `inherited|modified|added|deleted`)
- `Tool` → `ToolExecution[]`
- `Deployment.snapshot` — JSON snapshot of the full server+tools state at deploy time

### Branching Model

Branches work like git: each `McpServer` has a `main` branch (protected). Feature branches store per-tool overrides in `BranchTool.overrideData`. `getEffectiveTools` merges base tools with overrides. Merging copies branch tool states into `main`.

### State Management

`src/lib/store.ts` — Zustand store (`useAppStore`) with persistence. Tracks current navigation view, selected server/branch IDs, and dialog open states. Pages are mostly client components that read from this store and fire TanStack Query fetches.

### AI Integration

- `src/app/api/servers/[id]/ai/` — Endpoints for AI-powered tool generation (`generate-tool`, `generate-server-tools`, `generate-from-prompt`, `suggest`).
- AI provider/model/key stored per-user in `AppSettings`. `getAppSettings(userId)` resolves the effective settings.
- Uses `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` with the Vercel AI SDK.

### API Response Convention

All API routes return:
- Success: `{ success: true, data: <payload> }`
- Error: `{ success: false, error: string, code?: string }`

### Environment Variables

Required: `DATABASE_URL`, `DIRECT_URL` (Supabase PostgreSQL), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Optional: `INTERNAL_TEST_SECRET` (bypasses MCP auth in tests), AI provider API keys (stored per-user in DB).

### Infrastructure

A `Caddyfile` at root proxies port 81 → localhost:3000. The `XTransformPort` query param allows routing to arbitrary local ports through the same Caddy entry.
