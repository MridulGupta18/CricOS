import { Request, Response, NextFunction } from 'express';
import { randomBytes, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { UserRole } from '@cricket-os/shared';
import { can, atLeast, Action } from '../access-control';
import { logger } from '../lib/logger';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: UserRole; tokenVersion?: number };
}

// ─── SECRETS ─────────────────────────────────────────────────
// In production, both secrets MUST be set explicitly. In dev we generate
// ephemeral random secrets so the app works out of the box (but warn loudly).

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  }
  logger.warn('[CricOS] JWT_SECRET not set — using ephemeral dev secret. Set JWT_SECRET in production!');
}
const _JWT_SECRET = JWT_SECRET ?? randomBytes(32).toString('hex');
// Exported so socket handlers use the exact same secret — never diverge
export { _JWT_SECRET as JWT_SECRET_INTERNAL };

const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
if (!REFRESH_TOKEN_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: REFRESH_TOKEN_SECRET environment variable is not set. Refusing to start.');
}
const _REFRESH_SECRET = (REFRESH_TOKEN_SECRET ?? _JWT_SECRET) + '_refresh_v1';

// ─── TOKEN VERIFICATION ──────────────────────────────────────

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No token provided' } });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, _JWT_SECRET) as { id: string; email: string; role: UserRole; tokenVersion?: number };
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token expired or invalid' } });
  }
}

// ─── PERMISSION GUARDS ───────────────────────────────────────

export function requirePermission(action: Action) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    if (!can(req.user.role, action)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Your role (${req.user.role}) does not have permission to perform: ${action}`,
        },
      });
    }
    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  };
}

export function requireAtLeast(minimum: UserRole) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    if (!atLeast(req.user.role, minimum)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: `Requires at least ${minimum} role` },
      });
    }
    next();
  };
}

// ─── TOKEN GENERATORS ────────────────────────────────────────

export function generateAccessToken(payload: { id: string; email: string; role: UserRole; tokenVersion?: number }) {
  return jwt.sign(payload, _JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(payload: { id: string; tokenVersion?: number }) {
  return jwt.sign(payload, _REFRESH_SECRET, { expiresIn: '30d' });
}

export function verifyRefreshToken(token: string): { id: string; tokenVersion?: number } {
  return jwt.verify(token, _REFRESH_SECRET) as { id: string; tokenVersion?: number };
}

// ─── TOKEN HASHING ───────────────────────────────────────────
// Refresh tokens are stored at rest as SHA-256 digests, not plaintext. The
// risk model: if the database is ever exfiltrated, an attacker still cannot
// present the stored value to /auth/refresh (the JWT signature would still
// verify, but the row would be missing on lookup). Combined with rotation,
// this gives forward secrecy for refresh sessions.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
