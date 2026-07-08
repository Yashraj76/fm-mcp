-- Migration: add_unique_constraints_and_indexes
-- Adds:
--   • FMConnectionServer @@unique([connectionId, serverId]) + @@index([serverId])
--   • BranchTool @@index([toolId])
--   • Deployment @@index([branchId])
--   • ToolGenerationJob @@index([serverId])
--   • ActivityLog @@index([branchId])
--   • Tool partial unique index: active tool names per server (WHERE deletedAt IS NULL)
--
-- Deduplication runs before constraint creation so existing duplicate rows do not
-- block the migration. The most recently created row for each duplicate pair is kept.

-- ─── 1. Deduplicate FMConnectionServer ─────────────────────────────────────────

DELETE FROM "FMConnectionServer"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "connectionId", "serverId"
             ORDER BY "createdAt" DESC
           ) AS rn
    FROM "FMConnectionServer"
  ) ranked
  WHERE rn > 1
);

-- ─── 2. FMConnectionServer unique constraint + index ───────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "FMConnectionServer_connectionId_serverId_key"
  ON "FMConnectionServer"("connectionId", "serverId");

CREATE INDEX IF NOT EXISTS "FMConnectionServer_serverId_idx"
  ON "FMConnectionServer"("serverId");

-- ─── 3. BranchTool index on toolId ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "BranchTool_toolId_idx"
  ON "BranchTool"("toolId");

-- ─── 4. Deployment index on branchId ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "Deployment_branchId_idx"
  ON "Deployment"("branchId");

-- ─── 5. ToolGenerationJob index on serverId ────────────────────────────────────

CREATE INDEX IF NOT EXISTS "ToolGenerationJob_serverId_idx"
  ON "ToolGenerationJob"("serverId");

-- ─── 6. ActivityLog index on branchId ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "ActivityLog_branchId_idx"
  ON "ActivityLog"("branchId");

-- ─── 7. Tool: partial unique index for active tool names per server ─────────────
-- Prisma does not support partial/conditional unique indexes in the schema DSL.
-- This index enforces uniqueness only among non-deleted (active) tools so that
-- soft-deleted tools do not prevent re-using a name on the same server.
-- The application-level checkDuplicateToolName guard handles normal cases;
-- this index is the safety net against race conditions.

CREATE UNIQUE INDEX IF NOT EXISTS "Tool_serverId_name_active_unique"
  ON "Tool"("serverId", "name")
  WHERE "deletedAt" IS NULL;
