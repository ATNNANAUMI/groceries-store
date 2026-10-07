# server/ — self-hosted REST API (planned)

Not implemented yet. This folder will hold the backend that replaces Supabase.

## What it must do

Implement every endpoint in [`docs/api-contract.md`](../docs/api-contract.md) on top of
plain Postgres using [`db/schema.sql`](../db/schema.sql). Once it passes, switch the client
with `REACT_APP_API_PROVIDER=rest` — no UI changes needed.

## Suggested layout (Node + Express, any stack works if it honours the contract)

    server/
      Dockerfile
      package.json
      src/
        index.js          - app setup, CORS, JSON, error handler, /health
        db.js             - pg Pool from DATABASE_URL
        auth.js           - POST /auth/login, GET /auth/me, requireAuth middleware (JWT)
        routes/
          buyers.js
          items.js
          sales.js        - POST runs in a transaction with SELECT ... FOR UPDATE on the item
      scripts/
        create-owner.js   - inserts a row in `users` with a bcrypt password hash

## Environment

    DATABASE_URL=postgres://groceries:groceries@db:5432/groceries
    JWT_SECRET=<long random string>
    PORT=4000
    CORS_ORIGIN=http://localhost:3000

## Docker

`docker-compose.yml` at the repo root already runs Postgres with the schema applied.
When this server exists, uncomment the `api` service there.
