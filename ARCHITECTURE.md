# CricOS — Cricket League Operating System
## System Architecture

---

## 1. HIGH-LEVEL OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Web App     │  │ Scorer Mode  │  │  Public Match View       │  │
│  │ (Next.js 14) │  │ (PWA/Mobile) │  │  (shareable link)        │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         │                 │                        │                │
│  ┌──────▼─────────────────▼────────────────────────▼─────────────┐  │
│  │              Zustand Store + React Query Cache                 │  │
│  │              IndexedDB (offline queue)                         │  │
│  └──────────────────────────┬──────────────────────────────────── ┘  │
└─────────────────────────────┼───────────────────────────────────────┘
                              │ HTTP / WebSocket
┌─────────────────────────────▼───────────────────────────────────────┐
│                         API LAYER                                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   Express + Socket.io                       │    │
│  │                                                             │    │
│  │  /api/v1/auth      /api/v1/matches    /api/v1/leagues       │    │
│  │  /api/v1/teams     /api/v1/players    /api/v1/search        │    │
│  │  /api/v1/scoring   /api/v1/payments   /api/v1/sponsors      │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │              Service Layer                                  │    │
│  │                                                             │    │
│  │  ScoringService  SearchService  LeagueService  AuthService  │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                         DATA LAYER                                  │
│                                                                     │
│  ┌──────────────────┐  ┌────────────────┐  ┌──────────────────┐    │
│  │   PostgreSQL     │  │   Redis Cache  │  │  Object Storage  │    │
│  │   (Prisma ORM)   │  │   (optional)   │  │  (images/media)  │    │
│  └──────────────────┘  └────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. MONOREPO STRUCTURE

```
cricket-os/
├── apps/
│   ├── web/                    # Next.js 14 frontend
│   │   ├── src/
│   │   │   ├── app/            # App Router pages
│   │   │   ├── components/     # UI components
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/            # Utilities, API client
│   │   │   └── offline/        # IndexedDB sync layer
│   │   └── public/
│   └── api/                    # Express backend
│       ├── src/
│       │   ├── routes/         # Express routers
│       │   ├── services/       # Business logic
│       │   ├── middleware/     # Auth, validation
│       │   ├── socket/         # Socket.io handlers
│       │   └── db/             # Prisma client
│       └── prisma/
├── packages/
│   ├── scoring-engine/         # Pure TS scoring logic (shared)
│   ├── shared/                 # Types, constants, validators
│   └── db/                     # Prisma schema
└── turbo.json
```

---

## 3. SCORING ENGINE ARCHITECTURE

```
Ball Event Input
      │
      ▼
┌─────────────────────────────────┐
│         ScoringEngine           │
│                                 │
│  validateBall()                 │
│  applyBall()  ──────────────────┼──► MatchState (immutable update)
│  undoBall()                     │
│  getScorecard()                 │
│  autoRotateStrike()             │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│      Event Store (append-only)  │
│  ball_events table              │
│  [ball1, ball2, ..., ballN]     │  ← replay-able, source of truth
└─────────────────────────────────┘
```

Key insight: Match state is DERIVED from ball events (event sourcing pattern).
This enables undo/redo, replay, and analytics naturally.

---

## 4. REAL-TIME ARCHITECTURE

```
Scorer (client)
    │
    │  emit('ball:scored', ballEvent)
    ▼
Socket.io Server
    │
    │  join room: match:{matchId}
    │  broadcast to room
    ▼
All Viewers in room
    │
    │  on('match:updated', matchState)
    ▼
Live scorecard re-renders
```

---

## 5. OFFLINE SYNC ARCHITECTURE

```
Scorer is offline
    │
    ▼
Ball events → IndexedDB queue
    │
    │  (connection restored)
    ▼
Sync worker flushes queue → API
    │
    ▼
Server reconciles events (idempotent by ball event ID)
    │
    ▼
Broadcasts updated state to all viewers
```

---

## 6. SEARCH ARCHITECTURE

```
User types query
    │
    ▼
Debounce (150ms)
    │
    ▼
Client fuzzy-search (recent items, local cache)
    +
    ▼
API: /api/v1/search?q=...
    │
    ▼
PostgreSQL full-text search (tsvector)
+ pg_trgm (fuzzy/typo tolerance)
    │
    ▼
Ranked results: players > teams > matches > leagues
    │
    ▼
Instant navigation
```

---

## 7. MONETIZATION FLOW

```
League Organizer
    │
    │  creates league + sets registration_fee
    ▼
Team registers → Stripe checkout session
    │
    ▼
Stripe webhook → marks registration paid
    │
    ▼
Revenue Dashboard aggregates payments
```

---

## 8. KEY DESIGN DECISIONS

| Decision | Choice | Reason |
|---|---|---|
| State management | Event sourcing for scoring | Enables undo, replay, analytics |
| ORM | Prisma | Type-safe, great DX |
| Real-time | Socket.io | Battle-tested, room-based |
| Offline | IndexedDB + sync queue | Works on field without signal |
| Search | pg_trgm | No extra infra (no Elasticsearch) |
| Auth | JWT + refresh tokens | Stateless, scales horizontally |
| Frontend state | Zustand + React Query | Lightweight, no Redux boilerplate |
