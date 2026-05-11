import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@cricket-os/db';
import { requireAuth, requirePermission, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { computeInningsState, validateBallEvent, calculateDLSTarget } from '@cricket-os/scoring-engine';
import { io } from '../index';

export const scoringRouter = Router();

// ─── INNINGS ────────────────────────────────────────────────

scoringRouter.post('/matches/:matchId/innings', requireAuth, requirePermission('match:start_innings'), async (req: AuthRequest, res, next) => {
  try {
    const { battingTeamId, bowlingTeamId, inningsNumber } = req.body;

    const existing = await prisma.innings.findUnique({
      where: { matchId_inningsNumber: { matchId: req.params.matchId, inningsNumber } },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'INNINGS_EXISTS', message: 'Innings already started' } });
    }

    // Validate batting order matches toss decision (innings 1 only)
    if (inningsNumber === 1) {
      const match = await prisma.match.findUnique({
        where: { id: req.params.matchId },
        select: { tossWinnerId: true, tossDecision: true, homeTeamId: true, awayTeamId: true },
      });
      if (match?.tossWinnerId && match.tossDecision) {
        const expectedBattingTeam = match.tossDecision === 'BAT'
          ? match.tossWinnerId
          : (match.homeTeamId === match.tossWinnerId ? match.awayTeamId : match.homeTeamId);
        if (battingTeamId !== expectedBattingTeam) {
          return res.status(422).json({
            success: false,
            error: { code: 'TOSS_ORDER_MISMATCH', message: 'Batting team does not match toss decision' },
          });
        }
      }
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

scoringRouter.post('/ball', requireAuth, requirePermission('match:score'), validate(ballEventSchema), async (req: AuthRequest, res, next) => {
  try {
    const { clientId, inningsId, batsmanId, bowlerId, runs, extraType, extraRuns, wicket } = req.body;

    // Idempotency
    const existing = await prisma.ballEvent.findUnique({ where: { clientId } });
    if (existing) {
      return res.json({ success: true, data: existing, meta: { idempotent: true } });
    }

    const innings = await prisma.innings.findUnique({
      where: { id: inningsId },
      include: { ballEvents: { where: { deletedAt: null }, orderBy: { rawBallNumber: 'asc' }, include: { wicket: true } } },
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
    // A four or six hit off a no-ball still counts as a batting boundary.
    // Wides, byes, leg-byes are not bat-hit boundaries.
    const isBatHit    = !extraType || extraType === 'NO_BALL';
    const isBoundary  = runs === 4 && isBatHit;
    const isSix       = runs === 6 && isBatHit;

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

      // Auto-close match — handle normal completion, tie → super over, and super over result
      if (inningsNowComplete) {
        const reason = newWickets >= 10 ? 'ALL_OUT' : 'OVERS_COMPLETE';
        const newTotalRuns = innings.totalRuns + runs + extraRuns;
        let newMatchStatus: 'INNINGS_BREAK' | 'COMPLETED' | 'SUPER_OVER' = 'COMPLETED';

        if (innings.inningsNumber === 1) {
          newMatchStatus = 'INNINGS_BREAK';

        } else if (innings.inningsNumber === 2) {
          // Check if scores are tied — auto-start super over
          const inn1 = await tx.innings.findFirst({
            where: { matchId: innings.matchId, inningsNumber: 1 },
            select: { totalRuns: true },
          });
          if (inn1 && newTotalRuns === inn1.totalRuns) {
            newMatchStatus = 'SUPER_OVER';
            // Team that batted 2nd in main match bats first in super over
            await tx.innings.create({
              data: {
                matchId: innings.matchId,
                inningsNumber: 3,
                battingTeamId: innings.battingTeamId,
                bowlingTeamId: innings.bowlingTeamId,
              },
            });
            await tx.match.update({ where: { id: innings.matchId }, data: { overs: 1 } });
            io.to(`match:${innings.matchId}`).emit('super_over:started', { innings: 3 });
          }

        } else if (innings.inningsNumber === 3) {
          // Super over innings 1 complete — auto-create innings 4 for the other team
          newMatchStatus = 'SUPER_OVER';
          await tx.innings.create({
            data: {
              matchId: innings.matchId,
              inningsNumber: 4,
              battingTeamId: innings.bowlingTeamId,  // teams swap
              bowlingTeamId: innings.battingTeamId,
            },
          });

        } else if (innings.inningsNumber === 4) {
          // Super over complete — determine winner by comparing innings 3 vs 4
          const inn3 = await tx.innings.findFirst({
            where: { matchId: innings.matchId, inningsNumber: 3 },
            select: { totalRuns: true, battingTeamId: true },
          });
          if (inn3) {
            const winnerId = newTotalRuns > inn3.totalRuns
              ? innings.battingTeamId
              : newTotalRuns < inn3.totalRuns
              ? inn3.battingTeamId
              : null; // another tie (extremely rare — declared no-result)
            if (winnerId) {
              await tx.match.update({
                where: { id: innings.matchId },
                data: { winnerId, resultType: 'WIN' },
              });
            }
          }
        }

        await tx.match.update({ where: { id: innings.matchId }, data: { status: newMatchStatus } });
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

    // Recompute career stats for involved players after match finishes (fire-and-forget)
    if (inningsNowComplete && innings.inningsNumber >= 2) {
      recomputeCareerStatsForMatch(innings.matchId).catch(() => {});
    }

    res.status(201).json({ success: true, data: { ballEvent, isFreeHit, inningsComplete: inningsNowComplete } });
  } catch (err) { next(err); }
});

// DELETE /api/v1/scoring/ball/:ballId — undo last ball (soft-delete for audit trail)
scoringRouter.delete('/ball/:ballId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const ball = await prisma.ballEvent.findUnique({
      where: { id: req.params.ballId, deletedAt: null },
      include: { innings: true, wicket: true },
    });
    if (!ball) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ball event not found' } });

    // Must be the last non-deleted ball of this innings
    const lastBall = await prisma.ballEvent.findFirst({
      where: { inningsId: ball.inningsId, deletedAt: null },
      orderBy: { rawBallNumber: 'desc' },
    });
    if (lastBall?.id !== ball.id) {
      return res.status(400).json({ success: false, error: { code: 'NOT_LAST_BALL', message: 'Can only undo the last ball' } });
    }

    const wasComplete = ball.innings.isCompleted;

    await prisma.$transaction(async (tx) => {
      // Soft-delete: preserve the record for audit, just mark deleted
      await tx.ballEvent.update({ where: { id: ball.id }, data: { deletedAt: new Date() } });

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
          where: { deletedAt: null },
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
              where: { deletedAt: null },
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

// ─── CAREER STATS RECOMPUTE ──────────────────────────────────
// Called after a match's final innings completes.
// Recomputes PlayerCareerStats for every player who batted or bowled.

async function recomputeCareerStatsForMatch(matchId: string): Promise<void> {
  const BOWLER_CREDITED = ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'];

  // Collect all unique player IDs involved in this match
  const balls = await prisma.ballEvent.findMany({
    where: { matchId },
    include: { wicket: true },
  });
  const playerIds = new Set<string>();
  for (const b of balls) {
    playerIds.add(b.batsmanId);
    playerIds.add(b.bowlerId);
    if (b.wicket?.fielderId) playerIds.add(b.wicket.fielderId);
    if (b.wicket?.outBatsmanId) playerIds.add(b.wicket.outBatsmanId);
  }

  for (const playerId of playerIds) {
    try {
      // ── Batting ────────────────────────────────────────────
      const battingBalls = await prisma.ballEvent.findMany({
        where: { batsmanId: playerId },
        include: { wicket: true, innings: { select: { matchId: true } } },
      });

      const batByInnings: Record<string, { runs: number; balls: number; fours: number; sixes: number; isOut: boolean; matchId: string }> = {};
      for (const b of battingBalls) {
        const key = b.inningsId;
        if (!batByInnings[key]) batByInnings[key] = { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, matchId: b.innings.matchId };
        if (b.extraType !== 'WIDE') batByInnings[key].balls++;
        if (!b.extraType || (b.extraType !== 'BYE' && b.extraType !== 'LEG_BYE' && b.extraType !== 'WIDE')) {
          batByInnings[key].runs += b.runs;
          // Recompute from runs value — don't trust stored flags which may predate this fix
          const isBatHitBall = !b.extraType || b.extraType === 'NO_BALL';
          if (b.runs === 4 && isBatHitBall) batByInnings[key].fours++;
          if (b.runs === 6 && isBatHitBall) batByInnings[key].sixes++;
        }
        // RETIRED_HURT is not a dismissal (Law 26/37) — do not mark as out
        if (b.wicket && b.wicket.outBatsmanId === playerId && b.wicket.wicketType !== 'RETIRED_HURT') {
          batByInnings[key].isOut = true;
        }
      }

      const batInningsList = Object.values(batByInnings);
      const battingMatches = new Set(batInningsList.map(i => i.matchId)).size;
      const battingInnings = batInningsList.length;
      const battingRuns    = batInningsList.reduce((s, i) => s + i.runs, 0);
      const battingBalls2  = batInningsList.reduce((s, i) => s + i.balls, 0);
      const battingFours   = batInningsList.reduce((s, i) => s + i.fours, 0);
      const battingSixes   = batInningsList.reduce((s, i) => s + i.sixes, 0);
      const battingNotOuts = batInningsList.filter(i => !i.isOut).length;
      const dismissals     = battingInnings - battingNotOuts;
      const battingHighScore = Math.max(0, ...batInningsList.map(i => i.runs));
      const battingHalfCenturies = batInningsList.filter(i => i.runs >= 50 && i.runs < 100).length;
      const battingCenturies     = batInningsList.filter(i => i.runs >= 100).length;
      const battingAverage   = dismissals > 0 ? battingRuns / dismissals : battingRuns;
      const battingStrikeRate = battingBalls2 > 0 ? (battingRuns / battingBalls2) * 100 : 0;

      // ── Bowling ────────────────────────────────────────────
      const bowlingBalls = await prisma.ballEvent.findMany({
        where: { bowlerId: playerId },
        include: { wicket: true, innings: { select: { matchId: true } } },
      });

      const bowlByInnings: Record<string, { balls: number; runs: number; wickets: number; matchId: string; overMap: Record<number, { runs: number; legal: number; hasExtra: boolean }> }> = {};
      for (const b of bowlingBalls) {
        const key = b.inningsId;
        if (!bowlByInnings[key]) bowlByInnings[key] = { balls: 0, runs: 0, wickets: 0, matchId: b.innings.matchId, overMap: {} };
        if (b.isLegalBall) bowlByInnings[key].balls++;
        if (b.extraType !== 'BYE' && b.extraType !== 'LEG_BYE') {
          bowlByInnings[key].runs += b.runs + b.extraRuns;
        }
        if (b.wicket && BOWLER_CREDITED.includes(b.wicket.wicketType)) bowlByInnings[key].wickets++;
        const ov = b.overNumber;
        if (!bowlByInnings[key].overMap[ov]) bowlByInnings[key].overMap[ov] = { runs: 0, legal: 0, hasExtra: false };
        if (b.isLegalBall) bowlByInnings[key].overMap[ov].legal++;
        if (b.extraType !== 'BYE' && b.extraType !== 'LEG_BYE') bowlByInnings[key].overMap[ov].runs += b.runs + b.extraRuns;
        if (b.extraType === 'WIDE' || b.extraType === 'NO_BALL') bowlByInnings[key].overMap[ov].hasExtra = true;
      }

      const bowlInningsList = Object.values(bowlByInnings);
      const bowlingMatches  = new Set(bowlInningsList.map(i => i.matchId)).size;
      const bowlingBalls2   = bowlInningsList.reduce((s, i) => s + i.balls, 0);
      const bowlingRuns2    = bowlInningsList.reduce((s, i) => s + i.runs, 0);
      const bowlingWickets  = bowlInningsList.reduce((s, i) => s + i.wickets, 0);
      let bowlingMaidens = 0;
      let fiveWicketHauls = 0;
      let bowlBestWkts = 0; let bowlBestRuns = 9999;
      for (const inn of bowlInningsList) {
        for (const ov of Object.values(inn.overMap)) {
          if (ov.legal >= 6 && ov.runs === 0 && !ov.hasExtra) bowlingMaidens++;
        }
        if (inn.wickets >= 5) fiveWicketHauls++;
        if (inn.wickets > bowlBestWkts || (inn.wickets === bowlBestWkts && inn.runs < bowlBestRuns)) {
          bowlBestWkts = inn.wickets; bowlBestRuns = inn.runs;
        }
      }
      const bowlingOvers = bowlingBalls2 / 6;
      const bowlingAverage   = bowlingWickets > 0 ? bowlingRuns2 / bowlingWickets : 0;
      const bowlingEconomy   = bowlingOvers > 0 ? bowlingRuns2 / bowlingOvers : 0;
      const bowlingStrikeRate = bowlingWickets > 0 ? bowlingBalls2 / bowlingWickets : 0;

      // ── Fielding ───────────────────────────────────────────
      const [catches, runOuts, stumpings] = await Promise.all([
        prisma.wicketEvent.count({ where: { fielderId: playerId, wicketType: 'CAUGHT' } }),
        prisma.wicketEvent.count({ where: { fielderId: playerId, wicketType: 'RUN_OUT' } }),
        prisma.wicketEvent.count({ where: { fielderId: playerId, wicketType: 'STUMPED' } }),
      ]);

      // Upsert career stats
      await prisma.playerCareerStats.upsert({
        where: { playerId },
        create: {
          playerId, battingMatches, battingInnings, battingRuns, battingBalls: battingBalls2,
          battingHighScore, battingFours, battingSixes, battingHalfCenturies, battingCenturies,
          battingNotOuts, battingAverage, battingStrikeRate,
          bowlingMatches, bowlingBallsDelivered: bowlingBalls2, bowlingRuns: bowlingRuns2,
          bowlingWickets, bowlingMaidens, bowlingBestFiguresWickets: bowlBestWkts,
          bowlingBestFiguresRuns: bowlBestWkts > 0 ? bowlBestRuns : 0,
          bowlingAverage, bowlingEconomy, bowlingStrikeRate, fiveWicketHauls,
          catches, runOuts, stumpings,
        },
        update: {
          battingMatches, battingInnings, battingRuns, battingBalls: battingBalls2,
          battingHighScore, battingFours, battingSixes, battingHalfCenturies, battingCenturies,
          battingNotOuts, battingAverage, battingStrikeRate,
          bowlingMatches, bowlingBallsDelivered: bowlingBalls2, bowlingRuns: bowlingRuns2,
          bowlingWickets, bowlingMaidens, bowlingBestFiguresWickets: bowlBestWkts,
          bowlingBestFiguresRuns: bowlBestWkts > 0 ? bowlBestRuns : 0,
          bowlingAverage, bowlingEconomy, bowlingStrikeRate, fiveWicketHauls,
          catches, runOuts, stumpings,
        },
      });
    } catch {
      // Skip individual player failures — don't block response
    }
  }
}
