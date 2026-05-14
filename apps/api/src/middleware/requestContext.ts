import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

// requestId — short, lowercase, easy to grep. Honors an inbound header if
// callers (load balancers, edge proxies) already minted one.
export function attachRequestId(req: Request, res: Response, next: NextFunction) {
  const inbound = (req.headers['x-request-id'] as string | undefined)?.slice(0, 64);
  const id = inbound && /^[A-Za-z0-9_-]+$/.test(inbound) ? inbound : randomUUID();
  (req as any).id = id;
  res.setHeader('x-request-id', id);
  next();
}

// pino-http gives us one structured log line per request with method, url,
// status, latency, requestId, and user id (when available).
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as any).id ?? randomUUID(),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps: (req) => {
    const user = (req as any).user;
    return user ? { userId: user.id, role: user.role } : {};
  },
  // Don't log every health check — they're noisy and not useful.
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/api/v1/health',
  },
});
