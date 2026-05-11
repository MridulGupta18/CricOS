// ============================================================
// SHARED TYPES — used by both frontend and backend
// ============================================================

// --- AUTH ---

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type UserRole = 'MASTER' | 'ADMIN' | 'ORGANIZER' | 'SCORER' | 'PLAYER' | 'VIEWER';

// --- SCORING ENGINE TYPES ---

export type RunValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ExtraType = 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | 'PENALTY';

export type WicketType =
  | 'BOWLED'
  | 'CAUGHT'
  | 'LBW'
  | 'RUN_OUT'
  | 'STUMPED'
  | 'HIT_WICKET'
  | 'HANDLED_BALL'
  | 'OBSTRUCTING_FIELD'
  | 'RETIRED_HURT'
  | 'TIMED_OUT';

export interface BallEvent {
  id: string;
  matchId: string;
  inningsId: string;
  overNumber: number;       // 0-indexed
  ballNumber: number;       // 0-indexed within over (legal balls only for display)
  rawBallNumber: number;    // actual sequence including extras
  batsmanId: string;
  bowlerId: string;
  runs: RunValue;
  extras: ExtraRecord | null;
  wicket: WicketRecord | null;
  isLegalBall: boolean;     // false for wides/no-balls
  isFreeHit: boolean;       // true if this ball is a free hit (after no-ball)
  timestamp: string;
  clientId: string;         // UUID generated client-side (idempotency key)
}

export interface ExtraRecord {
  type: ExtraType;
  runs: number;
}

export interface WicketRecord {
  type: WicketType;
  outBatsmanId: string;
  fielderId?: string;
  newBatsmanId?: string;
}

// --- MATCH STATE ---

export interface MatchState {
  matchId: string;
  status: MatchStatus;
  currentInnings: number;
  innings: InningsState[];
  toss: TossResult | null;
  result: MatchResult | null;
}

export type MatchStatus =
  | 'UPCOMING'
  | 'TOSS'
  | 'IN_PROGRESS'
  | 'INNINGS_BREAK'
  | 'SUPER_OVER'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'CANCELLED';

export interface InningsState {
  inningsId: string;
  inningsNumber: number;
  battingTeamId: string;
  bowlingTeamId: string;
  totalRuns: number;
  totalWickets: number;
  totalOvers: number;
  extras: ExtrasBreakdown;
  currentOver: CurrentOverState;
  batsmen: BatsmanInnings[];
  bowlers: BowlerInnings[];
  fallOfWickets: FallOfWicket[];
  currentPartnership: Partnership | null;
  partnershipHistory: Partnership[];    // all completed partnerships in order
  currentStrikerId: string | null;
  currentNonStrikerId: string | null;
  nextBallIsFreeHit: boolean;
  isComplete: boolean;       // true when 10 wkts or overs exhausted
  target?: number;
}

export interface CurrentOverState {
  overNumber: number;
  legalBallsDelivered: number;
  balls: BallEvent[];
  bowlerId: string;
  runsInOver: number;        // used for maiden calculation
  isMaidenCandidate: boolean; // true so far no scoring runs/wides/noballs
}

export interface ExtrasBreakdown {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalties: number;
  total: number;
}

export interface BatsmanInnings {
  playerId: string;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isOnStrike: boolean;
  isOut: boolean;
  wicket?: WicketRecord;
  isNotOut: boolean;
}

export interface BowlerInnings {
  playerId: string;
  overs: number;            // completed overs (integer part) + balls in current spell
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  wides: number;
  noBalls: number;
}

export interface FallOfWicket {
  wicketNumber: number;
  runs: number;
  overs: number;
  playerId: string;
  batsmanName?: string;
}

export interface Partnership {
  batsmanId1: string;
  batsmanId2: string;
  runs: number;
  balls: number;
}

export interface TossResult {
  winnerId: string;
  decision: 'BAT' | 'BOWL';
}

export interface MatchResult {
  winnerId: string | null;
  margin?: number;
  marginType?: 'RUNS' | 'WICKETS';
  resultType: 'WIN' | 'TIE' | 'NO_RESULT' | 'DRAW';
}

// --- VALIDATION CONTEXT (passed to engine for cross-ball rules) ---

export interface BallValidationContext {
  inningsState: InningsState;
  maxOvers: number;
  matchFormat: MatchFormat;
  lastOverBowlerId?: string;   // for consecutive-over check
  bowlerOverCounts: Record<string, number>; // playerId → completed overs
}

// --- ENTITIES ---

export interface Player {
  id: string;
  name: string;
  jerseyNumber?: number;
  battingStyle?: 'RIGHT_HAND' | 'LEFT_HAND';
  bowlingStyle?: string;
  role?: 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER';
  avatarUrl?: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  players: Player[];
}

export interface Match {
  id: string;
  title?: string;
  homeTeam: Team;
  awayTeam: Team;
  venue?: string;
  scheduledAt: string;
  format: MatchFormat;
  overs: number;
  leagueId?: string;
  scorerId?: string;
  isPublic: boolean;
  shareToken: string;
  status: MatchStatus;
}

export type MatchFormat = 'T20' | 'ODI' | 'TEST' | 'T10' | 'CUSTOM';

export interface League {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  organizerId: string;
  format: MatchFormat;
  startDate?: string;
  endDate?: string;
  registrationFee?: number;
  currency: string;
  isPublic: boolean;
  status: LeagueStatus;
  sponsors: Sponsor[];
}

export type LeagueStatus = 'DRAFT' | 'REGISTRATION_OPEN' | 'ONGOING' | 'COMPLETED';

export interface Sponsor {
  id: string;
  name: string;
  logoUrl?: string;
  websiteUrl?: string;
  tier: 'TITLE' | 'GOLD' | 'SILVER' | 'ASSOCIATE';
}

// --- SEARCH ---

export type SearchEntityType = 'PLAYER' | 'TEAM' | 'MATCH' | 'LEAGUE';

export interface SearchResult {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  href: string;
  matchScore?: number;
}

// --- API RESPONSE WRAPPERS ---

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// --- REAL-TIME SOCKET EVENTS ---

export type SocketEvent =
  | { type: 'BALL_SCORED';          payload: BallEvent }
  | { type: 'INNINGS_CHANGED';      payload: { inningsNumber: number } }
  | { type: 'MATCH_STATUS_CHANGED'; payload: { status: MatchStatus } }
  | { type: 'MATCH_RESULT';         payload: MatchResult }
  | { type: 'INNINGS_COMPLETE';     payload: { inningsId: string; reason: 'ALL_OUT' | 'OVERS_COMPLETE' } };
