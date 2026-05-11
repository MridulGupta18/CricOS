import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth';
import { matchesRouter } from './routes/matches';
import { scoringRouter } from './routes/scoring';
import { leaguesRouter } from './routes/leagues';
import { teamsRouter } from './routes/teams';
import { playersRouter } from './routes/players';
import { searchRouter } from './routes/search';
import { sponsorsRouter } from './routes/sponsors';
import { paymentsRouter } from './routes/payments';
import { adminRouter } from './routes/admin';
import { initSocketHandlers } from './socket/handlers';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// ─── MIDDLEWARE ──────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// Rate limiting — more permissive for scoring (scorer fires many events)
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

app.use('/api/', globalLimiter);
app.use('/api/v1/auth', authLimiter);

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

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.get('/api/v1/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ─── SOCKET.IO ──────────────────────────────────────────────

initSocketHandlers(io);

// ─── ERROR HANDLER (must be last) ───────────────────────────

app.use(errorHandler);

// ─── START ──────────────────────────────────────────────────

const PORT = process.env.PORT ?? 4000;
httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🏏 CricOS API running on port ${PORT}`);
});
