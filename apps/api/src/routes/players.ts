import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

export const playersRouter = Router();

const createPlayerSchema = z.object({
  name: z.string().min(2).max(100),
  jerseyNumber: z.number().int().min(0).max(999).optional(),
  battingStyle: z.enum(['RIGHT_HAND', 'LEFT_HAND']).optional(),
  bowlingStyle: z.string().optional(),
  role: z.enum(['BATSMAN', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER']).optional(),
  city: z.string().optional(),
  country: z.string().default('India'),
  dateOfBirth: z.string().datetime().optional(),
});

// GET /api/v1/players/:id
playersRouter.get('/:id', async (req, res, next) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id },
      include: {
        teamMemberships: {
          where: { isActive: true },
          include: { team: { select: { id: true, name: true, shortName: true, logoUrl: true } } },
        },
      },
    });
    if (!player) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Player not found' } });
    res.json({ success: true, data: player });
  } catch (err) { next(err); }
});

// GET /api/v1/players/:id/stats — career stats for a player
playersRouter.get('/:id/stats', async (req, res, next) => {
  try {
    const [battingStats, bowlingStats] = await Promise.all([
      prisma.ballEvent.aggregate({
        where: { batsmanId: req.params.id },
        _sum: { runs: true },
        _count: { id: true },
      }),
      prisma.wicketEvent.count({ where: { ballEvent: { bowlerId: req.params.id } } }),
    ]);

    const totalBallsBatted = battingStats._count.id;
    const totalRunsBatted = battingStats._sum.runs ?? 0;
    const strikeRate = totalBallsBatted > 0 ? (totalRunsBatted / totalBallsBatted) * 100 : 0;

    const [fours, sixes, fifties, hundreds] = await Promise.all([
      prisma.ballEvent.count({ where: { batsmanId: req.params.id, runs: 4, isBoundary: true } }),
      prisma.ballEvent.count({ where: { batsmanId: req.params.id, runs: 6, isSix: true } }),
      // Simplified — in production compute innings-level aggregates
      Promise.resolve(0),
      Promise.resolve(0),
    ]);

    res.json({
      success: true,
      data: {
        batting: { runs: totalRunsBatted, balls: totalBallsBatted, strikeRate, fours, sixes, fifties, hundreds },
        bowling: { wickets: bowlingStats },
      },
    });
  } catch (err) { next(err); }
});

// POST /api/v1/players
playersRouter.post('/', requireAuth, validate(createPlayerSchema), async (req: AuthRequest, res, next) => {
  try {
    const player = await prisma.player.create({ data: req.body });
    res.status(201).json({ success: true, data: player });
  } catch (err) { next(err); }
});

// PATCH /api/v1/players/:id
playersRouter.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const player = await prisma.player.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: player });
  } catch (err) { next(err); }
});
