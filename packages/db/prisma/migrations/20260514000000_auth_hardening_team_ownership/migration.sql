-- ============================================================
-- Auth hardening + team ownership migration
--
-- 1. User: tokenVersion, email verification, password reset, login throttling
-- 2. Team: creatorId
-- 3. RefreshToken: tokenHash (replaces plaintext token), tokenVersion
-- ============================================================

-- ─── USER ───────────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "verificationToken" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordResetExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);

-- A unique index already serves equality lookups; no separate non-unique
-- index is needed (and would just bloat insert/update cost).
CREATE UNIQUE INDEX IF NOT EXISTS "User_verificationToken_key" ON "User"("verificationToken");
CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- ─── TEAM ───────────────────────────────────────────────────
ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "creatorId" TEXT;

-- Backfill the creator from the current CAPTAIN (best-effort): for each team
-- without a creator, pick the linked user behind the EARLIEST active captain.
-- Determinism note: the schema doesn't prevent multiple active CAPTAINS on a
-- team, so we ORDER BY joinedAt + LIMIT 1 to make the choice reproducible.
-- Teams with no captain remain null and can only be modified by ADMIN/MASTER
-- until explicitly claimed.
UPDATE "Team" t
   SET "creatorId" = (
     SELECT u."id"
       FROM "TeamMember" tm
       JOIN "Player" p ON p."id" = tm."playerId"
       JOIN "User"   u ON u."id" = p."userId"
      WHERE tm."teamId"   = t."id"
        AND tm."isActive" = TRUE
        AND tm."role"     = 'CAPTAIN'
      ORDER BY tm."joinedAt" ASC, u."id" ASC
      LIMIT 1
   )
 WHERE t."creatorId" IS NULL;

CREATE INDEX IF NOT EXISTS "Team_creatorId_idx" ON "Team"("creatorId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Team_creatorId_fkey'
  ) THEN
    ALTER TABLE "Team"
      ADD CONSTRAINT "Team_creatorId_fkey"
      FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END$$;

-- ─── REFRESH TOKEN ──────────────────────────────────────────
-- Add tokenHash and tokenVersion. We migrate existing rows by hashing the
-- current plaintext token (so live sessions survive the migration), then
-- drop the old `token` column.

ALTER TABLE "RefreshToken"
  ADD COLUMN IF NOT EXISTS "tokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Postgres supports SHA-256 via pgcrypto (digest). Enable the extension if absent
-- so we can hash existing tokens during the migration.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "RefreshToken"
   SET "tokenHash" = encode(digest("token", 'sha256'), 'hex')
 WHERE "tokenHash" IS NULL;

ALTER TABLE "RefreshToken"
  ALTER COLUMN "tokenHash" SET NOT NULL;

-- Drop the old token column and its unique index. The new index is on tokenHash.
DROP INDEX IF EXISTS "RefreshToken_token_key";
DROP INDEX IF EXISTS "RefreshToken_token_idx";

ALTER TABLE "RefreshToken"
  DROP COLUMN IF EXISTS "token";

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
