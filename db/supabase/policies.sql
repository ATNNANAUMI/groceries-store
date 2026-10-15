-- Supabase only: restrict every table to logged-in users via Row Level Security.
-- Run after db/schema.sql. (The `users` table is unused on Supabase.)

alter table buyers enable row level security;
alter table items  enable row level security;
alter table sales  enable row level security;
alter table users  enable row level security; -- no policy => no API access

create policy "Allow authenticated full access" on buyers for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Allow authenticated full access" on items for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Allow authenticated full access" on sales for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Functions: callable only by logged-in users (see db/schema.sql).
revoke execute on function sales_summary(uuid) from public, anon;
grant execute on function sales_summary(uuid) to authenticated;
