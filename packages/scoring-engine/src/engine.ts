import {
  BallEvent,
  InningsState,
  BatsmanInnings,
  BowlerInnings,
  CurrentOverState,
  ExtrasBreakdown,
  FallOfWicket,
  RunValue,
  MatchState,
} from '@cricket-os/shared';
import { BALLS_PER_OVER, ILLEGAL_DELIVERY_EXTRAS } from '@cricket-os/shared';

// ============================================================
// SCORING ENGINE
//
// Pure functions — no side effects, no DB calls.
// The API layer passes ball events here, gets back derived state.
// This is the single source of scoring truth.
// ============================================================

// Compute full innings state by replaying all ball events in order.
// This is O(n) in balls but called infrequently (on load / undo).
export function computeInningsState(
  events: BallEvent[],
  battingTeamId: string,
  bowlingTeamId: string,
  inningsId: string,
  inningsNumber: number,
  target?: number
): InningsState {
  const batsmen = new Map<string, BatsmanInnings>();
  const bowlers = new Map<string, BowlerInnings>();
  const fallOfWickets: FallOfWicket[] = [];
  let totalRuns = 0;
  let totalWickets = 0;
  let currentStrikerIndex = 0; // We track strikerId from events
  let currentBallInOver = 0;
  let currentOverNumber = 0;
  const overBalls: BallEvent[] = [];

  const extras: ExtrasBreakdown = {
    wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0, total: 0,
  };

  for (const event of events) {
    const runsOnBall = event.runs + (event.extras?.runs ?? 0);
    totalRuns += runsOnBall;

    // Track batsman
    if (!batsmen.has(event.batsmanId)) {
      batsmen.set(event.batsmanId, initBatsman(event.batsmanId));
    }
    const batsman = batsmen.get(event.batsmanId)!;

    // Track bowler
    if (!bowlers.has(event.bowlerId)) {
      bowlers.set(event.bowlerId, initBowler(event.bowlerId));
    }
    const bowler = bowlers.get(event.bowlerId)!;

    // Apply extras
    if (event.extras) {
      const { type, runs: eRuns } = event.extras;
      switch (type) {
        case 'WIDE': extras.wides += eRuns; bowler.wides++; break;
        case 'NO_BALL': extras.noBalls += eRuns; bowler.noBalls++; break;
        case 'BYE': extras.byes += eRuns; break;
        case 'LEG_BYE': extras.legByes += eRuns; break;
        case 'PENALTY': extras.penalties += eRuns; break;
      }
      extras.total += eRuns;
    }

    // Apply runs to batsman (only for genuine bat runs — not byes/leg byes/wides)
    const isBatRun = !event.extras || (event.extras.type !== 'BYE' && event.extras.type !== 'LEG_BYE' && event.extras.type !== 'WIDE');
    if (isBatRun && event.runs > 0) {
      batsman.runs += event.runs;
      if (event.runs === 4) batsman.fours++;
      if (event.runs === 6) batsman.sixes++;
    }

    // Legal ball counts for batsman balls faced (wides don't count)
    if (event.extras?.type !== 'WIDE') {
      batsman.ballsFaced++;
    }

    // Bowler runs = bat runs + no-ball runs (byes/leg byes NOT charged to bowler)
    if (!event.extras || event.extras.type !== 'BYE' && event.extras.type !== 'LEG_BYE') {
      bowler.runs += event.runs + (event.extras?.runs ?? 0);
    }

    // Wicket
    if (event.wicket) {
      totalWickets++;
      batsman.isOut = true;
      batsman.isNotOut = false;
      batsman.wicket = event.wicket;

      // Wicket credited to bowler (not for run-outs, retired, obstructing)
      const bowlerWicketTypes = ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'];
      if (bowlerWicketTypes.includes(event.wicket.type)) {
        bowler.wickets++;
      }

      fallOfWickets.push({
        wicketNumber: totalWickets,
        runs: totalRuns,
        overs: event.overNumber + (event.ballNumber + 1) / 10,
        playerId: event.wicket.outBatsmanId,
      });
    }

    // Legal ball — advance over counter
    if (event.isLegalBall) {
      currentBallInOver++;
      batsman.ballsFaced = batsmen.get(event.batsmanId)!.ballsFaced; // already incremented above
    }

    // Over completed
    if (event.isLegalBall && currentBallInOver >= BALLS_PER_OVER) {
      bowler.overs = Math.floor(bowler.overs) + 1;
      currentBallInOver = 0;
      currentOverNumber++;
    }

    // Auto strike rotation
    if (event.isLegalBall) {
      const rotationRuns = event.runs + (isBatRun ? 0 : 0); // use actual runs for rotation
      const oddRuns = event.runs % 2 !== 0;
      if (oddRuns) {
        // Strike rotates
      }
      if (currentBallInOver === 0 && !event.wicket) {
        // End of over — strike automatically rotates
      }
    }

    // Track current over balls
    if (event.overNumber === currentOverNumber) {
      overBalls.push(event);
    }
  }

  // Compute strike rates
  for (const [, bat] of batsmen) {
    bat.strikeRate = bat.ballsFaced > 0 ? (bat.runs / bat.ballsFaced) * 100 : 0;
  }
  for (const [, bowl] of bowlers) {
    const completedOvers = Math.floor(bowl.overs) + (bowl.overs % 1) * 10 / BALLS_PER_OVER;
    bowl.economy = completedOvers > 0 ? bowl.runs / completedOvers : 0;
  }

  const currentOverState: CurrentOverState = {
    overNumber: currentOverNumber,
    legalBallsDelivered: currentBallInOver,
    balls: overBalls.filter(e => e.overNumber === currentOverNumber),
    bowlerId: events[events.length - 1]?.bowlerId ?? '',
  };

  return {
    inningsId,
    inningsNumber,
    battingTeamId,
    bowlingTeamId,
    totalRuns,
    totalWickets,
    totalOvers: currentOverNumber + currentBallInOver / 10,
    extras,
    currentOver: currentOverState,
    batsmen: Array.from(batsmen.values()),
    bowlers: Array.from(bowlers.values()),
    fallOfWickets,
    target,
  };
}

// Validate a ball event before applying it.
// Returns null if valid, or an error message string.
export function validateBallEvent(
  event: Partial<BallEvent>,
  innings: InningsState,
  maxOvers: number
): string | null {
  if (!event.batsmanId) return 'Batsman is required';
  if (!event.bowlerId) return 'Bowler is required';
  if (event.runs === undefined || event.runs < 0 || event.runs > 6) return 'Invalid run value';
  if (innings.totalWickets >= 10) return 'All wickets fallen';
  if (maxOvers > 0 && innings.totalOvers >= maxOvers) return 'Over limit reached';
  return null;
}

// Determine if strike should rotate after this ball
export function shouldRotateStrike(event: BallEvent, isEndOfOver: boolean): boolean {
  if (event.wicket) return false; // new batsman comes in — handled separately
  if (isEndOfOver) return true;
  // Odd runs = strike rotates
  return event.runs % 2 !== 0;
}

// Calculate required run rate
export function calculateRRR(
  target: number,
  currentRuns: number,
  currentOvers: number,
  maxOvers: number
): number {
  const runsNeeded = target - currentRuns;
  const oversRemaining = maxOvers - currentOvers;
  if (oversRemaining <= 0) return Infinity;
  return runsNeeded / oversRemaining;
}

// Calculate net run rate for a team across matches
export function calculateNRR(
  runsScored: number,
  oversPlayedBatting: number,
  runsConceded: number,
  oversPlayedBowling: number
): number {
  if (oversPlayedBatting === 0 || oversPlayedBowling === 0) return 0;
  return (runsScored / oversPlayedBatting) - (runsConceded / oversPlayedBowling);
}

// Format overs display: 3.4 means 3 overs 4 balls
export function formatOvers(overs: number): string {
  const completed = Math.floor(overs);
  const balls = Math.round((overs - completed) * 10);
  return `${completed}.${balls}`;
}

// --- Private helpers ---

function initBatsman(playerId: string): BatsmanInnings {
  return {
    playerId,
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    strikeRate: 0,
    isOnStrike: false,
    isOut: false,
    isNotOut: true,
  };
}

function initBowler(playerId: string): BowlerInnings {
  return {
    playerId,
    overs: 0,
    maidens: 0,
    runs: 0,
    wickets: 0,
    economy: 0,
    wides: 0,
    noBalls: 0,
  };
}
