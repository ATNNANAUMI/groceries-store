# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Single-owner console for a groceries store: buyers, items (catalog + stock), and sales. React (Create React App, plain JS) frontend in `client/`, currently backed by Supabase. A self-hosted REST API + Postgres (Docker) is planned to replace Supabase — the repo is structured so that swap needs no UI changes.

## Commands

All npm commands run from `client/`:

```bash
npm start                                           # dev server on :3000 (restart after editing .env)
CI=true npm test -- --watchAll=false                # all tests once
CI=true npm test -- --watchAll=false src/lib/format # single test file (path pattern)
npm test -- -t "login screen"                       # tests matching a name
CI=true npm run build                               # production build; CI=true turns ESLint warnings into errors
```

Lint is ESLint via `react-scripts` (`react-app` config) — it runs during `start`/`build`; there is no separate lint script.

From the repo root: `docker compose up -d db` starts Postgres 16 with `db/schema.sql` applied (for future server work).

Env: copy `client/.env.example` → `client/.env`. `REACT_APP_API_PROVIDER` selects the backend (`supabase` | `rest`).

## Architecture

**The backend boundary is `client/src/api/`.** Components and `App.js` import only `api` from `./api` — never `@supabase/supabase-js` or `fetch` directly. `api/index.js` picks a provider by env var; `supabaseProvider.js` and `restProvider.js` must expose the identical shape (`api.auth`, `api.buyers`, `api.items`, `api.sales`), return plain DB-shaped rows (snake_case), and throw `Error` with a user-readable message. The full contract, including the REST endpoints the future `server/` must implement, is in `docs/api-contract.md`. A change to the data model means updating: `db/schema.sql` (+ a file in `db/migrations/` for existing DBs), both providers, `docs/api-contract.md`, and the UI.

**State lives in `App.js`.** It holds the session plus `buyers`/`items`/`sales` arrays and passes `refreshX` callbacks down; components call `api.*` then the relevant refresh — there is no client cache or optimistic update. Data loading is keyed on `session.user.id`, not the session object, because Supabase replaces the session on every token refresh (keying on the object reloaded everything and wiped forms).

**Sales mutate stock.** `api.sales.create` validates quantity ≤ stock, computes `total` from the current item price, and decrements stock. On Supabase this is a compare-and-set update (`.eq('stock', old)`) followed by the insert, with a manual rollback on failure; the REST server is expected to do it in one transaction (`SELECT … FOR UPDATE`). Deleting a sale does not restore stock. Deleting a buyer/item keeps its sales with a `null` FK (shown as "Unknown").

**Conventions**
- Money: always `formatMoney()` from `src/lib/format.js`; `numeric` columns may arrive as strings, so wrap in `Number()` before math.
- Dates: `sale_date` is a `YYYY-MM-DD` date column. Use `todayLocal()` / `formatDate()` — never `toISOString().slice(0, 10)` (UTC rolls to tomorrow in the evening for the owner's timezone).
- Errors are shown in the UI with `<ErrorBanner>`; a form is reset only after a successful save.
- Styling is plain CSS with design tokens (CSS custom properties, light + dark via `prefers-color-scheme`) in `src/index.css`; component classes (`.card`, `.btn`, `.btn-primary`, `.field`, `.form-grid`, `.table-wrap`, `.badge-*`) in `src/App.css`. Reuse these instead of adding new ad-hoc styles; no CSS framework.
- Tests mock `./api` (see `src/App.test.js`), so they never need real credentials.

## Database & security

`db/schema.sql` is portable Postgres (works on Supabase and plain Postgres) and includes a `users` table used only by the future server. `db/supabase/policies.sql` enables RLS restricting all tables to the `authenticated` role — the Supabase anon key ships in the bundle by design and is only safe because of these policies. There is no sign-up flow; the owner account is created manually in Supabase Auth.

## Repo rules

- Do not add `Co-Authored-By: Claude` or any Claude/AI attribution to commit messages or PRs.
- Never commit `.env` files (only `.env.example`).
