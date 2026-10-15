# API contract

The client talks to its backend only through `client/src/api/` (`api.auth`, `api.buyers`,
`api.items`, `api.sales`). Two providers implement it:

| Provider   | File                                   | Backend                         |
|------------|----------------------------------------|---------------------------------|
| `supabase` | `client/src/api/supabaseProvider.js`   | Supabase (current)              |
| `rest`     | `client/src/api/restProvider.js`       | Self-hosted server in `server/` (planned) |

Pick one with `REACT_APP_API_PROVIDER`. **Any change to this contract must be made in both
providers, in this file, and (for schema changes) in `db/schema.sql`.**

## Data shapes

Rows use the database column names (snake_case) on both providers.

```ts
Buyer = { id: uuid, name: string, phone: string | null, email: string | null,
          import_batch: string | null, created_at: timestamp }
Item  = { id: uuid, name: string, price: number|string, stock: integer,
          import_batch: string | null, created_at: timestamp }
Sale  = { id: uuid, buyer_id: uuid | null, item_id: uuid | null, quantity: integer,
          unit_price: number|string, discount: number|string, total: number|string, sale_date: 'YYYY-MM-DD', sold_at: timestamp | null,
          description: string | null, import_batch: string | null, created_at: timestamp }
```

`price` / `unit_price` / `discount` / `total` are Postgres `numeric` and may arrive as strings — the client always wraps
them in `Number()`. `buyer_id` / `item_id` become `null` when the referenced row is deleted.

`unit_price` is the item's price at the time of the sale; `discount` is a percentage from 0 to
100; `total = round(quantity × unit_price × (1 − discount/100), 2)`.

`sold_at`, `description` and `import_batch` are filled by the spreadsheet importer
(`tools/sheet-import/`): imported sales carry an estimated time in `sold_at`, keep the original
spreadsheet text in `description` when no catalog item matched, and are tagged with
`import_batch` so an import can be rolled back. Sales recorded in the app leave them `null`.

`list()` must return **every** row. Supabase caps responses at 1000 rows, so the Supabase
provider pages through results; the REST server must not truncate either.

## Client interface (`api.*`)

All methods are async and throw an `Error` with a user-readable `message` on failure, in
Brazilian Portuguese (the UI shows it as is).

| Method | Returns | Notes |
|---|---|---|
| `auth.getSession()` | `{ user: { id, email } } \| null` | |
| `auth.onChange(cb)` | unsubscribe fn | `cb(session \| null)` on sign-in/out/expiry |
| `auth.signIn(email, password)` | – | |
| `auth.signOut()` | – | |
| `buyers.list()` | `Buyer[]` | oldest first |
| `buyers.create({ name, phone, email })` | `Buyer` | |
| `buyers.update(id, { name, phone, email })` | `Buyer` | |
| `buyers.remove(id)` | – | sales keep the row with `buyer_id = null` |
| `items.list()` | `Item[]` | oldest first |
| `items.create({ name, price, stock })` | `Item` | |
| `items.update(id, { name, price, stock })` | `Item` | |
| `items.remove(id)` | – | sales keep the row with `item_id = null` |
| `sales.list()` | `Sale[]` | `sale_date desc, sold_at desc (nulls last), created_at desc` |
| `sales.create({ buyerId, itemId, quantity, saleDate, discount })` | `Sale` | see rules below |
| `sales.remove(id)` | – | does **not** restore stock |

### `sales.create` rules

1. `quantity` is an integer ≥ 1 and ≤ the item's current stock — otherwise fail with a
   message like `Só há 3 de "Salgado" em estoque`.
2. `discount` is a percentage from 0 to 100 (optional, default 0) — otherwise fail with
   `O desconto deve ficar entre 0 e 100%`.
3. `unit_price = item.price` (the **current** price, never trusted from the client) and
   `total = round(quantity × unit_price × (1 − discount/100), 2)`, both computed by the backend.
4. Decrementing stock and inserting the sale must be atomic. The REST server does both in
   one SQL transaction (`SELECT … FOR UPDATE` on the item).

## REST endpoints (for `server/`)

Base URL: `REACT_APP_API_URL` (e.g. `http://localhost:4000/api`). JSON in and out.
Every endpoint except `POST /auth/login` requires `Authorization: Bearer <token>`.

| Method & path | Body | Success |
|---|---|---|
| `POST /auth/login` | `{ email, password }` | `200 { token, user: { id, email } }` |
| `GET /auth/me` | – | `200 { id, email }` |
| `GET /buyers` | – | `200 Buyer[]` |
| `POST /buyers` | `{ name, phone, email }` | `201 Buyer` |
| `PATCH /buyers/:id` | partial buyer | `200 Buyer` |
| `DELETE /buyers/:id` | – | `204` |
| `GET /items` · `POST /items` · `PATCH /items/:id` · `DELETE /items/:id` | same pattern | |
| `GET /sales` | – | `200 Sale[]` |
| `POST /sales` | `{ buyer_id, item_id, quantity, discount, sale_date }` | `201 Sale` |
| `DELETE /sales/:id` | – | `204` |
| `GET /health` | – | `200 { ok: true }` (no auth; for Docker healthchecks) |

Errors: `{ "error": "mensagem legível em português" }` with `400` (validation), `401` (missing/invalid
token — the client signs out), `404`, `409` (insufficient stock / conflict), `500`.
