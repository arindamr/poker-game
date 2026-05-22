# Frontend Components Reference

Generated from analysis of `frontend/`. Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4.

The frontend is small and deliberately dependency-light: **8 route pages**, **1 root layout**, **1 API client module**, and **zero shared/reusable components**. Every page is a self-contained client component.

---

## 1. Component Hierarchy

The App Router tree. Every page is `'use client'` and default-exports a single component; there is no `components/` directory and no component composition between pages.

```
RootLayout                         app/layout.tsx        — <html>/<body>, imports globals.css
│  (wraps every route below)
│
├── Home                           app/page.tsx          — landing page, login-aware nav
├── Login                          app/login/page.tsx    — email/password form
├── Register                       app/register/page.tsx — signup form
├── Dashboard                      app/dashboard/page.tsx — system/metrics dashboard (5s poll)
├── Lobby                          app/lobby/page.tsx     — table browser + create-table form
├── Profile                        app/profile/page.tsx   — user profile + edit form
├── AdminTables                    app/admin/page.tsx     — all-tables admin view
└── TablePage                      app/table/[tableId]/page.tsx — live game view (1,467 lines)
```

| Route | Component | File | Auth guard | Live updates |
|-------|-----------|------|-----------|--------------|
| `/` | `Home` | [page.tsx](frontend/app/page.tsx) | none (reads token for nav) | — |
| `/login` | `Login` | [login/page.tsx](frontend/app/login/page.tsx) | none | — |
| `/register` | `Register` | [register/page.tsx](frontend/app/register/page.tsx) | none | — |
| `/dashboard` | `Dashboard` | [dashboard/page.tsx](frontend/app/dashboard/page.tsx) | redirect if no token | `setInterval` 5 s |
| `/lobby` | `Lobby` | [lobby/page.tsx](frontend/app/lobby/page.tsx) | redirect if no token | `setInterval` 5 s |
| `/profile` | `Profile` | [profile/page.tsx](frontend/app/profile/page.tsx) | redirect if no token | — |
| `/admin` | `AdminTables` | [admin/page.tsx](frontend/app/admin/page.tsx) | redirect if no token | manual refresh |
| `/table/[tableId]` | `TablePage` | [table/[tableId]/page.tsx](frontend/app/table/[tableId]/page.tsx) | redirect if no token | Socket.IO + 5 s poll |

### Sub-component structure

There are **no nested React components** within pages. The largest page, `TablePage`, is one ~1,467-line function. Its reusable UI logic lives in **module-level helper functions that return JSX** — not components, so they take no props object and hold no state:

- [`renderPlayingCard`](frontend/app/table/[tableId]/page.tsx#L166), [`renderCardBack`](frontend/app/table/[tableId]/page.tsx#L191), [`renderCardCenter`](frontend/app/table/[tableId]/page.tsx#L135) — render a single card face/back, with king/queen/jack art and `PIP_LAYOUTS` pip placement.
- Pure helpers: `parseCard`, `getSeatPosition` (radial seat math), `formatCurrency`, `formatActionLabel`, `getActionBadgeClasses`, `getWinnerLabel`, `buildWinningExplanation`.
- Module constants: `STREET_LABELS`, `HAND_RANK_ORDER`, `SUIT_SYMBOLS`, `PIP_LAYOUTS`, `RING_LAYOUT_9`.

> **Observation:** the seat panel, card rendering, action log, and header markup are good extraction candidates but are currently inlined. See §7.

---

## 2. State Management

**Approach: 100% local React state. No global store, no Context, no data-fetching library.**

### Layers

| Layer | Mechanism | Notes |
|-------|-----------|-------|
| Component state | `useState` / `useRef` / `useMemo` | Every page; `TablePage` alone has ~25 `useState` + 4 `useRef`. |
| Cross-page / "global" state | **`localStorage`** | Keys: `authToken`, `userId`, `userName`, `userEmail`. Read/written directly in pages and by `ApiClient`. |
| Server state | Manual `fetch` + `useState` | No React Query / SWR. Each page holds its own `data` + `loading` + `error` triplet. |
| Real-time state | Socket.IO client | Only in `TablePage`; events mutate `gameState`, `roundResult`, `nextHandStatus`, `actionLog`. |

### Patterns

- **Auth guard** — every protected page repeats the same `useEffect`: read `localStorage.authToken`, `router.push('/login')` if absent. Duplicated across 5 pages with no shared abstraction.
- **Polling** — `Dashboard`, `Lobby`, and `TablePage` each set up a `setInterval(fetch, 5000)` in a `useEffect` and clear it on unmount.
- **Animation diffing** — `TablePage` keeps a `previousGameRef` ([page.tsx:350](frontend/app/table/[tableId]/page.tsx#L350)) to compare previous vs. current game (pot, community-card count, game id, phase) and trigger deal/reveal/burst animations.
- **Optimistic logging** — on a player action, `TablePage` appends to `actionLog` before the request resolves, and uses `suppressBotSocketLog` (a `useRef` flag) to deduplicate bot actions arriving via both the REST response and the `BOT_ACTIONS` socket event.
- **`useMemo`** — `TablePage` derives `playersBySeat`, `revealedHandByPlayerId`, and `winnerIds` from `gameState`/`roundResult`.

There is **no `ApiResponse` typing discipline** at call sites — most pages use `response.tables`, `response.state`, etc. via the `[key: string]: any` index signature on `ApiResponse<T>`.

---

## 3. Custom Hooks

**There are none.** No `use*` functions are defined anywhere in `frontend/` — only React built-ins (`useState`, `useEffect`, `useRef`, `useMemo`) and Next.js hooks (`useRouter`, `useParams`) are used.

Three patterns are duplicated enough that they are natural hook candidates:

| Would-be hook | Currently | Used by |
|---------------|-----------|---------|
| `useAuthGuard()` | inline `useEffect` token check | dashboard, lobby, profile, admin, table |
| `usePolling(fn, ms)` | inline `setInterval` in `useEffect` | dashboard, lobby, table |
| `useTableSocket(tableId)` | ~80 lines of socket setup inside `TablePage`'s mount effect | table |

Extracting these would remove the most repetition in the codebase — see TODO.md.

---

## 4. External Libraries

The dependency list ([package.json](frontend/package.json)) is intentionally minimal — 4 runtime deps.

### Runtime dependencies

| Package | Version | Why it's here |
|---------|---------|---------------|
| `next` | 16.1.6 | Framework — App Router, file-based routing, dev server, build. `next/link` for nav, `next/navigation` for `useRouter`/`useParams`. |
| `react` / `react-dom` | 19.2.3 | UI runtime. React 19 paired with Next 16. |
| `socket.io-client` | ^4.7.5 | Real-time game events. Used **only** in `TablePage` ([page.tsx:7](frontend/app/table/[tableId]/page.tsx#L7)) — connects to the backend Socket.IO server with the JWT in `auth.token`, listens for `GAME_STATE_UPDATE`, `HAND_COMPLETED`, `BOT_ACTIONS`, etc. Version matches the backend's `socket.io` 4.x. |

### Dev dependencies

| Package | Purpose |
|---------|---------|
| `tailwindcss` ^4 + `@tailwindcss/postcss` | Styling — see §5. |
| `typescript` ^5 + `@types/node` / `@types/react` / `@types/react-dom` | Type checking. |
| `eslint` ^9 + `eslint-config-next` | Linting (`next` rule set). |

### What is deliberately absent (and why it works anyway)

No state library (Redux/Zustand), no data-fetching library (React Query/SWR), no UI/component library (MUI/shadcn), no form library, no date library. For an 8-page app with one heavy page, the team hand-rolled the API client ([`lib/api.ts`](frontend/lib/api.ts)) and leaned on `localStorage` + `useState` instead. The cost is the duplication noted in §2–3.

---

## 5. Styling Approach

### Tailwind CSS v4 (utility-first, config-less)

- Imported via `@import "tailwindcss";` in [`globals.css`](frontend/app/globals.css) — the Tailwind **v4** style. There is **no `tailwind.config.js`**; theme tokens are declared inline with `@theme inline { ... }`.
- PostCSS pipeline: a single plugin, `@tailwindcss/postcss` ([`postcss.config.mjs`](frontend/postcss.config.mjs)).
- All component styling is **inline utility classes** in JSX `className`. No CSS Modules, no `styled-components`.

### Design system (by convention, not enforced)

A consistent dark theme is repeated across every page:

- **Backgrounds:** `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900`.
- **Surfaces:** `bg-slate-800` cards with `border border-slate-700`, `rounded-lg`.
- **Accent:** emerald — `emerald-400/500/600`, often as `bg-gradient-to-r from-emerald-500 to-emerald-600`.
- **Brand mark:** the `♠️` tile in an emerald gradient square, hand-copied into `Home`, `Login`, `Register`, `Lobby`, `Profile` headers (another extraction candidate).
- **Status colors:** red for errors/logout, amber/yellow for warnings, cyan for human turn, amber for bot turn.

### Two secondary mechanisms

1. **CSS custom properties** — `globals.css` defines `--background`/`--foreground` with a `prefers-color-scheme: dark` override, and `@theme inline` font tokens (`--font-sans`, `--font-mono`).
2. **styled-jsx** — `TablePage` ships a `<style jsx global>` block ([page.tsx:1340](frontend/app/table/[tableId]/page.tsx#L1340)) with ~9 `@keyframes` animations (`dealToSeat`, `communityReveal`, `chipDrop`, `potBurst`, `actionBadgePop`, `turnPulseHuman/Bot`, `winnerBannerIn`, `phaseFade`) and matching `.animate-*` classes. These are **not** Tailwind utilities — they are the only hand-written CSS in the app, used for the table's deal/reveal/chip animations. Animation parameters are passed in via CSS variables (`--deal-from-x/y`).

> **Inconsistency:** `globals.css` declares a `--font-sans` theme token but the `body` rule immediately below hardcodes `font-family: Arial, Helvetica, sans-serif`, overriding it.

---

## 6. Data Flow Summary

```
localStorage (authToken)
        │
        ▼
ApiClient ──fetch──▶ backend REST  ──┐
 (lib/api.ts)                        │
                                     ▼
                            page useState (data/loading/error)
                                     ▲
TablePage ──socket.io──▶ backend WS ─┘  (gameState, actionLog, roundResult)
```

- [`lib/api.ts`](frontend/lib/api.ts) exports the `ApiClient` class (a `fetch` wrapper that injects `Authorization: Bearer`) plus grouped wrappers: `authAPI`, `gameAPI`, `securityAPI`, `adminAPI`, `userAPI`, `systemAPI`.
- `API_URL` defaults to same-origin (`''`) so it works behind a reverse proxy; override with `NEXT_PUBLIC_API_URL`.
- **Note:** the gameplay pages (`Lobby`, `TablePage`, `AdminTables`, `Profile`) bypass the grouped wrappers and call `new ApiClient().get/post/...` directly against `/api/v1/...`. The `gameAPI` group (which targets `/api/game/*`) is therefore mostly unused. See TODO.md (F3).

---

## 7. Notes & Observations

- **Flat, monolithic structure.** No shared components, no hooks, no Context. Acceptable at 8 pages, but `TablePage` (1,467 lines) concentrates most complexity and would benefit from extraction (`Card`, `SeatRing`, `ActionPanel`, `ActionLog`, `useTableSocket`).
- **Auth is `localStorage`-only.** No Context provider; protection is a redirect `useEffect` repeated per page. There is no route-level guard, and `/admin` does no client-side admin check (it relies on the backend `403`).
- **API contract drift.** Several `lib/api.ts` wrappers and the Profile/Register pages call endpoints or expect response shapes the backend does not provide. These are logged as discrepancies in TODO.md.
- All known frontend issues are tracked in [TODO.md](TODO.md) under the **Frontend** section.
