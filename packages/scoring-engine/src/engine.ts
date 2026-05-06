import {
  BallEvent,
  BallValidationContext,
  BatsmanInnings,
  BowlerInnings,
  CurrentOverState,
  ExtrasBreakdown,
  FallOfWicket,
  InningsState,
  MatchFormat,
  Partnership,
} from '@cricket-os/shared';
import {
  BALLS_PER_OVER,
  BOWLER_CREDITED_WICKETS,
  BOWLER_MAX_OVERS_RATIO,
  FREE_HIT_SAFE_WICKET_TYPES,
  ILLEGAL_DELIVERY_EXTRAS,
  POWERPLAY_OVERS,
} from '@cricket-os/shared';

// ============================================================
// SCORING ENGINE  — pure functions, no DB calls.
// Single source of truth for all cricket scoring logic.
// ============================================================

export function computeInningsState(
  events: BallEvent[],
  battingTeamId: string,
  bowlingTeamId: string,
  inningsId: string,
  inningsNumber: number,
  target?: number
): InningsState {
  const batsmen   = new Map<string, BatsmanInnings>();
  const bowlers   = new Map<string, BowlerInnings>();
  const fallOfWickets: FallOfWicket[] = [];

  let totalRuns      = 0;
  let totalWickets   = 0;
  let completedOvers = 0;
  let currentBallInOver = 0;

  const extras: ExtrasBreakdown = { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0, total: 0 };

  // Strike tracking — derived purely from event order + rotation rules
  let strikerId: string | null    = null;
  let nonStrikerId: string | null = null;

  // Free hit — the ball AFTER a no-ball is a free hit
  let nextIsFreeHit = false;

  // Maiden tracking — track each over's run/illegality state
  let overRunsFromBat  = 0;  // bat runs + no-ball extras (not byes/legbyes)
  let overHasWideOrNB  = false;
  const overBalls: BallEvent[] = [];

  // Partnership tracking
  let partnershipRuns  = 0;
  let partnershipBalls = 0;
  let partnershipStart = 0; // totalRuns at partnership start

  for (const event of events) {
    const totalExtras = event.extras?.runs ?? 0;
    const runsOnBall  = event.runs + totalExtras;
    totalRuns += runsOnBall;

    // ── Initialize striker from first ball (before any wicket/rotation logic) ─
    if (strikerId === null) {
      strikerId = event.batsmanId;
    }

    // ── Batsman init ──────────────────────────────────────
    if (!batsmen.has(event.batsmanId)) {
      batsmen.set(event.batsmanId, initBatsman(event.batsmanId));
    }
    const batsman = batsmen.get(event.batsmanId)!;

    // ── Bowler init ───────────────────────────────────────
    if (!bowlers.has(event.bowlerId)) {
      bowlers.set(event.bowlerId, initBowler(event.bowlerId));
    }
    const bowler = bowlers.get(event.bowlerId)!;

    // ── Extras ────────────────────────────────────────────
    const extraType = event.extras?.type ?? null;
    if (extraType) {
      switch (extraType) {
        case 'WIDE':    extras.wides    += totalExtras; bowler.wides++;  break;
        case 'NO_BALL': extras.noBalls  += totalExtras; bowler.noBalls++; break;
        case 'BYE':     extras.byes     += totalExtras; break;
        case 'LEG_BYE': extras.legByes  += totalExtras; break;
        case 'PENALTY': extras.penalties += totalExtras; break;
      }
      extras.total += totalExtras;
    }

    // ── Bat runs (not byes/legbyes/wides) ────────────────
    const isBatRun = !extraType || (extraType !== 'BYE' && extraType !== 'LEG_BYE' && extraType !== 'WIDE');
    if (isBatRun && event.runs > 0) {
      batsman.runs += event.runs;
      if (event.runs === 4) batsman.fours++;
      if (event.runs === 6) batsman.sixes++;
    }

    // ── Bowler runs (bat + no-ball extras; byes/legbyes not charged) ──
    if (extraType !== 'BYE' && extraType !== 'LEG_BYE') {
      bowler.runs += event.runs + totalExtras;
    }

    // ── Balls faced (wides don't count) ──────────────────
    if (extraType !== 'WIDE') {
      batsman.ballsFaced++;
    }

    // ── Wicket ────────────────────────────────────────────
    if (event.wicket) {
      // On a free hit, only certain wicket types are allowed (run-out etc.)
      // The API enforces this; engine just records it.
      totalWickets++;
      batsman.isOut   = true;
      batsman.isNotOut = false;
      batsman.wicket  = event.wicket;

      if (BOWLER_CREDITED_WICKETS.includes(event.wicket.type as any)) {
        bowler.wickets++;
      }

      fallOfWickets.push({
        wicketNumber: totalWickets,
        runs:  totalRuns,
        overs: completedOvers + currentBallInOver / 10,
        playerId: event.wicket.outBatsmanId,
      });

      // Runs completed before the dismissal still count for strike rotation.
      // Apply rotation FIRST (odd runs = batsmen crossed), THEN nullify out batsman.
      if (event.runs % 2 !== 0) {
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }
      if (event.wicket.outBatsmanId === strikerId) {
        strikerId = null; // new batsman will set this on their first ball
      } else {
        nonStrikerId = null; // non-striker was run out (or crossed and dismissed)
      }

      // Reset partnership
      partnershipRuns  = 0;
      partnershipBalls = 0;
      partnershipStart = totalRuns;
    }

    // ── Legal ball counting and over management ───────────
    const isLegal = event.isLegalBall;
    if (isLegal) {
      currentBallInOver++;
      partnershipBalls++;
    }

    // Track for maiden calculation
    if (extraType === 'WIDE' || extraType === 'NO_BALL') overHasWideOrNB = true;
    if (isBatRun && event.runs > 0)  overRunsFromBat += event.runs;
    if (extraType === 'NO_BALL')     overRunsFromBat += totalExtras;

    // ── Over complete ─────────────────────────────────────
    if (isLegal && currentBallInOver >= BALLS_PER_OVER) {
      // Check maiden: no runs off bat, no wides/no-balls in this over
      const isMaiden = overRunsFromBat === 0 && !overHasWideOrNB;
      if (isMaiden) bowler.maidens++;

      // Record completed overs for the bowler
      bowler.overs = Math.floor(bowler.overs) + 1;

      completedOvers++;
      currentBallInOver = 0;
      overBalls.length = 0;
      overRunsFromBat  = 0;
      overHasWideOrNB  = false;

      // End of over: both batsmen cross ends unconditionally.
      // Wicket block already nullified the dismissed batsman, so swapping here
      // correctly puts the surviving batsman on strike for the new over.
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
    } else if (isLegal && !event.wicket) {
      // Mid-over: rotate strike on odd runs (wicket balls handled in wicket block above)
      if (event.runs % 2 !== 0) {
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }
    }

    // (striker init was handled at top of loop; after a wicket, strikerId is null
    //  and will be set to the new batsman on their first ball)

    // ── Partnership accumulation ──────────────────────────
    if (isBatRun) partnershipRuns += event.runs;
    // byes/legbyes count towards partnership (running happened)
    if (extraType === 'BYE' || extraType === 'LEG_BYE') {
      partnershipRuns += totalExtras;
    }

    // ── Free hit tracking ─────────────────────────────────
    nextIsFreeHit = extraType === 'NO_BALL';

    // Track current over balls
    overBalls.push(event);
  }

  // ── Set isOnStrike in batsmen map ─────────────────────────
  for (const [id, bat] of batsmen) {
    bat.isOnStrike = id === strikerId;
    // Strike rate
    bat.strikeRate = bat.ballsFaced > 0 ? (bat.runs / bat.ballsFaced) * 100 : 0;
  }

  // ── Bowler economy ────────────────────────────────────────
  for (const [, bowl] of bowlers) {
    const overs = bowl.overs + (completedOvers === Math.floor(bowl.overs) ? currentBallInOver / BALLS_PER_OVER : 0);
    bowl.economy = overs > 0 ? bowl.runs / overs : 0;
  }

  // ── Determine non-striker: active batsman who is not the striker ──
  const activeBatsmen = Array.from(batsmen.values()).filter(b => !b.isOut);
  if (strikerId && !nonStrikerId && activeBatsmen.length >= 2) {
    const other = activeBatsmen.find(b => b.playerId !== strikerId);
    if (other) nonStrikerId = other.playerId;
  }

  // ── Current partnership ───────────────────────────────────
  let currentPartnership: Partnership | null = null;
  if (strikerId && nonStrikerId) {
    currentPartnership = {
      batsmanId1: strikerId,
      batsmanId2: nonStrikerId,
      runs:  partnershipRuns,
      balls: partnershipBalls,
    };
  }

  // ── Innings complete? ─────────────────────────────────────
  const maxOversFromContext = 0; // passed separately; checked in validateBallEvent
  const isComplete = totalWickets >= 10;

  const currentOverState: CurrentOverState = {
    overNumber:          completedOvers,
    legalBallsDelivered: currentBallInOver,
    balls:               overBalls.slice(),
    bowlerId:            events[events.length - 1]?.bowlerId ?? '',
    runsInOver:          overRunsFromBat,
    isMaidenCandidate:   !overHasWideOrNB && overRunsFromBat === 0,
  };

  return {
    inningsId,
    inningsNumber,
    battingTeamId,
    bowlingTeamId,
    totalRuns,
    totalWickets,
    totalOvers: completedOvers + currentBallInOver / 10,
    extras,
    currentOver:      currentOverState,
    batsmen:          Array.from(batsmen.values()),
    bowlers:          Array.from(bowlers.values()),
    fallOfWickets,
    currentPartnership,
    currentStrikerId:    strikerId,
    currentNonStrikerId: nonStrikerId,
    nextBallIsFreeHit:   nextIsFreeHit,
    isComplete,
    target,
  };
}

// ──────────────────────────────────────────────────────────────
// VALIDATION
// ──────────────────────────────────────────────────────────────

export function validateBallEvent(
  event: Partial<BallEvent> & { wicket?: any },
  ctx: BallValidationContext
): string | null {
  const { inningsState, maxOvers, matchFormat, lastOverBowlerId, bowlerOverCounts } = ctx;

  if (!event.batsmanId) return 'Batsman is required';
  if (!event.bowlerId)  return 'Bowler is required';
  if (event.runs === undefined || event.runs < 0 || event.runs > 6) return 'Invalid run value (0–6)';

  // Innings already complete
  if (inningsState.totalWickets >= 10) return 'All wickets fallen — innings is complete';
  if (maxOvers > 0 && inningsState.totalOvers >= maxOvers) return 'Over limit reached — innings is complete';

  // Bowler overs limit
  if (maxOvers > 0) {
    const maxBowlerOvers = Math.round(maxOvers * BOWLER_MAX_OVERS_RATIO);
    const bowlerDone     = bowlerOverCounts[event.bowlerId!] ?? 0;
    if (bowlerDone >= maxBowlerOvers) {
      return `Bowler has already bowled their maximum ${maxBowlerOvers} overs`;
    }
  }

  // No consecutive overs by the same bowler
  const isStartOfNewOver = inningsState.currentOver.legalBallsDelivered === 0;
  if (isStartOfNewOver && lastOverBowlerId && lastOverBowlerId === event.bowlerId) {
    return 'Same bowler cannot bowl consecutive overs';
  }

  // Free hit: only run-out type wickets are allowed
  if (inningsState.nextBallIsFreeHit && event.wicket) {
    const safeOnFreeHit = !FREE_HIT_SAFE_WICKET_TYPES.includes(event.wicket.type);
    if (!safeOnFreeHit) {
      return `Batsman cannot be dismissed ${event.wicket.type} on a free hit`;
    }
  }

  return null;
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

export function shouldRotateStrike(runs: number, isEndOfOver: boolean): boolean {
  if (isEndOfOver) return true;
  return runs % 2 !== 0;
}

export function calculateRRR(
  target: number,
  currentRuns: number,
  currentOvers: number,
  maxOvers: number
): number {
  const runsNeeded    = target - currentRuns;
  const oversRemaining = maxOvers - currentOvers;
  if (oversRemaining <= 0) return Infinity;
  return runsNeeded / oversRemaining;
}

export function calculateNRR(
  runsScored: number,
  oversPlayedBatting: number,
  runsConceded: number,
  oversPlayedBowling: number
): number {
  if (oversPlayedBatting === 0 || oversPlayedBowling === 0) return 0;
  return (runsScored / oversPlayedBatting) - (runsConceded / oversPlayedBowling);
}

export function formatOvers(overs: number): string {
  const completed = Math.floor(overs);
  const balls     = Math.round((overs - completed) * 10);
  return `${completed}.${balls}`;
}

export function isPowerplay(overNumber: number, format: MatchFormat): boolean {
  const pp = POWERPLAY_OVERS[format];
  if (!pp) return false;
  return overNumber >= pp.start && overNumber <= pp.end;
}

export function maxBowlerOvers(totalOvers: number): number {
  return Math.round(totalOvers * BOWLER_MAX_OVERS_RATIO);
}

// ──────────────────────────────────────────────────────────────
// PRIVATE INITIALISERS
// ──────────────────────────────────────────────────────────────

function initBatsman(playerId: string): BatsmanInnings {
  return { playerId, runs: 0, ballsFaced: 0, fours: 0, sixes: 0, strikeRate: 0, isOnStrike: false, isOut: false, isNotOut: true };
}

function initBowler(playerId: string): BowlerInnings {
  return { playerId, overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, wides: 0, noBalls: 0 };
}
