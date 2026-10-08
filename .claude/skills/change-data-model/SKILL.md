---
name: change-data-model
description: Add, rename, or remove a field or table (e.g. add a "category" to items, add a "suppliers" table). Use whenever a change touches the database schema or the shape of buyers/items/sales rows, so every layer stays in sync.
---

# Change the data model

A schema change in this repo touches several layers that must agree. Work through them in order and do not skip one because "the other backend isn't used yet".

1. **Schema** — edit `db/schema.sql` (the fresh-install source of truth, must stay idempotent: `create … if not exists`).
2. **Migration** — add `db/migrations/NNN_<what>.sql` (next number) that upgrades an existing database to the same state. Make it re-runnable (`add column if not exists`, `drop constraint if exists` before `add constraint`).
3. **Supabase policies** — a new table needs RLS enabled and the "Allow authenticated full access" policy in `db/supabase/policies.sql` (and in the migration). Without it the anon key can read/write the table.
4. **Contract** — update the data shapes, method table and REST endpoints in `docs/api-contract.md`.
5. **Providers** — update **both** `client/src/api/supabaseProvider.js` and `client/src/api/restProvider.js`. A new table gets the same `crud(...)` helper pattern and a new key on the returned object; also list it in the header comment of `client/src/api/index.js`.
6. **State & UI** — `client/src/App.js` holds the arrays and `refreshX` callbacks; components in `client/src/components/` follow the Buyers/Items pattern (form card + table, `ErrorBanner`, reset only on success). Reuse classes from `App.css`.
7. **Verify** — from `client/`: `CI=true npm test -- --watchAll=false` and `CI=true npm run build`.
8. Tell the user which SQL file(s) to run in the Supabase SQL editor — Claude cannot apply them.

Optionally finish by running the `contract-checker` agent to confirm the layers agree.
