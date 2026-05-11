-- Migration: soft-delete for BallEvent + composite indexes
-- Run with: npx prisma migrate deploy

-- Add soft-delete column to BallEvent
ALTER TABLE "BallEvent" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Index for filtering deleted balls
CREATE INDEX "BallEvent_deletedAt_idx" ON "BallEvent"("deletedAt");

-- Composite index: fast per-over queries (used by consecutive-over check + stats)
CREATE INDEX "BallEvent_inningsId_overNumber_idx" ON "BallEvent"("inningsId", "overNumber");

-- Composite index: fast league standings query (leagueId + status)
CREATE INDEX "Match_leagueId_status_idx" ON "Match"("leagueId", "status");
