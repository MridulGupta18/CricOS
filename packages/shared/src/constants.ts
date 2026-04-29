export const BALLS_PER_OVER = 6;

export const MATCH_FORMATS = {
  T20: { overs: 20, name: 'T20' },
  ODI: { overs: 50, name: 'ODI' },
  T10: { overs: 10, name: 'T10' },
  TEST: { overs: null, name: 'Test' },
  CUSTOM: { overs: null, name: 'Custom' },
} as const;

export const WICKET_TYPES = [
  'BOWLED', 'CAUGHT', 'LBW', 'RUN_OUT', 'STUMPED',
  'HIT_WICKET', 'HANDLED_BALL', 'OBSTRUCTING_FIELD',
  'RETIRED_HURT', 'TIMED_OUT',
] as const;

export const EXTRA_TYPES = ['WIDE', 'NO_BALL', 'BYE', 'LEG_BYE', 'PENALTY'] as const;

// Extras that don't count as legal deliveries
export const ILLEGAL_DELIVERY_EXTRAS = ['WIDE', 'NO_BALL'] as const;

export const SPONSOR_TIERS = ['TITLE', 'GOLD', 'SILVER', 'ASSOCIATE'] as const;

export const MAX_PLAYERS_PER_TEAM = 15;
export const MIN_PLAYERS_PER_MATCH = 11;

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';
