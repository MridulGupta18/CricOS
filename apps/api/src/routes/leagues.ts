import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { requireAuth, requireRole, requirePermission, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

export const leaguesRouter = Router();

const createLeagueSchema = z.object({
  name: z.string().min(3).max(100),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  format: z.enum(['T20', 'ODI', 'T10', 'TEST', 'CUSTOM']).default('T20'),
  overs: z.number().int().positive().default(20),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  registrationFee: z.number().int().min(0).default(0),
  currency: z.string().default('INR'),
  maxTeams: z.number().int().positive().optional(),
  isPublic: z.boolean().default(true),
  city: z.string().optional(),
  country: z.string().default('India'),
  rules: z.string().optional(),
});

const updateLeagueSchema = createLeagueSchema.partial();

const leagueSelect = {
  id: true, name: true, slug: true, description: true, logoUrl: true, bannerUrl: true,
  format: true, overs: true, startDate: true, endDate: true,
  registrationFee: true, currency: true, maxTeams: true, isPublic: true,
  status: true, city: true, country: true, createdAt: true,
  organizer: { select: { id: true, name: true, email: true } },
  sponsors: true,
  teams: {
    select: {
      id: true, registeredAt: true, paymentStatus: true,
      pointsEarned: true, matchesPlayed: true, matchesWon: true, nrr: true,
      team: { select: { id: true, name: true, shortName: true, logoUrl: true } },
    },
  },
};

// GET /api/v1/leagues
leaguesRouter.get('/', async (req, res, next) => {
  try {
    const { status, city, page = '1', limit = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = { isPublic: true };
    if (status) where.status = status;
    if (city) where.city = { contains: city, mode: 'insensitive' };

    const [leagues, total] = await Promise.all([
      prisma.league.findMany({ where, select: leagueSelect, skip, take: parseInt(limit), orderBy: { createdAt: 'desc' } }),
      prisma.league.count({ where }),
    ]);

    res.json({ success: true, data: leagues, meta: { page: parseInt(page), pageSize: parseInt(limit), total } });
  } catch (err) { next(err); }
});

// GET /api/v1/leagues/:idOrSlug
leaguesRouter.get('/:idOrSlug', async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const league = await prisma.league.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { ...leagueSelect, matches: { select: { id: true, status: true, scheduledAt: true, homeTeam: { select: { id: true, name: true, shortName: true } }, awayTeam: { select: { id: true, name: true, shortName: true } } } } },
    });

    if (!league) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'League not found' } });
    res.json({ success: true, data: league });
  } catch (err) { next(err); }
});

// POST /api/v1/leagues — create league
leaguesRouter.post('/', requireAuth, requirePermission('league:create'), validate(createLeagueSchema), async (req: AuthRequest, res, next) => {
  try {
    const slugExists = await prisma.league.findUnique({ where: { slug: req.body.slug } });
    if (slugExists) {
      return res.status(409).json({ success: false, error: { code: 'SLUG_EXISTS', message: 'League slug already taken' } });
    }

    const league = await prisma.league.create({
      data: { ...req.body, organizerId: req.user!.id },
      select: leagueSelect,
    });
    res.status(201).json({ success: true, data: league });
  } catch (err) { next(err); }
});

// PATCH /api/v1/leagues/:id
leaguesRouter.patch('/:id', requireAuth, requirePermission('league:update'), validate(updateLeagueSchema), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.league.findUnique({ where: { id: req.params.id }, select: { organizerId: true } });
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'League not found' } });
    if (existing.organizerId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the league organizer can edit this league' } });
    }
    const league = await prisma.league.update({
      where: { id: req.params.id },
      data: req.body,
      select: leagueSelect,
    });
    res.json({ success: true, data: league });
  } catch (err) { next(err); }
});

// PATCH /api/v1/leagues/:id/status — change league status
leaguesRouter.patch('/:id/status', requireAuth, requirePermission('league:set_status'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.league.findUnique({ where: { id: req.params.id }, select: { organizerId: true } });
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'League not found' } });
    if (existing.organizerId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the league organizer can change the league status' } });
    }
    const { status } = req.body;
    const league = await prisma.league.update({
      where: { id: req.params.id },
      data: { status },
      select: leagueSelect,
    });
    res.json({ success: true, data: league });
  } catch (err) { next(err); }
});

// POST /api/v1/leagues/:id/teams — register a team
leaguesRouter.post('/:id/teams', requireAuth, requirePermission('league:register_team'), async (req: AuthRequest, res, next) => {
  try {
    const { teamId } = req.body;
    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'League not found' } });

    const existing = await prisma.leagueTeam.findUnique({
      where: { leagueId_teamId: { leagueId: req.params.id, teamId } },
    });
    if (existing) return res.status(409).json({ success: false, error: { code: 'ALREADY_REGISTERED', message: 'Team already registered' } });

    const registration = await prisma.leagueTeam.create({
      data: {
        leagueId: req.params.id,
        teamId,
        paymentStatus: league.registrationFee === 0 ? 'PAID' : 'PENDING',
      },
      include: { team: { select: { id: true, name: true, shortName: true } } },
    });

    res.status(201).json({ success: true, data: registration });
  } catch (err) { next(err); }
});

// GET /api/v1/leagues/:id/standings — live points table with computed NRR
leaguesRouter.get('/:id/standings', async (req, res, next) => {
  try {
    const [leagueTeams, matches] = await Promise.all([
      prisma.leagueTeam.findMany({
        where: { leagueId: req.params.id },
        include: { team: { select: { id: true, name: true, shortName: true, logoUrl: true } } },
      }),
      prisma.match.findMany({
        where: { leagueId: req.params.id, status: 'COMPLETED' },
        include: {
          innings: { select: { battingTeamId: true, totalRuns: true, completedOvers: true, extraBalls: true, isCompleted: true } },
        },
      }),
    ]);

    // Build standings map
    const stats: Record<string, {
      teamId: string; played: number; won: number; lost: number; tied: number; noResult: number; points: number;
      runsScored: number; oversBatted: number; runsConceded: number; oversBowled: number;
    }> = {};

    for (const lt of leagueTeams) {
      stats[lt.teamId] = { teamId: lt.teamId, played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0, runsScored: 0, oversBatted: 0, runsConceded: 0, oversBowled: 0 };
    }

    for (const m of matches) {
      const home = m.homeTeamId; const away = m.awayTeamId;
      if (!stats[home] || !stats[away]) continue;

      stats[home].played++; stats[away].played++;

      const toOvers = (inn: any) => (inn.completedOvers ?? 0) + (inn.extraBalls ?? 0) / 6;

      for (const inn of m.innings) {
        const batting  = inn.battingTeamId;
        const fielding = batting === home ? away : home;
        const overs    = toOvers(inn);
        if (stats[batting]) { stats[batting].runsScored += inn.totalRuns; stats[batting].oversBatted += overs; }
        if (stats[fielding]) { stats[fielding].runsConceded += inn.totalRuns; stats[fielding].oversBowled += overs; }
      }

      if (m.resultType === 'WIN' && m.winnerId) {
        const loser = m.winnerId === home ? away : home;
        stats[m.winnerId].won++;  stats[m.winnerId].points += 2;
        stats[loser].lost++;
      } else if (m.resultType === 'TIE') {
        stats[home].tied++; stats[away].tied++;
        stats[home].points += 1; stats[away].points += 1;
      } else if (m.resultType === 'NO_RESULT') {
        stats[home].noResult++; stats[away].noResult++;
        stats[home].points += 1; stats[away].points += 1;
      }
    }

    // Compute NRR and merge with leagueTeam data
    const standings = leagueTeams.map(lt => {
      const s = stats[lt.teamId];
      const nrr = s && s.oversBatted > 0 && s.oversBowled > 0
        ? (s.runsScored / s.oversBatted) - (s.runsConceded / s.oversBowled)
        : 0;
      return {
        ...lt,
        matchesPlayed: s?.played ?? lt.matchesPlayed,
        matchesWon:    s?.won    ?? lt.matchesWon,
        matchesLost:   s?.lost   ?? 0,
        matchesTied:   s?.tied   ?? 0,
        pointsEarned:  s?.points ?? lt.pointsEarned,
        nrr:           parseFloat(nrr.toFixed(3)),
      };
    }).sort((a, b) => b.pointsEarned - a.pointsEarned || b.nrr - a.nrr);

    res.json({ success: true, data: standings });
  } catch (err) { next(err); }
});

// GET /api/v1/leagues/:id/revenue — revenue dashboard (organizer only)
leaguesRouter.get('/:id/revenue', requireAuth, requirePermission('league:view_revenue'), async (req: AuthRequest, res, next) => {
  try {
    // Ownership check: only the league organizer or admin can view revenue
    const leagueOwner = await prisma.league.findUnique({ where: { id: req.params.id }, select: { organizerId: true } });
    if (leagueOwner && leagueOwner.organizerId !== req.user!.id && req.user!.role !== 'ADMIN' && req.user!.role !== 'MASTER') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the league organizer can view revenue' } });
    }
    const [payments, league] = await Promise.all([
      prisma.payment.findMany({
        where: { leagueId: req.params.id, status: 'PAID' },
        include: { team: { select: { id: true, name: true } } },
        orderBy: { paidAt: 'desc' },
      }),
      prisma.league.findUnique({ where: { id: req.params.id }, select: { registrationFee: true, currency: true } }),
    ]);

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalRegistrations = payments.length;

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalRegistrations,
        currency: league?.currency,
        payments,
      },
    });
  } catch (err) { next(err); }
});


// GET /api/v1/leagues/:id/bracket — full tournament bracket
leaguesRouter.get('/:id/bracket', async (req, res, next) => {
  try {
    const stages = await prisma.tournamentStage.findMany({
      where: { leagueId: req.params.id },
      include: {
        fixtures: {
          include: {
            match: {
              select: {
                id: true, status: true, homeTeamId: true, awayTeamId: true,
                homeTeam: { select: { id: true, name: true, shortName: true } },
                awayTeam: { select: { id: true, name: true, shortName: true } },
                winnerId: true, resultType: true,
                innings: { select: { inningsNumber: true, totalRuns: true, totalWickets: true, completedOvers: true } },
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { stageOrder: 'asc' },
    });
    res.json({ success: true, data: stages });
  } catch (err) { next(err); }
});

// POST /api/v1/leagues/:id/bracket — create bracket stages (organizer only)
leaguesRouter.post('/:id/bracket', requireAuth, requirePermission('league:manage_bracket'), async (req: AuthRequest, res, next) => {
  try {
    const leagueOwner = await prisma.league.findUnique({ where: { id: req.params.id }, select: { organizerId: true } });
    if (leagueOwner && leagueOwner.organizerId !== req.user!.id && req.user!.role !== 'ADMIN' && req.user!.role !== 'MASTER') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the league organizer can manage the bracket' } });
    }
    const { stages } = req.body as { stages: { name: string; stageType: string; stageOrder: number; teamsAdvance: number }[] };
    if (!stages?.length) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'stages array required' } });

    const created = await prisma.$transaction(
      stages.map(s => prisma.tournamentStage.create({
        data: { leagueId: req.params.id, name: s.name, stageType: s.stageType as any, stageOrder: s.stageOrder, teamsAdvance: s.teamsAdvance ?? 2 },
      }))
    );
    res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
});
