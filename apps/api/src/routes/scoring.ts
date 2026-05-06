import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@cricket-os/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { computeInningsState, validateBallEvent, calculateDLSTarget } from '@cricket-os/scoring-engine';
import { io } from '../index';

export const scoringRouter = Router();

// ─── INNINGS ────────────────────────────────────────────────

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
  clientId:   z.string().uuid().default(() => uuidv4()),
  inningsId:  z.string().cuid(),
  batsmanId:  z.string().cuid(),
  bowlerId:   z.string().cuid(),
  runs:       z.number().int().min(0).max(6),
  extraType:  z.enum(['WIDE', 'NO_BALL', 'BYE', 'LEG_BYE', 'PENALTY']).optional().nullable(),
  extraRuns:  z.number().int().min(0).default(0),
  wicket: z.object({
    type:          z.enum(['BOWLED','CAUGHT','LBW','RUN_OUT','STUMPED','HIT_WICKET','HANDLED_BALL','OBSTRUCTING_FIELD','RETIRED_HURT','TIMED_OUT']),
    outBatsmanId:  z.string().cuid(),
    fielderId:     z.string().cuid().optional().nullable(),
  }).optional().nullable(),
});

scoringRouter.post('/ball', requireAuth, validate(ballEventSchema), async (req: AuthRequest, res, next) => {
  try {
    const { clientId, inningsId, batsmanId, bowlerId, runs, extraType, extraRuns, wicket } = req.body;

    // Idempotency
    const existing = await prisma.ballEvent.findUnique({ where: { clientId } });
    if (existing) {
      return res.json({ success: true, data: existing, meta: { idempotent: true } });
    }

    const innings = await prisma.innings.findUnique({
      where: { id: inningsId },
      include: { ballEvents: { orderBy: { rawBallNumber: 'asc' }, include: { wicket: true } } },
    });
    if (!innings) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Innings not found' } });
    if (innings.isCompleted) return res.status(422).json({ success: false, error: { code: 'INNINGS_COMPLETE', message: 'Innings is already complete' } });

    const match = await prisma.match.findUnique({ where: { id: innings.matchId } });
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });

    // Compute full innings state for validation
    const currentState = computeInningsState(
      innings.ballEvents as any,
      innings.battingTeamId,
      innings.bowlingTeamId,
      innings.id,
      innings.inningsNumber
    );

    // Build bowler over counts from current state
    const bowlerOverCounts: Record<string, number> = {};
    for (const b of currentState.bowlers) {
      bowlerOverCounts[b.playerId] = Math.floor(b.overs);
    }

    // Last over's bowler (for consecutive-over check)
    const lastOverBowlerId = currentState.currentOver.legalBallsDelivered === 0 && innings.ballEvents.length > 0
      ? (() => {
          // find last legal ball in previous over
          const prevOverBalls = innings.ballEvents.filter((e: any) => e.overNumber === currentState.currentOver.overNumber - 1);
          return prevOverBalls[prevOverBalls.length - 1]?.bowlerId ?? undefined;
        })()
      : undefined;

    const validationError = validateBallEvent(
      { batsmanId, bowlerId, runs, wicket },
      {
        inningsState:     currentState,
        maxOvers:         match.overs,
        matchFormat:      match.format as any,
        lastOverBowlerId,
        bowlerOverCounts,
      }
    );
    if (validationError) {
      return res.status(422).json({ success: false, error: { code: 'INVALID_BALL', message: validationError } });
    }

    const isLegalBall = !extraType || (extraType !== 'WIDE' && extraType !== 'NO_BALL');
    const isFreeHit   = currentState.nextBallIsFreeHit;
    const overNumber  = currentState.currentOver.overNumber;
    const ballNumber  = currentState.currentOver.legalBallsDelivered;
    const rawBallNumber = innings.ballEvents.length;
    const isBoundary  = runs === 4 && !extraType;
    const isSix       = runs === 6 && !extraType;

    // Determine innings completion after this ball
    const newWickets   = currentState.totalWickets + (wicket ? 1 : 0);
    const newLegalBalls = isLegalBall ? ballNumber + 1 : ballNumber;
    const newCompletedOvers = newLegalBalls >= 6
      ? currentState.currentOver.overNumber + 1
      : currentState.currentOver.overNumber;
    const totalOversAfter = newCompletedOvers + (newLegalBalls >= 6 ? 0 : newLegalBalls) / 10;
    const inningsNowComplete = newWickets >= 10 || (match.overs > 0 && totalOversAfter >= match.overs);

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
          extraType:  extraType ?? null,
          extraRuns,
          isLegalBall,
          isFreeHit,
          isWicket:   !!wicket,
          isBoundary,
          isSix,
        },
      });

      if (wicket) {
        await tx.wicketEvent.create({
          data: {
            ballEventId:  ball.id,
            wicketType:   wicket.type,
            outBatsmanId: wicket.outBatsmanId,
            fielderId:    wicket.fielderId ?? null,
          },
        });
      }

      // Update innings aggregate
      const completedOversUpdate = newLegalBalls >= 6
        ? innings.completedOvers + 1
        : innings.completedOvers;
      const extraBallsUpdate = newLegalBalls >= 6 ? 0 : newLegalBalls;

      await tx.innings.update({
        where: { id: inningsId },
        data: {
          totalRuns:      innings.totalRuns + runs + extraRuns,
          totalWickets:   innings.totalWickets + (wicket ? 1 : 0),
          completedOvers: completedOversUpdate,
          extraBalls:     extraBallsUpdate,
          extrasWides:    innings.extrasWides    + (extraType === 'WIDE'    ? extraRuns : 0),
          extrasNoBalls:  innings.extrasNoBalls  + (extraType === 'NO_BALL' ? extraRuns : 0),
          extrasByes:     innings.extrasByes     + (extraType === 'BYE'     ? extraRuns : 0),
          extrasLegByes:  innings.extrasLegByes  + (extraType === 'LEG_BYE' ? extraRuns : 0),
          isCompleted:    inningsNowComplete,
        },
      });

      // Auto-close match to INNINGS_BREAK / COMPLETED
      if (inningsNowComplete) {
        const reason = newWickets >= 10 ? 'ALL_OUT' : 'OVERS_COMPLETE';
        const newMatchStatus = innings.inningsNumber === 1 ? 'INNINGS_BREAK' : 'COMPLETED';
        await tx.match.update({
          where: { id: innings.matchId },
          data:  { status: newMatchStatus },
        });
        io.to(`match:${innings.matchId}`).emit('innings:complete', {
          inningsId: innings.id,
          reason,
          newMatchStatus,
        });
      }

      return ball;
    });

    io.to(`match:${innings.matchId}`).emit('ball:scored', {
      ballEvent,
      wicket: wicket ?? null,
      isFreeHit,
      inningsComplete: inningsNowComplete,
    });

    res.status(201).json({ success: true, data: { ballEvent, isFreeHit, inningsComplete: inningsNowComplete } });
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

    const lastBall = await prisma.ballEvent.findFirst({
      where: { inningsId: ball.inningsId },
      orderBy: { rawBallNumber: 'desc' },
    });
    if (lastBall?.id !== ball.id) {
      return res.status(400).json({ success: false, error: { code: 'NOT_LAST_BALL', message: 'Can only undo the last ball' } });
    }

    // Re-open innings if it was marked complete
    const wasComplete = ball.innings.isCompleted;

    await prisma.$transaction(async (tx) => {
      await tx.ballEvent.delete({ where: { id: ball.id } });

      await tx.innings.update({
        where: { id: ball.inningsId },
        data: {
          totalRuns:     { decrement: ball.runs + ball.extraRuns },
          totalWickets:  ball.isWicket ? { decrement: 1 } : undefined,
          extrasWides:   ball.extraType === 'WIDE'    ? { decrement: ball.extraRuns } : undefined,
          extrasNoBalls: ball.extraType === 'NO_BALL' ? { decrement: ball.extraRuns } : undefined,
          extrasByes:    ball.extraType === 'BYE'     ? { decrement: ball.extraRuns } : undefined,
          extrasLegByes: ball.extraType === 'LEG_BYE' ? { decrement: ball.extraRuns } : undefined,
          isCompleted:   wasComplete ? false : undefined,
        },
      });

      if (wasComplete) {
        await tx.match.update({
          where: { id: ball.matchId },
          data:  { status: 'IN_PROGRESS' },
        });
      }
    });

    io.to(`match:${ball.matchId}`).emit('ball:undone', { ballId: ball.id });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// POST /api/v1/scoring/matches/:matchId/super-over — trigger super over after a tie
scoringRouter.post('/matches/:matchId/super-over', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.matchId },
      include: { innings: { orderBy: { inningsNumber: 'asc' } } },
    });
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });
    if (match.status !== 'COMPLETED') return res.status(422).json({ success: false, error: { code: 'NOT_COMPLETE', message: 'Match must be completed (tied) to start a super over' } });

    // Verify scores are tied
    const inn1 = match.innings.find(i => i.inningsNumber === 1);
    const inn2 = match.innings.find(i => i.inningsNumber === 2);
    if (!inn1 || !inn2 || inn1.totalRuns !== inn2.totalRuns) {
      return res.status(422).json({ success: false, error: { code: 'NOT_TIED', message: 'Scores are not tied — super over not needed' } });
    }

    // Super over innings are numbered 3 and 4, 1 over each
    // Teams swap: team that batted second in main match bats first in super over
    const soInn1 = await prisma.innings.create({
      data: {
        matchId: req.params.matchId,
        inningsNumber: 3,
        battingTeamId: inn2.battingTeamId,
        bowlingTeamId: inn2.bowlingTeamId,
      },
    });

    await prisma.match.update({
      where: { id: req.params.matchId },
      data: { status: 'SUPER_OVER', overs: 1 },
    });

    io.to(`match:${req.params.matchId}`).emit('super_over:started', { innings: soInn1 });
    res.status(201).json({ success: true, data: { message: 'Super over started', innings: soInn1 } });
  } catch (err) { next(err); }
});

// GET /api/v1/scoring/innings/:inningsId
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

// POST /api/v1/scoring/matches/:matchId/dls — compute revised DLS target
scoringRouter.post('/matches/:matchId/dls', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { team2OversAvail, team2WicketsLost = 0, team2OversUsed = 0 } = req.body;
    if (typeof team2OversAvail !== 'number') {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'team2OversAvail is required' } });
    }

    const match = await prisma.match.findUnique({
      where: { id: req.params.matchId },
      include: { innings: { where: { inningsNumber: 1 }, select: { totalRuns: true, completedOvers: true, extraBalls: true } } },
    });
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });

    const inn1 = match.innings[0];
    if (!inn1) return res.status(422).json({ success: false, error: { code: 'NO_INNINGS', message: 'First innings not yet completed' } });

    const team1Overs = inn1.completedOvers + (inn1.extraBalls ?? 0) / 6;
    const result = calculateDLSTarget(inn1.totalRuns, team1Overs, team2OversAvail, team2WicketsLost, team2OversUsed);

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/v1/scoring/matches/:matchId/scorecard
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
