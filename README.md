# 🏏 CricOS — Cricket League Operating System

A production-grade cricket scoring + league management platform.
Mobile app for Android and iOS, backed by an Express API and PostgreSQL.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Mobile (Android + iOS) | React Native + **Expo** (Expo Router) |
| Styling | **NativeWind** v4 (Tailwind in React Native) |
| State | **Zustand** + **expo-secure-store** for tokens |
| Data fetching | **TanStack Query** |
| Real-time | **Socket.io** client |
| Animations | **Reanimated 3** + haptic feedback |
| Backend | **Express** + Socket.io |
| Database | **PostgreSQL** + Prisma ORM (migrations, not `db push`) |
| Auth | JWT + refresh token rotation, hashed-at-rest, email verification |
| Payments | **Stripe Checkout** + webhook signature verification |
| Email | **Resend** (with a dev-fallback that logs the link) |
| Logging | **Pino** (structured JSON in prod, pretty in dev) |
| Errors | **Sentry** (optional — no-op without DSN) |
| Tests | **Vitest** (scoring engine, ACL, auth helpers) |
| CI | GitHub Actions (lint, type-check, test, build) |

---

## Quick Start

### Prerequisites
- Node.js ≥ 20
- PostgreSQL 15+
- Expo CLI (`npm install -g expo-cli`)

### 1. Install + generate Prisma

```bash
npm install --legacy-peer-deps
npx prisma generate --schema=packages/db/prisma/schema.prisma
```

### 2. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
# Edit:
#   DATABASE_URL — your local Postgres
#   JWT_SECRET, REFRESH_TOKEN_SECRET — generate with:
#     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   MASTER_EMAIL — the email you want to promote to MASTER via the bootstrap endpoint
```

### 3. Apply migrations + seed

```bash
npx prisma migrate dev --schema=packages/db/prisma/schema.prisma
cd packages/db && npx ts-node -O '{"module":"commonjs"}' prisma/seed.ts
```

### 4. Run the API (dev)

```bash
npm run dev --workspace=apps/api
# → http://localhost:4000 — logs are pretty-printed via pino-pretty
```

### 5. Run the API (prod)

```bash
npm run build --workspace=apps/api    # bundles to apps/api/dist/index.js
npm run start --workspace=apps/api    # node dist/index.js
```

### 6. Run the mobile app

```bash
cp apps/mobile/.env.example apps/mobile/.env
# Android emulator: EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
# Physical device : EXPO_PUBLIC_API_URL=http://<LAN_IP>:4000

cd apps/mobile
npx expo start --android
npx expo start --ios   # macOS only
```

---

## Project Structure

```
Cricket App/
├── apps/
│   ├── mobile/             React Native Expo app (the user-facing app)
│   └── api/                Express + Socket.io API
├── packages/
│   ├── db/                 Prisma schema + migrations
│   ├── scoring-engine/     Pure-TS scoring logic (the source of truth)
│   └── shared/             Cross-app types + cricket constants
├── .github/workflows/      CI pipelines
└── ARCHITECTURE.md         System architecture overview
```

---

## Key Endpoints

### Auth
- `POST /api/v1/auth/register` — create account, sends verification email
- `POST /api/v1/auth/login` — sign in (with account-level throttling)
- `POST /api/v1/auth/refresh` — rotate refresh + access tokens
- `POST /api/v1/auth/verify` — consume verification token
- `POST /api/v1/auth/verify/resend` — request a new verification email
- `POST /api/v1/auth/forgot` — start password reset
- `POST /api/v1/auth/reset` — finalize password reset

### Operations
- `GET  /health` — liveness
- `GET  /health/ready` — readiness (checks DB)

### Admin
- `POST /api/v1/admin/bootstrap` — promote `MASTER_EMAIL` to MASTER (one-time)
- `GET  /api/v1/admin/users` — list users
- `PATCH /api/v1/admin/users/:id/role` — change role (bumps tokenVersion)

Full route list: see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Security model (at a glance)

- **Passwords:** bcrypt cost 12, strict complexity (8+, upper/lower/digit/symbol).
- **Refresh tokens:** stored as SHA-256 hashes (plaintext never touches the DB).
- **Token revocation:** `User.tokenVersion` is bumped on role change / password reset; old tokens are rejected at the next refresh.
- **Account lockout:** 5 failed logins → 15-minute lockout (defends against credential stuffing).
- **CORS:** explicit allowlist via `FRONTEND_URL` (comma-separated).
- **Stripe webhook:** rejects unsigned requests; raw-body parser mounted before `express.json()`.
- **Players:** linking a Player to a user account is forced to the caller's id (non-admin); only ADMIN/MASTER can link a profile to another user.
- **Teams:** the creator owns the team; only creator/captain/admin can edit; roster mutations also require vice-captain at minimum.
- **Mobile tokens:** stored in Keychain (iOS) / Keystore (Android) via expo-secure-store — not plain AsyncStorage.

---

## Tests

```bash
npm test --workspace=@cricket-os/scoring-engine
npm test --workspace=apps/api
```

The scoring engine has full coverage of cricket rule edge cases (free hits, no-balls, retired hurt, maidens, partnerships). ACL and auth helpers have unit tests pinning down the hierarchy + tampering resistance.

---

## Deployment

- **Railway / Fly / Render** — `nixpacks.toml` runs `prisma migrate deploy` + `tsup` then starts `node dist/index.js`.
- **Health checks** — set `/health/ready` as the readiness probe.
- **Required env** — `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `DATABASE_URL`, `FRONTEND_URL`. The API refuses to start in production without `JWT_SECRET`/`REFRESH_TOKEN_SECRET`.
- **Optional env** — `STRIPE_*` (payments), `RESEND_API_KEY` (email), `SENTRY_DSN` (observability), `MASTER_EMAIL` (bootstrap).

---

## Seed Credentials (dev only)
- Admin:     `admin@crivos.com` / `Admin@123`
- Organizer: `organizer@crivos.com` / `Org@12345`
