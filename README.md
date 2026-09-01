# Groceries Store — Owner Console

A simple internal tool for a store owner to track buyers, items, and sales — who bought what, when, and how much. Built with React and Supabase (Postgres) so data syncs across any device, protected behind owner login.

## Features

- **Owner login** — the app is gated behind email/password authentication; no public sign-up
- **Buyers** — add, edit, and delete customer records (name, phone, email)
- **Items** — manage a product catalog with price and stock levels
- **Sales** — record a purchase (buyer + item + quantity + date); automatically calculates the total and decrements stock
- **Sales history** — filterable by buyer, sorted by most recent
- **Multi-device sync** — all data is stored in a shared Supabase (Postgres) database, not the browser, so it's accessible from any device after logging in

## Tech stack

- [React](https://react.dev/) (Create React App)
- [Supabase](https://supabase.com/) — hosted Postgres database, auto-generated REST API, and authentication

## Project structure

    src/
      components/
        Login.js         - Owner login screen
        Buyers.js         - Buyer CRUD UI
        Items.js          - Item CRUD UI
        Sales.js          - Sale recording + history UI
      supabaseClient.js  - Supabase client setup
      App.js             - Auth gate + tab navigation + data fetching
      App.css

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd groceries-store
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the **SQL Editor**, run:

```sql
create table buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  created_at timestamp default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null default 0,
  stock integer not null default 0,
  created_at timestamp default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references buyers(id) on delete set null,
  item_id uuid references items(id) on delete set null,
  quantity integer not null,
  total numeric(10,2) not null,
  sale_date date not null default current_date,
  created_at timestamp default now()
);

alter table buyers enable row level security;
alter table items enable row level security;
alter table sales enable row level security;

create policy "Allow authenticated full access"
on buyers for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Allow authenticated full access"
on items for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Allow authenticated full access"
on sales for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
```

3. Under **Project Settings → API**, copy your **Project URL** and **anon public** key.
4. Under **Authentication → Users**, add yourself as a user (email + password, auto-confirmed). This is the login you'll use to access the app — there's no public sign-up flow.

### 3. Configure environment variables

Create a `.env` file in the project root:

REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key


Use placeholders like these when committing example files — never commit your real `.env` (it's already git-ignored).

**Important:** use the bare project URL only — no `/rest/v1/` path, no trailing slash.

### 4. Run locally

```bash
npm start
```

Opens at `http://localhost:3000`. Restart the dev server any time `.env` changes.

## Deployment

The frontend is stateless (all data lives in Supabase), so it can be deployed anywhere that serves static React apps — e.g., [Vercel](https://vercel.com) or [Netlify](https://netlify.com):

1. Push this repo to GitHub.
2. Import it into Vercel/Netlify.
3. Add the same `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` as environment variables in the deployment settings.
4. Deploy. Any device can now reach the app — it just needs a valid login to see or change data.

## Security

- The app requires **Supabase Auth** login (email/password) before any data loads.
- **Row Level Security (RLS)** is enabled on `buyers`, `items`, and `sales`, restricted to the `authenticated` role — even direct API requests with the anon key are rejected unless the caller is logged in.
- The anon key is meant to be public (it ships in the frontend bundle by design), but it is no longer sufficient on its own to read or write data.
- There is currently only single-user access (whoever's credentials you create in Supabase) — no per-user roles or permissions.

## Available scripts

- `npm start` — run the dev server
- `npm run build` — build a production bundle to `build/`
- `npm test` — run tests