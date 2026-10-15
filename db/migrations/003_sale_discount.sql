-- Sales record the unit price at the time of the sale and a discount percentage:
--   total = quantity × unit_price × (1 − discount/100)
-- Existing sales get unit_price = total / quantity and no discount. Safe to re-run.

alter table sales add column if not exists unit_price numeric(10,2);
alter table sales add column if not exists discount   numeric(7,4) not null default 0;

update sales set unit_price = round(total / quantity, 2) where unit_price is null;
alter table sales alter column unit_price set not null;

alter table sales drop constraint if exists sales_unit_price_check;
alter table sales add constraint sales_unit_price_check check (unit_price >= 0);
alter table sales drop constraint if exists sales_discount_check;
alter table sales add constraint sales_discount_check check (discount between 0 and 100);
