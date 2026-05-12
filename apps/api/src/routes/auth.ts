import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@cricket-os/db';
import { validate } from '../middleware/validate';
import { requireAuth, generateAccessToken, generateRefreshToken, verifyRefreshToken, AuthRequest } from '../middleware/auth';

export const authRouter = Router();

// Self-registration is capped at PLAYER/VIEWER. SCORER+ must be granted by ADMIN/MASTER.
// MASTER, ADMIN, ORGANIZER, and SCORER roles are never assignable via public registration.
const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one symbol'),
  name:     z.string().min(2).max(100),
  phone:    z.string().max(20).optional(),
  role:     z.enum(['PLAYER', 'VIEWER']).default('VIEWER'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /api/v1/auth/register
authRouter.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, name, phone, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'Email already registered' } });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, phone: phone ?? null, role },
      select: { id: true, email: true, name: true, role: true },
    });

    const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ id: user.id });
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    res.status(201).json({ success: true, data: { user: { id: user.id, email: user.email, name: user.name, role: user.role }, accessToken, refreshToken } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
authRouter.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }

    const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ id: user.id });

    // Cleanup expired tokens for this user, then create new one
    await prisma.$transaction([
      prisma.refreshToken.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } }),
      prisma.refreshToken.create({
        data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: { code: 'NO_TOKEN', message: 'Refresh token required' } });
    }

    const payload = verifyRefreshToken(refreshToken);

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Refresh token expired' } });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });

    // Rotate refresh token atomically — delete old + create new in one transaction
    // so a failed create never leaves the user locked out
    const newAccessToken  = generateAccessToken({ id: user.id, email: user.email, role: user.role });
    const newRefreshToken = generateRefreshToken({ id: user.id });
    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { token: refreshToken } }),
      prisma.refreshToken.create({
        data: { token: newRefreshToken, userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    res.json({ success: true, data: { accessToken: newAccessToken, refreshToken: newRefreshToken } });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/me
authRouter.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, email: true, name: true, role: true, phone: true,
        avatarUrl: true, createdAt: true,
        playerProfile: { select: { id: true, name: true, role: true, jerseyNumber: true } },
      },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
authRouter.post('/logout', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken, userId: req.user!.id } });
    }
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});
