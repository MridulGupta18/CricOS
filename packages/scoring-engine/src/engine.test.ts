import { describe, it, expect } from 'vitest';
import {
  computeInningsState,
  validateBallEvent,
  shouldRotateStrike,
  calculateRRR,
  calculateNRR,
  maxBowlerOvers,
  isPowerplay,
} from './engine';
import type { BallEvent, ExtraType, WicketType } from '@cricket-os/shared';

// ─── FIXTURE HELPERS ─────────────────────────────────────────
// Hand-crafted ball events make these tests act as living documentation
// for how the engine handles cricket rules: strike rotation, extras,
// boundaries, wickets, free hits, partnerships, maidens.

let seq = 0;
function ball(partial: Partial<BallEvent>): BallEvent {
  seq++;
  return {
    id: `b${seq}`,
    clientId: `c${seq}`,
    matchId: 'm1',
    inningsId: 'i1',
    overNumber: 0,
    ballNumber: 0,
    rawBallNumber: seq - 1,
    batsmanId: 'P1',
    bowlerId: 'B1',
    runs: 0,
    extras: null,
    wicket: null,
    isLegalBall: true,
    isFreeHit: false,
    timestamp: new Date().toISOString(),
    ...partial,
  } as BallEvent;
}

function withExtras(type: ExtraType, runs: number, partial: Partial<BallEvent> = {}): BallEvent {
  const isLegal = type !== 'WIDE' && type !== 'NO_BALL';
  return ball({
    extras: { type, runs },
    isLegalBall: isLegal,
    ...partial,
  });
}

function wicketBall(type: WicketType, outBatsmanId: string, partial: Partial<BallEvent> = {}): BallEvent {
  return ball({
    wicket: { type, outBatsmanId },
    ...partial,
  });
}

// ─── BASIC ACCUMULATION ──────────────────────────────────────

describe('computeInningsState — basic accumulation', () => {
  it('sums runs across deliveries', () => {
    const events = [
      ball({ runs: 1, batsmanId: 'P1' }),
      ball({ runs: 4, batsmanId: 'P2' }), // odd-rotation in prev ball flips strike
      ball({ runs: 2, batsmanId: 'P2' }),
      ball({ runs: 0, batsmanId: 'P1' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state.totalRuns).toBe(7);
    expect(state.totalWickets).toBe(0);
  });

  it('emits zero state for an empty innings', () => {
    const state = computeInningsState([], 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state.totalRuns).toBe(0);
    expect(state.totalWickets).toBe(0);
    expect(state.batsmen.length).toBe(0);
  });

  it('tracks boundaries on the batsman', () => {
    const events = [
      ball({ runs: 4, batsmanId: 'P1' }),
      ball({ runs: 6, batsmanId: 'P2' }),
      ball({ runs: 4, batsmanId: 'P2' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    const p1 = state.batsmen.find(b => b.playerId === 'P1')!;
    const p2 = state.batsmen.find(b => b.playerId === 'P2')!;
    expect(p1.fours).toBe(1);
    expect(p1.sixes).toBe(0);
    expect(p2.fours).toBe(1);
    expect(p2.sixes).toBe(1);
  });
});

// ─── EXTRAS ──────────────────────────────────────────────────

describe('computeInningsState — extras', () => {
  it('records wides as extras without crediting the batsman', () => {
    const events = [
      withExtras('WIDE', 1, { runs: 0, batsmanId: 'P1' }),
      withExtras('WIDE', 1, { runs: 0, batsmanId: 'P1' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state.totalRuns).toBe(2);
    expect(state.extras.wides).toBe(2);
    const p1 = state.batsmen.find(b => b.playerId === 'P1')!;
    expect(p1.runs).toBe(0);
    expect(p1.ballsFaced).toBe(0); // wides aren't faced
  });

  it('credits no-ball runs to the batsman + extra', () => {
    const events = [
      // No-ball where the batsman hits 4: 1 (NB) + 4 (bat)
      withExtras('NO_BALL', 1, { runs: 4, batsmanId: 'P1' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state.totalRuns).toBe(5);
    expect(state.extras.noBalls).toBe(1);
    const p1 = state.batsmen.find(b => b.playerId === 'P1')!;
    expect(p1.runs).toBe(4);
    expect(p1.fours).toBe(1);
  });

  it('credits byes/legbyes as extras only', () => {
    const events = [withExtras('BYE', 4, { runs: 0, batsmanId: 'P1' })];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state.totalRuns).toBe(4);
    expect(state.extras.byes).toBe(4);
    const p1 = state.batsmen.find(b => b.playerId === 'P1')!;
    expect(p1.runs).toBe(0);
    expect(p1.fours).toBe(0); // byes are not batsman boundaries
  });
});

// ─── FREE HIT ─────────────────────────────────────────────────

describe('computeInningsState — free hit', () => {
  it('arms a free hit on the ball AFTER a no-ball', () => {
    const events = [
      withExtras('NO_BALL', 1, { runs: 0, batsmanId: 'P1' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state.nextBallIsFreeHit).toBe(true);
  });

  it('keeps free hit armed through a wide (Law 21.15)', () => {
    const events = [
      withExtras('NO_BALL', 1, { runs: 0, batsmanId: 'P1' }),
      withExtras('WIDE',    1, { runs: 0, batsmanId: 'P1' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state.nextBallIsFreeHit).toBe(true);
  });

  it('clears free hit after a legal delivery', () => {
    const events = [
      withExtras('NO_BALL', 1, { runs: 0, batsmanId: 'P1' }),
      ball({ runs: 1, batsmanId: 'P1' }), // legal delivery — free hit consumed
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state.nextBallIsFreeHit).toBe(false);
  });
});

// ─── WICKETS & PARTNERSHIPS ──────────────────────────────────

describe('computeInningsState — wickets', () => {
  it('counts a real dismissal but NOT a retired-hurt', () => {
    const events = [
      ball({ runs: 0, batsmanId: 'P1' }),
      wicketBall('BOWLED', 'P1', { batsmanId: 'P1' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state.totalWickets).toBe(1);

    const events2 = [
      ball({ runs: 0, batsmanId: 'P1' }),
      wicketBall('RETIRED_HURT', 'P1', { batsmanId: 'P1' }),
    ];
    const state2 = computeInningsState(events2, 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state2.totalWickets).toBe(0);
    const p1 = state2.batsmen.find(b => b.playerId === 'P1')!;
    expect(p1.isRetiredHurt).toBe(true);
    expect(p1.isOut).toBe(false);
  });

  it('records fall-of-wickets in order', () => {
    const events = [
      ball({ runs: 4, batsmanId: 'P1' }),
      wicketBall('BOWLED', 'P1', { batsmanId: 'P1' }),
      ball({ runs: 2, batsmanId: 'P3' }),
      wicketBall('LBW', 'P3', { batsmanId: 'P3' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    expect(state.fallOfWickets).toHaveLength(2);
    expect(state.fallOfWickets[0].wicketNumber).toBe(1);
    expect(state.fallOfWickets[0].runs).toBe(4);
    expect(state.fallOfWickets[1].wicketNumber).toBe(2);
    expect(state.fallOfWickets[1].runs).toBe(6);
  });

  it('credits the bowler only for valid bowler-credited dismissals', () => {
    const events = [
      // Bowled — bowler gets credit
      wicketBall('BOWLED', 'P1', { batsmanId: 'P1' }),
      ball({ runs: 0, batsmanId: 'P3', bowlerId: 'B1' }),
      // Run out — bowler does NOT get credit
      wicketBall('RUN_OUT', 'P3', { batsmanId: 'P3' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    const b1 = state.bowlers.find(b => b.playerId === 'B1')!;
    expect(b1.wickets).toBe(1);
    expect(state.totalWickets).toBe(2);
  });
});

// ─── MAIDENS ─────────────────────────────────────────────────

describe('computeInningsState — maidens', () => {
  it('counts a true maiden over (no runs from bat, no wides/no-balls)', () => {
    const events = Array.from({ length: 6 }, () => ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }));
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    const b1 = state.bowlers.find(b => b.playerId === 'B1')!;
    expect(b1.maidens).toBe(1);
  });

  it('does NOT count an over with a wide as a maiden', () => {
    const events = [
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      withExtras('WIDE', 1, { runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    const b1 = state.bowlers.find(b => b.playerId === 'B1')!;
    expect(b1.maidens).toBe(0);
  });

  it('counts an over with only byes as a maiden (no bat runs)', () => {
    const events = [
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      withExtras('BYE', 4, { runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
      ball({ runs: 0, batsmanId: 'P1', bowlerId: 'B1' }),
    ];
    const state = computeInningsState(events, 'T-BAT', 'T-BOWL', 'i1', 1);
    const b1 = state.bowlers.find(b => b.playerId === 'B1')!;
    expect(b1.maidens).toBe(1);
  });
});

// ─── VALIDATION ──────────────────────────────────────────────

describe('validateBallEvent', () => {
  const baseState = computeInningsState([], 'T-BAT', 'T-BOWL', 'i1', 1);

  it('requires a batsman and bowler', () => {
    expect(validateBallEvent({ runs: 0 } as any, {
      inningsState: baseState, maxOvers: 20, matchFormat: 'T20', bowlerOverCounts: {},
    })).toMatch(/Batsman/);
  });

  it('rejects runs outside 0–6', () => {
    expect(validateBallEvent({ batsmanId: 'P1', bowlerId: 'B1', runs: 7 } as any, {
      inningsState: baseState, maxOvers: 20, matchFormat: 'T20', bowlerOverCounts: {},
    })).toMatch(/Invalid run/);
  });

  it('rejects consecutive overs by the same bowler', () => {
    expect(validateBallEvent({ batsmanId: 'P1', bowlerId: 'B1', runs: 0 } as any, {
      inningsState: baseState,
      maxOvers: 20,
      matchFormat: 'T20',
      lastOverBowlerId: 'B1',
      bowlerOverCounts: {},
    })).toMatch(/consecutive/);
  });

  it('rejects free-hit BOWLED dismissals', () => {
    const state = { ...baseState, nextBallIsFreeHit: true };
    expect(validateBallEvent({
      batsmanId: 'P1', bowlerId: 'B1', runs: 0,
      wicket: { type: 'BOWLED', outBatsmanId: 'P1' },
    } as any, {
      inningsState: state, maxOvers: 20, matchFormat: 'T20', bowlerOverCounts: {},
    })).toMatch(/not a valid dismissal on a free hit/);
  });

  it('allows free-hit RUN_OUT', () => {
    const state = { ...baseState, nextBallIsFreeHit: true };
    expect(validateBallEvent({
      batsmanId: 'P1', bowlerId: 'B1', runs: 1,
      wicket: { type: 'RUN_OUT', outBatsmanId: 'P1' },
    } as any, {
      inningsState: state, maxOvers: 20, matchFormat: 'T20', bowlerOverCounts: {},
    })).toBeNull();
  });

  it('caps bowler at totalOvers/5 for T20 (4 overs)', () => {
    expect(validateBallEvent({ batsmanId: 'P1', bowlerId: 'B1', runs: 0 } as any, {
      inningsState: baseState,
      maxOvers: 20,
      matchFormat: 'T20',
      bowlerOverCounts: { B1: 4 },
    })).toMatch(/maximum 4 overs/);
  });
});

// ─── HELPERS ─────────────────────────────────────────────────

describe('helpers', () => {
  it('shouldRotateStrike rotates on odd or end-of-over', () => {
    expect(shouldRotateStrike(1, false)).toBe(true);
    expect(shouldRotateStrike(2, false)).toBe(false);
    expect(shouldRotateStrike(0, true)).toBe(true);
  });

  it('calculateRRR computes runs required per over', () => {
    // (target, currentRuns, currentOvers, maxOvers) → runs / overs_remaining
    expect(calculateRRR(180, 100, 10, 20)).toBeCloseTo(8, 3);   // 80 / 10 = 8
    expect(calculateRRR(180, 180, 10, 20)).toBeCloseTo(0, 3);   // already chased
    expect(calculateRRR(180, 100, 20, 20)).toBe(Infinity);      // no overs left
  });

  it('calculateNRR returns scored/balled difference', () => {
    expect(calculateNRR(180, 20, 150, 20)).toBeCloseTo(1.5, 3);
  });

  it('maxBowlerOvers = floor(totalOvers * 0.2)', () => {
    expect(maxBowlerOvers(20)).toBe(4);
    expect(maxBowlerOvers(50)).toBe(10);
    expect(maxBowlerOvers(10)).toBe(2);
  });

  it('isPowerplay is true for first 6 overs of T20', () => {
    expect(isPowerplay(0, 'T20')).toBe(true);
    expect(isPowerplay(5, 'T20')).toBe(true);
    expect(isPowerplay(6, 'T20')).toBe(false);
  });
});
