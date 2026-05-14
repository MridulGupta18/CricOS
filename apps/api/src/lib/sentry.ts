// Sentry initialization.
//
// Lazy and optional: if SENTRY_DSN isn't set we expose no-op shims so calling
// code can stay un-conditional. We import @sentry/node only when actually
// initialising, so dev startup is unaffected.

import { logger } from './logger';

interface SentryShim {
  captureException(err: unknown, ctx?: any): void;
  captureMessage(msg: string, ctx?: any): void;
  init(): void;
}

const SENTRY_DSN = process.env.SENTRY_DSN;

let impl: SentryShim = {
  captureException(err: unknown) { logger.error({ err }, '[Sentry stub] captured exception'); },
  captureMessage(msg: string)    { logger.warn({ msg }, '[Sentry stub] captured message'); },
  init() { /* no-op */ },
};

if (SENTRY_DSN) {
  // Dynamic import so the SDK isn't loaded in dev/test where it's not used.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  });
  impl = {
    init() { /* already done */ },
    captureException: Sentry.captureException.bind(Sentry),
    captureMessage:   Sentry.captureMessage.bind(Sentry),
  };
  logger.info('Sentry initialized');
}

export const sentry = impl;
