# 🏏 CricOS — Cricket League Operating System

> A next-generation cricket scoring and league management **mobile app** for Android and iOS.
> Built with React Native (Expo) + Express + PostgreSQL.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Mobile (Android + iOS) | React Native + **Expo** (Expo Router) |
| Styling | **NativeWind** v4 (Tailwind in React Native) |
| State | **Zustand** + MMKV (offline-first storage) |
| Data fetching | **TanStack Query** |
| Real-time | **Socket.io** client |
| Animations | **Reanimated 3** + haptic feedback |
| Backend | **Express** + Socket.io |
| Database | **PostgreSQL** + Prisma ORM |
| Auth | JWT + refresh token rotation |

---

## Quick Start

### Prerequisites
- Node.js ≥ 20
- PostgreSQL 15+
- [Expo CLI](https://docs.expo.dev/get-started/installation/): `npm install -g expo-cli`
- Android Studio (for Android emulator) **or** physical Android device

### 1. Install dependencies

```bash
npm install
cd apps/mobile && npm install
```

### 2. Start the API

```bash
# Set up DB first
cp apps/api/.env.example apps/api/.env
# Edit DATABASE_URL

cd packages/db && npx prisma generate && npx prisma db push
cd packages/db && npx ts-node -O '{"module":"commonjs"}' prisma/seed.ts

# Start API
cd apps/api && npx tsx src/index.ts
# API runs on http://localhost:4000
```

### 3. Start the mobile app

```bash
# Configure API URL
cp apps/mobile/.env.example apps/mobile/.env
# For Android emulator: EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
# For physical device: EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:4000

cd apps/mobile
npx expo start --android   # → opens Android emulator
npx expo start --ios       # → opens iOS simulator (Mac only)
```

---

## Project Structure

```
Cricket App/
├── apps/
│   ├── mobile/                 ← React Native Expo app
│   │   ├── app/                  Expo Router pages
│   │   │   ├── (tabs)/           Bottom tab navigator
│   │   │   │   ├── index.tsx     Dashboard
│   │   │   │   ├── matches.tsx   Matches list
│   │   │   │   ├── leagues.tsx   Leagues list
│   │   │   │   └── profile.tsx   Profile
│   │   │   ├── match/[id]/       Match detail + scorer
│   │   │   ├── league/[slug]/    League dashboard
│   │   │   ├── search.tsx        Global search
│   │   │   └── auth/             Login / Register
│   │   └── src/
│   │       ├── screens/          Screen components
│   │       ├── components/ui/    Button, Card, Badge, etc.
│   │       ├── stores/           Zustand (auth, scoring, search)
│   │       ├── lib/              API client, socket, utils
│   │       └── offline/          MMKV queue + sync worker
│   └── api/                  ← Express backend
├── packages/
│   ├── db/                   ← Prisma schema (PostgreSQL)
│   ├── shared/               ← Shared TypeScript types
│   └── scoring-engine/       ← Pure TS scoring logic
└── ARCHITECTURE.md
```

---

## Key Screens

| Screen | Route | Description |
|---|---|---|
| Dashboard | `(tabs)/index` | Live + upcoming matches, leagues |
| Matches | `(tabs)/matches` | Full match list |
| Scorer Mode | `match/[id]/score` | **The core screen** — big buttons, haptics, offline |
| Match Detail | `match/[id]` | Scorecard, innings, live updates |
| League | `league/[slug]` | Points table, fixtures, sponsors |
| Search | `search` | Full-screen fuzzy search |
| Profile | `(tabs)/profile` | Auth, settings |

---

## Platform Strategy

| Platform | Status | How |
|---|---|---|
| Android | ✅ Now | `npx expo start --android` |
| iOS | ✅ Ready | `npx expo start --ios` (needs Mac + Xcode) |
| APK build | via EAS | `eas build --platform android` |
| IPA build | via EAS | `eas build --platform ios` |

**The same codebase runs on both.** Switch to iOS anytime on a Mac.

---

## Seed Credentials
- Admin: `admin@crivos.com` / `Admin@123`
- Organizer: `organizer@crivos.com` / `Org@12345`

---

## API Reference

See [ARCHITECTURE.md](./ARCHITECTURE.md) — all backend routes are unchanged.
