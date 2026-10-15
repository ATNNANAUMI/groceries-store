-- Support importing historical sales from the Cantina_Receber spreadsheet.
--   sales.sold_at      date + time of the sale (sale_date stays the calendar day)
--   sales.description  free text for sales without a catalog item (or extra detail)
--   *.import_batch     tag on imported rows, so an import can be rolled back exactly
-- Safe to re-run.

alter table sales  add column if not exists sold_at      timestamptz;
alter table sales  add column if not exists description  text;
alter table sales  add column if not exists import_batch text;
alter table buyers add column if not exists import_batch text;
alter table items  add column if not exists import_batch text;

create index if not exists sales_import_batch_idx on sales (import_batch) where import_batch is not null;
