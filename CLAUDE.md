# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multiplayer Texas Hold'em poker application. Backend is Node.js/Express with Socket.IO; frontend is Next.js 16 (React 19 + TypeScript + Tailwind CSS). Infrastructure runs on Docker with PostgreSQL and Redis.

## Commands

### Backend (run from `backend/`)

```bash
npm run dev          # Start dev server with nodemon (port 3000)
npm start            # Start production server
npm test             # Run Jest test suite with coverage
npm run test:watch   # Run tests in watch mode
npm run test:integration  # Run integration tests only
npm run lint         # Lint src/
npm run lint:fix     # Lint and auto-fix
npm run migrate      # Run DB migrations
npm run migrate:rollback  # Rollback migrations
npm run seed         # Seed database
```

Run a single test file:
```bash
npm test -- test/engine.test.js
npm test -- --testNamePattern="should deal hole cards"
```

### Frontend (run from `frontend/`)

```bash
npm run dev          # Start Next.js dev server (port 3000 by default)
npm run build        # Production build
npm start            # Start production server
npm run lint         # ESLint (eslint-config-next)
```

Set `NEXT_PUBLIC_API_URL` to point at the backend (defaults to same-origin, which works behind a reverse proxy). Auth token is stored in `localStorage` as `authToken`.

### Docker (run from repo root)

```bash
docker-compose -f docker/docker-compose.yml up -d    # Start all services (postgres, redis, backend)
docker-compose -f docker/docker-compose.yml down     # Stop all services
./setup-docker.sh    # First-time Docker setup
./test-local.sh      # Run automated endpoint tests against running Docker stack
```

### Environment

Copy `.env.example` to `backend/.env`. Key variables:
- `NODE_ENV`, `PORT` (3000), `WEBSOCKET_PORT` (3001)
- `DATABASE_URL` / `DB_*` — PostgreSQL connection
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — **must be set in non-development environments**
- `CORS_ORIGIN` — comma-separated allowed origins
- `ENABLE_RATE_LIMITING` — set `false` to disable during local dev
- `SEED_DEMO_USER` — set `false` to skip demo user creation (`test@example.com` / `Demo@123456`)

## Architecture

### Backend (`backend/src/`)

The server (`server.js`) wires together Express middleware, routes, and Socket.IO on a shared `http.Server`.

**Middleware stack order** (defined in `server.js`):
1. Security headers (`middleware/securityHeaders.js` — Helmet + CSP)
2. Compression
3. CORS (allows `.local` hostnames in development)
4. Body parsing (10kb limit)
5. Enhanced rate limiting (`middleware/enhancedRateLimiter.js` — Redis-backed, progressive penalties)

**Route layout:**
- `POST/GET /api/auth/*` and `/api/v1/auth/*` — authentication (JWT login/register/refresh)
- `GET/POST /api/security/*` — 2FA (TOTP via speakeasy), KYC, AML, SAR, self-exclusion
- `GET/POST /api/game/*` — game tables with anti-cheat integration
- `/api/v1/users`, `/api/v1/tables`, `/api/v1/admin` — legacy REST endpoints
- `GET /health`, `GET /metrics` (Prometheus), `GET /admin/metrics`

**Game engine (`game/`):**
- `gameState.js` — `GameStateMachine` class; holds the full hand state (deck, community cards, pot, player stacks, action order). States: `PRE_GAME → PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN → HAND_COMPLETE`.
- `engine.js` — `PokerEngine` orchestrates `GameStateMachine`, `PotCalculator`, `SecureShuffler`, and `HandHistoryRecorder` for one full hand lifecycle.
- `engineManager.js` — In-memory `Map<tableId, PokerEngine>` singleton; lazily creates engines from DB table data.
- `handEvaluator.js` — Hand ranking logic.
- `potCalculator.js` — Side-pot calculation.
- `shuffler.js` — Cryptographically secure deck shuffle with RNG audit hashing.
- `antiCheatEngine.js` — RTA (action timing), multi-account (device fingerprint), collusion pattern, and shuffle anomaly detection. Suspicious threshold: 0.5; auto-ban threshold: 0.85.
- `botStrategy.js` — Bot player logic.

**WebSocket (`websocket/`):**
- `socketHandler.js` — Initializes Socket.IO, applies JWT auth middleware to every connection.
- `gameEvents.js` — Registers per-socket event handlers: `JOIN_TABLE`, `LEAVE_TABLE`, `PLAYER_ACTION`. Rooms are named `table:<tableId>`.
- `io.js` — Singleton accessor so non-socket modules can emit events.

**Data layer:**
- `config/database.js` — `pg` pool; exports `db.query()` and `db.getOne()`.
- `config/redis.js` — `ioredis` client with connect/close lifecycle.
- `models/` — `User`, `Session`, `GameTable` ActiveRecord-style wrappers.
- `migrations/` — Sequential SQL files (`001_` … `011_`) plus `migrate.js` runner.

**Supporting services:**
- `utils/crypto.js` — JWT sign/verify, password hashing wrappers.
- `utils/complianceService.js` — KYC, AML, OFAC, SAR logic.
- `utils/twoFactorAuth.js` — TOTP setup/verify using speakeasy.
- `monitoring/monitoringService.js` — In-process metrics store; Prometheus text export; alert rules and dashboards.

### Database

PostgreSQL with 11 migration files. Key tables: `users`, `sessions`, `game_tables`, `table_seats`, `games`, `hand_history`, `player_cards`, `community_cards`, `game_results`, `rng_audit`, `cheat_detection`. See `docs/DATABASE_SCHEMA.md`.

### Frontend (`frontend/`)

Next.js App Router. All pages are client components (`'use client'`).

**Pages:**
- `app/page.tsx` — Landing/home
- `app/login/page.tsx`, `app/register/page.tsx` — Auth forms
- `app/dashboard/page.tsx` — Post-login home
- `app/lobby/page.tsx` — Table browser and table creation
- `app/table/[tableId]/page.tsx` — Live game view (seat selection, hole cards, action buttons, pot, community cards, action log)
- `app/profile/page.tsx` — User profile
- `app/admin/page.tsx` — Admin metrics/monitoring

**API layer (`lib/api.ts`):**
- `ApiClient` class — `fetch` wrapper that reads/writes `authToken` from `localStorage` and sends `Authorization: Bearer` headers.
- `apiClient` — singleton instance; `authAPI`, `gameAPI`, `userAPI`, `systemAPI` are named wrappers over it.

**WebSocket:** The table page connects directly via `socket.io-client` using the same `authToken`. Listens for `GAME_STATE_UPDATE`, `PLAYER_ACTION_RESULT`, `ROUND_RESULT`, `SEAT_UPDATED`, `PLAYER_JOINED`, `PLAYER_LEFT`, `ACTION_REQUIRED`, `SEAT_ACTION_BADGE`, `TABLE_CLOSED` events.

### Infrastructure

- `docker/docker-compose.yml` — Local dev stack (postgres:15, redis:7, backend with live-reload volume mount).
- `deployment/aws/` — Production Docker Compose, Nginx config, CloudFormation template, deploy script.
- `infra/` — Terraform/Lightsail bootstrap scripts.

## Key Conventions

- All game actions flow through `PokerEngine.processAction()` which calls `AntiCheatEngine` before mutating state.
- JWT secrets use obvious dev defaults; the server refuses to start with defaults when `NODE_ENV !== 'development'`.
- ESLint is configured with `airbnb-base` rules — run `lint:fix` before committing.
- Tests use Jest + Supertest. Integration tests require a running database (see `INTEGRATION_TESTING_GUIDE.md`).
- WebSocket events use SCREAMING_SNAKE_CASE (e.g., `PLAYER_ACTION`, `GAME_STATE_UPDATE`).
- The Postman collection (`Poker_Game_API.postman_collection.json`) covers all 25+ endpoints and is the primary manual testing tool.
