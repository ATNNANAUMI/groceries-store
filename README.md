# Groceries Store — Owner Console

A simple internal tool for a store owner to track buyers, items, and sales — who bought what, when, and how much. Built with React and Supabase (Postgres) so data syncs across any device, protected behind owner login.

can be accessed using the link:
https://groceries-store-seven.vercel.app/

## Features

- **Owner login** — the app is gated behind email/password authentication; no public sign-up
- **Buyers** — add, edit, and delete customer records (name, phone, email)
- **Items** — manage a product catalog with price and stock levels
- **Sales** — record a purchase (buyer + item + quantity + date); automatically calculates the total and decrements stock
- **Sales history** — filterable by buyer, sorted by most recent
- **Multi-device sync** — all data is stored in a shared Supabase (Postgres) database, not the browser, so it's accessible from any device after logging in

## Tech stack

- [React](https://react.dev/) (Create React App) in `client/`
- [Supabase](https://supabase.com/) — hosted Postgres + auth (current backend)
- Planned: self-hosted REST API in `server/` + Postgres via Docker (see [server/README.md](server/README.md))

## Project structure

    client/                 React app
      src/
        api/                Data-access layer — the ONLY place that talks to a backend
          index.js            picks the provider from REACT_APP_API_PROVIDER
          supabaseProvider.js current backend
          restProvider.js     client for the future self-hosted server
        components/         Login, Buyers, Items, Sales, ErrorBanner
        lib/format.js       money/date helpers
        App.js              auth gate, tabs, data loading
    db/
      schema.sql            portable Postgres schema (Supabase or plain Postgres)
      supabase/policies.sql Row Level Security (Supabase only)
      migrations/           upgrades for existing databases
    docs/api-contract.md    the contract every backend must implement
    server/                 future REST API (not implemented yet)
    docker-compose.yml      local Postgres (and later the API)

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd groceries-store/client
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the **SQL Editor**, run [`db/schema.sql`](db/schema.sql), then [`db/supabase/policies.sql`](db/supabase/policies.sql).
   Already have the tables from an older version of this README? Run [`db/migrations/001_constraints.sql`](db/migrations/001_constraints.sql) instead.
3. Under **Project Settings → API**, copy your **Project URL** and **anon public** key.
4. Under **Authentication → Users**, add yourself as a user (email + password, auto-confirmed). This is the login you'll use to access the app — there's no public sign-up flow.

### 3. Configure environment variables

Copy `client/.env.example` to `client/.env` and fill in your values:

```
REACT_APP_API_PROVIDER=supabase
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

Never commit your real `.env` (it's git-ignored).

**Important:** use the bare project URL only — no `/rest/v1/` path, no trailing slash.

### 4. Run locally

```bash
cd client
npm start
```

Opens at `http://localhost:3000`. Restart the dev server any time `.env` changes.

## Deployment

The frontend is stateless (all data lives in Supabase), so it can be deployed anywhere that serves static React apps — e.g., [Vercel](https://vercel.com) or [Netlify](https://netlify.com):

1. Push this repo to GitHub.
2. Import it into Vercel/Netlify and set the **root directory** to `client`.
3. Add the same `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` as environment variables in the deployment settings.
4. Deploy. Any device can now reach the app — it just needs a valid login to see or change data.

## Security

- The app requires **Supabase Auth** login (email/password) before any data loads.
- **Row Level Security (RLS)** is enabled on `buyers`, `items`, and `sales`, restricted to the `authenticated` role — even direct API requests with the anon key are rejected unless the caller is logged in.
- The anon key is meant to be public (it ships in the frontend bundle by design), but it is no longer sufficient on its own to read or write data.
- There is currently only single-user access (whoever's credentials you create in Supabase) — no per-user roles or permissions.

## Available scripts (run inside `client/`)

- `npm start` — run the dev server
- `npm run build` — build a production bundle to `build/`
- `npm test` — run tests
