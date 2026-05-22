# Backend API Reference

Generated from analysis of `backend/src/`. Texas Hold'em poker backend — Node.js / Express / Socket.IO.

Entry point: [`backend/src/server.js`](backend/src/server.js) wires the middleware stack, mounts routers, and starts Socket.IO on the same `http.Server`.

---

## 1. Conventions

### Base paths & router mounting

Mounted in [`server.js:130-142`](backend/src/server.js#L130):

| Mount path | Router | File |
|------------|--------|------|
| `/api/v1/auth`, `/api/auth` | Auth | [`api/routes/auth.js`](backend/src/api/routes/auth.js) |
| `/api/auth`, `/api/security` | Security / 2FA / compliance | [`api/securityRoutes.js`](backend/src/api/securityRoutes.js) |
| `/api/v1/users` | Users | [`api/routes/users.js`](backend/src/api/routes/users.js) |
| `/api/v1/tables` | Tables (gameplay) | [`api/routes/tables.js`](backend/src/api/routes/tables.js) |
| `/api/v1/admin` | Admin | [`api/routes/admin.js`](backend/src/api/routes/admin.js) |
| `/api/game` | Game w/ anti-cheat (Phase 5) | [`api/gameRoutes.js`](backend/src/api/gameRoutes.js) |

> Note: `/api/auth` has **both** `securityRoutes` and `authRoutes` mounted, so `/api/auth/login` and `/api/auth/2fa/enable` both resolve.

### Auth header

Protected endpoints expect `Authorization: Bearer <accessToken>`. Token parsed at [`authMiddleware.js:12-13`](backend/src/api/middleware/authMiddleware.js#L12).

### Response envelopes

Two inconsistent styles exist in the codebase:

- **v1 routes** (`auth`, `users`, `tables`, `admin`): `{ "success": true, ... }` or `{ "success": false, "error": "...", "code"?: "..." }`.
- **Phase 5 routes** (`/api/game`, `/api/security`): bare objects on success (e.g. `{ "gameId": ... }`), and `{ "error": "..." }` on failure — no `success` flag.
- **express-validator failures** (`validate` in [`middleware/inputValidation.js:7`](backend/src/middleware/inputValidation.js#L7)): `{ "success": false, "message": "Validation failed", "errors": [{ "field": "msg" }] }`.

### Status codes

`200` ok · `201` created · `400` validation/bad request · `401` unauthenticated · `403` forbidden/banned · `404` not found · `409` duplicate · `429` rate-limited · `500` server error · `501` feature schema missing (2FA).

---

## 2. Authentication Flow

JWT-based with DB-backed session hardening (Phase 5). Crypto helpers: [`utils/crypto.js`](backend/src/utils/crypto.js).

### Tokens

| Token | Secret (`config/env.js`) | TTL | Storage |
|-------|--------------------------|-----|---------|
| Access JWT | `JWT_SECRET` | `JWT_EXPIRATION` (24h) | Client; **SHA-256 hash** stored in `sessions.token_hash` |
| Refresh JWT | `JWT_REFRESH_SECRET` | `JWT_REFRESH_EXPIRATION` (7d) | Redis key `refresh_token:<userId>` |

JWT payload: `{ sub: <userId>, username, email }` ([`authController.js:100`](backend/src/api/controllers/authController.js#L100)). The server refuses to boot outside `development` if the dev-default secrets are still set ([`server.js:162`](backend/src/server.js#L162)).

### Flow

1. **Register** — `POST /api/auth/register` → bcrypt-hash password → `User.create` → `201`.
2. **Login** — `POST /api/auth/login` → `User.findByEmail` → `comparePassword` (bcrypt) → issue access + refresh tokens → create `sessions` row (token hash, device fingerprint, IP, 24h expiry) → cache refresh token in Redis → `User.recordLastLogin`.
3. **Authenticated request** — `authenticateToken` ([`authMiddleware.js:10`](backend/src/api/middleware/authMiddleware.js#L10)) runs five checks:
   1. Verify JWT signature/expiry (`verifyToken`).
   2. Look up `sessions` row by `hashToken(token)`; must exist and be `is_active`.
   3. **IP binding** — if `VALIDATE_SESSION_IP=true` and session IP ≠ request IP, invalidate session (enforced only when `NODE_ENV !== development`).
   4. **Idle timeout** — 30-min sliding window on `sessions.last_activity`; expired → invalidate + `401 SESSION_TIMEOUT`.
   5. Update `last_activity`, set `req.user` (`payload.id` is back-filled from `sub`) and `req.sessionId`.
4. **Refresh** — `POST /api/auth/refresh` with `{ refreshToken }` → verify signature → must equal the Redis-cached token → returns a fresh access token. (No new `sessions` row is created — see Caveats.)
5. **Logout** — `POST /api/auth/logout` → invalidate the `sessions` row, delete the Redis refresh token.
6. **WebSocket** — token passed via `socket.handshake.auth.token`; verified by JWT signature **only** (no DB session check) in [`socketHandler.js:26`](backend/src/websocket/socketHandler.js#L26).

### Authorization tiers

- `optionalAuth` — attaches `req.user` if a token is present, never rejects.
- `authenticateToken` — full session-hardened check above.
- `requireAdmin` ([`authMiddleware.js:151`](backend/src/api/middleware/authMiddleware.js#L151)) — `req.user.email` must be in `ADMIN_EMAILS`. Used by `/api/v1/admin`.
- `authorizeRole('admin')` — checks `req.user.role`. ⚠️ The login JWT carries no `role` claim, so this gate always 403s (see Caveats).

---

## 3. Endpoints

### 3.1 Auth — `/api/auth` and `/api/v1/auth`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/register` | public (`registrationLimiter`) | Create account |
| POST | `/login` | public (`loginLimiter`) | Authenticate, issue tokens |
| POST | `/refresh` | public | Exchange refresh token for new access token |
| POST | `/logout` | Bearer | Invalidate session + refresh token |
| GET | `/verify` | Bearer | Echo current user identity |

**`POST /register`** — request:
```json
{ "username": "alice", "email": "a@b.com", "password": "Passw0rd!", "confirmPassword": "Passw0rd!" }
```
Validated twice: express-validator `authValidation.register` ([`inputValidation.js:33`](backend/src/middleware/inputValidation.js#L33)) then Joi `validateRegister` ([`utils/validators.js:7`](backend/src/utils/validators.js#L7)) — the Joi schema additionally **requires `confirmPassword`**. Response `201`:
```json
{ "success": true, "message": "User registered successfully",
  "user": { "id": "uuid", "username": "alice", "email": "a@b.com" } }
```
Errors: `409 EMAIL_EXISTS`, `400` validation.

**`POST /login`** — request `{ "email", "password" }`. Response `200`:
```json
{ "success": true, "message": "Login successful",
  "user": { "id", "username", "email", "accountBalance" },
  "tokens": { "accessToken": "jwt", "refreshToken": "jwt" } }
```
Errors: `401 Invalid email or password`.

**`POST /refresh`** — `{ "refreshToken" }` → `{ "success": true, "accessToken": "jwt" }`.

### 3.2 Users — `/api/v1/users` (all Bearer; self-only)

Every handler enforces `params.userId === req.user.sub` → else `403`. Source: [`userController.js`](backend/src/api/controllers/userController.js).

| Method | Path | Purpose | Response |
|--------|------|---------|----------|
| GET | `/:userId` | Get profile | `{ success, user }` |
| PUT | `/:userId` | Update profile (only `username`) | `{ success, user }` |
| GET | `/:userId/balance` | Account + total balance | `{ success, balance: { accountBalance, totalBalance } }` |
| POST | `/:userId/deposit` | Add chips (`{ amount }`) — payment integration is a TODO stub | `{ success, balance }` |
| POST | `/:userId/withdraw` | Remove chips (`{ amount }`); checks sufficient balance | `{ success, balance }` |

### 3.3 Tables / Gameplay — `/api/v1/tables`

Primary gameplay surface used by the frontend. Backed by `table_seats` + the in-memory engine manager. Source: [`tableController.js`](backend/src/api/controllers/tableController.js).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | optional | List `WAITING`/`RUNNING` tables (`?limit`, `?offset`) |
| POST | `/` | Bearer | Create table (Joi `validateTableCreation`) |
| GET | `/:tableId` | optional | Table details |
| DELETE | `/:tableId` | Bearer | Delete table (creator only) |
| POST | `/:tableId/join` | Bearer | Claim a seat (auto-picks lowest free position) |
| DELETE | `/:tableId/leave` | Bearer | Vacate seat |
| GET | `/:tableId/seats` | optional | Seat map + `yourSeat` |
| POST | `/:tableId/bots` | Bearer | Add bots (`{ count }`, 1–5, max 5/table) |
| DELETE | `/:tableId/bots` | Bearer | Remove bot by `{ seatPosition }` |
| POST | `/:tableId/action` | Bearer | Submit a poker action; bots then auto-act |
| GET | `/:tableId/state` | Bearer | Engine snapshot for the caller |
| POST | `/:tableId/next-hand/ready` | Bearer | Confirm readiness; next hand starts when all humans confirm |

**`POST /:tableId/action`** — request `{ "action": "RAISE", "amount": 50 }`. Action is upper-cased and checked against `ACTION` enum from [`game/gameState.js`](backend/src/game/gameState.js). Response:
```json
{ "success": true,
  "state": { /* getGameStateForPlayer — hole cards only for caller */ },
  "botActions": [ { "playerId", "action", "amount", "street" } ],
  "roundResult": null,
  "nextHand": null }
```
Engine rejections (`not player turn`, `insufficient chips`, `raise must…`) → `400` with the engine message. Side effect: emits `GAME_STATE_UPDATE`, `PLAYER_ACTION_BROADCAST`, `BOT_ACTIONS`, `HAND_COMPLETED` to room `table:<tableId>`.

**`POST /`** — request:
```json
{ "name": "Friday Game", "smallBlind": 1, "bigBlind": 2,
  "minBuyIn": 100, "maxBuyIn": 1000, "maxSeats": 6 }
```
→ `201 { success, message, table }`.

### 3.4 Admin — `/api/v1/admin` (Bearer + `requireAdmin`)

Source: [`adminController.js`](backend/src/api/controllers/adminController.js). Param validation via express-validator in [`routes/admin.js`](backend/src/api/routes/admin.js).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/tables` | All tables + creator info |
| DELETE | `/tables/:tableId` | Force-delete a table |
| GET | `/cheat-detections` | Paginated cheat-detection feed (`?limit` 1–100, `?offset`) |
| GET | `/cheat-detections/:userId` | One user's cheat history |
| POST | `/cheat-suspicions/:userId/review` | Annotate detections (`{ status: dismissed\|confirmed, notes? }`) |
| POST | `/cheat-suspicions/:userId/ban` | Ban user + delete all sessions (`{ reason? }`) |

### 3.5 Game w/ Anti-Cheat — `/api/game` (all Bearer)

Phase 5 surface. Independent of §3.3 — uses the `game_players` table and a **separate** in-memory engine map. Source: [`gameRoutes.js`](backend/src/api/gameRoutes.js).

| Method | Path | Rate limit | Purpose |
|--------|------|-----------|---------|
| POST | `/tables` | 20/min | Create game; seats creator; checks ban/suspend/balance |
| POST | `/tables/:gameId/join` | 50/min | Join; runs multi-account detection (ban at score > 0.85) |
| POST | `/tables/:gameId/action` | 100/10s | Action; runs RTA detection before processing |
| GET | `/tables/:gameId/state` | — | DB-level game state snapshot |
| POST | `/tables/:gameId/verify-shuffle` | — | Validate `{ seed, deck }`; suspends game if invalid |
| POST | `/tables/:gameId/cash-out` | — | Credit stack to balance; AML check + SAR on large sums |
| GET | `/tables/:gameId/history` | — | `hand_history` rows for the game |

**`POST /tables`** — request `{ blinds: { small, big }, buyIn, maxPlayers }` → `201 { gameId, blinds, buyIn, maxPlayers, status }`. Anti-cheat thresholds throughout: suspicious `> 0.7` (logs to `cheat_detection`), auto-ban `> 0.85`.

### 3.6 Security / 2FA / Compliance — `/api/security` (and `/api/auth`)

Source: [`securityRoutes.js`](backend/src/api/securityRoutes.js). 2FA via `speakeasy` ([`utils/twoFactorAuth.js`](backend/src/utils/twoFactorAuth.js)); compliance via [`utils/complianceService.js`](backend/src/utils/complianceService.js).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/2fa/enable` | Bearer | Generate TOTP secret + QR + backup codes (pending) |
| POST | `/2fa/verify-setup` | Bearer | Confirm setup with `{ token }`; activates 2FA |
| POST | `/2fa/disable` | Bearer | Disable with `{ password }` |
| GET | `/2fa/status` | Bearer | Current 2FA state |
| POST | `/2fa/backup-code` | Bearer | Consume a `{ backupCode }` |
| POST | `/game/:gameId/monitor-cheat` | Bearer | Run RTA/multi-account/collusion checks; log if risk > 0.7 |
| POST | `/game/:gameId/verify-shuffle` | Bearer | Verify shuffle randomness |
| POST | `/kyc/initiate` | Bearer | Start KYC; sanctions-list check |
| GET | `/kyc/status` | Bearer | Compliance status |
| POST | `/financial/deposit` | Bearer | Deposit with limit + AML checks; SAR on suspicion |
| POST | `/responsible-gaming/self-exclude` | Bearer | Self-exclusion `{ duration: 7d\|30d\|permanent }` |
| GET | `/compliance/dashboard` | Bearer + `authorizeRole('admin')` | 7-day compliance report |

2FA endpoints return `501 { error: "2FA not implemented" }` if the underlying schema columns are missing (PG error codes `42703`/`42P01`).

### 3.7 System

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health`, `/api/health` | public | `{ status: "ok", timestamp }` |
| GET | `/metrics` | Bearer | Prometheus text-format metrics |
| GET | `/admin/metrics` | Bearer | JSON metrics snapshot |

---

## 4. WebSocket API

Socket.IO on the shared HTTP server. Init: [`socketHandler.js`](backend/src/websocket/socketHandler.js); per-socket handlers: [`gameEvents.js`](backend/src/websocket/gameEvents.js). Rooms are named `table:<tableId>`. Auth: JWT in `handshake.auth.token`.

**Client → server** (each takes a `callback({ success })`):

| Event | Payload | Effect |
|-------|---------|--------|
| `JOIN_TABLE` | `{ tableId }` | Join room; broadcast `PLAYER_JOINED` |
| `LEAVE_TABLE` | `{ tableId }` | Leave room; broadcast `PLAYER_LEFT` |
| `PLAYER_ACTION` | `{ tableId, action, amount }` | Broadcast `PLAYER_ACTION_BROADCAST` (no engine mutation here) |
| `PLAYER_READY` | `{ tableId }` | Broadcast `PLAYER_READY_NOTIFICATION` |
| `CHAT_MESSAGE` | `{ tableId, message }` | Broadcast `CHAT_MESSAGE_BROADCAST` (≤ 500 chars) |

**Server → client** (emitted by `tableController` via the [`io.js`](backend/src/websocket/io.js) singleton): `GAME_STATE_UPDATE`, `PLAYER_ACTION_BROADCAST`, `BOT_ACTIONS`, `HAND_COMPLETED`, `NEXT_HAND_STARTED`, `NEXT_HAND_STATUS`, `PLAYER_JOINED`, `PLAYER_LEFT`.

> Authoritative game state flows through the **REST** `tableController`; `gameEvents.js` only relays notifications.

---

## 5. Database Schema

PostgreSQL. Migrations run via `npm run migrate` ([`migrations/migrate.js`](backend/migrations/migrate.js)) over [`backend/migrations/`](backend/migrations) `001`–`012`.

### Core tables (`001`–`011`)

| Table | Key columns | Notes |
|-------|-------------|-------|
| `users` | `id` UUID PK, `username`/`email` UNIQUE, `password_hash`, `account_balance`, `total_balance`, `is_active`, `device_fingerprint`, `ip_address` | `CHECK` balances ≥ 0 |
| `sessions` | `id`, `user_id`→users, `token_hash` UNIQUE, `device_id`, `ip_address`, `expires_at`, `is_active`, `last_activity` | SHA-256 token hash; idle-timeout source |
| `game_tables` | `id`, `name`, `small_blind`/`big_blind`, `min_buy_in`/`max_buy_in`, `max_seats`, `current_players`, `status`, `created_by`→users | `status` `WAITING`/`RUNNING` |
| `table_seats` | `id`, `table_id`→game_tables, `player_id`→users, `position`, `stack`, `is_seated` | UNIQUE `(table_id, position)` |
| `games` | `id`, `table_id`, `hand_number`, blind/button positions, `final_pot`, `winner_id` | One row per hand |
| `hand_history` | `id`, `game_id`→games, `action_order`, `player_id`, `action`, `amount`, `street` | Action log |
| `player_cards` | `id`, `game_id`, `player_id`, `card_1`, `card_2` | UNIQUE `(game_id, player_id)` |
| `community_cards` | `id`, `game_id`, `card_position` (0–4), `card` | UNIQUE `(game_id, card_position)` |
| `game_results` | `id`, `game_id`, `player_id`, `hole_cards`, `best_hand`, `final_stack`, `win_amount`, `finish_position` | Per-player hand outcome |
| `rng_audit` | `id`, `game_id`, `seed_hash`, `deck_hash` | Shuffle integrity audit |
| `cheat_detection` | `id`, `user_id`, `detection_type`, `severity`, `details` JSONB, `resolved` | Extended by `012` (see below) |

### Phase 5 additions (`012_add_phase5_security_columns.sql`)

- **`users`** — `+ two_fa_enabled, two_fa_secret, two_fa_pending, backup_codes_hash, is_suspended, suspension_reason, suspension_until, is_banned, ban_reason, daily/weekly/monthly_deposit_limit, daily_deposit_used`.
- **`game_tables`** — `+ creator_id, blinds` JSONB`, buy_in, max_players` (compatibility columns for `/api/game`).
- **`cheat_detection`** — `+ game_id, suspicion_type, risk_score, risk_level, score, created_at` (the columns the anti-cheat `INSERT`s actually use).
- New tables: `two_fa_audit`, `compliance_audit`, `game_players`, `deposit_withdrawals`, `deposits_withdrawals` (typo-compat duplicate), `self_exclusions`.

> Two parallel "player" tables exist: `table_seats` (used by `/api/v1/tables`) and `game_players` (used by `/api/game`). They are **not** synchronized.

---

## 6. Models

ActiveRecord-style modules in [`backend/src/models/`](backend/src/models) — thin wrappers over the `pg` pool (`db.query` / `db.getOne` / `db.getAll` / `db.transaction` from [`config/database.js`](backend/src/config/database.js)).

| Model | File | Key methods |
|-------|------|-------------|
| `User` | [`User.js`](backend/src/models/User.js) | `create`, `findById`, `findByEmail`, `findByUsername`, `update`, `updateBalance`, `recordLastLogin`, `getAll` |
| `Session` | [`Session.js`](backend/src/models/Session.js) | `create`, `findByTokenHash`, `findByUserId`, `updateLastActivity`, `invalidate`, `invalidateAllUserSessions`, `cleanupExpired`, `getUserSessionCount` |
| `GameTable` | [`GameTable.js`](backend/src/models/GameTable.js) | `create`, `findById`, `getActive`, `updatePlayerCount`, `updateStatus`, `delete` (cascades `games`/`rng_audit`/`table_seats`) |

`table_seats`, `game_players`, `cheat_detection`, `compliance_audit`, etc. have no model — controllers issue raw SQL.

---

## 7. Middleware

Global stack, in order ([`server.js:43-104`](backend/src/server.js#L43)):

1. **Security headers** — [`middleware/securityHeaders.js`](backend/src/middleware/securityHeaders.js) — Helmet + CSP.
2. **Compression** — gzip.
3. **CORS** — origin allow-list from `CORS_ORIGIN`; `.local` hostnames permitted in dev ([`utils/corsOrigin.js`](backend/src/utils/corsOrigin.js)).
4. **Body parsing** — JSON + urlencoded, **10 kb** limit.
5. **Enhanced rate limiting** — [`middleware/enhancedRateLimiter.js`](backend/src/middleware/enhancedRateLimiter.js) — Redis-backed, progressive penalties. Global `/api/` 1000/min; `/api/auth/login` 5/min.
6. **Metrics tracker** — records request count/duration/errors per endpoint.

Per-route middleware:

| Middleware | File | Role |
|------------|------|------|
| `authenticateToken` / `optionalAuth` / `requireAdmin` / `authorizeRole` | [`api/middleware/authMiddleware.js`](backend/src/api/middleware/authMiddleware.js) | JWT + session validation, RBAC |
| `loginLimiter` / `registrationLimiter` / `apiLimiter` | [`api/middleware/rateLimiter.js`](backend/src/api/middleware/rateLimiter.js) | `express-rate-limit` (login 5/15min, register 3/hr) |
| `authValidation` / `gameValidation` / `securityValidation` / `validate` | [`middleware/inputValidation.js`](backend/src/middleware/inputValidation.js) | `express-validator` rule sets |
| `validateRegister` / `validateLogin` / `validateTableCreation` / … | [`utils/validators.js`](backend/src/utils/validators.js) | Joi schemas (used inside controllers) |
| `asyncHandler` / `errorHandler` | [`api/middleware/errorHandler.js`](backend/src/api/middleware/errorHandler.js) | Promise wrapper + DB-aware error formatter |

---

## 8. Services

| Service | File | Responsibility |
|---------|------|----------------|
| Poker engine | [`game/engine.js`](backend/src/game/engine.js), [`game/gameState.js`](backend/src/game/gameState.js) | One full hand lifecycle; state machine `PRE_GAME → … → HAND_COMPLETE` |
| Engine manager | [`game/engineManager.js`](backend/src/game/engineManager.js) | In-memory `Map<tableId, PokerEngine>`; lazy create / `resetEngine` |
| Anti-cheat | [`game/antiCheatEngine.js`](backend/src/game/antiCheatEngine.js) | RTA, multi-account, collusion, shuffle anomaly. Suspicious `>0.5`, auto-ban `>0.85` |
| Shuffler | [`game/shuffler.js`](backend/src/game/shuffler.js) | Crypto-secure shuffle + RNG audit hashing |
| Pot calculator | [`game/potCalculator.js`](backend/src/game/potCalculator.js) | Side-pot math |
| Hand evaluator | [`game/handEvaluator.js`](backend/src/game/handEvaluator.js) | Hand ranking |
| Bot strategy | [`game/botStrategy.js`](backend/src/game/botStrategy.js) | `decideBotAction` for `BOT_*` users |
| 2FA | [`utils/twoFactorAuth.js`](backend/src/utils/twoFactorAuth.js) | TOTP setup/verify, backup codes (`speakeasy` + `qrcode`) |
| Compliance | [`utils/complianceService.js`](backend/src/utils/complianceService.js) | KYC, AML transaction monitoring, OFAC/sanctions, SAR creation |
| Monitoring | [`monitoring/monitoringService.js`](backend/src/monitoring/monitoringService.js) | In-process metrics, Prometheus export, alert rules |
| Crypto | [`utils/crypto.js`](backend/src/utils/crypto.js) | bcrypt hashing, JWT sign/verify, token hashing, device fingerprint |
| DB / Redis | [`config/database.js`](backend/src/config/database.js), [`config/redis.js`](backend/src/config/redis.js) | `pg` pool, `ioredis` client |

---

## 9. Known Discrepancies

Found while tracing the code — relevant when consuming the API:

1. **`gameValidation` / `securityValidation` not imported.** [`gameRoutes.js:230`](backend/src/api/gameRoutes.js#L230) references `gameValidation.action` and [`securityRoutes.js:346`](backend/src/api/securityRoutes.js#L346) references `securityValidation.deposit`, but neither file imports those symbols from `inputValidation.js`. As written this is a `ReferenceError` at route registration — `POST /api/game/tables/:gameId/action` and `POST /api/security/financial/deposit` cannot be served until the import is added.
2. **`errorHandler` is never mounted.** It is exported by `errorHandler.js` but `server.js` does not `app.use(errorHandler)`. Errors thrown inside `asyncHandler` fall through to Express's default handler (HTML 500), not the documented `{ success:false, error, code }` envelope.
3. **`authorizeRole('admin')` always 403s.** The login JWT payload has no `role` claim, so `GET /api/security/compliance/dashboard` is effectively unreachable. Admin gating that *works* is `requireAdmin` (email allow-list) on `/api/v1/admin`.
4. **Refresh does not rotate the session.** `POST /refresh` mints a new access token but creates no `sessions` row; that token has no DB session, so `authenticateToken` (step 2) rejects it with `SESSION_INVALID`.
5. **Tables referenced but not created by the migration runner.** `securityRoutes.js` writes to `rate_limit_violations` and `sar_reports`; neither is created by `backend/migrations/`. (`rate_limit_violations` exists only in the unused [`src/database/012_add_security_tables.sql`](backend/src/database/012_add_security_tables.sql).)
6. **2FA disable password check is unsafe.** [`securityRoutes.js:136`](backend/src/api/securityRoutes.js#L136) compares the bcrypt hash buffer against the raw password with `crypto.timingSafeEqual` — it throws on length mismatch rather than verifying the password.
