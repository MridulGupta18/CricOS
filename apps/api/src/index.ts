import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { prisma } from '@cricket-os/db';

import { authRouter } from './routes/auth';
import { matchesRouter } from './routes/matches';
import { scoringRouter } from './routes/scoring';
import { leaguesRouter } from './routes/leagues';
import { teamsRouter } from './routes/teams';
import { playersRouter } from './routes/players';
import { searchRouter } from './routes/search';
import { sponsorsRouter } from './routes/sponsors';
import { paymentsRouter, stripeWebhookHandler } from './routes/payments';
import { adminRouter } from './routes/admin';
import { initSocketHandlers } from './socket/handlers';
import { errorHandler } from './middleware/errorHandler';
import { attachRequestId, httpLogger } from './middleware/requestContext';
import { logger } from './lib/logger';

const app = express();
const httpServer = createServer(app);

// ─── CORS POLICY ─────────────────────────────────────────────
// Allowlist explicit origins. FRONTEND_URL may carry one or many entries
// (comma-separated). Mobile (Expo Go / native bundles) does not send an
// Origin header, so it bypasses CORS entirely — which is correct.
const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000,http://localhost:8081')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function originAllowed(origin: string | undefined): boolean {
  // No Origin header — non-browser caller (mobile, curl). Allow.
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

export const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => cb(null, originAllowed(origin)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ─── REQUEST CONTEXT (must be first) ────────────────────────
app.set('trust proxy', 1); // Railway / Fly / Heroku put us behind a proxy
app.use(attachRequestId);
app.use(httpLogger);

// ─── SECURITY HEADERS ───────────────────────────────────────
app.use(helmet({
  // We don't serve HTML, so the default CSP is overkill and breaks API explorers.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: (origin, cb) => {
    if (originAllowed(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400,
}));

// ─── STRIPE WEBHOOK ─────────────────────────────────────────
// Must be mounted BEFORE express.json() — signature verification requires the
// raw body, and json() would consume the stream first.
app.post('/api/v1/payments/webhook', ...stripeWebhookHandler);

// ─── BODY PARSER ────────────────────────────────────────────
// 100kb is plenty for our payloads; ball events are ~200 bytes.
app.use(express.json({ limit: '100kb' }));

// ─── RATE LIMITING ──────────────────────────────────────────
// Scoring is intentionally permissive (a scorer can fire 200+ events in an hour).
// Auth is tight to slow brute-force. Both key by user id when authenticated so
// a noisy NAT doesn't lock out everyone behind it; falls back to IP otherwise.
//
// Note: express-rate-limit defaults the key to `req.ip`, which already handles
// IPv6 normalization. We just substitute `req.user.id` when present.
const userKey = (req: any) => req.user?.id || req.ip || 'anon';
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, keyGenerator: userKey, standardHeaders: true, legacyHeaders: false });
const authLimiter   = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,  standardHeaders: true, legacyHeaders: false });
const searchLimiter = rateLimit({ windowMs: 60 * 1000,      max: 60,  keyGenerator: userKey, standardHeaders: true, legacyHeaders: false });

app.use('/api/', globalLimiter);
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1/search', searchLimiter);

// ─── ROUTES ─────────────────────────────────────────────────
app.use('/api/v1/auth',    authRouter);
app.use('/api/v1/matches', matchesRouter);
app.use('/api/v1/scoring', scoringRouter);
app.use('/api/v1/leagues', leaguesRouter);
app.use('/api/v1/teams',   teamsRouter);
app.use('/api/v1/players', playersRouter);
app.use('/api/v1/search',  searchRouter);
app.use('/api/v1/sponsors',sponsorsRouter);
app.use('/api/v1/payments',paymentsRouter);
app.use('/api/v1/admin',   adminRouter);

// ─── HEALTH CHECKS ──────────────────────────────────────────
// /health is lightweight (process is up). /health/ready also checks the DB,
// for use as a readiness probe.
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.get('/api/v1/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.get('/health/ready', async (_, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', ts: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, 'Readiness check failed');
    res.status(503).json({ status: 'not_ready', error: 'Database unavailable' });
  }
});

// ─── SOCKET.IO ──────────────────────────────────────────────
initSocketHandlers(io);

// ─── ERROR HANDLER (must be last) ───────────────────────────
app.use(errorHandler);

// ─── START ──────────────────────────────────────────────────
const PORT = process.env.PORT ?? 4000;
const server = httpServer.listen(Number(PORT), '0.0.0.0', () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV ?? 'development' }, 'CricOS API listening');
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────
// On SIGTERM (Railway/Kubernetes) and SIGINT (Ctrl-C), stop accepting new
// connections, drain Socket.io, disconnect Prisma, then exit. A 15s hard
// deadline protects against hung connections.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  const deadline = setTimeout(() => {
    logger.warn('Forcing exit after 15s shutdown deadline');
    process.exit(1);
  }, 15_000);
  // setTimeout in Node returns NodeJS.Timeout (an object with .unref()), but
  // the @types/node setTimeout overload for browser-style returns a number.
  // Cast explicitly so we can hold the handle without TS conflating the two.
  (deadline as unknown as NodeJS.Timeout).unref();

  io.close(() => logger.info('Socket.io closed'));
  server.close(() => logger.info('HTTP server closed'));
  try { await prisma.$disconnect(); } catch { /* nothing to undo */ }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

import { sentry } from './lib/sentry';
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled rejection');
  sentry.captureException(err);
});
process.on('uncaughtException',  (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  sentry.captureException(err);
});
