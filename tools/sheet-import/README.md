# sheet-import — Cantina_Receber spreadsheet → site

Rebuilds the sales history from weekly copies of the Google Sheet and imports it
into the site. All data files live in `dump/` (git-ignored — it holds customers' names and debts).

```bash
python -m venv .venv && .venv/bin/pip install -r tools/sheet-import/requirements.txt
cd tools/sheet-import
```

| Step | Command | Output |
|---|---|---|
| 0. latest sheet state (optional) | `python fetch_current.py KEY.json SHEET_ID ../../dump/work` | `dump/work/current_*.xlsx` |
| 1. read every snapshot (~10 min) | `python extract.py ../../dump/<copies-folder> ../../dump/work/raw.json [../../dump/work/current_*.xlsx]` | `raw.json` |
| 2. rebuild the order log | `python build_queue.py ../../dump/work/raw.json ../../dump/output` | `orders_queue.*`, `order_lines.*` |
| 3. mapping files | `python make_mappings.py ../../dump/output/order_lines.csv ../../dump/mappings` | `customers.csv`, `items.csv` |
| 4. **edit the mappings** | see below | |
| 5. import | `python import_sales.py` (dry run) → `python import_sales.py --commit` | rows in Supabase |
| 6. verify | `python import_sales.py --check` | per-year counts: database vs. expected |

Run `db/migrations/002_sales_import.sql` and `003_sale_discount.sql` in the Supabase SQL editor
once before importing (`--commit` stops with a message if they haven't been).

## How the sheet is read

Ledger tabs are made of lanes `date | item | amount`. Several customers are stacked in
one lane: a row with text but no date/amount is a customer name. Each amount with an
item to its left is an entry; its owner is the nearest name above it in the lane, its
date the nearest date between that name and the entry. `=SUM(...)` cells, heading rows
("data | produto | valor"), "saldo anterior" lines and entries under blank names are
dropped. Entries without any date get one estimated from the week they first appeared
and the customer's usual weekdays (`flags = date estimated`). Times are always
estimated (meal slots around 09:00 / 13:00 / 19:00).

## Editing the mappings

`customers.csv` — rows with the same `buyer_name` become one buyer.
`status=maybe` rows are one-word names (a first name or a surname alone, e.g. "JOANA",
"Ferreira") that look like someone in `suggestion` — same word, a typo, or written together
("Joanasilva") — best match first, ranked by overlapping dates. They are **not** merged; to
merge one, copy a name from `suggestion` into `buyer_name`. `status=suspect` names don't look
like a person (punctuation, an item name). To split a wrong merge, give it a different
`buyer_name`; edited rows show `status=edited`.

`items.csv` — `item_name` is the catalog item, `quantity` the units per line
("2 salgados", "salgado 2" → Salgado ×2).

## Price and discount

Each sale keeps the sheet's amount as its `total` and gets `unit_price` and `discount` (%) so that
`total = quantity × unit_price × (1 − discount/100)`. `unit_price` is the item's regular price at
that date (its most common unit price within 45 days, so price rises are respected); a line
charged less gets the difference as a discount — unless that lower price is itself common
(≥ 20% of the item's sales then), which means a different size/variant, not a discount. A line
charged an exact multiple of the price ("salgado" 17.00) gets that quantity. The catalog price
of an imported item is its regular price at its latest sale. Blank `item_name` imports the line with its text only.

Re-running `make_mappings.py` keeps your edits. Re-running `import_sales.py --commit`
updates the same rows (ids are derived from the content), so: edit → re-import is safe.

## Import safety

- Logs in with the owner email/password; RLS applies; no service-role key.
- Every row is tagged `import_batch` (default `sheet-import`); `--rollback` deletes exactly
  those rows (and refuses if sales recorded in the app point at imported buyers, unless `--force`).
- Buyers/items you already created in the site (same name) are reused and never modified.
- Stock is never changed. Payments are not imported.
- `--commit` ends by counting what reached the database; if it was interrupted, run it again —
  it fills in what is missing without duplicating anything.
