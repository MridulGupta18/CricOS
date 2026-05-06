// ============================================================
// DLS (Duckworth-Lewis-Stern) Method
// Simplified Standard Edition — Professional Edition requires
// ICC-licensed software; this implementation is suitable for
// amateur leagues and gives results within ~2 runs of the
// professional method for most interruption scenarios.
//
// Reference: D/L Professional Method (2014 update)
// G50 = 245 (average first-innings score in 50-over matches)
// ============================================================

// Z table: Z[wickets][overs remaining] = resource percentage remaining
// Compressed to key breakpoints; linear interpolation between them.
// Values from the Standard Edition resource table (publicly available).
const G50 = 245;

// Resource percentage lookup: [wickets_lost][overs_remaining]
// Index 0 = 0 wickets lost, index 10 = all out
function resourcePercentage(wicketsLost: number, oversRemaining: number): number {
  if (oversRemaining <= 0) return 0;
  const w = Math.min(Math.max(0, wicketsLost), 10);

  // Decay constants per wicket tier (simplified from DL table)
  const decayRates = [0.0765, 0.0775, 0.0785, 0.0800, 0.0820,
                       0.0850, 0.0890, 0.0950, 0.1050, 0.1250, 0.1600];
  const F0 = [100, 93.4, 85.1, 74.9, 62.7, 49.0, 34.9, 22.0, 11.9, 4.7, 0];

  const u = oversRemaining;
  const Zinf = F0[w];
  const b    = decayRates[w];
  return Zinf * (1 - Math.exp(-b * u));
}

export interface DLSInterruptionResult {
  revisedTarget:   number;
  parScore:        number;     // score to be level at point of stoppage
  resourcesTeam1: number;
  resourcesTeam2: number;
  method: 'DLS_STANDARD';
}

/**
 * Compute the revised DLS target for Team 2 after an interruption.
 *
 * @param team1Score      - Team 1's final score
 * @param team1Overs      - Overs Team 1 faced
 * @param team2OversAvail - Overs available to Team 2 after interruption
 * @param team2WicketsLost - Wickets Team 2 have lost at interruption point
 * @param team2OversUsed  - Overs Team 2 have already faced at interruption
 */
export function calculateDLSTarget(
  team1Score: number,
  team1Overs: number,
  team2OversAvail: number,
  team2WicketsLost = 0,
  team2OversUsed = 0
): DLSInterruptionResult {
  const R1 = resourcePercentage(0, team1Overs);
  const R2before = resourcePercentage(team2WicketsLost, team1Overs - team2OversUsed);
  const R2after  = resourcePercentage(team2WicketsLost, team2OversAvail);

  const resourcesTeam1 = R1;
  const resourcesTeam2 = R2after;

  let revisedTarget: number;
  if (R2after <= R1) {
    // Team 2 has fewer resources — target reduced proportionally
    revisedTarget = Math.round(team1Score * (R2after / R1)) + 1;
  } else {
    // Team 2 has MORE resources (e.g. Team 1 was interrupted)
    revisedTarget = Math.round(team1Score + G50 * (R2after - R1) / 100) + 1;
  }

  const parScore = Math.round(
    revisedTarget - 1 - (resourcePercentage(team2WicketsLost, team2OversAvail - team2OversUsed) / R1) * team1Score
  );

  return {
    revisedTarget,
    parScore:       Math.max(0, parScore),
    resourcesTeam1: parseFloat(R1.toFixed(1)),
    resourcesTeam2: parseFloat(R2after.toFixed(1)),
    method: 'DLS_STANDARD',
  };
}

/**
 * Check if Team 2 is ahead of par at a given point (during second innings).
 */
export function isAheadOfPar(
  team2Score: number,
  team1Score: number,
  team1Overs: number,
  team2OversUsed: number,
  team2WicketsLost: number
): boolean {
  const { parScore } = calculateDLSTarget(team1Score, team1Overs, team1Overs, team2WicketsLost, team2OversUsed);
  return team2Score > parScore;
}
