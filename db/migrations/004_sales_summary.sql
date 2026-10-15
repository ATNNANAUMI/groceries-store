-- The site no longer downloads every sale: it loads one page of the history at a time and
-- asks the database for the totals. Safe to re-run.

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

-- Supabase: only logged-in users may call it (it would return 0 for anyone else anyway,
-- because of row level security). Skipped on plain Postgres, which has no such roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function sales_summary(uuid) from public, anon;
    grant execute on function sales_summary(uuid) to authenticated;
  end if;
end $$;

-- Supabase: make the API see the new function right away.
notify pgrst, 'reload schema';
