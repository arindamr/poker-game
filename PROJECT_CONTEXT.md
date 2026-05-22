# Project Context

Primer for AI sessions working on this repo. Read this first, then the specific reference doc for your task.

---

## Purpose

A **multiplayer Texas Hold'em poker** web application. Beyond the card game itself, the project is built around three concerns:

- **Security** — JWT auth with DB-backed session hardening, TOTP 2FA, session IP binding, idle timeout.
- **Anti-cheat** — RTA (action-timing), multi-account (device fingerprint), collusion, and shuffle-anomaly detection, with auto-ban at risk > 0.85.
- **Compliance** — KYC, AML transaction monitoring, OFAC sanctions checks, SAR generation, deposit limits, self-exclusion.

Real-time play is delivered over Socket.IO. Tables support **bot players** (`BOT_*` users) so a single human can play.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, Socket.IO (CommonJS) |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| Data | PostgreSQL 15, Redis 7 |
| Infra | Docker Compose on a single AWS Lightsail VM, provisioned by Terraform |

## Current Status (as of 2026-05-22)

The **core gameplay path works**: register/login, lobby, table join/leave, seat selection, bot players, hand play with real-time updates, and the admin/metrics views. This path runs through the `/api/v1/*` REST surface and the `table_seats` + in-memory engine system.

A second, parallel **Phase 5 surface** (`/api/game/*` plus parts of `/api/security/*`) exists for anti-cheat-integrated gameplay, 2FA, and compliance. It is **partially wired and partially broken** — see `TODO.md`.

**21 known discrepancies are tracked in [TODO.md](TODO.md)** (`B*` backend, `S*` security, `A*` architecture, `F*` frontend, `I*` infrastructure). Nothing there is actioned yet — the analysis phase produced the list; fixes come later.

> **Documentation drift warning:** the committed `README.md` and the old `QUICK_START.md` are **stale**. `README.md` describes a *Flutter* frontend — that is wrong; the frontend is **Next.js**. It also reports inflated "98% ready / Phase 5 complete" status and example payloads that don't match the code. Trust the generated analysis docs (below) and the code over `README.md`.

## Architecture at a Glance

```
Browser ──▶ nginx :80 ──┬─ /            ─▶ Next.js frontend
                        ├─ /api , /api/auth ─▶ Express backend :3000
                        └─ /socket.io/  ─▶ Express backend :3000 (Socket.IO)
                                   backend ─▶ PostgreSQL , Redis
```

- All game actions flow through `PokerEngine.processAction()`, which invokes the anti-cheat engine before mutating state.
- Two parallel "player" systems exist: `table_seats` (used by `/api/v1/tables`, the working path) and `game_players` (used by `/api/game`, Phase 5). They are not synchronized — see TODO `A1`.
- Full structure: [CODEBASE_MAP.md](CODEBASE_MAP.md).

## Known Limitations

Summarized from `TODO.md` — consult it for specifics and file/line references.

- **Broken user-facing flows:** registration treats a successful signup as a failure (`F2`); the profile page calls a non-existent endpoint (`F1`).
- **Broken Phase 5 routes:** two endpoints reference unimported validators and 500 on use (`B1`); `errorHandler` middleware is never mounted (`B2`); refreshed tokens are unusable (`B4`).
- **Architecture duplication:** two parallel game/seat systems (`A1`); a redundant `websocket` container that nothing routes to (`I1`); inconsistent API response envelopes (`A2`).
- **Frontend:** no shared components, no custom hooks, no auth context — duplication across 8 pages; one 1,467-line table component (`F5`). No frontend test suite.
- **Infra:** single-node, no managed DB/cache, no HA; production compose bind-mounts host source over the built image (`I2`).
- **Docs:** `README.md` / old `QUICK_START.md` are inaccurate.

## Roadmap (inferred — not an official plan)

Derived from `TODO.md` severity ordering. This is a *suggested* sequence, not a committed plan.

1. **P0 — restore broken user journeys:** fix registration (`F2`) and the profile page (`F1`); mount `errorHandler` (`B2`).
2. **P1 — make Phase 5 coherent:** decide whether `/api/game/*` or `/api/v1/tables/*` is canonical and converge the two game systems (`A1`, `B1`, `F3`); remove or properly wire the `websocket` service (`I1`).
3. **P2 — consistency & safety:** standardize the API response envelope (`A2`); fix the 2FA-disable password check (`S1`); add missing migration tables (`B5`).
4. **P3 — hygiene:** refresh `README.md`; extract frontend components/hooks (`F5`); de-duplicate Dockerfiles/compose (`I3`, `I4`); add a frontend test suite.

## Generated Analysis Docs (map for future sessions)

| Doc | Use it for |
|-----|-----------|
| [CODEBASE_MAP.md](CODEBASE_MAP.md) | Directory structure, entry points, folder dependencies |
| [API.md](API.md) | Every REST/WebSocket endpoint, auth flow, DB schema, middleware |
| [frontend/COMPONENTS.md](frontend/COMPONENTS.md) | Frontend pages, state, styling, libraries |
| [INFRASTRUCTURE.md](INFRASTRUCTURE.md) | Terraform resources, deployment process, integration wiring |
| [CONVENTIONS.md](CONVENTIONS.md) | Code patterns, error handling, naming rules to follow |
| [QUICK_START.md](QUICK_START.md) | How to run, test, and deploy locally |
| [TODO.md](TODO.md) | All 21 known bugs/discrepancies — check before "fixing" something |

`CLAUDE.md` (repo root) holds the canonical command list and architecture notes and is loaded automatically.
