import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { requireAuth, requirePermission, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

export const teamsRouter = Router();

const createTeamSchema = z.object({
  name:      z.string().min(2).max(100),
  shortName: z.string().min(2).max(5).toUpperCase(),
  city:      z.string().optional(),
  country:   z.string().default('India'),
});

const updateTeamSchema = createTeamSchema.partial();

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

// POST /api/v1/teams — create a team
teamsRouter.post('/', requireAuth, requirePermission('team:create'), validate(createTeamSchema), async (req: AuthRequest, res, next) => {
  try {
    const team = await prisma.team.create({ data: req.body });
    res.status(201).json({ success: true, data: team });
  } catch (err) { next(err); }
});

// PATCH /api/v1/teams/:id — update team details
teamsRouter.patch('/:id', requireAuth, requirePermission('team:update'), validate(updateTeamSchema), async (req: AuthRequest, res, next) => {
  try {
    const team = await prisma.team.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: team });
  } catch (err) { next(err); }
});

// POST /api/v1/teams/:id/players — add a player to team
teamsRouter.post('/:id/players', requireAuth, requirePermission('team:manage_roster'), async (req: AuthRequest, res, next) => {
  try {
    const { playerId, role = 'PLAYER' } = req.body;
    if (!playerId) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'playerId required' } });
    const member = await prisma.teamMember.upsert({
      where: { teamId_playerId: { teamId: req.params.id, playerId } },
      create: { teamId: req.params.id, playerId, role },
      update: { isActive: true, role },
      include: { player: true },
    });
    res.status(201).json({ success: true, data: member });
  } catch (err) { next(err); }
});

// DELETE /api/v1/teams/:id/players/:playerId — remove player from team
teamsRouter.delete('/:id/players/:playerId', requireAuth, requirePermission('team:manage_roster'), async (req: AuthRequest, res, next) => {
  try {
    await prisma.teamMember.update({
      where: { teamId_playerId: { teamId: req.params.id, playerId: req.params.playerId } },
      data: { isActive: false },
    });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});
