// ============================================================
// Ownership / per-resource authorization helpers.
//
// These centralize "can THIS user modify THIS resource" logic so
// individual route handlers don't drift in subtle ways. Role-based
// gates still live in middleware/auth.ts + access-control.ts;
// these helpers add the ownership layer on top.
// ============================================================

import { prisma } from '@cricket-os/db';
import { UserRole } from '@cricket-os/shared';

// Identifies a caller for ownership decisions.
export interface Caller { id: string; role: UserRole }

// Admin/Master always pass ownership checks.
export function isPrivileged(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'MASTER';
}

// ─── MATCH ──────────────────────────────────────────────────
// Match-level write actions (score, toss, result, scorer reassign, super-over)
// must be performed by the match creator, the assigned scorer, or an admin.
export async function canModifyMatch(matchId: string, caller: Caller): Promise<boolean> {
  if (isPrivileged(caller.role)) return true;
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { creatorId: true, scorerId: true },
  });
  if (!match) return false;
  return match.creatorId === caller.id || match.scorerId === caller.id;
}

// Same as above but takes a pre-loaded match to avoid an extra query.
export function canModifyMatchFromRecord(
  match: { creatorId: string; scorerId: string | null },
  caller: Caller,
): boolean {
  if (isPrivileged(caller.role)) return true;
  return match.creatorId === caller.id || match.scorerId === caller.id;
}

// ─── TEAM ───────────────────────────────────────────────────
// Team write actions (update details, manage roster) must be performed by
// the team creator, the current captain, or an admin.
export async function canModifyTeam(teamId: string, caller: Caller): Promise<boolean> {
  if (isPrivileged(caller.role)) return true;
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { creatorId: true },
  });
  if (!team) return false;
  if (team.creatorId === caller.id) return true;
  // Fall back to captaincy — covers legacy teams without a creator and
  // matches the existing "captain edits team" expectation.
  const captain = await prisma.teamMember.findFirst({
    where: {
      teamId,
      isActive: true,
      role: 'CAPTAIN',
      player: { userId: caller.id },
    },
    select: { id: true },
  });
  return !!captain;
}

// Roster management: same as canModifyTeam, but also allows the vice-captain
// to add/remove players (mirrors how clubs actually operate).
export async function canManageRoster(teamId: string, caller: Caller): Promise<boolean> {
  if (isPrivileged(caller.role)) return true;
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { creatorId: true },
  });
  if (!team) return false;
  if (team.creatorId === caller.id) return true;
  const leader = await prisma.teamMember.findFirst({
    where: {
      teamId,
      isActive: true,
      role: { in: ['CAPTAIN', 'VICE_CAPTAIN'] },
      player: { userId: caller.id },
    },
    select: { id: true },
  });
  return !!leader;
}

// ─── LEAGUE ─────────────────────────────────────────────────
export async function canModifyLeague(leagueId: string, caller: Caller): Promise<boolean> {
  if (isPrivileged(caller.role)) return true;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { organizerId: true },
  });
  if (!league) return false;
  return league.organizerId === caller.id;
}
