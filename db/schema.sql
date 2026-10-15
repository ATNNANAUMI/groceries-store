-- Portable Postgres schema for the Groceries Store.
-- Works on plain Postgres (docker-compose / future REST server) and on Supabase.
-- Supabase-only security policies live in db/supabase/policies.sql.

create extension if not exists pgcrypto; -- gen_random_uuid() on Postgres < 13

create table if not exists buyers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  email      text,
  import_batch text,          -- set on rows created by tools/sheet-import
  created_at timestamptz not null default now()
);

create table if not exists items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      numeric(10,2) not null default 0 check (price >= 0),
  stock      integer not null default 0 check (stock >= 0),
  import_batch text,
  created_at timestamptz not null default now()
);

create table if not exists sales (
  id         uuid primary key default gen_random_uuid(),
  buyer_id   uuid references buyers(id) on delete set null,
  item_id    uuid references items(id) on delete set null,
  quantity   integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),  -- item price at the time of the sale
  discount   numeric(7,4) not null default 0 check (discount between 0 and 100),  -- percent
  total      numeric(10,2) not null check (total >= 0),       -- quantity × unit_price × (1 − discount/100)
  sale_date  date not null default current_date,
  sold_at    timestamptz,     -- date + time when known (imported sales have estimated times)
  description text,           -- free text, used when item_id is null
  import_batch text,
  created_at timestamptz not null default now()
);

create index if not exists sales_buyer_id_idx on sales (buyer_id);
create index if not exists sales_sale_date_idx on sales (sale_date desc, created_at desc);
create index if not exists sales_import_batch_idx on sales (import_batch) where import_batch is not null;

-- Index matching the sales history order (api.sales.page), so jumping to a late page stays fast.
create index if not exists sales_history_idx on sales (sale_date desc, sold_at desc nulls last, created_at desc, id);

-- Number of sales and their total, optionally for one buyer, so the site can show the totals
-- without downloading every sale. SECURITY INVOKER: runs with the caller's rights, so row
-- level security on `sales` still applies.
create or replace function sales_summary(p_buyer_id uuid default null)
returns table (sales_count bigint, sales_total numeric)
language sql stable security invoker
set search_path = public
as $$
  select count(*), coalesce(sum(total), 0)
  from sales
  where p_buyer_id is null or buyer_id = p_buyer_id
$$;

-- Owner accounts for the self-hosted server (Supabase uses its own auth.users).
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);
