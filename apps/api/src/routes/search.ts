import { Router } from 'express';
import { prisma } from '@cricket-os/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { SearchResult } from '@cricket-os/shared';

export const searchRouter = Router();

// GET /api/v1/search?q=...&type=...&region=...
// Returns ranked results across players, teams, matches, leagues
searchRouter.get('/', async (req, res, next) => {
  try {
    const { q = '', type, region, limit = '10' } = req.query as Record<string, string>;
    const maxResults = Math.min(parseInt(limit), 50);

    if (q.trim().length < 1) {
      return res.json({ success: true, data: [] });
    }

    const searchTerm = q.trim();
    // Use PostgreSQL ILIKE for simple fuzzy matching without extra extensions.
    // In production, replace with pg_trgm similarity() for typo tolerance.
    const likePattern = `%${searchTerm}%`;

    const results: SearchResult[] = [];

    const fetchAll = type === undefined;

    // ─── PLAYERS ────────────────────────────────────────────
    if (fetchAll || type === 'PLAYER') {
      const players = await prisma.player.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            ...(region ? [{ city: { contains: region, mode: 'insensitive' as const } }] : []),
          ],
        },
        select: { id: true, name: true, role: true, city: true, avatarUrl: true },
        take: maxResults,
      });

      players.forEach((p) =>
        results.push({
          id: p.id,
          type: 'PLAYER',
          title: p.name,
          subtitle: [p.role, p.city].filter(Boolean).join(' · '),
          avatarUrl: p.avatarUrl ?? undefined,
          href: `/player/${p.id}`,
        })
      );
    }

    // ─── TEAMS ──────────────────────────────────────────────
    if (fetchAll || type === 'TEAM') {
      const teams = await prisma.team.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { shortName: { contains: searchTerm, mode: 'insensitive' } },
            ...(region ? [{ city: { contains: region, mode: 'insensitive' as const } }] : []),
          ],
        },
        select: { id: true, name: true, shortName: true, city: true, logoUrl: true },
        take: maxResults,
      });

      teams.forEach((t) =>
        results.push({
          id: t.id,
          type: 'TEAM',
          title: t.name,
          subtitle: [t.shortName, t.city].filter(Boolean).join(' · '),
          avatarUrl: t.logoUrl ?? undefined,
          href: `/team/${t.id}`,
        })
      );
    }

    // ─── MATCHES ────────────────────────────────────────────
    if (fetchAll || type === 'MATCH') {
      const matches = await prisma.match.findMany({
        where: {
          isPublic: true,
          OR: [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { homeTeam: { name: { contains: searchTerm, mode: 'insensitive' } } },
            { awayTeam: { name: { contains: searchTerm, mode: 'insensitive' } } },
            ...(region ? [{ city: { contains: region, mode: 'insensitive' as const } }] : []),
          ],
        },
        select: {
          id: true, title: true, status: true, scheduledAt: true, city: true,
          homeTeam: { select: { name: true, shortName: true } },
          awayTeam: { select: { name: true, shortName: true } },
        },
        take: maxResults,
        orderBy: { scheduledAt: 'desc' },
      });

      matches.forEach((m) =>
        results.push({
          id: m.id,
          type: 'MATCH',
          title: m.title ?? `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`,
          subtitle: [m.status, m.city, m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString() : null].filter(Boolean).join(' · '),
          href: `/match/${m.id}`,
        })
      );
    }

    // ─── LEAGUES ────────────────────────────────────────────
    if (fetchAll || type === 'LEAGUE') {
      const leagues = await prisma.league.findMany({
        where: {
          isPublic: true,
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            ...(region ? [{ city: { contains: region, mode: 'insensitive' as const } }] : []),
          ],
        },
        select: { id: true, name: true, slug: true, status: true, city: true, logoUrl: true },
        take: maxResults,
      });

      leagues.forEach((l) =>
        results.push({
          id: l.id,
          type: 'LEAGUE',
          title: l.name,
          subtitle: [l.status, l.city].filter(Boolean).join(' · '),
          avatarUrl: l.logoUrl ?? undefined,
          href: `/league/${l.slug}`,
        })
      );
    }

    // Sort: exact name matches first, then partial
    const sorted = results.sort((a, b) => {
      const aExact = a.title.toLowerCase() === searchTerm.toLowerCase() ? 1 : 0;
      const bExact = b.title.toLowerCase() === searchTerm.toLowerCase() ? 1 : 0;
      return bExact - aExact;
    });

    res.json({ success: true, data: sorted.slice(0, maxResults) });
  } catch (err) { next(err); }
});

// POST /api/v1/search/recent — save a recent search
searchRouter.post('/recent', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { query, resultId, resultType } = req.body;
    await prisma.recentSearch.create({
      data: { userId: req.user!.id, query, resultId, resultType },
    });
    // Keep only last 20 recent searches per user
    const old = await prisma.recentSearch.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      skip: 20,
    });
    if (old.length > 0) {
      await prisma.recentSearch.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
    }
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// GET /api/v1/search/recent — get recent searches for current user
searchRouter.get('/recent', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const recent = await prisma.recentSearch.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    res.json({ success: true, data: recent });
  } catch (err) { next(err); }
});
