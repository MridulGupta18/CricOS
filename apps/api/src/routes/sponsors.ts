import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { requireAuth, requirePermission, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { isPrivileged } from '../lib/ownership';

export const sponsorsRouter = Router();

const createSponsorSchema = z.object({
  leagueId:   z.string().cuid(),
  name:       z.string().min(2).max(100),
  logoUrl:    z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  tier:       z.enum(['TITLE', 'GOLD', 'SILVER', 'ASSOCIATE']).default('ASSOCIATE'),
});

// POST /api/v1/sponsors — add sponsor to a league (organizer must own the league)
sponsorsRouter.post('/', requireAuth, requirePermission('sponsor:manage'),
  validate(createSponsorSchema), async (req: AuthRequest, res, next) => {
  try {
    // Verify caller is organizer of the target league (or admin/master)
    const league = await prisma.league.findUnique({ where: { id: req.body.leagueId }, select: { organizerId: true } });
    if (!league) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'League not found' } });
    if (league.organizerId !== req.user!.id && !isPrivileged(req.user!.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the league organizer can add sponsors' } });
    }
    const sponsor = await prisma.sponsor.create({ data: req.body });
    res.status(201).json({ success: true, data: sponsor });
  } catch (err) { next(err); }
});

// GET /api/v1/sponsors/league/:leagueId — public
sponsorsRouter.get('/league/:leagueId', async (req, res, next) => {
  try {
    const sponsors = await prisma.sponsor.findMany({
      where: { leagueId: req.params.leagueId, isActive: true },
      orderBy: { tier: 'asc' },
    });
    res.json({ success: true, data: sponsors });
  } catch (err) { next(err); }
});

// DELETE /api/v1/sponsors/:id — deactivate sponsor (organizer of that league only)
sponsorsRouter.delete('/:id', requireAuth, requirePermission('sponsor:manage'), async (req: AuthRequest, res, next) => {
  try {
    const sponsor = await prisma.sponsor.findUnique({ where: { id: req.params.id }, include: { league: { select: { organizerId: true } } } });
    if (!sponsor) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sponsor not found' } });
    if (sponsor.league.organizerId !== req.user!.id && !isPrivileged(req.user!.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the league organizer can remove sponsors' } });
    }
    await prisma.sponsor.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});
