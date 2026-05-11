import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { requireAuth, requirePermission, requireAtLeast, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { assignableRoles, MASTER_EMAIL, can, ROLE_HIERARCHY, permissionsFor } from '../access-control';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';

export const adminRouter = Router();

// ─── MASTER BOOTSTRAP ────────────────────────────────────────
// POST /api/v1/admin/bootstrap
// One-time endpoint: promotes guptamridul1997@gmail.com to MASTER.
// Blocked if a MASTER account already exists.

adminRouter.post('/bootstrap', async (req, res, next) => {
  try {
    const existingMaster = await prisma.user.findFirst({ where: { role: 'MASTER' } });
    if (existingMaster) {
      return res.status(409).json({
        success: false,
        error: { code: 'MASTER_EXISTS', message: 'Master account already exists' },
      });
    }

    const targetUser = await prisma.user.findUnique({ where: { email: MASTER_EMAIL } });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `No account found for ${MASTER_EMAIL} — register first` },
      });
    }

    await prisma.user.update({ where: { email: MASTER_EMAIL }, data: { role: 'MASTER' } });
    return res.json({
      success: true,
      data: { message: `${MASTER_EMAIL} promoted to MASTER`, email: MASTER_EMAIL },
    });
  } catch (err) { next(err); }
});

// ─── USER MANAGEMENT ─────────────────────────────────────────

// GET /api/v1/admin/users — list all users (ADMIN+)
adminRouter.get('/users', requireAuth, requirePermission('admin:list_users'), async (req: AuthRequest, res, next) => {
  try {
    const { page = '1', limit = '50', role, q } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (q)    where.OR = [
      { name:  { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, email: true, name: true, role: true, isVerified: true, createdAt: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ success: true, data: users, meta: { page: parseInt(page), pageSize: parseInt(limit), total } });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/users/:id — get single user (ADMIN+)
adminRouter.get('/users/:id', requireAuth, requirePermission('admin:list_users'), async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, email: true, name: true, role: true,
        isVerified: true, createdAt: true, phone: true, avatarUrl: true,
        organizedLeagues: { select: { id: true, name: true, status: true } },
        playerProfile: { select: { id: true, name: true } },
      },
    });
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/users/:id/role — change user role (ADMIN+ with restrictions)
const setRoleSchema = z.object({
  role: z.enum(['MASTER', 'ADMIN', 'ORGANIZER', 'SCORER', 'PLAYER', 'VIEWER']),
});

adminRouter.patch('/users/:id/role', requireAuth, requirePermission('admin:set_role'),
  validate(setRoleSchema), async (req: AuthRequest, res, next) => {
  try {
    const { role: newRole } = req.body;
    const callerRole = req.user!.role;

    // Enforce assignable roles from access-control.ts
    const allowed = assignableRoles(callerRole);
    if (!allowed.includes(newRole)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: `${callerRole} cannot assign role ${newRole}` },
      });
    }

    // Cannot demote or modify the MASTER account
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true, email: true } });
    if (!target) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    if (target.role === 'MASTER' && callerRole !== 'MASTER') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify the MASTER account' } });
    }
    if (target.email === MASTER_EMAIL && newRole !== 'MASTER' && callerRole !== 'MASTER') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot demote the master account email' } });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: newRole },
      select: { id: true, email: true, name: true, role: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/users/:id — delete user (MASTER only)
adminRouter.delete('/users/:id', requireAuth, requireAtLeast('MASTER'), async (req: AuthRequest, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true, email: true } });
    if (!target) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    if (target.email === MASTER_EMAIL) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete the master account' } });
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// ─── ROLE SUMMARY ────────────────────────────────────────────
// GET /api/v1/admin/roles — returns role hierarchy + permissions for documentation
adminRouter.get('/roles', requireAuth, requireAtLeast('ADMIN'), async (req: AuthRequest, res) => {
  const summary = ROLE_HIERARCHY.map((r) => ({
    role: r,
    permissions: permissionsFor(r),
    canAssign: assignableRoles(r),
  }));
  res.json({ success: true, data: summary });
});

// ─── APP STATS ───────────────────────────────────────────────
// GET /api/v1/admin/stats — platform-wide stats (ADMIN+)
adminRouter.get('/stats', requireAuth, requireAtLeast('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const [users, matches, leagues, teams, players, ballEvents] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
      prisma.match.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.league.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.team.count(),
      prisma.player.count(),
      prisma.ballEvent.count({ where: { deletedAt: null } }),
    ]);

    res.json({
      success: true,
      data: {
        users: users.reduce((acc, r) => ({ ...acc, [r.role]: r._count.id }), {} as Record<string, number>),
        matches: matches.reduce((acc, r) => ({ ...acc, [r.status]: r._count.id }), {} as Record<string, number>),
        leagues: leagues.reduce((acc, r) => ({ ...acc, [r.status]: r._count.id }), {} as Record<string, number>),
        teams,
        players,
        ballEvents,
      },
    });
  } catch (err) { next(err); }
});
