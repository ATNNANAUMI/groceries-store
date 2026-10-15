"""Import the reconstructed spreadsheet sales into the site's database.

    python import_sales.py                      # dry run: show what would be imported
    python import_sales.py --commit             # write to Supabase (asks for the owner password)
    python import_sales.py --check              # compare the database with what should be imported
    python import_sales.py --rollback           # delete everything this batch imported

Inputs (defaults relative to the repo root):
    dump/output/order_lines.csv    from build_queue.py
    dump/mappings/customers.csv    from make_mappings.py (edit to merge buyers)
    dump/mappings/items.csv        from make_mappings.py (edit to map items)
    client/.env                    REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY

Behaviour:
  * Logs in as the owner (same email/password as the site), so Row Level Security
    applies. No service-role key is needed or used.
  * Ids are derived from the content (uuid5), so re-running updates rows instead of
    duplicating them.
  * Every inserted row gets import_batch = --batch; --rollback deletes exactly those.
  * Buyers/items that already exist in the site (created by hand, same name) are
    reused and never modified.
  * Stock is never touched: new catalog items start at stock 0 and sales are
    inserted directly, not through the app's "record sale" logic.
  * Only orders are imported, not payments.
  * Each sale gets unit_price = the item's regular price at that date (most common unit
    price within 45 days) and discount = how much less was charged, so that
    total = quantity × unit_price × (1 − discount/100) equals the amount in the sheet.
    A line charged an exact multiple of the price ("salgado" 17.00) gets that quantity.
"""
import argparse
import bisect
import collections
import csv
import datetime
import getpass
import math
import os
import re
import sys
import unicodedata
import uuid

import requests

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NAMESPACE = uuid.UUID('6f1d3c2a-9b8e-4c7d-a5f4-3e2b1c0d9e8f')
BATCH_SIZE = 500
TIMEZONE = '-03:00'  # times in the spreadsheet log are Brasília time


def ascii_lower(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', s).strip()


def stable_id(kind, key):
    return str(uuid.uuid5(NAMESPACE, f'{kind}:{key}'))


def read_csv(path):
    with open(path, encoding='utf-8') as f:
        return list(csv.DictReader(f))


def read_env(path):
    env = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


# ---------- build the rows ----------

PRICE_WINDOW_DAYS = 45
DISCOUNT_MAX_SHARE = 0.2  # a lower price this common is another regular price (size/variant), not a discount


def ceil_cents(x):
    return math.ceil(round(x * 100, 6)) / 100


def window_prices(history, when):
    """Counter of an item's unit prices within PRICE_WINDOW_DAYS of `when`.
    `history` is a sorted list of (date, unit_price)."""
    lo = bisect.bisect_left(history, (when - datetime.timedelta(days=PRICE_WINDOW_DAYS),))
    hi = bisect.bisect_right(history, (when + datetime.timedelta(days=PRICE_WINDOW_DAYS), math.inf))
    return collections.Counter(p for _, p in history[lo:hi])


def regular_price(history, when):
    """Most common unit price of an item around `when` (ties: the higher)."""
    counts = window_prices(history, when)
    return max(counts, key=lambda p: (counts[p], p)) if counts else None


def price_and_discount(amount, qty, regular, prices=None):
    """unit_price and discount (%) such that round(qty × unit_price × (1 − discount/100), 2) == amount.
    Charged at or above the regular price, or at a lower price that is itself common → that unit
    price, no discount."""
    unit = round(amount / qty, 2)
    if prices and prices[unit] >= DISCOUNT_MAX_SHARE * sum(prices.values()):
        regular = None
    unit_price = max(regular or 0, ceil_cents(amount / qty))
    if unit_price == 0:
        return 0.0, 0.0
    discount = round((1 - amount / (qty * unit_price)) * 100, 4)
    return unit_price, max(0.0, discount)


HALF_LABEL = re.compile(r'^1\s*/\s*2\s*')


def nearest_price(history, when):
    """Unit price of the item's sale closest in time to `when` (fallback when the window is empty)."""
    return min(history, key=lambda h: abs((h[0] - when).days))[1] if history else None


def build_rows(lines, customers, items_map, batch):
    buyer_of = {r['sheet_name']: r['buyer_name'].strip() for r in customers if r['buyer_name'].strip()}
    item_of = {r['sheet_label']: (r['item_name'].strip(), int(r['quantity'] or 1), r.get('half_portion') == 'yes')
               for r in items_map}

    buyers, item_names, rows = {}, {}, []
    history = collections.defaultdict(list)
    missing_customers = set()
    for l in lines:
        if l['type'] != 'order':
            continue
        buyer_name = buyer_of.get(l['customer'])
        if not buyer_name:
            missing_customers.add(l['customer'])
            continue
        bkey = ascii_lower(buyer_name)
        buyers.setdefault(bkey, {'id': stable_id('buyer', bkey), 'name': buyer_name, 'import_batch': batch})

        item_name, qty, half = item_of.get(ascii_lower(l['label']), ('', 1, False))
        qty = max(qty, 1)
        amount = round(float(l['amount']), 2)
        when = datetime.date.fromisoformat(l['datetime'][:10])
        ikey = None
        if item_name:
            ikey = ascii_lower(item_name)
            item_names.setdefault(ikey, item_name)
            if not half:  # half portions would drag the item's regular price down
                history[ikey].append((when, round(amount / qty, 2)))
        rows.append((l, buyers[bkey]['id'], ikey, qty, amount, when, half))

    for h in history.values():
        h.sort()

    sales, used, stats = [], set(), collections.Counter()
    for l, buyer_id, ikey, qty, amount, when, half in rows:
        if half:
            # "1/2 coca 600": one item split between two people → the item ×1 at its regular
            # price, the rest as discount. Vague labels ("1/2 coca" = half a 2L or a 600ml) pick,
            # among products starting with the same word, the one costing about twice the amount.
            # Nothing fits (e.g. "1/2 almoço", a smaller meal at its own price) → text only.
            words = HALF_LABEL.sub('', ascii_lower(l['label'])).split()
            candidates = {k for k in history if words and k.split()[0].startswith(words[0])} - {ikey}
            best = None
            for k in [ikey] + sorted(candidates):  # the label's own product first: it wins ties
                if not k:
                    continue
                regular = regular_price(history[k], when) or nearest_price(history[k], when)
                if regular and 0.4 <= amount / regular <= 0.6 and (
                        best is None or abs(amount / regular - 0.5) < abs(amount / best[1] - 0.5)):
                    best = (k, regular)
            if best:
                ikey, regular = best
                qty, unit_price, discount = 1, regular, round((1 - amount / regular) * 100, 4)
                stats['half portion'] += 1
            else:
                ikey = None
                qty, (unit_price, discount) = 1, price_and_discount(amount, 1, None)
        else:
            prices = window_prices(history[ikey], when) if ikey else None
            regular = max(prices, key=lambda p: (prices[p], p)) if prices else None
            # "salgado" written once but charged 17.00 when a salgado costs 8.50 → quantity 2.
            if regular and qty == 1 and amount >= 2 * regular - 0.005:
                k = round(amount / regular)
                if abs(amount - k * regular) < 0.005:
                    qty = k
                    stats['quantity from amount'] += 1
            unit_price, discount = price_and_discount(amount, qty, regular, prices)
        if discount and not half:
            stats['with discount'] += 1
        if ikey:
            used.add(ikey)
        assert abs(round(qty * unit_price * (1 - discount / 100) + 1e-9, 2) - amount) < 0.005, (l['line_key'], amount)
        sales.append({
            'id': stable_id('sale', l['line_key']),
            'buyer_id': buyer_id, 'item_id': stable_id('item', ikey) if ikey else None,
            'quantity': qty, 'unit_price': unit_price, 'discount': discount, 'total': amount,
            'sale_date': l['datetime'][:10], 'sold_at': f"{l['datetime']}:00{TIMEZONE}",
            'description': l['label'], 'import_batch': batch,
        })

    # Catalog price = the item's regular price at its most recent sale.
    items = [{'id': stable_id('item', ikey), 'name': item_names[ikey], 'stock': 0, 'import_batch': batch,
              'price': regular_price(history[ikey], history[ikey][-1][0])}
             for ikey in sorted(used)]
    return list(buyers.values()), items, sales, missing_customers, stats


def reuse_existing(rows, existing, kind):
    """Swap ids of imported rows for hand-made rows with the same name. Returns {old_id: new_id}."""
    manual = {ascii_lower(r['name']): r['id'] for r in existing if not r.get('import_batch')}
    remap, keep = {}, []
    for r in rows:
        mid = manual.get(ascii_lower(r['name']))
        if mid:
            remap[r['id']] = mid
        else:
            keep.append(r)
    if remap:
        print(f'  reusing {len(remap)} existing {kind} created in the site')
    return keep, remap


# ---------- Supabase REST ----------

class Supabase:
    def __init__(self, url, anon_key):
        self.url, self.key, self.token = url.rstrip('/'), anon_key, None

    def login(self, email, password):
        r = requests.post(f'{self.url}/auth/v1/token?grant_type=password',
                          headers={'apikey': self.key}, json={'email': email, 'password': password}, timeout=30)
        if r.status_code != 200:
            sys.exit(f'Login failed: {r.json().get("error_description") or r.text}')
        self.token = r.json()['access_token']

    def _headers(self, extra=None):
        return {'apikey': self.key, 'Authorization': f'Bearer {self.token}', **(extra or {})}

    def select_all(self, table, columns):
        rows, start = [], 0
        while True:
            r = requests.get(f'{self.url}/rest/v1/{table}?select={columns}&order=id',
                             headers=self._headers({'Range': f'{start}-{start + 999}'}), timeout=60)
            r.raise_for_status()
            page = r.json()
            rows += page
            if len(page) < 1000:
                return rows
            start += 1000

    def upsert(self, table, rows):
        for i in range(0, len(rows), BATCH_SIZE):
            chunk = rows[i:i + BATCH_SIZE]
            try:
                r = requests.post(f'{self.url}/rest/v1/{table}?on_conflict=id', json=chunk, timeout=120,
                                  headers=self._headers({'Prefer': 'resolution=merge-duplicates,return=minimal'}))
            except requests.RequestException as e:
                sys.exit(f'\nInsert into {table} stopped at row {i} of {len(rows)}: {e}\n'
                         'Nothing is duplicated by re-running: run --commit again to finish.')
            if r.status_code >= 300:
                sys.exit(f'\nInsert into {table} failed at row {i} of {len(rows)}: {r.status_code} {r.text[:500]}\n'
                         'Run --commit again after fixing it; rows already written are updated, not duplicated.')
            print(f'  {table}: {min(i + BATCH_SIZE, len(rows))}/{len(rows)}', end='\r', flush=True)
        print()

    def check_migration(self):
        for table, cols in (('sales', 'sold_at,description,import_batch,unit_price,discount'), ('buyers', 'import_batch'), ('items', 'import_batch')):
            r = requests.get(f'{self.url}/rest/v1/{table}?select={cols}&limit=0', headers=self._headers(), timeout=30)
            if r.status_code == 400:
                sys.exit('The database is missing the import columns. Run db/migrations/002_sales_import.sql and '
                         '003_sale_discount.sql in the Supabase SQL editor first.')
            r.raise_for_status()

    def prune(self, table, keep_ids, batch):
        """Delete rows of this import batch that the current mappings no longer produce (e.g. a
        renamed product), unless some sale still uses them."""
        column = {'buyers': 'buyer_id', 'items': 'item_id'}[table]
        stale = [r['id'] for r in self.select_all(table, 'id,import_batch')
                 if r.get('import_batch') == batch and r['id'] not in keep_ids]
        kept = 0
        for row_id in stale:
            if self.count('sales', f'{column}=eq.{row_id}'):
                kept += 1
            else:
                self.delete(table, f'id=eq.{row_id}')
        if stale:
            print(f'  {table}: removed {len(stale) - kept} imported rows no longer in the mappings'
                  + (f', kept {kept} still used by sales' if kept else ''))

    def count(self, table, query):
        r = requests.get(f'{self.url}/rest/v1/{table}?select=id&{query}', timeout=60,
                         headers=self._headers({'Prefer': 'count=exact', 'Range': '0-0'}))
        r.raise_for_status()
        return int(r.headers.get('Content-Range', '*/0').split('/')[-1])

    def delete(self, table, query):
        r = requests.delete(f'{self.url}/rest/v1/{table}?{query}', headers=self._headers(), timeout=300)
        r.raise_for_status()


def verify(db, buyers, items, sales, batch):
    """Compare what is in the database with what this import should have written. True if complete."""
    q = f'import_batch=eq.{batch}'
    ok = True
    print('\nIn the database vs. expected:')
    for table, rows in (('buyers', buyers), ('items', items), ('sales', sales)):
        got = db.count(table, q)
        ok &= got >= len(rows)
        print(f'  {table:<7} {got:>6} / {len(rows):<6} {"ok" if got >= len(rows) else "MISSING " + str(len(rows) - got)}')
    years = collections.Counter(s['sale_date'][:4] for s in sales)
    for year, expected in sorted(years.items()):
        got = db.count('sales', f'{q}&sale_date=gte.{year}-01-01&sale_date=lt.{int(year) + 1}-01-01')
        ok &= got >= expected
        print(f'  sales {year} {got:>6} / {expected:<6} {"ok" if got >= expected else "MISSING " + str(expected - got)}')
    print('Complete.' if ok else 'Incomplete — run --commit again; it fills in what is missing without duplicating.')
    return ok


def connect(args):
    env = read_env(args.env)
    url, key = env.get('REACT_APP_SUPABASE_URL'), env.get('REACT_APP_SUPABASE_ANON_KEY')
    if not url or not key:
        sys.exit(f'REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY missing in {args.env}')
    db = Supabase(url, key)
    email = args.email or os.environ.get('SUPABASE_EMAIL') or input('Owner email: ')
    db.login(email, os.environ.get('SUPABASE_PASSWORD') or getpass.getpass('Owner password: '))
    db.check_migration()
    return db


# ---------- main ----------

def summary(buyers, items, sales, missing, stats):
    total = sum(s['total'] for s in sales)
    mapped = sum(1 for s in sales if s['item_id'])
    years = collections.Counter(s['sale_date'][:4] for s in sales)
    print(f'buyers: {len(buyers)}   items: {len(items)}   sales: {len(sales)}   total: R$ {total:,.2f}')
    print(f'sales with a catalog item: {mapped} ({mapped / len(sales):.1%}); the rest keep the sheet text as description')
    print(f"sales with a discount: {stats['with discount']}; half portions (50% off): {stats['half portion']}; "
          f"quantity taken from the amount: {stats['quantity from amount']}")
    print('sales per year:', dict(sorted(years.items())))
    if missing:
        print(f'WARNING: {len(missing)} sheet names have no buyer_name in customers.csv; their sales are skipped')
    print('\nsample:')
    names = {b['id']: b['name'] for b in buyers}
    inames = {i['id']: i['name'] for i in items}
    for s in sales[:: max(1, len(sales) // 5)][:5]:
        print(f"  {s['sold_at'][:16]}  {names[s['buyer_id']]:<24} {inames.get(s['item_id'], '-'):<22} "
              f"x{s['quantity']} @ {s['unit_price']:.2f} -{s['discount']:g}%  R$ {s['total']:.2f}  ({s['description']})")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--lines', default=os.path.join(REPO, 'dump/output/order_lines.csv'))
    p.add_argument('--mappings', default=os.path.join(REPO, 'dump/mappings'))
    p.add_argument('--env', default=os.path.join(REPO, 'client/.env'))
    p.add_argument('--batch', default='sheet-import', help='tag stored in import_batch (default: sheet-import)')
    p.add_argument('--email', help='owner email (or SUPABASE_EMAIL)')
    mode = p.add_mutually_exclusive_group()
    mode.add_argument('--commit', action='store_true', help='write to Supabase')
    mode.add_argument('--check', action='store_true', help='compare the database with what should be imported')
    mode.add_argument('--rollback', action='store_true', help='delete rows of this batch from Supabase')
    p.add_argument('--force', action='store_true', help='rollback even if app-recorded sales use imported buyers/items')
    args = p.parse_args()

    if args.rollback:
        db = connect(args)
        q = f'import_batch=eq.{args.batch}'
        counts = {t: db.count(t, q) for t in ('sales', 'items', 'buyers')}
        print(f"batch '{args.batch}':", counts)
        imported_buyers = [b['id'] for b in db.select_all('buyers', 'id,import_batch') if b.get('import_batch') == args.batch]
        if imported_buyers and not args.force:
            used = sum(db.count('sales', f'import_batch=is.null&buyer_id=in.({",".join(imported_buyers[i:i + 200])})')
                       for i in range(0, len(imported_buyers), 200))
            if used:
                sys.exit(f'{used} sales recorded in the app use imported buyers; rerun with --force to delete anyway '
                         '(those sales would show "Unknown")')
        if input('Delete these rows? Type "delete" to confirm: ') != 'delete':
            sys.exit('Cancelled.')
        for t in ('sales', 'items', 'buyers'):
            db.delete(t, q)
        print('Rolled back.')
        return

    lines = read_csv(args.lines)
    customers = read_csv(os.path.join(args.mappings, 'customers.csv'))
    items_map = read_csv(os.path.join(args.mappings, 'items.csv'))
    buyers, items, sales, missing, stats = build_rows(lines, customers, items_map, args.batch)

    if args.check:
        db = connect(args)
        buyers, _ = reuse_existing(buyers, db.select_all('buyers', 'id,name,import_batch'), 'buyers')
        items, _ = reuse_existing(items, db.select_all('items', 'id,name,import_batch'), 'items')
        sys.exit(0 if verify(db, buyers, items, sales, args.batch) else 1)
    if not args.commit:
        summary(buyers, items, sales, missing, stats)
        print('\nDry run — nothing was written. Use --commit to import.')
        return

    db = connect(args)
    buyers, buyer_remap = reuse_existing(buyers, db.select_all('buyers', 'id,name,import_batch'), 'buyers')
    items, item_remap = reuse_existing(items, db.select_all('items', 'id,name,import_batch'), 'items')
    for s in sales:
        s['buyer_id'] = buyer_remap.get(s['buyer_id'], s['buyer_id'])
        s['item_id'] = item_remap.get(s['item_id'], s['item_id'])
    summary(buyers, items, sales, missing, stats)
    if input(f'\nImport into {db.url}? Type "import" to confirm: ') != 'import':
        sys.exit('Cancelled.')
    db.upsert('buyers', buyers)
    db.upsert('items', items)
    db.upsert('sales', sales)
    db.prune('items', {i['id'] for i in items}, args.batch)
    db.prune('buyers', {b['id'] for b in buyers}, args.batch)
    if verify(db, buyers, items, sales, args.batch):
        print(f"Done. Undo with: python {os.path.relpath(__file__)} --rollback --batch {args.batch}")
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
