import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@cricket-os/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { computeInningsState, validateBallEvent } from '@cricket-os/scoring-engine';
import { io } from '../index';

export const scoringRouter = Router();

// ─── INNINGS ────────────────────────────────────────────────

// POST /api/v1/scoring/matches/:matchId/innings — start an innings
scoringRouter.post('/matches/:matchId/innings', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { battingTeamId, bowlingTeamId, inningsNumber } = req.body;

    const existing = await prisma.innings.findUnique({
      where: { matchId_inningsNumber: { matchId: req.params.matchId, inningsNumber } },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'INNINGS_EXISTS', message: 'Innings already started' } });
    }

    const innings = await prisma.innings.create({
      data: { matchId: req.params.matchId, battingTeamId, bowlingTeamId, inningsNumber },
    });

    await prisma.match.update({
      where: { id: req.params.matchId },
      data: { status: 'IN_PROGRESS' },
    });

    io.to(`match:${req.params.matchId}`).emit('innings:started', { innings });
    res.status(201).json({ success: true, data: innings });
  } catch (err) { next(err); }
});

// ─── BALL EVENTS ─────────────────────────────────────────────

const ballEventSchema = z.object({
  clientId: z.string().uuid().default(() => uuidv4()),
  inningsId: z.string().cuid(),
  batsmanId: z.string().cuid(),
  bowlerId: z.string().cuid(),
  runs: z.number().int().min(0).max(6),
  extraType: z.enum(['WIDE', 'NO_BALL', 'BYE', 'LEG_BYE', 'PENALTY']).optional().nullable(),
  extraRuns: z.number().int().min(0).default(0),
  wicket: z.object({
    type: z.enum(['BOWLED','CAUGHT','LBW','RUN_OUT','STUMPED','HIT_WICKET','HANDLED_BALL','OBSTRUCTING_FIELD','RETIRED_HURT','TIMED_OUT']),
    outBatsmanId: z.string().cuid(),
    fielderId: z.string().cuid().optional().nullable(),
  }).optional().nullable(),
});

// POST /api/v1/scoring/ball — score a ball
scoringRouter.post('/ball', requireAuth, validate(ballEventSchema), async (req: AuthRequest, res, next) => {
  try {
    const { clientId, inningsId, batsmanId, bowlerId, runs, extraType, extraRuns, wicket } = req.body;

    // Idempotency — if this clientId already exists, return the existing event
    const existing = await prisma.ballEvent.findUnique({ where: { clientId } });
    if (existing) {
      return res.json({ success: true, data: existing, meta: { idempotent: true } });
    }

    const innings = await prisma.innings.findUnique({
      where: { id: inningsId },
      include: { ballEvents: { orderBy: { rawBallNumber: 'asc' } } },
    });
    if (!innings) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Innings not found' } });

    const match = await prisma.match.findUnique({ where: { id: innings.matchId } });
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });

    // Compute current state for validation
    const currentState = computeInningsState(
      innings.ballEvents as any,
      innings.battingTeamId,
      innings.bowlingTeamId,
      innings.id,
      innings.inningsNumber
    );

    const validationError = validateBallEvent({ batsmanId, bowlerId, runs }, currentState, match.overs);
    if (validationError) {
      return res.status(422).json({ success: false, error: { code: 'INVALID_BALL', message: validationError } });
    }

    const isLegalBall = !extraType || (extraType !== 'WIDE' && extraType !== 'NO_BALL');
    const overNumber = currentState.currentOver.overNumber;
    const ballNumber = isLegalBall ? currentState.currentOver.legalBallsDelivered : currentState.currentOver.legalBallsDelivered;
    const rawBallNumber = innings.ballEvents.length;

    const isBoundary = runs === 4 && !extraType;
    const isSix = runs === 6 && !extraType;

    // Create ball event in a transaction with optional wicket
    const ballEvent = await prisma.$transaction(async (tx) => {
      const ball = await tx.ballEvent.create({
        data: {
          clientId,
          matchId: innings.matchId,
          inningsId,
          overNumber,
          ballNumber,
          rawBallNumber,
          batsmanId,
          bowlerId,
          runs,
          extraType: extraType ?? null,
          extraRuns,
          isLegalBall,
          isWicket: !!wicket,
          isBoundary,
          isSix,
        },
      });

      if (wicket) {
        await tx.wicketEvent.create({
          data: {
            ballEventId: ball.id,
            wicketType: wicket.type,
            outBatsmanId: wicket.outBatsmanId,
            fielderId: wicket.fielderId ?? null,
          },
        });
      }

      // Update innings aggregate (denormalized for fast reads)
      const totalRuns = innings.totalRuns + runs + extraRuns;
      const totalWickets = innings.totalWickets + (wicket ? 1 : 0);
      const newLegalBalls = isLegalBall
        ? currentState.currentOver.legalBallsDelivered + 1
        : currentState.currentOver.legalBallsDelivered;
      const completedOvers = newLegalBalls >= 6
        ? innings.completedOvers + 1
        : innings.completedOvers;
      const extraBalls = newLegalBalls >= 6 ? 0 : newLegalBalls;

      await tx.innings.update({
        where: { id: inningsId },
        data: {
          totalRuns,
          totalWickets,
          completedOvers,
          extraBalls,
          extrasWides: innings.extrasWides + (extraType === 'WIDE' ? extraRuns : 0),
          extrasNoBalls: innings.extrasNoBalls + (extraType === 'NO_BALL' ? extraRuns : 0),
          extrasByes: innings.extrasByes + (extraType === 'BYE' ? extraRuns : 0),
          extrasLegByes: innings.extrasLegByes + (extraType === 'LEG_BYE' ? extraRuns : 0),
        },
      });

      return ball;
    });

    // Emit real-time update to all match viewers
    io.to(`match:${innings.matchId}`).emit('ball:scored', {
      ballEvent,
      wicket: wicket ?? null,
    });

    res.status(201).json({ success: true, data: ballEvent });
  } catch (err) { next(err); }
});

// DELETE /api/v1/scoring/ball/:ballId — undo last ball
scoringRouter.delete('/ball/:ballId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const ball = await prisma.ballEvent.findUnique({
      where: { id: req.params.ballId },
      include: { innings: true, wicket: true },
    });
    if (!ball) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ball event not found' } });

    // Only allow undoing the LAST ball of an innings
    const lastBall = await prisma.ballEvent.findFirst({
      where: { inningsId: ball.inningsId },
      orderBy: { rawBallNumber: 'desc' },
    });
    if (lastBall?.id !== ball.id) {
      return res.status(400).json({ success: false, error: { code: 'NOT_LAST_BALL', message: 'Can only undo the last ball' } });
    }

    await prisma.$transaction(async (tx) => {
      await tx.ballEvent.delete({ where: { id: ball.id } });

      // Reverse the innings aggregate
      await tx.innings.update({
        where: { id: ball.inningsId },
        data: {
          totalRuns: { decrement: ball.runs + ball.extraRuns },
          totalWickets: ball.isWicket ? { decrement: 1 } : undefined,
          extrasWides: ball.extraType === 'WIDE' ? { decrement: ball.extraRuns } : undefined,
          extrasNoBalls: ball.extraType === 'NO_BALL' ? { decrement: ball.extraRuns } : undefined,
          extrasByes: ball.extraType === 'BYE' ? { decrement: ball.extraRuns } : undefined,
          extrasLegByes: ball.extraType === 'LEG_BYE' ? { decrement: ball.extraRuns } : undefined,
        },
      });
    });

    io.to(`match:${ball.matchId}`).emit('ball:undone', { ballId: ball.id });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// GET /api/v1/scoring/innings/:inningsId — full innings state (computed)
scoringRouter.get('/innings/:inningsId', async (req, res, next) => {
  try {
    const innings = await prisma.innings.findUnique({
      where: { id: req.params.inningsId },
      include: {
        ballEvents: {
          orderBy: { rawBallNumber: 'asc' },
          include: { wicket: true },
        },
      },
    });
    if (!innings) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Innings not found' } });

    const state = computeInningsState(
      innings.ballEvents as any,
      innings.battingTeamId,
      innings.bowlingTeamId,
      innings.id,
      innings.inningsNumber
    );

    res.json({ success: true, data: state });
  } catch (err) { next(err); }
});

// GET /api/v1/scoring/matches/:matchId/scorecard — full scorecard
scoringRouter.get('/matches/:matchId/scorecard', async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.matchId },
      include: {
        homeTeam: { include: { members: { include: { player: true } } } },
        awayTeam: { include: { members: { include: { player: true } } } },
        innings: {
          include: {
            ballEvents: {
              orderBy: { rawBallNumber: 'asc' },
              include: { wicket: true },
            },
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
    });

    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });

    const inningsStates = match.innings.map((inn) =>
      computeInningsState(
        inn.ballEvents as any,
        inn.battingTeamId,
        inn.bowlingTeamId,
        inn.id,
        inn.inningsNumber
      )
    );

    res.json({ success: true, data: { match, inningsStates } });
  } catch (err) { next(err); }
});
