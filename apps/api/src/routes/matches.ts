import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

export const matchesRouter = Router();

const createMatchSchema = z.object({
  homeTeamId: z.string().cuid(),
  awayTeamId: z.string().cuid(),
  venue: z.string().optional(),
  city: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  format: z.enum(['T20', 'ODI', 'T10', 'TEST', 'CUSTOM']).default('T20'),
  overs: z.number().int().positive().max(50).default(20),
  leagueId: z.string().cuid().optional(),
  title: z.string().optional(),
  isPublic: z.boolean().default(true),
});

const matchSelect = {
  id: true,
  title: true,
  shareToken: true,
  status: true,
  format: true,
  overs: true,
  venue: true,
  city: true,
  scheduledAt: true,
  isPublic: true,
  tossWinnerId: true,
  tossDecision: true,
  resultType: true,
  winnerId: true,
  winMargin: true,
  winMarginType: true,
  createdAt: true,
  homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
  awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
  scorer: { select: { id: true, name: true } },
  league: { select: { id: true, name: true, slug: true } },
};

// GET /api/v1/matches — list with filters
matchesRouter.get('/', async (req, res, next) => {
  try {
    const { status, leagueId, teamId, page = '1', limit = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = { isPublic: true };
    if (status) where.status = status;
    if (leagueId) where.leagueId = leagueId;
    if (teamId) where.OR = [{ homeTeamId: teamId }, { awayTeamId: teamId }];

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        select: {
          ...matchSelect,
          innings: {
            select: {
              id: true, inningsNumber: true, battingTeamId: true, bowlingTeamId: true,
              totalRuns: true, totalWickets: true, completedOvers: true, extraBalls: true,
              isCompleted: true,
            },
            orderBy: { inningsNumber: 'asc' },
          },
        },
        orderBy: [{ status: 'asc' }, { scheduledAt: 'desc' }],
        skip,
        take: parseInt(limit),
      }),
      prisma.match.count({ where }),
    ]);

    res.json({ success: true, data: matches, meta: { page: parseInt(page), pageSize: parseInt(limit), total } });
  } catch (err) { next(err); }
});

// GET /api/v1/matches/:id
matchesRouter.get('/:id', async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      select: {
        ...matchSelect,
        innings: {
          select: {
            id: true, inningsNumber: true, battingTeamId: true, bowlingTeamId: true,
            totalRuns: true, totalWickets: true, completedOvers: true, extraBalls: true,
            extrasWides: true, extrasNoBalls: true, extrasByes: true, extrasLegByes: true,
            isCompleted: true,
          },
        },
      },
    });

    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });
    res.json({ success: true, data: match });
  } catch (err) { next(err); }
});

// GET /api/v1/matches/public/:shareToken — public shareable view
matchesRouter.get('/public/:shareToken', async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { shareToken: req.params.shareToken },
      select: { ...matchSelect, innings: { include: { ballEvents: { orderBy: { rawBallNumber: 'asc' } } } } },
    });

    if (!match || !match.isPublic) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });
    }
    res.json({ success: true, data: match });
  } catch (err) { next(err); }
});

// POST /api/v1/matches — create a match (auth required)
matchesRouter.post('/', requireAuth, validate(createMatchSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = req.body;
    const match = await prisma.match.create({
      data: { ...data, creatorId: req.user!.id, status: 'UPCOMING' },
      select: matchSelect,
    });
    res.status(201).json({ success: true, data: match });
  } catch (err) { next(err); }
});

// PATCH /api/v1/matches/:id/toss — set toss result
matchesRouter.patch('/:id/toss', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { tossWinnerId, tossDecision } = req.body;
    const match = await prisma.match.update({
      where: { id: req.params.id },
      data: { tossWinnerId, tossDecision, status: 'IN_PROGRESS' },
      select: matchSelect,
    });
    res.json({ success: true, data: match });
  } catch (err) { next(err); }
});

// PATCH /api/v1/matches/:id/result — set match result
matchesRouter.patch('/:id/result', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { winnerId, resultType, winMargin, winMarginType } = req.body;
    const match = await prisma.match.update({
      where: { id: req.params.id },
      data: { winnerId, resultType, winMargin, winMarginType, status: 'COMPLETED' },
      select: matchSelect,
    });
    res.json({ success: true, data: match });
  } catch (err) { next(err); }
});

// DELETE /api/v1/matches/:id
matchesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await prisma.match.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});
