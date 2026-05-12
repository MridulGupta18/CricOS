import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { UserRole } from '@cricket-os/shared';
import { can, atLeast, Action } from '../access-control';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: UserRole };
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  }
  console.warn('[CricOS] WARNING: JWT_SECRET not set — using ephemeral dev secret. Set JWT_SECRET in production!');
}
// Use cryptographically random bytes for dev fallback (not Math.random)
const _JWT_SECRET = JWT_SECRET ?? randomBytes(32).toString('hex');
// Exported so socket handlers use the exact same secret — never diverge
export { _JWT_SECRET as JWT_SECRET_INTERNAL };

// ─── TOKEN VERIFICATION ──────────────────────────────────────

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No token provided' } });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, _JWT_SECRET) as { id: string; email: string; role: UserRole };
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token expired or invalid' } });
  }
}

// Optional auth — attaches user if token present, but doesn't block unauthenticated requests
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), _JWT_SECRET) as unknown as { id: string; email: string; role: UserRole };
      req.user = payload;
    } catch { /* no-op — unauthenticated is fine */ }
  }
  next();
}

// ─── PERMISSION GUARDS ───────────────────────────────────────

/**
 * Requires the caller to be authenticated AND hold a specific permission
 * as defined in access-control.ts.
 *
 * Usage: router.patch('/leagues/:id', requireAuth, requirePermission('league:update'), handler)
 */
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

/**
 * Requires the caller's role to be at least `minimum` in the hierarchy.
 * MASTER > ADMIN > ORGANIZER > SCORER > PLAYER > VIEWER
 */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  };
}

/**
 * Requires the caller to be at least `minimum` role level.
 * E.g. requireAtLeast('ORGANIZER') allows ORGANIZER, ADMIN, MASTER.
 */
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

export function generateAccessToken(payload: { id: string; email: string; role: UserRole }) {
  return jwt.sign(payload, _JWT_SECRET, { expiresIn: '15m' });
}

const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
if (!REFRESH_TOKEN_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: REFRESH_TOKEN_SECRET environment variable is not set. Refusing to start.');
}
const _REFRESH_SECRET = (REFRESH_TOKEN_SECRET ?? _JWT_SECRET) + '_refresh_v1';

export function generateRefreshToken(payload: { id: string }) {
  return jwt.sign(payload, _REFRESH_SECRET, { expiresIn: '30d' });
}

export function verifyRefreshToken(token: string): { id: string } {
  return jwt.verify(token, _REFRESH_SECRET) as { id: string };
}
