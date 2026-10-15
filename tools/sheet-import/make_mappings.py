"""Generate editable mapping files: sheet names -> buyers, sheet labels -> catalog items.

Usage: python make_mappings.py ORDER_LINES_CSV MAPPINGS_DIR

Writes MAPPINGS_DIR/customers.csv and MAPPINGS_DIR/items.csv. Re-running keeps
any value you edited by hand (buyer_name, item_name, quantity) and only adds
rows for names/labels it has not seen before.

customers.csv
  status=same       spelling/class-suffix variants of one name, merged
  status=merged     typo or a fuller version of another name, merged
  status=maybe      one-word name (first name or surname only) that looks like one of the
                    `suggestion`s (best match first: same token, typo, or written together,
                    ranked by overlapping dates); NOT merged. To merge it, copy a
                    suggestion into `buyer_name`.
  status=suspect    doesn't look like a person (punctuation, an item name); check the sheet
  status=edited     buyer_name was changed by hand
  status=single     no similar name found
  Rows with the same buyer_name become one buyer.

items.csv
  item_name blank   the line is imported with its text as description and no catalog item
  quantity          units per line ("2 salgados" -> item Salgado, quantity 2)
  half_portion=yes  "1/2 coca 600": half of one item, split between two people; imported as
                    the item x1 at its regular price with the rest as discount (~50%)

Re-running keeps hand edits: the auto_* columns hold what the generator wrote, and a value
that differs from them is yours. Don't edit the auto_* columns.
"""
import collections
import csv
import difflib
import os
import re
import statistics
import sys
import unicodedata
from datetime import date

STOP = {'prof', 'profa', 'professor', 'professora', 'nome', 'do', 'da', 'de', 'dos', 'das', 'e'}
CLASS_TOKEN = re.compile(r'^(\d+[a-z]*|[nm]|sem|ano|om|on)$')

ITEM_SYNONYMS = {
    'Salgado': ['salgado'],
    'Refrigerante lata': ['lata', 'lata refri', 'refri lata', 'latarefri', 'refri', 'lata refrigerante', 'refrigerante lata', 'refrigerante'],
    'Coca-Cola lata': ['lata coca', 'coca lata', 'coca cola lata', 'lata coca cola'],
    'Mini refrigerante': ['mini refri', 'refri mini', 'mini', 'mini coca', 'coca mini', 'mini guarana', 'minirefri'],
    'Pão de queijo': ['pao queijo', 'pao de queijo', 'paoqueijo'],
    'Almoço': ['almoco'],
    'Janta': ['janta', 'jantar'],
    'Suco': ['suco'],
    'Suco 1L': ['suco grande', 'suco 1l', 'suco 1 l', 'suco l', 'suco litro', 'suco 1 litro', 'suco g'],
    'Cookie': ['cookie'],
    'Monster': ['monster'],
    'Toddynho': ['toddynho', 'todinho', 'toddy'],
    'Água': ['agua', 'h2o', 'agua sem gas'],
    'Água com gás': ['agua gas', 'agua com gas', 'h2o gas', 'agua c gas'],
    'Esfiha': ['esfiha', 'esfirra', 'esfiha'],
    'Trident': ['trident'],
    'Trento': ['trento'],
    'Coca-Cola 600ml': ['coca 600', 'coca 600ml', 'coca600', 'coca 600 ml'],
    'Coca-Cola 2L': ['coca 2 l', 'coca 2l', 'coca 2 litro', 'coca2l', 'coca2 l'],
    'Refrigerante 2L': ['refri 2 l', 'refri 2l', 'refri2l', 'refrigerante 2l', 'refrigerante 2 l'],
    'Café': ['cafe'],
    'Pastel': ['pastel'],
    'Croissant': ['croissant'],
    'Combo': ['combo'],
    'Suflair': ['suflair'],
    'Pringles': ['pringles', 'pringle'],
    'Temaki': ['temaki'],
    'Cone': ['cone'],
    'Red Bull': ['redbull', 'red bull'],
    'Chá Yai': ['cha yai', 'yai', 'chayai'],
    'Yakisoba': ['yakisoba'],
    'Batata grande': ['batata grande', 'batatag', 'batata g'],
    'Batata pequena': ['batata p', 'batata pq', 'batata pequena', 'batatap'],
    'Crepioca': ['crepioca'],
    'Tapioca': ['tapioca', 'tapiooca'],
    'Misto quente': ['misto', 'misto quente', 'mistoquente'],
    'Kit Kat': ['kitkat', 'kit kat'],
    'Energético': ['energetico'],
    'Pão de mel': ['pao mel', 'pao de mel'],
}
SYNONYM_OF = {alias: name for name, aliases in ITEM_SYNONYMS.items() for alias in aliases}


def ascii_lower(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', s).strip()


# ---------- customers ----------

def name_core(name):
    s = ascii_lower(name)
    s = re.sub(r'^nome:\s*', '', s)
    s = re.sub(r'\d{8,}', ' ', s)                 # phone numbers
    s = re.sub(r'(\d)\s*[o°º]\s*\.?\s*', r'\1o ', s)  # "9º. N" -> "9o N"
    s = re.sub(r'[^a-z0-9/ ]', ' ', s)
    tokens = [t for t in s.split() if t not in STOP and not CLASS_TOKEN.match(t)]
    return tokens


def cluster_customers(stats):
    names = list(stats)
    core = {n: name_core(n) for n in names}
    parent = {n: n for n in names}
    why = {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b, reason):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra
            why.setdefault(b, reason)
            why.setdefault(a, reason)

    by_core = collections.defaultdict(list)
    for n in names:
        if core[n]:
            by_core[' '.join(core[n])].append(n)
    for group in by_core.values():
        for other in group[1:]:
            union(group[0], other, 'same')

    multi = [n for n in names if len(core[n]) >= 2]
    for i, a in enumerate(multi):
        for b in multi[i + 1:]:
            ca, cb = ' '.join(core[a]), ' '.join(core[b])
            if ca == cb:
                continue
            if difflib.SequenceMatcher(None, ca, cb).ratio() >= 0.88:
                union(a, b, 'merged')
    for a in multi:
        supersets = {find(b) for b in multi if b != a and set(core[a]) < set(core[b])}
        if len(supersets) == 1:
            union(next(iter(supersets)), a, 'merged')

    clusters = collections.defaultdict(list)
    for n in names:
        clusters[find(n)].append(n)
    return clusters, core, why


def display_name(variants, core, stats):
    # Prefer the most complete spelling, but never a shared entry like "Joana /Paulo".
    fullest = max(variants, key=lambda v: ('/' not in v, len(core[v]), stats[v]['orders']))
    tokens = core[fullest] or [ascii_lower(fullest)]
    original = ' '.join(re.findall(r'\S+', fullest))
    # Title-case the cleaned name but keep accents from the original spelling where possible.
    words = []
    for t in tokens:
        match = next((w for w in re.split(r'[\s\-/]+', original)
                      if ascii_lower(w) == t), t)
        words.append(match.capitalize())
    return ' '.join(words)


def customer_rows(lines):
    stats = {}
    for l in lines:
        s = stats.setdefault(l['customer'], {'orders': set(), 'first': l['datetime'][:10], 'last': l['datetime'][:10]})
        s['orders'].add(l['order_id'])
        s['first'] = min(s['first'], l['datetime'][:10])
        s['last'] = max(s['last'], l['datetime'][:10])
    for s in stats.values():
        s['orders'] = len(s['orders'])

    clusters, core, why = cluster_customers(stats)
    buyer_of = {}
    for variants in clusters.values():
        name = display_name(variants, core, stats)
        for v in variants:
            buyer_of[v] = name

    sizes = collections.Counter(buyer_of.values())
    rows = []
    for n, s in stats.items():
        rows.append({
            'sheet_name': n, 'orders': s['orders'], 'first_date': s['first'], 'last_date': s['last'],
            'buyer_name': buyer_of[n], 'status': why.get(n, 'single') if sizes[buyer_of[n]] > 1 else 'single',
            'suggestion': '',
        })
    rows.sort(key=lambda r: (r['buyer_name'].lower(), -r['orders']))
    return rows


def name_tokens_match(token, tokens):
    """How a one-word name relates to a fuller name: 'same', 'joined', 'typo' or None."""
    if token in tokens:
        return 'same'
    if any(token == ''.join(tokens[i:j]) for i in range(len(tokens)) for j in range(i + 2, len(tokens) + 1)):
        return 'joined'  # "joanasilva" -> Joana Silva
    if len(token) >= 4 and any(len(t) >= 4 and difflib.SequenceMatcher(None, token, t).ratio() >= 0.85 for t in tokens):
        return 'typo'    # "ferera" -> Paulo Ferreira, "soza" -> Souza
    return None


def add_suggestions(rows):
    """Flag one-word buyers (first name or surname only) that may be someone listed in full."""
    buyers = collections.defaultdict(list)
    for r in rows:
        buyers[r['buyer_name']].append(r)
    info = {}
    for b, rs in buyers.items():
        info[b] = {'tokens': name_core(b), 'orders': sum(int(r['orders']) for r in rs),
                   'first': min(r['first_date'] for r in rs), 'last': max(r['last_date'] for r in rs)}

    def overlap(a, b):
        start, end = max(a['first'], b['first']), min(a['last'], b['last'])
        return (date.fromisoformat(end) - date.fromisoformat(start)).days if start <= end else -1

    for b, rs in buyers.items():
        me = info[b]
        if not me['tokens']:
            status = 'suspect'
        elif len(me['tokens']) == 1 and canonical_item(me['tokens'][0]):
            status = 'suspect'
        else:
            status = None
        cands = []
        if len(me['tokens']) == 1:
            for o, oi in info.items():
                if o == b or not oi['tokens']:
                    continue
                kind = name_tokens_match(me['tokens'][0], oi['tokens'])
                if kind == 'same' and len(oi['tokens']) == 1:
                    kind = None  # identical one-word names are already one buyer
                if kind:
                    cands.append((kind != 'same', -overlap(me, oi), -oi['orders'], o))
        cands.sort()
        for r in rs:
            if r['status'] == 'edited':
                continue
            if status:
                r['status'] = status
            elif cands:
                r['status'] = 'maybe'
                r['suggestion'] = ' | '.join(c[-1] for c in cands[:4])
    return rows


# ---------- items ----------

HALF = re.compile(r'^1\s*/\s*2\s*')  # "1/2 coca 600", "1/2coca 2 l": one item split between two people


def parse_label(label):
    """(base, quantity, half): "2 salgados" -> ("salgados", 2, False), "1/2 coca 600" -> ("coca 600", 1, True)."""
    s = ascii_lower(label)
    half = bool(HALF.match(s))
    s = HALF.sub('', s)
    s = re.sub(r'\([^)]*\)', ' ', s)  # notes: "salgado (ney)", "(ney)2 salgado"
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    qty = 1
    m = re.match(r'^(\d{1,2})\s*x?\s*([a-z].*)$', s)          # "2 salgados", "2x salgado"
    if m:
        qty, s = int(m.group(1)), m.group(2).strip()
    else:
        m = re.match(r'^([a-z][a-z ]*?)\s*x?\s*([1-9])$', s)   # "salgado 2", "salgado x2"
        if m:
            s, qty = m.group(1).strip(), int(m.group(2))
    return s, qty, half


def canonical_item(base):
    if base in SYNONYM_OF:
        return SYNONYM_OF[base]
    singular = re.sub(r'(?<=[a-z]{3})s\b', '', base)
    if singular in SYNONYM_OF:
        return SYNONYM_OF[singular]
    return None


def item_rows(lines):
    by_label = collections.defaultdict(list)
    for l in lines:
        by_label[ascii_lower(l['label'])].append(l)
    base_count = collections.Counter()
    parsed = {}
    for label, ls in by_label.items():
        base, qty, half = parse_label(label)
        parsed[label] = (base, qty, half)
        base_count[base] += len(ls)

    rows = []
    for label, ls in by_label.items():
        base, qty, half = parsed[label]
        name = canonical_item(base)
        status = 'mapped'
        if not name and base_count[base] >= 5 and base:
            name, status = base.capitalize(), 'auto'
        if not name:
            name, status = '', 'unmapped'
        recent = sorted(ls, key=lambda l: l['datetime'])[-50:]
        rows.append({
            'sheet_label': label, 'lines': len(ls), 'example': ls[0]['label'],
            'median_amount': round(statistics.median(float(l['amount']) for l in recent), 2),
            'item_name': name, 'quantity': qty, 'half_portion': 'yes' if half else '', 'status': status,
        })
    rows.sort(key=lambda r: (-r['lines'], r['sheet_label']))
    return rows


# ---------- io ----------

def merge_with_existing(path, rows, key, editable):
    """Keep hand edits from the previous file; everything else takes this run's values.

    Each editable column is also written as auto_<col>, the value the generator produced, so a
    hand edit is a value that differs from it. (Older files without auto_<col>: any value that
    differs from this run counts as an edit.) Returns the set of keys with hand edits."""
    for r in rows:
        for col in editable:
            r[f'auto_{col}'] = r[col]
    edited = set()
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            old = {r[key]: r for r in csv.DictReader(f)}
        for r in rows:
            o = old.get(r[key])
            if not o:
                continue
            for col in editable:
                if col in o and o[col] != o.get(f'auto_{col}', r[col]):
                    r[col] = o[col]
                    edited.add(r[key])
    return edited


def write_csv(path, rows):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def main(lines_path, out_dir):
    with open(lines_path, encoding='utf-8') as f:
        lines = [l for l in csv.DictReader(f) if l['type'] == 'order']
    os.makedirs(out_dir, exist_ok=True)

    cpath = os.path.join(out_dir, 'customers.csv')
    customers = customer_rows(lines)
    edited = merge_with_existing(cpath, customers, 'sheet_name', ['buyer_name'])
    for r in customers:
        if r['sheet_name'] in edited:
            r['status'] = 'edited'
    write_csv(cpath, add_suggestions(customers))
    ipath = os.path.join(out_dir, 'items.csv')
    items = item_rows(lines)
    edited = merge_with_existing(ipath, items, 'sheet_label', ['item_name', 'quantity', 'half_portion'])
    for r in items:
        if r['sheet_label'] in edited:
            r['status'] = 'edited'
    write_csv(ipath, items)

    st = collections.Counter(r['status'] for r in customers)
    print(f"customers: {len(customers)} sheet names -> {len({r['buyer_name'] for r in customers})} buyers  {dict(st)}")
    covered = sum(r['lines'] for r in items if r['item_name'])
    total = sum(r['lines'] for r in items)
    print(f"items: {len(items)} labels -> {len({r['item_name'] for r in items if r['item_name']})} catalog items; "
          f"{covered}/{total} lines mapped ({covered / total:.1%})  {dict(collections.Counter(r['status'] for r in items))}")


if __name__ == '__main__':
    main(*sys.argv[1:3])
