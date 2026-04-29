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

export type UserRole = 'ADMIN' | 'ORGANIZER' | 'SCORER' | 'PLAYER' | 'VIEWER';

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
  timestamp: string;
  // For offline sync
  clientId: string;         // UUID generated client-side (idempotency key)
}

export interface ExtraRecord {
  type: ExtraType;
  runs: number;             // extras runs (1 for wide/no-ball minimum)
}

export interface WicketRecord {
  type: WicketType;
  outBatsmanId: string;
  fielderId?: string;       // for caught/run-out/stumped
  newBatsmanId?: string;    // pre-populated when next batsman is known
}

// --- MATCH STATE ---

export interface MatchState {
  matchId: string;
  status: MatchStatus;
  currentInnings: number;   // 1 or 2
  innings: InningsState[];
  toss: TossResult | null;
  result: MatchResult | null;
}

export type MatchStatus =
  | 'UPCOMING'
  | 'TOSS'
  | 'IN_PROGRESS'
  | 'INNINGS_BREAK'
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
  totalOvers: number;       // completed overs (float: 3.4 = 3 overs 4 balls)
  extras: ExtrasBreakdown;
  currentOver: CurrentOverState;
  batsmen: BatsmanInnings[];
  bowlers: BowlerInnings[];
  fallOfWickets: FallOfWicket[];
  target?: number;          // set after first innings
}

export interface CurrentOverState {
  overNumber: number;
  legalBallsDelivered: number;
  balls: BallEvent[];
  bowlerId: string;
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
  overs: number;
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
}

export interface TossResult {
  winnerId: string;         // team that won toss
  decision: 'BAT' | 'BOWL';
}

export interface MatchResult {
  winnerId: string | null;  // null = tie/no result
  margin?: number;
  marginType?: 'RUNS' | 'WICKETS';
  resultType: 'WIN' | 'TIE' | 'NO_RESULT' | 'DRAW';
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
  shortName: string;        // e.g., "RCB", "MI"
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
  shareToken: string;       // public shareable URL slug
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
  registrationFee?: number; // in paise/cents
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
  matchScore?: number;      // fuzzy match confidence
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
  | { type: 'BALL_SCORED'; payload: BallEvent }
  | { type: 'INNINGS_CHANGED'; payload: { inningsNumber: number } }
  | { type: 'MATCH_STATUS_CHANGED'; payload: { status: MatchStatus } }
  | { type: 'MATCH_RESULT'; payload: MatchResult };
