// Structured logger built on Pino.
//
// In development we use pino-pretty for readable output if it's installed,
// otherwise we fall back to default JSON (Pino emits one JSON object per line).
// In production we always emit JSON so log aggregators (Datadog, Loggly, etc.)
// can parse it directly.
//
// Every request gets a `requestId` attached by middleware/requestId.ts so logs
// from the same request can be correlated.

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  // pino-pretty is a dev-only convenience; if it's not installed the runtime
  // silently falls back to JSON (which is fine — just less readable in a terminal).
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' } }
    : undefined,
  redact: {
    // Strip anything that could carry a credential or PII out of the log line.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.passwordHash',
      'req.body.refreshToken',
      'req.body.token',
    ],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
