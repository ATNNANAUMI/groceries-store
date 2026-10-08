---
name: build-rest-server
description: Implement or extend the self-hosted REST API in server/ (Node/Express + Postgres + Docker) that replaces Supabase. Use when the user asks to build the backend, add an endpoint, dockerize, or migrate off Supabase.
---

# Build the self-hosted REST server

Goal: a server in `server/` that implements `docs/api-contract.md` exactly, so the client works unchanged with `REACT_APP_API_PROVIDER=rest` (client side already exists in `client/src/api/restProvider.js`).

## Before writing code

- Read `docs/api-contract.md`, `db/schema.sql`, `client/src/api/restProvider.js`, and `server/README.md` (suggested layout and env vars).
- Confirm the stack with the user if they haven't chosen one; default is Node + Express + `pg` + `jsonwebtoken` + `bcrypt`, plain JS to match the client.

## Rules the implementation must follow

- Use `db/schema.sql` as-is; schema changes go through the `change-data-model` skill, not ad-hoc in server code.
- Parameterized SQL only (`$1, $2`) — never string-interpolate values.
- Response shapes = DB rows (snake_case), as the contract specifies. Errors are `{ "error": "message" }` with the listed status codes; `401` makes the client sign out.
- `POST /sales`: one transaction — `SELECT price, stock FROM items WHERE id = $1 FOR UPDATE`, reject with `409` if `quantity > stock`, compute `total` server-side, update stock, insert sale, commit.
- `PATCH` accepts partial bodies; validate types and the same constraints as the schema checks (non-negative price/stock, quantity ≥ 1, non-empty name).
- Auth: `POST /auth/login` checks `users.password_hash` with bcrypt and returns a JWT; `requireAuth` middleware on everything except `/auth/login` and `/health`. Provide `scripts/create-owner.js` to create the owner account (no sign-up endpoint).
- CORS restricted to `CORS_ORIGIN`. Secrets only from env.

## Docker

- `server/Dockerfile`: `node:<lts>-alpine`, `npm ci --omit=dev`, non-root user, `CMD ["node", "src/index.js"]`.
- Uncomment the `api` service in the root `docker-compose.yml`; keep `depends_on: db: condition: service_healthy`.

## Verify

- `docker compose up -d --build`, create an owner, then exercise each endpoint with `curl` (login → token → CRUD → sale with too much quantity returns 409).
- Run the client against it: `REACT_APP_API_PROVIDER=rest REACT_APP_API_URL=http://localhost:4000/api npm start` in `client/`.
- Run the `contract-checker` agent.
