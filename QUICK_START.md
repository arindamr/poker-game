# Quick Start

How to run, test, and deploy this project **locally**. Verified against the current code (2026-05-22).

> This file replaces an earlier, inaccurate version. The committed `README.md` is also stale (it describes a Flutter frontend — the frontend is **Next.js**). Trust this file and the code.

---

## Prerequisites

- **Docker** + Docker Compose v2 (`docker compose`, not `docker-compose`)
- **Node.js 18+** and npm (for running backend/frontend outside Docker)
- `curl` / `jq` for API checks (optional)

Stack: backend on **:3000**, frontend dev on **:3002**, Postgres **:5432**, Redis **:6379**. Full Docker stack also runs nginx on **:80**.

---

## Run Locally

There are two practical setups. **Option A** is closest to production; **Option B** is best for active development.

### Option A — Full stack in Docker (recommended for a realistic run)

Brings up nginx + frontend + backend + websocket + postgres + redis.

```bash
# 1. Create the env file the compose stack reads
cp .env.example deployment/aws/.env
#    Edit deployment/aws/.env — at minimum set DB_USER, DB_PASSWORD, DB_NAME,
#    JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV=development, CORS_ORIGIN, SEED_DEMO_USER, ADMIN_EMAILS, LOG_LEVEL

# 2. Build & start
docker compose -f deployment/aws/docker-compose.yml --env-file deployment/aws/.env up -d --build

# 3. Apply DB migrations (this compose file does NOT auto-run them)
docker exec poker_backend npm run migrate

# 4. Verify
curl http://localhost:3000/health        # -> {"status":"ok","timestamp":"..."}
docker compose -f deployment/aws/docker-compose.yml ps
```

Open the app at **http://localhost** (nginx serves the frontend; `/api` and `/socket.io/` proxy to the backend).

### Option B — Backend in Docker, frontend on host (best for iterating on UI)

The dev compose ([`docker/docker-compose.yml`](docker/docker-compose.yml)) has sane env defaults, runs `npm run dev` (nodemon), and **auto-applies migrations** on a fresh Postgres volume.

```bash
# Backend + Postgres + Redis
docker compose -f docker/docker-compose.yml up -d
# (first-time helper alternative: ./setup-docker.sh)

# Frontend — separate terminal. Backend is :3000, so run the frontend on :3002.
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run dev -- -p 3002
```

Open **http://localhost:3002**. `CORS_ORIGIN` already includes `http://localhost:3002` (see `backend/src/config/env.js`).

If Postgres volume already existed (migrations didn't auto-run): `docker exec poker-app-backend npm run migrate`.

### Demo user

In development with `SEED_DEMO_USER` ≠ `false`, the backend seeds:

```
email:    test@example.com
password: Demo@123456
```

Use this to log in. **Note:** the registration flow is currently broken (a successful signup is shown as an error — see [TODO.md](TODO.md) `F2`), so prefer the demo user for testing.

### Smoke-test the API

```bash
# Health
curl http://localhost:3000/health

# Login (returns tokens.accessToken). /api/auth/login is rate-limited to 5/min.
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"Demo@123456"}'

# Authenticated call
TOKEN="<accessToken from above>"
curl http://localhost:3000/api/v1/tables -H "Authorization: Bearer $TOKEN"
```

Full endpoint reference: [API.md](API.md).

---

## Test

### Backend (Jest + Supertest)

```bash
cd backend
npm install
npm test                                  # full suite + coverage
npm test -- test/engine.test.js            # one file
npm test -- --testNamePattern="deal"       # by test name
npm run test:integration                   # integration tests — needs a running DB
npm run lint                               # airbnb-base ESLint
```

### Frontend

No unit-test suite exists. Only:

```bash
cd frontend
npm run lint        # eslint-config-next
npm run build       # type-check + production build
```

### Endpoint smoke tests

```bash
./test-local.sh     # runs curl-based checks against a running Docker stack
```

---

## Deploy Locally (production-shaped)

"Deploy locally" = run the full production-shaped stack on your machine. That is **Option A** above: the `deployment/aws/docker-compose.yml` stack behind nginx on port 80.

For the **real** cloud deployment (AWS Lightsail via Terraform — `terraform apply`, cloud-init bootstrap, `deploy.sh`), see [INFRASTRUCTURE.md](INFRASTRUCTURE.md). Do not run `terraform apply` as part of local work.

---

## Common Tasks

```bash
# Logs
docker logs -f poker_backend                       # Option A backend
docker logs -f poker-app-backend                   # Option B backend

# Database shell
docker exec -it poker_postgres psql -U postgres -d poker_game
#   \dt                 list tables
#   SELECT id,email FROM users LIMIT 5;

# Redis shell
docker exec -it poker_redis redis-cli ping          # -> PONG

# Re-run migrations
docker exec poker_backend npm run migrate

# Tear down
docker compose -f deployment/aws/docker-compose.yml down       # keep volumes
docker compose -f deployment/aws/docker-compose.yml down -v    # also wipe DB/Redis data
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Backend won't start, "JWT secrets must be configured" | `NODE_ENV` is not `development` and secrets are still defaults. Set real `JWT_SECRET`/`JWT_REFRESH_SECRET` or `NODE_ENV=development`. |
| Port 3000 already in use | `lsof -ti:3000 \| xargs kill -9`, or another service is bound. |
| Login returns 429 | `/api/auth/login` is rate-limited to 5/min. Wait, or set `ENABLE_RATE_LIMITING=false`. |
| Tables empty / DB errors on first run | Migrations didn't run. `docker exec <backend> npm run migrate`. |
| Registration shows an error on success | Known bug — TODO `F2`. Use the demo user instead. |
| `/profile` page fails to load | Known bug — TODO `F1` (wrong endpoint + response shape). |
| `docker-compose: command not found` | Use Docker Compose **v2** syntax: `docker compose`. |

Before fixing any unexpected behavior, **check [TODO.md](TODO.md)** — it may already be a known, catalogued issue.
