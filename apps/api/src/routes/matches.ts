import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '@cricket-os/db';
import { requireAuth, requirePermission, AuthRequest } from '../middleware/auth';
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

const tossSchema = z.object({
  tossWinnerId: z.string().cuid(),
  tossDecision: z.enum(['BAT', 'BOWL']),
});

const resultSchema = z.object({
  winnerId:       z.string().cuid().optional(),
  resultType:     z.enum(['WIN', 'TIE', 'NO_RESULT', 'DRAW']),
  winMargin:      z.number().int().positive().optional(),
  winMarginType:  z.enum(['RUNS', 'WICKETS']).optional(),
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
  creatorId: true,
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
              // No ballEvents here — only available on /matches/:id detail view
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

// POST /api/v1/matches — create a match
matchesRouter.post('/', requireAuth, requirePermission('match:create'), validate(createMatchSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = req.body;
    const match = await prisma.match.create({
      // Use cryptographically random UUID for shareToken (not sequential cuid)
      data: { ...data, creatorId: req.user!.id, status: 'UPCOMING', shareToken: randomUUID() },
      select: matchSelect,
    });
    res.status(201).json({ success: true, data: match });
  } catch (err) { next(err); }
});

// PATCH /api/v1/matches/:id/toss — set toss result
matchesRouter.patch('/:id/toss', requireAuth, validate(tossSchema), async (req: AuthRequest, res, next) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id }, select: { creatorId: true, scorerId: true } });
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });
    const uid = req.user!.id;
    if (match.creatorId !== uid && match.scorerId !== uid && req.user!.role !== 'ADMIN' && req.user!.role !== 'MASTER') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the match creator or assigned scorer can set the toss' } });
    }
    const { tossWinnerId, tossDecision } = req.body;
    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data: { tossWinnerId, tossDecision, status: 'IN_PROGRESS' },
      select: matchSelect,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// PATCH /api/v1/matches/:id/result — set match result
matchesRouter.patch('/:id/result', requireAuth, validate(resultSchema), async (req: AuthRequest, res, next) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id }, select: { creatorId: true, scorerId: true } });
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });
    const uid = req.user!.id;
    if (match.creatorId !== uid && match.scorerId !== uid && req.user!.role !== 'ADMIN' && req.user!.role !== 'MASTER') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the match creator or assigned scorer can set the result' } });
    }
    const { winnerId, resultType, winMargin, winMarginType } = req.body;
    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data: { winnerId, resultType, winMargin, winMarginType, status: 'COMPLETED' },
      select: matchSelect,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/v1/matches/:id
matchesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id }, select: { creatorId: true } });
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });
    if (match.creatorId !== req.user!.id && req.user!.role !== 'ADMIN' && req.user!.role !== 'MASTER') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the match creator can delete this match' } });
    }
    await prisma.match.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// PATCH /api/v1/matches/:id/scorer — assign or change the scorer
// Caller must be the match creator OR the current scorer OR ADMIN/MASTER.
// The new scorer must be a player in one of the match's two teams and have a linked user account.
const assignScorerSchema = z.object({
  scorerId: z.string().cuid().nullable(), // null = unassign
});

matchesRouter.patch('/:id/scorer', requireAuth, validate(assignScorerSchema), async (req: AuthRequest, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      select: { creatorId: true, scorerId: true, homeTeamId: true, awayTeamId: true },
    });
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });

    const uid = req.user!.id;
    const isAuthorised =
      match.creatorId === uid ||
      match.scorerId  === uid ||
      req.user!.role === 'ADMIN' ||
      req.user!.role === 'MASTER';

    if (!isAuthorised) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the match creator or current scorer can reassign the scorer' },
      });
    }

    const { scorerId } = req.body;

    if (scorerId !== null) {
      // Verify the new scorer is a player in one of the two teams and has a linked user account
      const player = await prisma.player.findFirst({
        where: {
          userId: scorerId,
          teamMemberships: {
            some: {
              isActive: true,
              teamId: { in: [match.homeTeamId, match.awayTeamId] },
            },
          },
        },
        select: { id: true, name: true },
      });

      if (!player) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'NOT_ELIGIBLE',
            message: 'Scorer must be an active player in one of the two teams playing this match',
          },
        });
      }
    }

    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data: { scorerId },
      select: matchSelect,
    });

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// GET /api/v1/matches/:id/eligible-scorers — list players from both teams who have user accounts
matchesRouter.get('/:id/eligible-scorers', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      select: { creatorId: true, scorerId: true, homeTeamId: true, awayTeamId: true,
                homeTeam: { select: { id: true, name: true, shortName: true } },
                awayTeam: { select: { id: true, name: true, shortName: true } } },
    });
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });

    const uid = req.user!.id;
    const isAuthorised =
      match.creatorId === uid || match.scorerId === uid ||
      req.user!.role === 'ADMIN' || req.user!.role === 'MASTER';
    if (!isAuthorised) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the match creator or scorer can view eligible scorers' } });
    }

    // Find all active players in both teams who have a linked user account
    const members = await prisma.teamMember.findMany({
      where: {
        isActive: true,
        teamId: { in: [match.homeTeamId, match.awayTeamId] },
        player: { userId: { not: null } },
      },
      select: {
        teamId: true,
        role: true,
        player: { select: { id: true, name: true, userId: true, role: true, jerseyNumber: true } },
      },
      orderBy: { player: { name: 'asc' } },
    });

    const result = members.map(m => ({
      userId:      m.player.userId!,
      playerId:    m.player.id,
      name:        m.player.name,
      playerRole:  m.player.role,
      teamRole:    m.role,
      jerseyNumber: m.player.jerseyNumber,
      team:        m.teamId === match.homeTeamId ? match.homeTeam : match.awayTeam,
    }));

    res.json({ success: true, data: result, meta: { currentScorerId: match.scorerId } });
  } catch (err) { next(err); }
});
