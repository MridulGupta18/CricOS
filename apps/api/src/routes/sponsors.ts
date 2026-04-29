import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

export const sponsorsRouter = Router();

const createSponsorSchema = z.object({
  leagueId: z.string().cuid(),
  name: z.string().min(2).max(100),
  logoUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  tier: z.enum(['TITLE', 'GOLD', 'SILVER', 'ASSOCIATE']).default('ASSOCIATE'),
});

// POST /api/v1/sponsors
sponsorsRouter.post('/', requireAuth, validate(createSponsorSchema), async (req: AuthRequest, res, next) => {
  try {
    const sponsor = await prisma.sponsor.create({ data: req.body });
    res.status(201).json({ success: true, data: sponsor });
  } catch (err) { next(err); }
});

// GET /api/v1/sponsors/league/:leagueId
sponsorsRouter.get('/league/:leagueId', async (req, res, next) => {
  try {
    const sponsors = await prisma.sponsor.findMany({
      where: { leagueId: req.params.leagueId, isActive: true },
      orderBy: { tier: 'asc' },
    });
    res.json({ success: true, data: sponsors });
  } catch (err) { next(err); }
});

// DELETE /api/v1/sponsors/:id
sponsorsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await prisma.sponsor.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});
