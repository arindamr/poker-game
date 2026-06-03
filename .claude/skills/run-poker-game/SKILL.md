---
name: run-poker-game
description: Run, start, launch, screenshot, or test the poker game app. Drives the Next.js frontend and Node.js/Express backend. Use for verifying UI changes, taking screenshots, testing the login flow, or smoke-testing the API.
---

# Run Poker Game

Full-stack Texas Hold'em app. Backend is Node.js/Express (port 3002) + Socket.IO (port 3001); frontend is Next.js 16 (port 3000). Infrastructure: PostgreSQL + Redis via Docker. The interaction harness is `.claude/skills/run-poker-game/driver.mjs`, a Playwright-based script that drives the browser headlessly from the repo root.

Demo user (seeded automatically): `test@example.com` / `Demo@123456`

---

## Prerequisites

```bash
# Docker (for postgres + redis)
docker-compose -f docker/docker-compose.yml up -d postgres redis

# Root-level playwright (already committed to repo root package.json)
npm install   # from repo root — installs playwright
npx playwright install chromium
```

---

## Start the backend

```bash
cd backend
npm install
npm run migrate
npm run dev
# Starts on port 3002. Verify: curl http://localhost:3002/health
```

If you see `Cannot find module './wrapAsync.js'` (corrupt `async` sub-dep under `winston`):
```bash
cd backend && rm -rf node_modules && npm install
```

If you see `Cannot find module './lib/async-callback-set'` in Next.js:
```bash
cd frontend && rm -rf node_modules && npm install
```

---

## Start the frontend

```bash
cd frontend
npm install
npm run dev
# Starts on port 3000 (Turbopack). Logs: /tmp/frontend.log
```

Frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env.local` (already set to `http://localhost:3002`).

---

## Run — agent path (driver)

Run all commands from the **repo root** (not from `backend/` or `frontend/`):

```bash
# Screenshot the home page (no login required)
node .claude/skills/run-poker-game/driver.mjs screenshot home

# Full golden path: home → login → lobby
node .claude/skills/run-poker-game/driver.mjs flow

# Log in and screenshot the result
node .claude/skills/run-poker-game/driver.mjs login test@example.com Demo@123456

# Navigate to the lobby page (after login)
node .claude/skills/run-poker-game/driver.mjs lobby

# Register a new user
node .claude/skills/run-poker-game/driver.mjs register newuser@example.com Demo@123456 NewUser

# Hit a backend API endpoint (GET, prints JSON)
node .claude/skills/run-poker-game/driver.mjs api /health
node .claude/skills/run-poker-game/driver.mjs api /api/v1/tables
```

Screenshots land in `/tmp/poker-screenshots/<name>.png`.

Environment overrides:
- `FRONTEND_URL` (default `http://localhost:3000`)
- `BACKEND_URL` (default `http://localhost:3002`)
- `SS_DIR` (default `/tmp/poker-screenshots`)

---

## Run — human path

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev

# Open http://localhost:3000 in a browser
```

---

## Backend API (curl)

```bash
# Health check
curl http://localhost:3002/health

# Login
curl -s -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Demo@123456"}'

# List tables (authenticated)
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Demo@123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])")
curl -s http://localhost:3002/api/v1/tables -H "Authorization: Bearer $TOKEN"
```

---

## Tests

```bash
cd backend && npm test                         # Jest unit tests with coverage
cd backend && npm run test:integration         # Requires running postgres/redis
```

---

## Gotchas

- **`async` module missing `wrapAsync.js`** — `winston` pulls in `async` 3.2.6, which can arrive with missing internal files on npm cache hits. Fix: `rm -rf backend/node_modules && npm install` from `backend/`.

- **Next.js 16 missing `./lib/async-callback-set`** — same cause (partial module cache). Fix: `rm -rf frontend/node_modules && npm install` from `frontend/`.

- **Driver must run from repo root** — `import { chromium } from 'playwright'` resolves against `node_modules/playwright` at the repo root (`package.json` there). Running from `backend/` or anywhere else will throw `ERR_MODULE_NOT_FOUND`.

- **Backend runs on port 3002, not 3000** — `backend/.env` sets `PORT=3002`. The frontend's `NEXT_PUBLIC_API_URL` in `.env.local` is already set to `http://localhost:3002`.

- **After login, `/dashboard` and `/lobby` render the same page** — the dashboard route redirects to lobby; both show "Available Tables" with the "Create Table" form.

- **`SEED_DEMO_USER=true` in `.env`** — the demo user (`test@example.com` / `Demo@123456`) is created on first migration. If you wipe the DB, re-run `npm run migrate` to recreate it.

- **WebSocket URL in `.env.local`** — `NEXT_PUBLIC_WS_URL` is set to a LAN hostname (`Arindams-MacBook-Air.local`). Change this to `ws://localhost:3001` if WebSocket features need testing in a different environment.
