# Codebase Map

Multiplayer Texas Hold'em poker application. This file is a structural index for AI agents and onboarding.

- **Backend**: Node.js / Express / Socket.IO (CommonJS)
- **Frontend**: Next.js 16 (App Router, React 19, TypeScript, Tailwind)
- **Data**: PostgreSQL + Redis
- **Infra**: Docker Compose (local), Terraform/Lightsail + AWS (production)

## Main Entry Points

| File | Role |
|------|------|
| `backend/src/server.js` | **Primary backend entry.** Wires Express middleware, routes, Socket.IO; calls `start()` when run directly. Used by `npm start` / `npm run dev` and the Docker image. Exports `{ app, server, io }`. |
| `backend/src/index.js` | Alternate bootstrap. Requires `server.js`, then seeds the demo user. Not referenced by npm scripts. |
| `backend/migrations/migrate.js` | DB migration runner (`npm run migrate`). |
| `frontend/app/layout.tsx` | Next.js root layout (App Router). |
| `frontend/app/page.tsx` | Landing page / frontend route entry. |
| `frontend/next.config.ts` | Next.js build configuration. |
| `infra/main.tf` | Terraform entry — provisions AWS Lightsail instance, static IP, secrets. |
| `docker/docker-compose.yml` | Local dev stack: `postgres`, `redis`, `backend`. |
| `deployment/aws/docker-compose.yml` | Production stack. |
| `poker-master.sh`, `setup-docker.sh`, `test-local.sh` | Repo-root operational scripts. |

## Directory Structure

```
poker-game/
├── backend/                 Node.js API + game server
│   ├── src/                 (2 files: server.js, index.js)
│   │   ├── api/             (2)  gameRoutes.js, securityRoutes.js — route entry
│   │   │   ├── controllers/ (4)  auth / user / table / admin request handlers
│   │   │   ├── middleware/  (3)  authMiddleware, errorHandler, rateLimiter
│   │   │   └── routes/      (4)  auth, users, tables, admin REST routers
│   │   ├── config/          (3)  database (pg pool), redis, env
│   │   ├── database/        (2)  migration wrapper + security-tables SQL
│   │   ├── game/            (9)  poker engine — see "Game Engine" below
│   │   ├── middleware/      (3)  securityHeaders, enhancedRateLimiter, inputValidation
│   │   ├── models/          (3)  User, Session, GameTable (ActiveRecord-style)
│   │   ├── monitoring/      (1)  monitoringService — metrics + Prometheus export
│   │   ├── utils/           (8)  crypto, auth, logger, validators, compliance, 2FA, redis, cors
│   │   └── websocket/       (4)  socketHandler, gameEvents, io, eventEmitter
│   ├── migrations/          (13) 001–012 SQL files + migrate.js runner
│   ├── test/                (8)  unit + integration tests (Jest)
│   └── tests/               (4)  additional engine/integration tests + fixtures
├── frontend/                Next.js client
│   ├── app/                 (4)  layout, page, globals.css, favicon
│   │   ├── admin/ dashboard/ lobby/ login/ profile/ register/   (1 page.tsx each)
│   │   └── table/[tableId]/  (1)  live game view
│   ├── lib/                 (1)  api.ts — ApiClient + auth/game/user/system wrappers
│   └── public/              (5)  static SVG assets
├── infra/                   (12) Terraform — main.tf, variables.tf, outputs.tf, providers.tf
│   └── scripts/             (2)  Lightsail static-IP helper scripts
├── deployment/
│   └── aws/                 (7)  prod compose, nginx.conf, CloudFormation, deploy.sh
├── docker/                  (3)  Dockerfile.backend, docker-compose.yml, test override
├── docs/                    (5)  ARCHITECTURE, API_SCHEMA, DATABASE_SCHEMA, GAMEPLAY_FLOW, CONTRIBUTING
└── .github/workflows/       (1)  integration-startup.yml — CI
```

### Game Engine (`backend/src/game/`)

| File | Responsibility |
|------|----------------|
| `gameState.js` | `GameStateMachine` — full hand state; states `PRE_GAME → PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN → HAND_COMPLETE`. |
| `engine.js` | `PokerEngine` — orchestrates one hand lifecycle. |
| `engineManager.js` | In-memory `Map<tableId, PokerEngine>` singleton. |
| `handEvaluator.js` | Hand ranking logic. |
| `potCalculator.js` | Side-pot calculation. |
| `shuffler.js` | Cryptographically secure shuffle with RNG audit hashing. |
| `antiCheatEngine.js` | RTA / multi-account / collusion / shuffle-anomaly detection. |
| `handHistoryRecorder.js` | Persists hand history. |
| `botStrategy.js` | Bot player decision logic. |

## File Counts (top-level)

| Area | Files (excl. node_modules / build) |
|------|------|
| `backend/src` (all subdirs) | ~57 |
| `backend/migrations` | 13 |
| `backend/test` + `backend/tests` | 12 |
| `frontend/app` (all routes) | 11 |
| `frontend/lib` + `public` | 6 |
| `infra` | 14 |
| `deployment` | 7 |
| `docker` | 3 |
| `docs` | 5 |

## Dependencies Between Major Folders

```
frontend/app ──HTTP──▶ backend/src/api/routes ──▶ api/controllers ──▶ models ──▶ config (db/redis)
frontend/lib (api.ts)                              │
frontend/app/table ──WebSocket──▶ websocket/ ──▶ game/ ──▶ models, monitoring
                                                   │
                            game/engine ──▶ engineManager, antiCheatEngine, shuffler, potCalculator
backend/src/server.js ──▶ middleware/, api/, websocket/, config/, monitoring/, utils/
api/routes ──▶ api/controllers ──▶ models, utils (crypto/auth/compliance/2FA)
api/* + websocket/ ──▶ api/middleware (auth) , middleware (rate-limit, headers)
config/database ──▶ migrations (schema) ──▶ PostgreSQL
config/redis ──▶ Redis (rate limiting, sessions)
docker/ + deployment/aws ──build──▶ backend/ image
infra/ (Terraform) ──provisions──▶ host running deployment/aws stack
```

**Direction of imports (who depends on whom):**

- `server.js` is the hub — pulls in `api/`, `websocket/`, `middleware/`, `config/`, `monitoring/`, `utils/`.
- `api/routes/*` → `api/controllers/*` → `models/*` → `config/database`, `config/redis`.
- `websocket/gameEvents` → `game/*` (engine, engineManager) → `models/*`, `monitoring/`.
- `game/engine` is the orchestrator within `game/`; all gameplay actions route through `PokerEngine.processAction()`, which invokes `antiCheatEngine` before state mutation.
- `utils/` and `config/` are leaf dependencies — imported widely, import little.
- Frontend `frontend/lib/api.ts` is the single HTTP boundary; `frontend/app/table/[tableId]` opens a direct Socket.IO connection to `backend/src/websocket`.
- `migrations/` defines the schema consumed by `config/database` and `models/`.
- `docker/` and `deployment/aws/` build/run the `backend/` package; `infra/` provisions the host.

## Notable Structural Notes

- Two middleware locations: `api/middleware/` (auth, error, rate-limit per-route) and `src/middleware/` (global security headers, enhanced rate limiter, input validation).
- Two test directories: `backend/test/` (main suite) and `backend/tests/` (extra engine/integration tests + `tests/src/game/` fixtures).
- `api/gameRoutes.js` and `api/securityRoutes.js` sit directly under `api/`, while CRUD routers live in `api/routes/`.
- WebSocket events use `SCREAMING_SNAKE_CASE`; rooms are named `table:<tableId>`.
- `docker/backend/migrations/` and `deployment/db/migrations/` exist but are currently empty.
