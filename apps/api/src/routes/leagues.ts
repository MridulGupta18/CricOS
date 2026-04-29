import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
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
leaguesRouter.post('/', requireAuth, requireRole('ORGANIZER', 'ADMIN'), validate(createLeagueSchema), async (req: AuthRequest, res, next) => {
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
leaguesRouter.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const league = await prisma.league.update({
      where: { id: req.params.id },
      data: req.body,
      select: leagueSelect,
    });
    res.json({ success: true, data: league });
  } catch (err) { next(err); }
});

// PATCH /api/v1/leagues/:id/status — change league status
leaguesRouter.patch('/:id/status', requireAuth, async (req: AuthRequest, res, next) => {
  try {
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
leaguesRouter.post('/:id/teams', requireAuth, async (req: AuthRequest, res, next) => {
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

// GET /api/v1/leagues/:id/standings — points table
leaguesRouter.get('/:id/standings', async (req, res, next) => {
  try {
    const standings = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      include: { team: { select: { id: true, name: true, shortName: true, logoUrl: true } } },
      orderBy: [{ pointsEarned: 'desc' }, { nrr: 'desc' }],
    });
    res.json({ success: true, data: standings });
  } catch (err) { next(err); }
});

// GET /api/v1/leagues/:id/revenue — revenue dashboard (organizer only)
leaguesRouter.get('/:id/revenue', requireAuth, async (req: AuthRequest, res, next) => {
  try {
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
