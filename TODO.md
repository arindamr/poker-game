# TODO / Known Actions & Discrepancies

Running log of issues found during codebase analysis. **Not yet actioned** — to be revisited and prioritized after analysis is complete.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done

---

## Backend — Bugs (break functionality)

### [x] B1 — Undefined `gameValidation` / `securityValidation` in route files
- **Severity:** Critical — crashes server startup. (Re-rated from "High" after Phase 1 verification.)
- **Location:** [`gameRoutes.js:230`](backend/src/api/gameRoutes.js#L230), [`securityRoutes.js:346`](backend/src/api/securityRoutes.js#L346)
- **Detail:** `gameRoutes.js` references `gameValidation.action` and `securityRoutes.js` references `securityValidation.deposit`, but neither file imports those symbols (they are exported from [`middleware/inputValidation.js`](backend/src/middleware/inputValidation.js)). The `router.post(...)` calls evaluate at **module load**, so `require('./api/gameRoutes')` / `require('./api/securityRoutes')` throw `ReferenceError` and **`server.js` crashes on startup** — this is not limited to two endpoints. Must be fixed together with B6 before the backend can boot.
- **Action:** Add `const { gameValidation, securityValidation } = require('../middleware/inputValidation');` to the respective files (both are in `src/api/`, so `../middleware/` is correct for them).

### [x] B2 — `errorHandler` middleware is never mounted
- **Severity:** Medium — error responses bypass the standard envelope.
- **Location:** [`errorHandler.js`](backend/src/api/middleware/errorHandler.js), [`server.js`](backend/src/server.js)
- **Detail:** `errorHandler` is exported but `server.js` never calls `app.use(errorHandler)`. Errors thrown inside `asyncHandler` fall through to Express's default handler (HTML 500) instead of the documented `{ success:false, error, code }` JSON.
- **Action:** Mount `app.use(errorHandler)` after all routes (after the 404 handler) in `server.js`.

### [x] B3 — `authorizeRole('admin')` can never pass
- **Severity:** Medium — makes one admin endpoint unreachable.
- **Location:** [`authMiddleware.js:132`](backend/src/api/middleware/authMiddleware.js#L132), [`securityRoutes.js:445`](backend/src/api/securityRoutes.js#L445)
- **Detail:** `authorizeRole` checks `req.user.role`, but the login JWT payload (`authController.js:100`) only carries `sub`/`username`/`email` — no `role`. `GET /api/security/compliance/dashboard` therefore always returns `403`.
- **Action:** Either add a `role` claim to the JWT, or switch the route to use `requireAdmin` (email allow-list) for consistency with `/api/v1/admin`.

### [x] B4 — `POST /refresh` issues a token with no session row
- **Severity:** Medium — refreshed tokens are immediately rejected.
- **Location:** [`authController.js:151`](backend/src/api/controllers/authController.js#L151)
- **Detail:** `refreshToken` mints a new access token but creates no `sessions` row. `authenticateToken` step 2 looks up the session by token hash and rejects with `SESSION_INVALID`, so the refreshed token is unusable.
- **Action:** On refresh, create a new `sessions` row (token hash, device, IP, expiry) — mirroring the login flow.

### [x] B5 — Phase 5 tables referenced but not created by the migration runner
- **Severity:** Medium — compliance/deposit routes fail at runtime.
- **Location:** [`securityRoutes.js`](backend/src/api/securityRoutes.js) (`rate_limit_violations`, `sar_reports`), [`migrations/`](backend/migrations)
- **Detail:** `securityRoutes.js` writes to `rate_limit_violations` and `sar_reports`; neither is created by any file in `backend/migrations/`. `rate_limit_violations` exists only in the unused [`src/database/012_add_security_tables.sql`](backend/src/database/012_add_security_tables.sql).
- **Action:** Add a migration creating `rate_limit_violations` and `sar_reports` (and confirm `complianceService` expectations), or reconcile the two `012_*` files.

### [x] B6 — Route files require `inputValidation` from the wrong path → server will not start
- **Severity:** Critical — backend crashes on startup; current `HEAD` does not boot. Found during Phase 1 functional verification.
- **Location:** [`auth.js:11`](backend/src/api/routes/auth.js#L11), [`admin.js:4`](backend/src/api/routes/admin.js#L4)
- **Detail:** Both files live in `src/api/routes/` and do `require('../middleware/inputValidation')`, which resolves to `src/api/middleware/inputValidation` — a path that does not exist. The module is at `src/middleware/inputValidation.js`; the correct require is `../../middleware/inputValidation`. (Lines 9–10 of `auth.js` correctly use `../middleware/` because `authMiddleware`/`rateLimiter` really are in `src/api/middleware/`.) `node src/server.js` crashes immediately: `Error: Cannot find module '../middleware/inputValidation'`. Introduced by commit `57c94ff`; confirmed not caused by the Phase 1 changes (`git status` shows only `server.js` + `authController.js` modified).
- **Action:** Change the require in both files to `require('../../middleware/inputValidation')`. Fix alongside B1 — both block server startup.

### [x] B7 — KYC initiation always fails (truthy-object check)
- **Severity:** Medium — `POST /api/security/kyc/initiate` always returns `403`.
- **Location:** [`securityRoutes.js`](backend/src/api/securityRoutes.js) — `/kyc/initiate` handler
- **Detail:** `complianceService.checkSanctionsList()` returns an **object** (`{ sanctioned: false }` or `{ sanctioned: true, ... }`), but the route does `if (sanctioned)`. An object is always truthy, so every KYC initiation is rejected as "User is on sanctions list". Found while standardizing `securityRoutes` responses (A2).
- **Action:** Check `if (sanctioned.sanctioned)` instead.
- **Done:** Also fixed a second bug found during verification — the route's `compliance_audit` insert used `verification_type` instead of the `NOT NULL` `audit_type` column, which 500'd once past the sanctions check.

### [ ] B8 — `/kyc/initiate` writes a duplicate `compliance_audit` row
- **Severity:** Low — data hygiene; the endpoint works correctly otherwise.
- **Location:** [`securityRoutes.js`](backend/src/api/securityRoutes.js) `/kyc/initiate`; [`complianceService.js`](backend/src/utils/complianceService.js) `initializeKYC`
- **Detail:** `initializeKYC()` inserts a `compliance_audit` row (`audit_type='kyc', status='pending'`), then the route inserts a second row (`status='initiated', details=…`). Each KYC initiation produces two audit rows. Found during B7 verification.
- **Action:** Have either the service or the route own the audit insert, not both.

---

## Backend — Security

### [x] S1 — Unsafe 2FA-disable password check
- **Severity:** High (security) — password is not actually verified.
- **Location:** [`securityRoutes.js:134-139`](backend/src/api/securityRoutes.js#L134)
- **Detail:** `/2fa/disable` compares the stored bcrypt hash buffer against the raw submitted password with `crypto.timingSafeEqual`. This throws on any length mismatch and never performs a real bcrypt verification.
- **Action:** Replace with `await comparePassword(password, user.rows[0].password_hash)` from [`utils/crypto.js`](backend/src/utils/crypto.js).

---

## Backend — Architecture / Consistency (needs a decision)

### [x] A1 — Two parallel, unsynchronized "player seat" systems
- **Severity:** Medium — risk of divergent game state.
- **Detail:** `/api/v1/tables` (tableController) uses `table_seats` + `engineManager`; `/api/game` (gameRoutes, Phase 5) uses `game_players` + a separate in-memory engine `Map`. The two are never reconciled.
- **Action:** Decide which surface is canonical; deprecate or bridge the other.

### [x] A2 — Inconsistent response envelopes
- **Severity:** Low — client/doc friction.
- **Detail:** v1 routes return `{ success, ... }`; Phase 5 routes (`/api/game`, `/api/security`) return bare objects on success and `{ error }` on failure.
- **Action:** Standardize on one envelope across all routers.

### [x] A3 — Duplicate / typo compatibility tables
- **Severity:** Low — schema clutter.
- **Detail:** Migration `012` creates both `deposit_withdrawals` and `deposits_withdrawals` (the latter only to match a route typo). Two `012_*` migration files exist in different directories.
- **Action:** Fix the route to use the correctly named table; drop the duplicate.

### [x] A4 — Double validation on registration
- **Severity:** Low — confusing, divergent rules.
- **Detail:** `POST /register` runs express-validator `authValidation.register` (route) **and** Joi `validateRegister` (controller). The Joi schema additionally requires `confirmPassword`; the password regexes differ (express-validator requires a special char, Joi does not).
- **Action:** Pick one validation layer for the endpoint.

---

## Frontend — Bugs & Discrepancies

### [x] F1 — Profile page is broken (wrong endpoint + response shape)
- **Severity:** High — `/profile` never renders profile data.
- **Location:** [`profile/page.tsx:44`](frontend/app/profile/page.tsx#L44), [`lib/api.ts:170`](frontend/lib/api.ts#L170)
- **Detail:** The page calls `GET /api/v1/users/profile`, but the backend only exposes `GET /api/v1/users/:userId`. The literal `profile` is matched as `:userId`, fails the `userId === req.user.sub` check, and returns `403`. Even if the path were correct, the page reads `response.data` with fields `balance`, `totalGames`, `winRate`, `totalWinnings`, `joinedAt` — the controller returns `{ success, user }` with none of those.
- **Action:** Point the request at `/api/v1/users/<userId>` (use the stored `userId`), and reconcile the response shape — either extend the backend `getUserProfile` payload or map `response.user` fields in the page.

### [x] F2 — Registration flow treats success as failure
- **Severity:** High — a successful signup shows an error and never logs the user in.
- **Location:** [`register/page.tsx:37-47`](frontend/app/register/page.tsx#L37)
- **Detail:** The page expects a token (`response.token || response.tokens?.accessToken`) and only redirects when a token is present. The backend `register` controller returns `{ success, message, user }` with **no tokens**. So `token` is `undefined`, the success branch is skipped, and the page sets the error box to `response.message` (`"User registered successfully"`) — a success string shown as a red error, with no redirect.
- **Action:** Either have the backend issue tokens on register, or change the page to redirect to `/login` (or call `login`) on `response.success` without requiring a token.

### [x] F3 — `gameAPI` wrappers are unused / inconsistent with gameplay pages
- **Severity:** Medium — dead code + contract confusion.
- **Location:** [`lib/api.ts:132-144`](frontend/lib/api.ts#L132)
- **Detail:** `gameAPI` targets the Phase 5 `/api/game/*` surface (`createTable`, `joinTable`, `processAction`, …). The actual gameplay pages (`Lobby`, `TablePage`) bypass `gameAPI` and call `ApiClient` directly against `/api/v1/tables/*`. `gameAPI` is effectively dead code, and `/api/game/tables/:gameId/action` is broken on the backend anyway (see B1). Related to A1 (two parallel table systems).
- **Action:** Delete `gameAPI` or rewrite it to wrap the `/api/v1/tables/*` endpoints the app actually uses.

### [x] F4 — Cosmetic: default boilerplate metadata & font override
- **Severity:** Low.
- **Location:** [`layout.tsx:4-7`](frontend/app/layout.tsx#L4), [`globals.css:11,25`](frontend/app/globals.css#L25)
- **Detail:** `layout.tsx` still ships the create-next-app defaults (`title: "Create Next App"`, `description: "Generated by create next app"`). In `globals.css`, the `body` rule hardcodes `font-family: Arial…`, overriding the `--font-sans` theme token declared just above it.
- **Action:** Set real app metadata; make the `body` font use the theme token (or drop the unused token).

### [ ] F5 — Frontend architecture: no shared components / hooks / auth context
- **Severity:** Low (refactor) — maintainability.
- **Detail:** No `components/` directory and no custom hooks. The auth-guard `useEffect`, the 5 s polling pattern, the brand-mark header, and card rendering are duplicated across pages. `TablePage` is a single 1,467-line component.
- **Action:** Extract `useAuthGuard` / `usePolling` / `useTableSocket` hooks and `Card` / `SeatRing` / `ActionPanel` components when convenient. See [`frontend/COMPONENTS.md`](frontend/COMPONENTS.md) §3/§7.
- **Phase 5 note (deferred):** Reviewed and deliberately deferred — a refactor of working code with no functional benefit; the 1,467-line table-page breakup needs careful browser verification. Best done as its own focused task.

---

## Infrastructure — Discrepancies

### [x] I1 — Dedicated `websocket` service & nginx upstream are unused
- **Severity:** Medium — wasted container, misleading topology.
- **Location:** [`deployment/aws/docker-compose.yml:91`](deployment/aws/docker-compose.yml#L91), [`deployment/aws/nginx.conf:53,84`](deployment/aws/nginx.conf#L53)
- **Detail:** Compose runs a separate `websocket` container on port 3001 with `SERVICE_TYPE=websocket`, and nginx defines a `websocket` upstream (`websocket:3001`). But the backend code never branches on `SERVICE_TYPE` — `server.js` always starts the full Express + Socket.IO app on one port. nginx routes `/socket.io/` to the **`backend`** upstream (3000), not the `websocket` upstream. The `websocket` container is a redundant duplicate of `backend` and its nginx upstream is referenced by no `location` block.
- **Action:** Either remove the `websocket` service + upstream, or make the backend honor `SERVICE_TYPE` and point `/socket.io/` at it. Reconcile with `CLAUDE.md`, which describes a 3001 WebSocket server that does not exist.

### [x] I2 — "Production" compose bind-mounts host source over the image
- **Severity:** Medium — prod runs mutable host files, not the built artifact.
- **Location:** [`deployment/aws/docker-compose.yml:82-85,120-123`](deployment/aws/docker-compose.yml#L82)
- **Detail:** The `backend` and `websocket` services mount `../../backend/src` and `../../backend/migrations` into the container, so the running code is the host checkout, not the immutable image built from `backend/Dockerfile`. This is a dev-style pattern in the production compose file — image rebuilds become partly cosmetic and the deployed code depends on the on-disk git state.
- **Action:** Drop the `src`/`migrations` bind-mounts from the production compose; rely on the built image.

### [x] I3 — `deployment/db/migrations` is empty; dev and prod seed schema differently
- **Severity:** Low/Medium — environment drift.
- **Location:** [`deployment/aws/docker-compose.yml:28`](deployment/aws/docker-compose.yml#L28), `deployment/db/migrations/` (empty)
- **Detail:** Prod Postgres mounts the empty `deployment/db/migrations` into `/docker-entrypoint-initdb.d`, so init runs no SQL — schema is created solely by `npm run migrate`. The dev compose instead mounts `backend/migrations` there, so dev Postgres auto-applies the numbered SQL files at init. The two environments build the schema by different mechanisms.
- **Action:** Pick one mechanism (recommended: `npm run migrate` everywhere) and align both compose files.

### [ ] I4 — Two backend Dockerfiles / two compose files
- **Severity:** Low — drift risk.
- **Location:** [`backend/Dockerfile`](backend/Dockerfile) (prod), [`docker/Dockerfile.backend`](docker/Dockerfile.backend) (dev)
- **Detail:** The backend has two Dockerfiles (prod compose uses `backend/Dockerfile`, dev compose uses `docker/Dockerfile.backend`) and two compose files. They can silently diverge (e.g. base image versions).
- **Action:** Consolidate to a single Dockerfile (multi-stage if dev/prod differ) and a single compose file with overrides.
- **Phase 4 note (deferred):** This is a real refactor, not a mechanical change — kept separate from the I2/I3/I5 fixes. Complications found: (1) prod installs prod-only deps while dev needs devDependencies + `python3/make/g++`, so a proper fix is a multi-stage Dockerfile with `dev`/`prod` targets; (2) `backend/Dockerfile` uses `COPY . .`, which copies host `node_modules` when built locally — needs a `.dockerignore`; (3) **`.dockerignore` is itself git-ignored** (see [`.gitignore`](.gitignore)), so consolidation also requires un-ignoring it; (4) the "single compose file" half restructures the dev workflow (different services/scripts reference each file) for marginal benefit. Recommend doing I4 as its own focused task.

### [x] I5 — `api_url` output points at a firewall-blocked port
- **Severity:** Low — misleading output.
- **Location:** [`infra/outputs.tf:33`](infra/outputs.tf#L33), [`infra/variables.tf:73`](infra/variables.tf#L73)
- **Detail:** When no domain is set, the `api_url` output is `http://<static_ip>:3000`. Port 3000 is not in `allowed_tcp_ports` (default `[22,80,443]`), so that URL is unreachable from the internet. The actually reachable API is `http://<static_ip>/api` via nginx on port 80.
- **Action:** Change the no-domain `api_url` fallback to `http://<static_ip>` (port 80).

---

## Tooling / Environment

### [ ] T1 — Corrupted `ajv` package breaks ESLint in both projects
- **Severity:** Medium — `npm run lint` is unusable repo-wide; the lint quality gate is effectively off.
- **Location:** `backend/node_modules/ajv`, `frontend/node_modules/ajv`
- **Detail:** `npm run lint` in either `backend/` or `frontend/` fails immediately with `Error: Cannot find module './compile/async'` thrown from `ajv/lib/ajv.js`. The installed `ajv` is incomplete. Confirmed **pre-existing** (not caused by code changes) during Phase 1 verification — affects ESLint 8 (backend) and ESLint 9 (frontend).
- **Action:** Reinstall dependencies in both projects: `rm -rf node_modules && npm install`, then confirm `npm run lint` runs. Note `package-lock.json` is git-ignored ([`.gitignore`](.gitignore)), so installs are non-reproducible — consider un-ignoring and committing the lockfiles.

---

## How to use this document

- Add new items under the relevant section with the next sequential ID (`B6`, `S2`, `A5`, `F6`, `I6`, `T2`, …).
- Keep each item self-contained: severity, file/line, detail, suggested action.
- Do not delete actioned items — mark them `[x]` so the history is preserved.
