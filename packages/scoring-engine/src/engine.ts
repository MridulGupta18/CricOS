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

  // Partnership tracking — current and historical
  let partnershipRuns  = 0;
  let partnershipBalls = 0;
  let partnershipStart = 0;
  const partnershipHistory: Partnership[] = [];

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
      batsman.wicket = event.wicket;
      const isRetiredHurt = event.wicket.type === 'RETIRED_HURT';

      if (isRetiredHurt) {
        // Law 26/37: Retired Hurt is NOT a dismissal.
        // Batsman leaves the field but remains not-out; wicket count does not increase.
        batsman.isRetiredHurt = true;
        // No bowler credit, no fall-of-wicket entry.
      } else {
        // Actual dismissal — increment wickets and record fall-of-wicket.
        totalWickets++;
        batsman.isOut    = true;
        batsman.isNotOut = false;

        if (BOWLER_CREDITED_WICKETS.includes(event.wicket.type as any)) {
          bowler.wickets++;
        }

        fallOfWickets.push({
          wicketNumber: totalWickets,
          runs:  totalRuns,
          overs: completedOvers + currentBallInOver / 10,
          playerId: event.wicket.outBatsmanId,
        });
      }

      // Runs before dismissal count for rotation (apply BEFORE removing batsman).
      if (event.runs % 2 !== 0) {
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }

      // Archive partnership NOW — while both batsmanIds are still valid —
      // before we nullify the outgoing batsman's position below.
      if (partnershipRuns > 0 || partnershipBalls > 0) {
        partnershipHistory.push({
          batsmanId1: strikerId    ?? '',
          batsmanId2: nonStrikerId ?? '',
          runs:  partnershipRuns,
          balls: partnershipBalls,
        });
      }
      partnershipRuns  = 0;
      partnershipBalls = 0;
      partnershipStart = totalRuns;

      // Nullify outgoing batsman's end so the incoming batsman can take their spot.
      if (event.wicket.outBatsmanId === strikerId) {
        strikerId = null;
      } else {
        nonStrikerId = null;
      }
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
    // A no-ball activates a free hit. Illegal deliveries (wides) do NOT consume
    // it — the free hit carries until the next LEGAL delivery (Law 21.15).
    if (extraType === 'NO_BALL') {
      nextIsFreeHit = true;
    } else if (isLegal) {
      nextIsFreeHit = false;
    }
    // Wides leave nextIsFreeHit unchanged.

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
  // The current bowler is whoever bowled the last ball.
  // Only they get the partial-over balls added for economy calculation.
  const lastBowlerId = events[events.length - 1]?.bowlerId ?? '';
  for (const [id, bowl] of bowlers) {
    const partialOvers = id === lastBowlerId ? currentBallInOver / BALLS_PER_OVER : 0;
    const totalOvers = bowl.overs + partialOvers;
    bowl.economy = totalOvers > 0 ? bowl.runs / totalOvers : 0;
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
    currentOver:         currentOverState,
    batsmen:             Array.from(batsmen.values()),
    bowlers:             Array.from(bowlers.values()),
    fallOfWickets,
    currentPartnership,
    partnershipHistory,
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

  // Bowler overs limit (limited-overs formats only; TEST/CUSTOM have no cap)
  const isLimitedOvers = maxOvers > 0 && matchFormat !== 'TEST' && matchFormat !== 'CUSTOM';
  if (isLimitedOvers) {
    const maxBowlerOvers = Math.floor(maxOvers * BOWLER_MAX_OVERS_RATIO);
    const bowlerDone     = bowlerOverCounts[event.bowlerId!] ?? 0;
    if (bowlerDone >= maxBowlerOvers) {
      return `Bowler has already bowled their maximum ${maxBowlerOvers} overs`;
    }
  }

  // No consecutive overs by the same bowler.
  // Fire on EVERY delivery of a new over (legalBallsDelivered === 0 means no legal
  // ball has been bowled yet in this over, so any delivery is still "over N+1 ball 1").
  if (inningsState.currentOver.legalBallsDelivered === 0 && lastOverBowlerId && lastOverBowlerId === event.bowlerId) {
    return 'Same bowler cannot bowl consecutive overs';
  }

  // Free hit: dismissals NOT allowed per Law 21.18 are blocked.
  // FREE_HIT_SAFE_WICKET_TYPES = ['BOWLED','CAUGHT','LBW','STUMPED','HIT_WICKET']
  // These are the types from which the batter is SAFE on a free hit.
  // allowedOnFreeHit = true  → dismissal IS valid (e.g. RUN_OUT)
  // allowedOnFreeHit = false → dismissal is blocked (e.g. BOWLED)
  if (inningsState.nextBallIsFreeHit && event.wicket) {
    const allowedOnFreeHit = !FREE_HIT_SAFE_WICKET_TYPES.includes(event.wicket.type as any);
    if (!allowedOnFreeHit) {
      return `${event.wicket.type} is not a valid dismissal on a free hit`;
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
  return Math.floor(totalOvers * BOWLER_MAX_OVERS_RATIO);
}

// ──────────────────────────────────────────────────────────────
// COMMENTARY GENERATOR
// Pure function: takes a ball event + player names, returns a
// human-readable sentence for the Timeline / live feed.
// ──────────────────────────────────────────────────────────────

export function generateCommentary(
  ball: BallEvent & { wicket?: any },
  batsmanName: string,
  bowlerName: string,
  fielderName?: string
): string {
  const over = `${ball.overNumber}.${ball.ballNumber + 1}`;

  if (ball.wicket) {
    const type: string = ball.wicket.type;
    switch (type) {
      case 'BOWLED':            return `OUT! ${batsmanName} is bowled by ${bowlerName}!`;
      case 'CAUGHT':            return fielderName
        ? `OUT! ${batsmanName} caught ${fielderName} bowled ${bowlerName}!`
        : `OUT! ${batsmanName} caught!`;
      case 'LBW':               return `OUT! ${batsmanName} lbw b ${bowlerName}!`;
      case 'RUN_OUT':           return fielderName
        ? `OUT! ${batsmanName} run out (${fielderName})!`
        : `OUT! ${batsmanName} run out!`;
      case 'STUMPED':           return fielderName
        ? `OUT! ${batsmanName} stumped ${fielderName} b ${bowlerName}!`
        : `OUT! ${batsmanName} stumped!`;
      case 'HIT_WICKET':        return `OUT! ${batsmanName} hit wicket b ${bowlerName}!`;
      case 'RETIRED_HURT':      return `${batsmanName} retires hurt.`;
      case 'OBSTRUCTING_FIELD': return `OUT! ${batsmanName} out obstructing the field!`;
      case 'HANDLED_BALL':      return `OUT! ${batsmanName} out handled ball!`;
      case 'TIMED_OUT':         return `OUT! ${batsmanName} timed out!`;
      default:                  return `OUT! ${batsmanName} dismissed!`;
    }
  }

  const extra = ball.extras?.type ?? null;
  const extraRuns = ball.extras?.runs ?? 0;

  if (extra === 'WIDE') {
    return extraRuns > 1
      ? `Wide. ${extraRuns} runs (wide + overthrows).`
      : `Wide ball from ${bowlerName}.`;
  }
  if (extra === 'NO_BALL') {
    const suffix = ball.isFreeHit ? ' FREE HIT next ball!' : '';
    if (ball.runs === 4) return `No ball! FOUR off the bat too! Expensive from ${bowlerName}.${suffix}`;
    if (ball.runs === 6) return `No ball! SIX as well! Huge over.${suffix}`;
    return `No ball from ${bowlerName}.${suffix}`;
  }
  if (extra === 'BYE')     return `${extraRuns} bye${extraRuns !== 1 ? 's' : ''}.`;
  if (extra === 'LEG_BYE') return `${extraRuns} leg bye${extraRuns !== 1 ? 's' : ''} off the pad.`;
  if (extra === 'PENALTY') return `${extraRuns} penalty run${extraRuns !== 1 ? 's' : ''} awarded.`;

  if (ball.runs === 0) return `Good ball from ${bowlerName}. Dot.`;
  if (ball.runs === 4) return `FOUR! ${batsmanName} finds the boundary off ${bowlerName}!`;
  if (ball.runs === 6) return `SIX! ${batsmanName} clears the rope off ${bowlerName}!`;
  const words = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
  return `${batsmanName} takes ${words[ball.runs] ?? ball.runs} run${ball.runs !== 1 ? 's' : ''}.`;
}

// ──────────────────────────────────────────────────────────────
// PRIVATE INITIALISERS
// ──────────────────────────────────────────────────────────────

function initBatsman(playerId: string): BatsmanInnings {
  return { playerId, runs: 0, ballsFaced: 0, fours: 0, sixes: 0, strikeRate: 0, isOnStrike: false, isOut: false, isNotOut: true, isRetiredHurt: false };
}

function initBowler(playerId: string): BowlerInnings {
  return { playerId, overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, wides: 0, noBalls: 0 };
}
