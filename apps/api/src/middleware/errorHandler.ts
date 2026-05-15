import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { sentry } from '../lib/sentry';

// Centralised error handler. Two main cases:
//   1. ZodError → 400 with field-level details (these are *expected* — not logged loudly).
//   2. Everything else → 500. The full error (with stack) goes to the structured log
//      under the requestId, but the HTTP response never leaks the error message
//      to the client in production. This avoids stack-trace + library-version disclosure.

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as any).id;

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.flatten().fieldErrors,
      },
    });
  }

  const error = err as Error;
  logger.error({ err: error, requestId, path: req.path, method: req.method }, '[API Error]');
  sentry.captureException(error, { tags: { requestId, path: req.path } });

  const isProd = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    success: false,
    error: {
      code:    'INTERNAL_ERROR',
      message: isProd ? 'Internal server error' : (error?.message ?? 'Unknown error'),
      requestId,
    },
  });
}
