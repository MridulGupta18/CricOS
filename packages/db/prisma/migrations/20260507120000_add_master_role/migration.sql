-- Add MASTER role to UserRole enum (PostgreSQL requires adding enum values one at a time)
-- MASTER = app owner with unrestricted access; set via backend only, never via registration

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MASTER' BEFORE 'ADMIN';

-- Update default registration role to VIEWER (no SQL change needed — enforced in API)
-- Update any existing ADMIN accounts that should remain ADMIN (no change)
