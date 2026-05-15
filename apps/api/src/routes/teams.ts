import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { requireAuth, requirePermission, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { canManageRoster, canModifyTeam, isPrivileged } from '../lib/ownership';

export const teamsRouter = Router();

const createTeamSchema = z.object({
  name:      z.string().min(2).max(100),
  shortName: z.string().min(2).max(5).toUpperCase(),
  city:      z.string().optional(),
  country:   z.string().default('India'),
});

const updateTeamSchema = createTeamSchema.partial();

const addPlayerSchema = z.object({
  playerId: z.string().cuid(),
  role:     z.enum(['CAPTAIN', 'VICE_CAPTAIN', 'PLAYER', 'COACH']).default('PLAYER'),
});

// GET /api/v1/teams/:id — public
teamsRouter.get('/:id', async (req, res, next) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          where: { isActive: true },
          include: { player: true },
          orderBy: { role: 'asc' },
        },
      },
    });
    if (!team) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
    res.json({ success: true, data: team });
  } catch (err) { next(err); }
});

// POST /api/v1/teams — create a team owned by the caller. The caller becomes the
// creator and (if they have a Player profile) is auto-added as CAPTAIN. Anyone
// promoted later still needs to come through the roster endpoints, but ownership
// is locked to the creator from now on.
teamsRouter.post('/', requireAuth, requirePermission('team:create'), validate(createTeamSchema), async (req: AuthRequest, res, next) => {
  try {
    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: { ...req.body, creatorId: req.user!.id },
      });
      // If the caller has a Player profile, add them as CAPTAIN automatically.
      // This is the common case (a player creating their own team) and avoids
      // the empty-team -> manually-claim-captain race.
      const player = await tx.player.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
      if (player) {
        await tx.teamMember.create({
          data: { teamId: created.id, playerId: player.id, role: 'CAPTAIN' },
        });
      }
      return created;
    });
    res.status(201).json({ success: true, data: team });
  } catch (err) { next(err); }
});

// PATCH /api/v1/teams/:id — update team details (creator/captain/admin only)
teamsRouter.patch('/:id', requireAuth, requirePermission('team:update'), validate(updateTeamSchema), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });

    const allowed = await canModifyTeam(req.params.id, req.user!);
    if (!allowed) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the team creator or captain can edit team details' } });
    }

    const team = await prisma.team.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: team });
  } catch (err) { next(err); }
});

// POST /api/v1/teams/:id/players — add a player to team (creator/captain/VC/admin)
teamsRouter.post('/:id/players', requireAuth, requirePermission('team:manage_roster'), validate(addPlayerSchema), async (req: AuthRequest, res, next) => {
  try {
    const allowed = await canManageRoster(req.params.id, req.user!);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the team creator, captain, or vice-captain can manage the roster' },
      });
    }

    const { playerId, role } = req.body;

    // Only privileged users can mint a new CAPTAIN; otherwise demote to PLAYER to
    // prevent a non-captain leader from overwriting captaincy.
    const effectiveRole = (role === 'CAPTAIN' && !isPrivileged(req.user!.role)) ? 'PLAYER' : role;

    const member = await prisma.teamMember.upsert({
      where: { teamId_playerId: { teamId: req.params.id, playerId } },
      create: { teamId: req.params.id, playerId, role: effectiveRole },
      update: { isActive: true, role: effectiveRole },
      include: { player: true },
    });
    res.status(201).json({ success: true, data: member });
  } catch (err) { next(err); }
});

// DELETE /api/v1/teams/:id/players/:playerId — remove player (soft-delete)
teamsRouter.delete('/:id/players/:playerId', requireAuth, requirePermission('team:manage_roster'), async (req: AuthRequest, res, next) => {
  try {
    const allowed = await canManageRoster(req.params.id, req.user!);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the team creator, captain, or vice-captain can manage the roster' },
      });
    }
    await prisma.teamMember.update({
      where: { teamId_playerId: { teamId: req.params.id, playerId: req.params.playerId } },
      data: { isActive: false },
    });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});
