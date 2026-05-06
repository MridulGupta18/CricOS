export const BALLS_PER_OVER = 6;

export const MATCH_FORMATS = {
  T20:    { overs: 20, name: 'T20' },
  ODI:    { overs: 50, name: 'ODI' },
  T10:    { overs: 10, name: 'T10' },
  TEST:   { overs: null, name: 'Test' },
  CUSTOM: { overs: null, name: 'Custom' },
} as const;

// Max overs per bowler = 1/5 of total match overs (standard across all formats)
export const BOWLER_MAX_OVERS_RATIO = 0.2;

export const WICKET_TYPES = [
  'BOWLED', 'CAUGHT', 'LBW', 'RUN_OUT', 'STUMPED',
  'HIT_WICKET', 'HANDLED_BALL', 'OBSTRUCTING_FIELD',
  'RETIRED_HURT', 'TIMED_OUT',
] as const;

// Wickets that are NOT out on a free hit (Law 21.18)
export const FREE_HIT_SAFE_WICKET_TYPES = [
  'BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET',
] as const;

// Wickets credited to the bowler
export const BOWLER_CREDITED_WICKETS = [
  'BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET',
] as const;

export const EXTRA_TYPES = ['WIDE', 'NO_BALL', 'BYE', 'LEG_BYE', 'PENALTY'] as const;

// Extras that don't count as legal deliveries
export const ILLEGAL_DELIVERY_EXTRAS = ['WIDE', 'NO_BALL'] as const;

// Powerplay overs per format (0-indexed, inclusive)
export const POWERPLAY_OVERS: Record<string, { start: number; end: number }> = {
  T20:  { start: 0, end: 5  },  // overs 1–6
  T10:  { start: 0, end: 2  },  // overs 1–3
  ODI:  { start: 0, end: 9  },  // overs 1–10 (mandatory powerplay)
};

export const SPONSOR_TIERS = ['TITLE', 'GOLD', 'SILVER', 'ASSOCIATE'] as const;

export const MAX_PLAYERS_PER_TEAM = 15;
export const MIN_PLAYERS_PER_MATCH = 11;

export const API_BASE_URL   = process.env.NEXT_PUBLIC_API_URL    ?? 'http://localhost:4000';
export const SOCKET_URL     = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';
