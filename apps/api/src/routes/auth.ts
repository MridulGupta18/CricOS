import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '@cricket-os/db';
import { validate } from '../middleware/validate';
import {
  requireAuth,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  AuthRequest,
} from '../middleware/auth';
import { logger } from '../lib/logger';
import { sendEmail, verificationEmail, passwordResetEmail } from '../lib/mailer';

export const authRouter = Router();

// ─── CONFIG ─────────────────────────────────────────────────
const REFRESH_TTL_MS    = 30 * 24 * 60 * 60 * 1000;     // 30 days
const VERIFY_TTL_MS     = 24 * 60 * 60 * 1000;          // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;           // 1 hour
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS        = 15 * 60 * 1000;               // 15 min

const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(',')[0].trim();

// ─── SCHEMAS ────────────────────────────────────────────────

// Self-registration is capped at PLAYER/VIEWER. SCORER+ must be granted by ADMIN/MASTER.
const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one symbol'),
  name:     z.string().min(2).max(100),
  phone:    z.string().max(20).optional(),
  role:     z.enum(['PLAYER', 'VIEWER']).default('PLAYER'),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms and privacy policy to continue.' }),
  }),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const verifySchema = z.object({ token: z.string().min(16) });
const requestResetSchema = z.object({ email: z.string().email() });
const completeResetSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one symbol'),
});

// ─── HELPERS ────────────────────────────────────────────────

function token(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

async function issueTokens(user: { id: string; email: string; role: any; tokenVersion: number }) {
  const accessToken  = generateAccessToken({ id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion });
  const refreshToken = generateRefreshToken({ id: user.id, tokenVersion: user.tokenVersion });
  await prisma.refreshToken.create({
    data: {
      tokenHash:    hashRefreshToken(refreshToken),
      userId:       user.id,
      tokenVersion: user.tokenVersion,
      expiresAt:    new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { accessToken, refreshToken };
}

// ─── ROUTES ─────────────────────────────────────────────────

// POST /api/v1/auth/register
authRouter.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, name, phone, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'Email already registered' } });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = token();
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        phone: phone ?? null,
        role,
        verificationToken,
        verificationExpiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
      select: { id: true, email: true, name: true, role: true, tokenVersion: true, isVerified: true },
    });

    // Fire-and-forget so registration doesn't fail if SMTP is down.
    const verifyUrl = `${FRONTEND_URL}/auth/verify?token=${verificationToken}`;
    const tmpl = verificationEmail({ name: user.name, verifyUrl });
    sendEmail({ ...tmpl, to: user.email }).catch(() => {});

    const tokens = await issueTokens(user);

    res.status(201).json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, isVerified: user.isVerified },
        ...tokens,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
authRouter.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    // Generic "invalid credentials" — never leak whether the email exists.
    const invalid = () => res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    if (!user) return invalid();

    // Account-level lockout protects against credential stuffing even from
    // distributed botnets where per-IP rate limits don't help.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({
        success: false,
        error: { code: 'ACCOUNT_LOCKED', message: 'Too many failed attempts. Try again later.' },
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      // Renamed away from `next` so we don't shadow the Express next() callback.
      const attempts = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: attempts,
          lockedUntil: attempts >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null,
        },
      });
      return invalid();
    }

    // Reset counters + cleanup expired tokens, atomically.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data:  { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } }),
    ]);

    const tokens = await issueTokens(user);

    res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, isVerified: user.isVerified },
        ...tokens,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: { code: 'NO_TOKEN', message: 'Refresh token required' } });
    }

    // Step 1 — verify the JWT signature/expiry. Done first so a malformed token
    // never reaches the DB.
    let payload: { id: string; tokenVersion?: number };
    try { payload = verifyRefreshToken(refreshToken); }
    catch { return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Refresh token invalid' } }); }

    // Step 2 — confirm the (hashed) token still exists in the DB and isn't expired.
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
    });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Refresh token expired' } });
    }

    // Step 3 — ensure the user still exists and token wasn't invalidated
    // (e.g. role change → tokenVersion bumped).
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    if ((stored.tokenVersion ?? 0) !== user.tokenVersion) {
      // Stale token — delete and tell client to log in again.
      await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {});
      return res.status(401).json({ success: false, error: { code: 'TOKEN_REVOKED', message: 'Session was revoked. Please sign in again.' } });
    }

    // Step 4 — rotate the refresh token atomically.
    const newAccess  = generateAccessToken({ id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion });
    const newRefresh = generateRefreshToken({ id: user.id, tokenVersion: user.tokenVersion });
    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: stored.id } }),
      prisma.refreshToken.create({
        data: {
          tokenHash:    hashRefreshToken(newRefresh),
          userId:       user.id,
          tokenVersion: user.tokenVersion,
          expiresAt:    new Date(Date.now() + REFRESH_TTL_MS),
        },
      }),
    ]);

    res.json({ success: true, data: { accessToken: newAccess, refreshToken: newRefresh } });
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
        avatarUrl: true, createdAt: true, isVerified: true,
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
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { tokenHash: hashRefreshToken(refreshToken), userId: req.user!.id },
      });
    }
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// ─── EMAIL VERIFICATION ──────────────────────────────────────

// POST /api/v1/auth/verify — consume a verification token.
authRouter.post('/verify', validate(verifySchema), async (req, res, next) => {
  try {
    const { token } = req.body;
    const user = await prisma.user.findUnique({ where: { verificationToken: token } });
    if (!user || !user.verificationExpiresAt || user.verificationExpiresAt < new Date()) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Verification link is invalid or expired.' } });
    }
    await prisma.user.update({
      where: { id: user.id },
      data:  { isVerified: true, verificationToken: null, verificationExpiresAt: null },
    });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/verify/resend — issue a fresh verification email (auth required).
authRouter.post('/verify/resend', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    if (user.isVerified) return res.json({ success: true, data: { alreadyVerified: true } });

    const verificationToken = token();
    await prisma.user.update({
      where: { id: user.id },
      data:  { verificationToken, verificationExpiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
    });
    const verifyUrl = `${FRONTEND_URL}/auth/verify?token=${verificationToken}`;
    const tmpl = verificationEmail({ name: user.name, verifyUrl });
    sendEmail({ ...tmpl, to: user.email }).catch(() => {});
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// ─── PASSWORD RESET ──────────────────────────────────────────

// POST /api/v1/auth/forgot — start a reset flow.
// Always returns 200 to avoid leaking which emails are registered.
authRouter.post('/forgot', validate(requestResetSchema), async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const resetToken = token();
      await prisma.user.update({
        where: { id: user.id },
        data:  { passwordResetToken: resetToken, passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
      });
      const resetUrl = `${FRONTEND_URL}/auth/reset?token=${resetToken}`;
      const tmpl = passwordResetEmail({ name: user.name, resetUrl });
      sendEmail({ ...tmpl, to: user.email }).catch(() => {});
      logger.info({ userId: user.id }, 'Password reset initiated');
    } else {
      // Don't write the raw email — it's PII and exposes the enumeration
      // pattern to anyone with log access. Log a redacted prefix instead.
      logger.debug({ emailPrefix: email.slice(0, 3) }, 'Password reset requested for unknown email (no-op)');
    }
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/reset — finalize a reset by exchanging token for a new password.
// On success: bumps tokenVersion, which invalidates all existing refresh tokens.
authRouter.post('/reset', validate(completeResetSchema), async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const user = await prisma.user.findUnique({ where: { passwordResetToken: token } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Reset link is invalid or expired.' } });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data:  {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
          tokenVersion: { increment: 1 },
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      // Nuke all outstanding sessions.
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});
