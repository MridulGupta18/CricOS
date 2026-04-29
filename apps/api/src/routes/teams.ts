import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

export const teamsRouter = Router();

const createTeamSchema = z.object({
  name: z.string().min(2).max(100),
  shortName: z.string().min(2).max(5).toUpperCase(),
  city: z.string().optional(),
  country: z.string().default('India'),
});

// GET /api/v1/teams/:id
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

// POST /api/v1/teams
teamsRouter.post('/', requireAuth, validate(createTeamSchema), async (req: AuthRequest, res, next) => {
  try {
    const team = await prisma.team.create({ data: req.body });
    res.status(201).json({ success: true, data: team });
  } catch (err) { next(err); }
});

// POST /api/v1/teams/:id/players — add a player to team
teamsRouter.post('/:id/players', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { playerId, role = 'PLAYER' } = req.body;
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
teamsRouter.delete('/:id/players/:playerId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await prisma.teamMember.update({
      where: { teamId_playerId: { teamId: req.params.id, playerId: req.params.playerId } },
      data: { isActive: false },
    });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});
