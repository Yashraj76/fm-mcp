-- Migration: appsettings_user_uniqueness
-- Problem: AppSettings has no DB-level uniqueness for per-user rows.
--          Concurrent first-login settings saves can produce duplicate rows
--          with the same userId, causing getAppSettings to return arbitrary data.
-- Fix:
--   1. Deduplicate any existing duplicate per-user rows (keep most recently updated).
--   2. Add a partial unique index on userId WHERE userId IS NOT NULL so that
--      the global singleton row (userId IS NULL) remains unaffected.
--
-- Prisma's schema DSL cannot express partial unique indexes; this migration
-- creates the constraint directly. The app uses id = 'user_<userId>' as the
-- upsert key (primary key lookup) as the primary race-free path; this index
-- is the safety net that prevents duplicate userId rows even if the id changes.

-- ─── 1. Deduplicate existing per-user rows ─────────────────────────────────────
-- Keep the most recently updated row per userId; delete the rest.

DELETE FROM "AppSettings"
WHERE "userId" IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON ("userId") id
    FROM "AppSettings"
    WHERE "userId" IS NOT NULL
    ORDER BY "userId", "updatedAt" DESC
  );

-- ─── 2. Partial unique index on userId ────────────────────────────────────────
-- Enforces one AppSettings row per user. The global singleton (userId IS NULL)
-- is excluded — PostgreSQL treats NULLs as distinct in unique indexes by default,
-- but the WHERE clause makes the intent explicit and avoids any future ambiguity.

CREATE UNIQUE INDEX IF NOT EXISTS "AppSettings_userId_unique"
  ON "AppSettings"("userId")
  WHERE "userId" IS NOT NULL;
