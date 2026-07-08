-- Migration: activitylog_actor_userid
-- Problem: ActivityLog.actorIp and actorSession stubs exist but no actorUserId,
--          so mutation audit entries have no reliable record of WHO performed the action.
-- Fix: Add actorUserId column and a sparse index for user-scoped audit queries.
--
-- actorUserId is nullable because:
--   • MCP/API-key executions are not user-session authenticated (actor = keyPrefix in meta)
--   • Legacy rows have no userId context

ALTER TABLE "ActivityLog"
  ADD COLUMN IF NOT EXISTS "actorUserId" TEXT;

-- Sparse index: most audit queries filter by a specific user; including NULL rows
-- in a full index wastes space and slows scans on non-user-filtered queries.
CREATE INDEX IF NOT EXISTS "ActivityLog_actorUserId_idx"
  ON "ActivityLog"("actorUserId")
  WHERE "actorUserId" IS NOT NULL;
