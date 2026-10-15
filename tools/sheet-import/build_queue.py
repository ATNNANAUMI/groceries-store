"""Rebuild a chronological order/payment log from the snapshot cache.

Usage: python build_queue.py RAW_JSON OUT_DIR

1. Dedupe: an entry lives in many weekly snapshots. Entries are grouped by
   (customer, date, item); the group's final contents come from the snapshot
   where it had the most entries (ties -> latest, so later corrections win).
   Entries whose date was corrected between two consecutive snapshots are
   counted once (the corrected one).
2. Clean: fix swapped day/month dates, send rows that cannot be placed
   (no customer, no date, no item, balance carried forward, dates typed into
   the amount column) to needs_review.
3. Time: the sheet only has dates. Items get a meal slot (09:00 / 13:00 /
   19:00) from keywords; snacks and drinks follow the nearest meal item;
   consecutive items are grouped into orders of up to 3; each order gets a
   random time around its slot (seeded, so reruns give identical output).
"""
import collections
import csv
import datetime
import hashlib
import json
import os
import random
import re
import sys
import unicodedata

import openpyxl

SLOTS = {'09:00': 9 * 60, '13:00': 13 * 60, '19:00': 19 * 60}
SLOT_WEIGHTS = [('09:00', 0.30), ('13:00', 0.45), ('19:00', 0.25)]
MORNING = re.compile(r'\b(cafe|pao (de )?queijo|misto|crepioca|tapioca|croissant|cuscuz|omelete|pao na chapa)')
LUNCH = re.compile(r'\b(almoco|marmita|prato|pf|feijoada|yakisoba|strogonoff|refeicao|bisteca|macarrao|temaki)')
DINNER = re.compile(r'\b(janta|jantar|sopa|caldo)')
DRINK = re.compile(r'\b(refri|coca|lata|suco|agua|h2o|monster|redbull|red bull|cha|toddynho|guarana|energetico|cafe)')
PAYMENT = re.compile(r'\b(pag|pix|quit|acerto|receb|credito|deposit|transf)')
BALANCE = re.compile(r'\bsaldo')
MAX_ITEM_AMOUNT = 1000  # above this an "item" is a date typed into the amount column


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s.lower()).strip()


def customer_key(name):
    return re.sub(r'^nome:\s*', '', norm(name))


def fix_date(d, seen):
    """`seen` is the date of the first snapshot containing the entry."""
    if seen is None or d <= seen + datetime.timedelta(days=1):
        return d, ''
    if d.day <= 12:
        swapped = d.replace(month=d.day, day=d.month)
        if seen - datetime.timedelta(days=400) <= swapped <= seen:
            return swapped, f'date fixed (was {d})'
    prev_year = d.replace(year=d.year - 1)
    if seen - datetime.timedelta(days=400) <= prev_year <= seen:
        return prev_year, f'date fixed (was {d})'
    return d, 'date later than first snapshot containing it'


def superseded(snaps):
    """(customer, item, amount, date) keys replaced by a date correction: the entry
    disappears from one snapshot and reappears 1-3 days off in the next one."""
    present = collections.defaultdict(set)
    for i, s in enumerate(snaps):
        for e in s['entries']:
            if e['customer'] and e['date'] and e['label']:
                present[(customer_key(e['customer']), norm(e['label']), e['amount'], e['date'])].add(i)
    by = collections.defaultdict(list)
    for (c, l, a, d), idx in present.items():
        by[(c, l, a)].append((d, idx))
    old = set()
    for (c, l, a), lst in by.items():
        lst.sort()
        for (d1, i1), (d2, i2) in zip(lst, lst[1:]):
            gap = (datetime.date.fromisoformat(d2) - datetime.date.fromisoformat(d1)).days
            if 0 < gap <= 3 and min(i2) == max(i1) + 1:
                old.add((c, l, a, d1))
            elif 0 < gap <= 3 and min(i1) == max(i2) + 1:
                old.add((c, l, a, d2))
    return old


def resolve_missing_names(snaps):
    """A block whose name cell was blanked in one snapshot usually has a name in
    another. Map (tab, date, item, amount) -> customer when exactly one named
    customer ever had that entry."""
    owners = collections.defaultdict(set)
    for s in snaps:
        for e in s['entries']:
            if e['customer'] and e['date']:
                owners[(e['tab'], e['date'], norm(e['label']), e['amount'])].add(e['customer'].strip())
    return {k: next(iter(v)) for k, v in owners.items() if len(v) == 1}


def build(snaps):
    best, first = {}, {}
    names = collections.defaultdict(collections.Counter)
    known_owner = resolve_missing_names(snaps)
    for i, s in enumerate(snaps):
        s['idx'] = i
        groups = collections.defaultdict(list)
        for e in s['entries']:
            if not e['customer']:
                e['customer'] = known_owner.get((e['tab'], e['date'], norm(e['label']), e['amount']))
                e['name_inferred'] = bool(e['customer'])
            ck = customer_key(e['customer']) if e['customer'] else ''
            e['file'] = s['file']
            groups[(ck, e['date'], norm(e['label']))].append(e)
            if e['customer']:
                names[ck][e['customer'].strip()] += 1
        for k, es in groups.items():
            first.setdefault(k, s)
            if k not in best or len(es) >= best[k][0]:
                best[k] = (len(es), es)
    display = {k: c.most_common(1)[0][0] for k, c in names.items()}
    stale = superseded(snaps)

    items, review, undated = [], [], []
    for (cust, date, label), (_, es) in best.items():
        fs = first[(cust, date, label)]
        seen = None if 'mais antigo' in fs['file'] else datetime.date.fromisoformat(fs['time'][:10])
        for e in es:
            a = e['amount']
            if (cust, label, a, date) in stale:
                continue
            rec = {'customer': display.get(cust, ''), 'tab': e['tab'], 'label': e['label'], 'amount': a,
                   'first_seen': fs['time'][:10], 'source': e['file'], 'cell': f"{e['lane']}{e['row']}"}
            if not cust or BALANCE.search(label):
                continue  # blank name / "saldo anterior": discarded on purpose
            if abs(a) >= MAX_ITEM_AMOUNT:
                review.append({**rec, 'date': date or '', 'reason': 'amount looks like a typed date'})
                continue
            kind = 'payment' if a < 0 or PAYMENT.search(label) else 'order'
            if not date:
                undated.append({**rec, 'type': kind, 'flags': 'date estimated', 'norm': label,
                                'order_key': (e['tab'], e['lane'], e['row']), 'snap_idx': fs['idx']})
                continue
            d, flag = fix_date(datetime.date.fromisoformat(date), seen)
            if e.get('name_inferred'):
                flag = '; '.join(x for x in (flag, 'customer name taken from another version') if x)
            items.append({**rec, 'date': d, 'type': kind, 'flags': flag, 'norm': label,
                          'order_key': (e['tab'], e['lane'], e['row'])})
    items += estimate_dates(undated, items, snaps)
    return items, review


def estimate_dates(undated, items, snaps):
    """Give undated entries a plausible date. An entry first seen in snapshot S
    was written between the previous snapshot and S, so its date is picked from
    that window, on the weekdays this customer usually buys, keeping sheet order
    and the customer's usual number of items per visit."""
    weekday = collections.defaultdict(collections.Counter)
    per_day = collections.defaultdict(collections.Counter)
    for it in items:
        if it['type'] == 'order':
            weekday[it['customer']][it['date'].weekday()] += 1
            per_day[it['customer']][it['date']] += 1
    times = [datetime.date.fromisoformat(s['time'][:10]) for s in snaps]

    batches = collections.defaultdict(list)
    for u in undated:
        batches[(u['customer'], u['snap_idx'])].append(u)
    out = []
    for (cust, idx), us in batches.items():
        rng = random.Random(hashlib.md5(f'undated|{cust}|{idx}'.encode()).hexdigest())
        end = times[idx]
        start = times[idx - 1] if idx > 0 and 'mais antigo' not in snaps[idx - 1]['file'] else end - datetime.timedelta(days=14)
        days = [start + datetime.timedelta(days=i) for i in range(1, (end - start).days + 1)]
        days = [d for d in days if d.weekday() < 5] or days or [end]
        counts = sorted(per_day[cust].values())
        per_visit = max(1, counts[len(counts) // 2]) if counts else 2
        us.sort(key=lambda u: u['order_key'])
        chunks = [us[i:i + per_visit] for i in range(0, len(us), per_visit)]
        weights = [weekday[cust][d.weekday()] + 1 for d in days]
        picked = []
        pool = list(zip(days, weights))
        for _ in range(min(len(chunks), len(pool))):
            d = rng.choices([p[0] for p in pool], [p[1] for p in pool])[0]
            picked.append(d)
            pool = [p for p in pool if p[0] != d]
        picked.sort()
        for n, chunk in enumerate(chunks):
            d = picked[min(n * len(picked) // len(chunks), len(picked) - 1)]
            out += [{**u, 'date': d} for u in chunk]
    return out


def slot_of(label):
    if DINNER.search(label):
        return '19:00'
    if LUNCH.search(label):
        return '13:00'
    if MORNING.search(label):
        return '09:00'
    return None


def pick_slot(rng):
    return rng.choices([s for s, _ in SLOT_WEIGHTS], [w for _, w in SLOT_WEIGHTS])[0]


def to_orders(items):
    by_day = collections.defaultdict(list)
    for it in items:
        by_day[(it['customer'], it['date'])].append(it)
    queue, lines = [], []
    occurrences = collections.Counter()
    for (cust, day), its in sorted(by_day.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        rng = random.Random(hashlib.md5(f'{cust}|{day}'.encode()).hexdigest())
        its.sort(key=lambda i: i['order_key'])
        orders = [i for i in its if i['type'] == 'order']
        payments = [i for i in its if i['type'] == 'payment']

        slots = [slot_of(i['norm']) for i in orders]
        anchors = [j for j, s in enumerate(slots) if s]
        for idx in range(len(slots)):
            if slots[idx] is None and anchors:
                slots[idx] = slots[min(anchors, key=lambda j: (abs(j - idx), j > idx))]
        fallback = None
        for idx in range(len(slots)):
            if slots[idx] is None:
                if fallback is None or rng.random() < 0.35:
                    fallback = pick_slot(rng)
                slots[idx] = fallback

        groups, cur, cur_slot = [], [], None
        for it, sl in zip(orders, slots):
            is_drink = bool(DRINK.search(it['norm']))
            if cur and (sl != cur_slot or len(cur) >= 3 or (len(cur) >= 2 and not is_drink)):
                groups.append((cur_slot, cur))
                cur = []
            cur.append(it)
            cur_slot = sl
        if cur:
            groups.append((cur_slot, cur))
        groups += [(pick_slot(rng), [p]) for p in payments]

        used = []
        for sl, grp in groups:
            minute = SLOTS[sl] + max(-75, min(75, round(rng.gauss(0, 30))))
            while any(abs(minute - u) < 10 for u in used):
                minute += 12
            used.append(minute)
            when = datetime.datetime.combine(day, datetime.time(minute // 60, minute % 60))
            kind = grp[0]['type']
            total = sum(g['amount'] for g in grp)
            order_id = hashlib.md5(f"{cust}|{when:%Y-%m-%d %H:%M}|{kind}".encode()).hexdigest()[:12]
            for n, g in enumerate(grp, 1):
                # content-based key: stable across reruns and re-extractions, so imports can upsert
                base = (customer_key(cust), day.isoformat(), g['norm'], g['amount'])
                occurrences[base] += 1
                lines.append({
                    'line_key': hashlib.md5(repr((base, occurrences[base])).encode()).hexdigest(),
                    'order_id': order_id, 'line': n, 'datetime': when.strftime('%Y-%m-%d %H:%M'),
                    'type': kind, 'customer': cust, 'tab': g['tab'], 'label': g['label'],
                    'amount': g['amount'], 'flags': g['flags'], 'cell': g['cell'],
                })
            queue.append({
                'order_id': order_id,
                'datetime': when.strftime('%Y-%m-%d %H:%M'),
                'date': day.isoformat(), 'time': when.strftime('%H:%M'), 'time_estimated': 'yes',
                'type': kind, 'customer': cust, 'tab': grp[0]['tab'],
                'items': ' + '.join(g['label'] for g in grp),
                'item_count': len(grp),
                'amount': round(abs(total) if kind == 'payment' else total, 2),
                'flags': '; '.join(sorted({g['flags'] for g in grp if g['flags']})),
                'first_seen_in_version': grp[0]['first_seen'],
                'cells': ' '.join(g['cell'] for g in grp),
            })
    queue.sort(key=lambda q: (q['datetime'], q['customer']))
    lines.sort(key=lambda l: (l['datetime'], l['customer'], l['order_id'], l['line']))
    return queue, lines


def write(rows, base, sheet):
    if not rows:
        return
    cols = list(rows[0].keys())
    with open(base + '.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet
    ws.append(cols)
    for r in rows:
        ws.append([str(r[c]) if isinstance(r[c], datetime.date) else r[c] for c in cols])
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = ws.dimensions
    wb.save(base + '.xlsx')


def main(raw_path, out_dir):
    with open(raw_path) as f:
        snaps = json.load(f)
    items, review = build(snaps)
    queue, lines = to_orders(items)
    os.makedirs(out_dir, exist_ok=True)
    write(queue, os.path.join(out_dir, 'orders_queue'), 'queue')
    write(lines, os.path.join(out_dir, 'order_lines'), 'lines')
    review.sort(key=lambda r: (r['reason'], r['date'], r['customer']))
    write(review, os.path.join(out_dir, 'needs_review'), 'review')

    print('queue rows:', len(queue), dict(collections.Counter(q['type'] for q in queue)),
          '| items:', len(items), '| review:', len(review))
    print('review reasons:', dict(collections.Counter(r['reason'] for r in review)))
    print('flags:', dict(collections.Counter(q['flags'].split(' (')[0] for q in queue if q['flags'])))
    print('span:', queue[0]['datetime'], '->', queue[-1]['datetime'])
    print('totals: orders R$ %.2f | payments R$ %.2f' % (
        sum(q['amount'] for q in queue if q['type'] == 'order'),
        sum(q['amount'] for q in queue if q['type'] == 'payment')))


if __name__ == '__main__':
    main(*sys.argv[1:3])
