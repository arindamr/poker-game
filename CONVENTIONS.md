# Conventions

Observed patterns in this codebase. Follow these when writing new code so changes stay consistent. Where the codebase is *itself* inconsistent, that is called out and cross-referenced to `TODO.md`.

---

## 1. Language & Module System

| Area | Convention |
|------|-----------|
| Backend | Node.js **CommonJS** — `require()` / `module.exports`. No ESM, no TypeScript. |
| Frontend | **TypeScript** + ESM. Every page starts with `'use client'`. |
| Backend lint | ESLint `airbnb-base` — run `npm run lint:fix` before committing. |
| Frontend lint | `eslint-config-next`. |
| Import alias (frontend) | `@/*` maps to `frontend/*` (e.g. `import { apiClient } from '@/lib/api'`). |

## 2. Naming

| Thing | Style | Example |
|-------|-------|---------|
| DB tables & columns | `snake_case` | `account_balance`, `table_seats` |
| JS/TS variables & functions | `camelCase` | `getEngineForGame`, `amountToCall` |
| Classes | `PascalCase` | `PokerEngine`, `GameStateMachine`, `ApiClient` |
| Constants / enums | `SCREAMING_SNAKE_CASE` | `ACTION`, `STREET_LABELS`, `HAND_RANK_ORDER` |
| WebSocket events | `SCREAMING_SNAKE_CASE` | `GAME_STATE_UPDATE`, `PLAYER_ACTION` |
| Poker actions (wire values) | upper-case strings | `FOLD`, `CHECK`, `CALL`, `RAISE`, `ALL_IN`, `BET` |
| Backend model files | `PascalCase.js` | `User.js`, `GameTable.js` |
| Backend controllers/routes/utils | `camelCase.js` / lowercase | `authController.js`, `auth.js`, `gameRoutes.js` |
| Frontend route files | Next.js convention | `app/<route>/page.tsx`, `layout.tsx` |
| DB migrations | `NNN_snake_case.sql` (sequential) | `012_add_phase5_security_columns.sql` |

**snake_case ↔ camelCase boundary:** the DB uses `snake_case`; frontend code reading API responses defensively accepts both (`table.small_blind ?? table.smallBlind`). When you add a field, prefer returning it in the shape the consumer already expects rather than adding another fallback.

## 3. Backend Patterns

### Data access
- All DB access goes through `config/database.js`: `db.query()`, `db.getOne()`, `db.getAll()`, `db.transaction(async (client) => {...})`.
- **Always use parameterized queries** (`$1, $2, …`) — never string-interpolate into SQL.
- Multi-statement writes use `db.transaction` (see `tableController.joinTable`).

### Models
- Models are **plain object literals** with `async` methods (ActiveRecord-ish), not classes — see `models/User.js`. Each method wraps its query in `try/catch`, logs via `logger`, and rethrows.

### Game engine
- The engine layer *does* use ES classes: `PokerEngine`, `GameStateMachine`, `PotCalculator`, etc.
- Engines are held in-memory by `engineManager.js` (`Map<tableId, PokerEngine>`); call `resetEngine(tableId)` when seating changes.

### Controllers & routes
- Controller handlers are wrapped in `asyncHandler` (`api/middleware/errorHandler.js`) so a rejected promise forwards to `next(err)`.
- Route files only wire middleware + handler; logic lives in controllers (`api/controllers/`).
- Auth gating uses `authenticateToken` / `optionalAuth` / `requireAdmin` from `api/middleware/authMiddleware.js`.

### Config & env
- Read environment through `config/env.js` — do **not** scatter `process.env` reads across modules (a few legacy spots still do; don't add more).
- Secrets must never be committed. The server refuses to start outside `development` if JWT secrets are still the dev defaults.

### Logging
- Use `utils/logger.js` (Winston). Structured form: `logger.info('Message', { userId, tableId })`. Levels: `error` / `warn` / `info` / `debug`. No `console.log` in backend code.

## 4. Error Handling

### Backend
- **v1 routes** (`auth`, `users`, `tables`, `admin`) — controllers wrapped in `asyncHandler`; explicit failures return `{ success: false, error, code? }` with an appropriate status.
- **Phase 5 routes** (`/api/game`, `/api/security`) — each handler has its own `try/catch` and returns `{ error }` (no `success` flag) — see TODO `A2`. `securityRoutes.js` additionally maps Postgres schema errors (`42703`/`42P01`) to `501` via the `isSchemaError` helper.
- **Models** — `try/catch` → `logger.error` → rethrow (let the caller/`asyncHandler` decide the response).
- **Engine** — throws `Error` with descriptive messages; `tableController.playerAction` pattern-matches the message (`/insufficient chips|not player turn|…/`) to choose `400` vs `500`.
- A global `errorHandler` exists in `api/middleware/errorHandler.js` but **is not currently mounted** (TODO `B2`) — until it is, uncaught errors hit Express's default HTML handler.

### Frontend
- `lib/api.ts` `ApiClient.request()` throws `Error(data.error || data.message || 'Request failed')` on non-2xx.
- Pages call API methods inside `try/catch`, store the message in an `error` state variable, and render it in a red banner. Pattern: `const [error, setError] = useState('')` + `const [loading, setLoading] = useState(...)`.

### New-code guidance
- Match the style of the router you are editing (v1 → `{ success }` envelope; Phase 5 → bare `{ error }`). Do not introduce a third style. If you are asked to *standardize*, that is TODO `A2` and should be done deliberately, not piecemeal.

## 5. Validation

Two validation libraries are in use — **this is intentional but inconsistent**:

| Library | Where | Files |
|---------|-------|-------|
| **Joi** | inside controllers | `utils/validators.js` (`validateRegister`, `validateLogin`, `validateTableCreation`) |
| **express-validator** | as route middleware | `middleware/inputValidation.js` (`authValidation`, `gameValidation`, `securityValidation`, `validate`) |

When extending an endpoint, use whichever layer that endpoint already uses. Validate at system boundaries (request bodies, params); trust internal calls.

## 6. Frontend Patterns

- One default-exported component per `page.tsx`; all are client components. No `components/` directory and **no custom hooks** (TODO `F5`).
- State: `useState` / `useEffect` / `useRef` / `useMemo` only — no Redux/Context. Cross-page state lives in `localStorage` (`authToken`, `userId`, `userName`, `userEmail`).
- All API calls go through `lib/api.ts` (`ApiClient` or the `authAPI`/`gameAPI`/… wrappers). Don't call `fetch` directly in a page.
- Protected pages guard with a `useEffect` that checks `localStorage.authToken` and `router.push('/login')`.
- Styling is **Tailwind utility classes inline** in `className`. Theme: slate backgrounds, emerald accent. No CSS Modules. The one exception is the table page's `<style jsx global>` keyframe block.

## 7. Money & IDs

- **IDs:** UUID v4, DB-generated (`gen_random_uuid()`).
- **Money:** stored as `DECIMAL` in Postgres. The UI displays **GBP** — `formatCurrency` renders `£X.XX`, and sub-£1 values as pence (`50p`). Reuse the existing `formatCurrency`/`formatSterling` helpers rather than re-formatting.

## 8. Testing

- Backend: **Jest + Supertest**. Test files are `*.test.js` under `backend/test/`. Integration tests need a live database (`npm run test:integration`).
- Run one file: `npm test -- test/engine.test.js`. Run by name: `npm test -- --testNamePattern="..."`.
- Frontend: **no test suite** exists (only `npm run lint`).
- `./test-local.sh` runs endpoint smoke tests against a running Docker stack.

## 9. Comments & Code Style

- Default to **no comments**; add one only when the *why* is non-obvious (a constraint, a workaround, a subtle invariant). The existing code follows this — comments are sparse and explain intent, not mechanics.
- Keep changes minimal and scoped; don't refactor unrelated code or add speculative abstractions.
- Don't add backwards-compatibility shims for internal code — change call sites directly.
