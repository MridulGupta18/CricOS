import { describe, it, expect } from 'vitest';
import { can, atLeast, permissionsFor, assignableRoles } from './access-control';

// These tests pin down the role hierarchy semantics. If you change
// ROLE_PERMISSIONS or ROLE_HIERARCHY, expect these to need updating —
// that is the point: every hierarchy change should be a conscious one.

describe('access-control — can()', () => {
  it('MASTER passes every action via the master:all short-circuit', () => {
    expect(can('MASTER', 'admin:list_users')).toBe(true);
    expect(can('MASTER', 'match:score')).toBe(true);
    expect(can('MASTER', 'league:create')).toBe(true);
  });

  it('ADMIN inherits ORGANIZER actions via the hierarchy', () => {
    // ORGANIZER explicitly has league:set_status; ADMIN should inherit it.
    expect(can('ADMIN', 'league:set_status')).toBe(true);
  });

  it('ORGANIZER inherits PLAYER actions (e.g. player:update for own profile)', () => {
    expect(can('ORGANIZER', 'player:update')).toBe(true);
  });

  it('VIEWER has no write actions', () => {
    expect(can('VIEWER', 'match:create')).toBe(false);
    expect(can('VIEWER', 'league:create')).toBe(false);
    expect(can('VIEWER', 'admin:list_users')).toBe(false);
  });

  it('PLAYER cannot list users or set roles', () => {
    expect(can('PLAYER', 'admin:list_users')).toBe(false);
    expect(can('PLAYER', 'admin:set_role')).toBe(false);
  });
});

describe('access-control — atLeast()', () => {
  it('MASTER is at-least every role', () => {
    expect(atLeast('MASTER', 'VIEWER')).toBe(true);
    expect(atLeast('MASTER', 'MASTER')).toBe(true);
  });

  it('VIEWER is at-least only VIEWER', () => {
    expect(atLeast('VIEWER', 'PLAYER')).toBe(false);
    expect(atLeast('VIEWER', 'VIEWER')).toBe(true);
  });

  it('ADMIN is at-least ORGANIZER but not MASTER', () => {
    expect(atLeast('ADMIN', 'ORGANIZER')).toBe(true);
    expect(atLeast('ADMIN', 'MASTER')).toBe(false);
  });
});

describe('access-control — assignableRoles()', () => {
  it('MASTER can assign every role except MASTER itself', () => {
    const roles = assignableRoles('MASTER');
    expect(roles).toContain('ADMIN');
    expect(roles).toContain('VIEWER');
    expect(roles).not.toContain('MASTER');
  });

  it('ADMIN can only assign up to ORGANIZER', () => {
    const roles = assignableRoles('ADMIN');
    expect(roles).toContain('ORGANIZER');
    expect(roles).not.toContain('ADMIN');
    expect(roles).not.toContain('MASTER');
  });

  it('Non-privileged roles cannot assign anyone', () => {
    expect(assignableRoles('ORGANIZER')).toEqual([]);
    expect(assignableRoles('SCORER')).toEqual([]);
    expect(assignableRoles('PLAYER')).toEqual([]);
    expect(assignableRoles('VIEWER')).toEqual([]);
  });
});

describe('access-control — permissionsFor()', () => {
  it('MASTER returns a deduplicated union of every action', () => {
    const perms = permissionsFor('MASTER');
    expect(perms).toContain('admin:bootstrap');
    expect(perms).toContain('match:score');
    // No duplicates
    expect(perms.length).toBe(new Set(perms).size);
  });

  it('VIEWER returns []', () => {
    expect(permissionsFor('VIEWER')).toEqual([]);
  });
});
