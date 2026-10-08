-- For databases created from the original README schema (before db/schema.sql):
-- adds the value checks, indexes, and timestamptz columns. Safe to re-run.

alter table items drop constraint if exists items_price_check;
alter table items add constraint items_price_check check (price >= 0);
alter table items drop constraint if exists items_stock_check;
alter table items add constraint items_stock_check check (stock >= 0);
alter table sales drop constraint if exists sales_quantity_check;
alter table sales add constraint sales_quantity_check check (quantity > 0);
alter table sales drop constraint if exists sales_total_check;
alter table sales add constraint sales_total_check check (total >= 0);

alter table buyers alter column created_at type timestamptz, alter column created_at set not null;
alter table items  alter column created_at type timestamptz, alter column created_at set not null;
alter table sales  alter column created_at type timestamptz, alter column created_at set not null;

create index if not exists sales_buyer_id_idx on sales (buyer_id);
create index if not exists sales_sale_date_idx on sales (sale_date desc, created_at desc);
