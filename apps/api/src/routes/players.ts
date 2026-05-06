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

// GET /api/v1/players — paginated list with optional role/search filters
playersRouter.get('/', async (req, res, next) => {
  try {
    const { q, role, page = '1', limit = '50' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = {};
    if (role && role !== 'All') where.role = role;
    if (q) where.name = { contains: q, mode: 'insensitive' };

    const [players, total] = await Promise.all([
      prisma.player.findMany({
        where,
        select: {
          id: true, name: true, role: true, avatarUrl: true, city: true, country: true,
          jerseyNumber: true, battingStyle: true, bowlingStyle: true,
          careerStats: { select: { battingRuns: true, battingAverage: true, bowlingWickets: true, bowlingAverage: true } },
          teamMemberships: {
            where: { isActive: true },
            take: 1,
            include: { team: { select: { id: true, name: true, shortName: true } } },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.player.count({ where }),
    ]);

    res.json({ success: true, data: players, meta: { page: parseInt(page), pageSize: parseInt(limit), total } });
  } catch (err) { next(err); }
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

// GET /api/v1/players/:id/stats — full career stats computed from ball events
playersRouter.get('/:id/stats', async (req, res, next) => {
  try {
    const playerId = req.params.id;

    // Fetch all innings this player batted in
    const battingInningsRaw = await prisma.innings.findMany({
      where: { ballEvents: { some: { batsmanId: playerId } } },
      include: {
        ballEvents: {
          where: { batsmanId: playerId },
          include: { wicket: { select: { wicketType: true } } },
        },
        match: { select: { id: true, format: true } },
      },
    });

    // Fetch all innings this player bowled in
    const bowlingInningsRaw = await prisma.innings.findMany({
      where: { ballEvents: { some: { bowlerId: playerId } } },
      include: {
        ballEvents: {
          where: { bowlerId: playerId },
          include: { wicket: { select: { wicketType: true } } },
        },
      },
    });

    // ── Batting aggregation ──────────────────────────────────────
    const BOWLER_CREDITED = ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'];
    let batRuns = 0, batBalls = 0, batFours = 0, batSixes = 0;
    let batNotOuts = 0, batHalfCenturies = 0, batCenturies = 0, batHighScore = 0;
    const battingMatches = new Set<string>();

    for (const inn of battingInningsRaw) {
      battingMatches.add(inn.matchId);
      let innRuns = 0; let innBalls = 0; let isOut = false;
      for (const b of inn.ballEvents) {
        const isWide = b.extraType === 'WIDE';
        if (!isWide) { innRuns += b.runs; innBalls++; }
        if (b.runs === 4 && b.isBoundary) batFours++;
        if (b.runs === 6 && b.isSix) batSixes++;
        if (b.wicket) isOut = true;
      }
      batRuns += innRuns; batBalls += innBalls;
      if (!isOut) batNotOuts++;
      if (innRuns >= 100) batCenturies++;
      else if (innRuns >= 50) batHalfCenturies++;
      if (innRuns > batHighScore) batHighScore = innRuns;
    }

    const batInnings  = battingInningsRaw.length;
    const batDismissals = batInnings - batNotOuts;
    const batAvg  = batDismissals > 0 ? batRuns / batDismissals : batRuns;
    const batSR   = batBalls > 0 ? (batRuns / batBalls) * 100 : 0;

    // ── Bowling aggregation ──────────────────────────────────────
    let bowlBalls = 0, bowlRuns = 0, bowlWickets = 0, bowlMaidens = 0;
    let bowlBestWkts = 0, bowlBestRuns = 9999;
    let fiveWicketHauls = 0;
    const bowlingMatches = new Set<string>();

    for (const inn of bowlingInningsRaw) {
      bowlingMatches.add(inn.matchId);
      let innWkts = 0; let innRuns = 0;
      // Group by over for maiden calculation
      const overMap: Record<number, { runs: number; legal: number; hasExtras: boolean }> = {};
      for (const b of inn.ballEvents) {
        const ov = b.overNumber;
        if (!overMap[ov]) overMap[ov] = { runs: 0, legal: 0, hasExtras: false };
        if (b.extraType !== 'BYE' && b.extraType !== 'LEG_BYE') {
          overMap[ov].runs += b.runs + b.extraRuns;
          innRuns += b.runs + b.extraRuns;
        }
        if (b.extraType === 'WIDE' || b.extraType === 'NO_BALL') overMap[ov].hasExtras = true;
        if (b.isLegalBall) { overMap[ov].legal++; bowlBalls++; }
        if (b.wicket && BOWLER_CREDITED.includes(b.wicket.wicketType)) { innWkts++; }
      }
      bowlRuns += innRuns; bowlWickets += innWkts;
      // Count maidens
      for (const ov of Object.values(overMap)) {
        if (ov.legal >= 6 && ov.runs === 0 && !ov.hasExtras) bowlMaidens++;
      }
      if (innWkts >= 5) fiveWicketHauls++;
      if (innWkts > bowlBestWkts || (innWkts === bowlBestWkts && innRuns < bowlBestRuns)) {
        bowlBestWkts = innWkts; bowlBestRuns = innRuns;
      }
    }

    const bowlOvers = bowlBalls / 6;
    const bowlAvg  = bowlWickets > 0 ? bowlRuns / bowlWickets : 0;
    const bowlEco  = bowlOvers > 0 ? bowlRuns / bowlOvers : 0;
    const bowlSR   = bowlWickets > 0 ? bowlBalls / bowlWickets : 0;

    // ── Fielding ─────────────────────────────────────────────────
    const [catches, runOuts, stumpings] = await Promise.all([
      prisma.wicketEvent.count({ where: { fielderId: playerId, wicketType: 'CAUGHT' } }),
      prisma.wicketEvent.count({ where: { fielderId: playerId, wicketType: 'RUN_OUT' } }),
      prisma.wicketEvent.count({ where: { fielderId: playerId, wicketType: 'STUMPED' } }),
    ]);

    res.json({
      success: true,
      data: {
        batting: {
          matches: battingMatches.size, innings: batInnings, runs: batRuns,
          balls: batBalls, highScore: batHighScore, average: parseFloat(batAvg.toFixed(2)),
          strikeRate: parseFloat(batSR.toFixed(2)), fours: batFours, sixes: batSixes,
          halfCenturies: batHalfCenturies, centuries: batCenturies, notOuts: batNotOuts,
        },
        bowling: {
          matches: bowlingMatches.size, balls: bowlBalls,
          overs: parseFloat((Math.floor(bowlBalls / 6) + (bowlBalls % 6) / 10).toFixed(1)),
          runs: bowlRuns, wickets: bowlWickets, maidens: bowlMaidens,
          average: parseFloat(bowlAvg.toFixed(2)), economy: parseFloat(bowlEco.toFixed(2)),
          strikeRate: parseFloat(bowlSR.toFixed(2)),
          bestFigures: bowlBestWkts > 0 ? `${bowlBestWkts}/${bowlBestRuns}` : '—',
          fiveWicketHauls,
        },
        fielding: { catches, runOuts, stumpings },
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
