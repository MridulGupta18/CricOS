import { describe, it, expect } from 'vitest';
import { calculateDLSTarget, isAheadOfPar } from './dls';

// DLS is an approximation; we check directional correctness and that the
// returned object has the expected shape — not exact numeric agreement with
// the professional method (which requires ICC-licensed software).

describe('calculateDLSTarget', () => {
  it('returns a target ≤ the original when Team 2 has fewer overs', () => {
    // T20: Team 1 scored 180 in 20 overs. Team 2 only gets 10 overs.
    const result = calculateDLSTarget(180, 20, 10, 0, 0);
    expect(result.method).toBe('DLS_STANDARD');
    expect(result.revisedTarget).toBeGreaterThan(0);
    expect(result.revisedTarget).toBeLessThan(180);
  });

  it('returns a target ≥ original when Team 2 has more resources (Team 1 was interrupted)', () => {
    // Team 1 only got 10 overs; Team 2 gets full 20.
    const result = calculateDLSTarget(80, 10, 20, 0, 0);
    expect(result.revisedTarget).toBeGreaterThan(80);
  });

  it('clamps par score to ≥ 0 in a normal scenario', () => {
    // Team 1 scored 150 in 20 overs; Team 2 has 20 overs available, no wickets, no overs used.
    const result = calculateDLSTarget(150, 20, 20, 0, 0);
    expect(result.parScore).toBeGreaterThanOrEqual(0);
  });
});

describe('isAheadOfPar', () => {
  it('returns true when team 2 is ahead of the par score', () => {
    // Trivially true: if Team 2 already has more runs than Team 1's total + some,
    // they're way ahead of par.
    expect(isAheadOfPar(200, 100, 20, 10, 0)).toBe(true);
  });

  it('returns false when team 2 is behind', () => {
    expect(isAheadOfPar(0, 200, 20, 10, 9)).toBe(false);
  });
});
