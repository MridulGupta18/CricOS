// ============================================================
// CricOS — Role-Based Access Control
//
// SINGLE SOURCE OF TRUTH for all permission decisions.
// To change who can do what, edit this file only — never
// scatter role checks across route files.
//
// Role hierarchy (highest → lowest):
//   MASTER > ADMIN > ORGANIZER > SCORER > PLAYER > VIEWER
//
// Ownership: many write actions also require the caller to
// own the resource (e.g. only the league organizer can edit
// their league). Ownership is checked in the route, not here.
// ============================================================

import { UserRole } from '@cricket-os/shared';

// ─── ACTION CATALOGUE ────────────────────────────────────────
// Every protectable action in the app. Add new ones here.
export type Action =
  // ── Matches ──
  | 'match:read'           // View any public match / scorecard
  | 'match:create'         // Create a new match
  | 'match:update'         // Edit match details (creator/scorer only — also checked by ownership)
  | 'match:delete'         // Delete a match
  | 'match:score'          // Submit ball events
  | 'match:set_toss'       // Record toss result
  | 'match:set_result'     // Record match result
  | 'match:start_innings'  // Create innings record
  | 'match:super_over'     // Trigger super over
  | 'match:dls'            // Compute DLS target

  // ── Leagues ──
  | 'league:read'          // View any public league
  | 'league:create'        // Create a league
  | 'league:update'        // Edit league (organizer only — also ownership)
  | 'league:delete'        // Delete a league
  | 'league:set_status'    // Change league status (organizer)
  | 'league:register_team' // Register a team in a league
  | 'league:view_revenue'  // View payments/revenue dashboard
  | 'league:manage_bracket'// Create / update tournament bracket

  // ── Teams ──
  | 'team:read'            // View any team
  | 'team:create'          // Create a team
  | 'team:update'          // Edit team details
  | 'team:delete'          // Delete a team
  | 'team:manage_roster'   // Add / remove players from a team

  // ── Players ──
  | 'player:read'          // View any player profile + stats
  | 'player:create'        // Register a new player
  | 'player:update'        // Edit player details

  // ── Sponsors ──
  | 'sponsor:manage'       // Add / edit / remove sponsors

  // ── Search ──
  | 'search:read'          // Use search (public)
  | 'search:history'       // View own search history

  // ── Admin ──
  | 'admin:list_users'     // List all users
  | 'admin:set_role'       // Promote / demote any user's role
  | 'admin:delete_user'    // Hard-delete a user account
  | 'admin:view_all'       // Bypass ownership — see all private resources
  | 'admin:bootstrap'      // One-time master account creation endpoint

  // ── Master-only ──
  | 'master:promote_admin' // Elevate someone to ADMIN
  | 'master:all';          // Unrestricted — every action implicitly granted

// ─── PERMISSIONS MAP ─────────────────────────────────────────
// List EVERY action each role is explicitly allowed to perform.
// Higher roles inherit via the `can()` helper below.
// Order matters for display but not for logic.

const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  // ── MASTER — owns the app; can do everything ──────────────
  MASTER: [
    'master:all',
    'master:promote_admin',
    'admin:list_users',
    'admin:set_role',
    'admin:delete_user',
    'admin:view_all',
    'admin:bootstrap',
    // All lower-role actions inherited via can() helper
  ],

  // ── ADMIN — app-wide administrator ───────────────────────
  ADMIN: [
    'admin:list_users',
    'admin:set_role',       // Can set roles up to ORGANIZER; cannot set MASTER/ADMIN
    'admin:view_all',
    'match:create', 'match:update', 'match:delete',
    'match:score', 'match:set_toss', 'match:set_result',
    'match:start_innings', 'match:super_over', 'match:dls',
    'league:create', 'league:update', 'league:delete',
    'league:set_status', 'league:register_team',
    'league:view_revenue', 'league:manage_bracket',
    'team:create', 'team:update', 'team:delete', 'team:manage_roster',
    'player:create', 'player:update',
    'sponsor:manage',
  ],

  // ── ORGANIZER — runs leagues and matches ──────────────────
  ORGANIZER: [
    'match:create', 'match:update', 'match:delete',
    'match:score', 'match:set_toss', 'match:set_result',
    'match:start_innings', 'match:super_over', 'match:dls',
    'league:create', 'league:update', 'league:set_status',
    'league:register_team', 'league:view_revenue',
    'league:manage_bracket',
    'team:create', 'team:update', 'team:manage_roster',
    'player:create', 'player:update',
    'sponsor:manage',
  ],

  // ── SCORER — scores matches they are assigned to ─────────
  SCORER: [
    'match:score', 'match:set_toss', 'match:set_result',
    'match:start_innings', 'match:super_over', 'match:dls',
    'team:manage_roster',
    'player:create',
  ],

  // ── PLAYER — registered player; manages own profile ──────
  PLAYER: [
    'player:create',
    'player:update',     // Own profile only — ownership enforced in route
    'team:create',       // Can create their own team
    'team:manage_roster',
    'match:create',      // Any player can set up an individual (non-league) match
    'match:update',
    'match:score',
    'match:set_toss',
    'match:set_result',
    'match:start_innings',
    'match:super_over',
    'match:dls',
  ],

  // ── VIEWER — default for new signups; read-only ───────────
  VIEWER: [
    // No write actions — all reads are handled by public routes
  ],
};

// ─── PUBLIC ACTIONS (no auth required) ───────────────────────
// These are checked separately — any user (even unauthenticated)
// can perform them. Listed here for documentation.
export const PUBLIC_ACTIONS: Action[] = [
  'match:read',
  'league:read',
  'team:read',
  'player:read',
  'search:read',
];

// ─── ROLE HIERARCHY ──────────────────────────────────────────
// Ordered highest → lowest. Used to check "at least X level".
export const ROLE_HIERARCHY: UserRole[] = [
  'MASTER',
  'ADMIN',
  'ORGANIZER',
  'SCORER',
  'PLAYER',
  'VIEWER',
];

// ─── HELPERS ─────────────────────────────────────────────────

/**
 * Returns true if `role` is allowed to perform `action`.
 * MASTER always returns true (master:all).
 */
export function can(role: UserRole, action: Action): boolean {
  if (role === 'MASTER') return true;
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

/**
 * Returns true if `role` is at least as privileged as `minimum`.
 */
export function atLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(role) <= ROLE_HIERARCHY.indexOf(minimum);
}

/**
 * Returns all actions allowed for a role (including inherited ones).
 */
export function permissionsFor(role: UserRole): Action[] {
  if (role === 'MASTER') return Object.keys(ROLE_PERMISSIONS).flatMap(r => ROLE_PERMISSIONS[r as UserRole]);
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Roles that a given role is allowed to assign to others.
 * MASTER can assign any role.
 * ADMIN can assign up to ORGANIZER (cannot create ADMIN or MASTER).
 * Others cannot assign roles.
 */
export function assignableRoles(byRole: UserRole): UserRole[] {
  if (byRole === 'MASTER') return ['ADMIN', 'ORGANIZER', 'SCORER', 'PLAYER', 'VIEWER'];
  if (byRole === 'ADMIN')  return ['ORGANIZER', 'SCORER', 'PLAYER', 'VIEWER'];
  return [];
}

// ─── MASTER ACCOUNT ──────────────────────────────────────────
// The email of the one master account — loaded from env, never hardcoded.
// Set MASTER_EMAIL=<your-email> in Railway/production environment variables.
// Bootstrap via POST /api/v1/admin/bootstrap after first registration.
export const MASTER_EMAIL = process.env.MASTER_EMAIL ?? '';
