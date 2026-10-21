# ts-fullstack-starter

A small full-stack TypeScript monorepo: a personal task list with accounts. React + Vite in front, Express 5 + PostgreSQL (Drizzle ORM) behind, one set of zod schemas shared by both.

## What it is

- **`apps/api`**: Express 5 REST API. Register, log in, log out, and create, list, update and delete your own tasks. zod validation on every input, a single JSON error envelope, request logging with pino, a `/health` endpoint that checks the database, and an OpenAPI 3.1 document at `/openapi.json`.
- **`apps/web`**: React 18 single-page app (Vite). Login/register form and a task list with add, toggle, delete and an all/open/done filter. Talks to the API through a typed `fetch` client.
- **`packages/db`**: Drizzle schema for `users`, `sessions` and `tasks`, the generated SQL migration, and a migration runner.
- **`packages/shared`**: zod schemas and inferred types for every request and response. The API validates with them, the web client is typed by them, and the OpenAPI document is generated from them.

Out of scope on purpose: admin roles, email (verification, password reset), OAuth, teams or sharing, deployment.

## Why it exists

It is a reference for how I structure a typed full-stack service: a clear boundary between HTTP, services and the database, validation at the edge, sessions that can be revoked, ownership checks that do not leak whether a record exists, and tests that hit a real Postgres instead of mocks. It is a demo project, not a product, and it is not deployed anywhere.

## Architecture

```mermaid
flowchart LR
  subgraph browser[Browser]
    web["apps/web<br/>React 18 + Vite"]
  end
  subgraph server[Node 24]
    api["apps/api<br/>Express 5"]
    svc["services<br/>auth, tasks"]
  end
  db[("PostgreSQL<br/>users, sessions, tasks")]
  shared["packages/shared<br/>zod schemas + types"]
  dbpkg["packages/db<br/>Drizzle schema + migrations"]

  web -- "fetch /api/*, sid cookie" --> api
  api --> svc --> db
  shared -. types .-> web
  shared -. validation + OpenAPI .-> api
  dbpkg -. schema, client .-> svc
```

Request path inside the API: `pino-http` → `helmet` → `cors` → `express.json` (100 kB limit) → `/health` and `/openapi.json` → global rate limiter → routers (`/api/auth`, `/api/tasks`) → 404 → error handler.

```
apps/
  api/   src/{app,server,env,logger,openapi}.ts, middleware/, routes/, services/; test/{unit,integration}
  web/   src/{main,App}.tsx, api/client.ts, features/{auth,tasks}; test/
packages/
  db/      src/{schema,client,migrate}.ts, drizzle/ (SQL migrations)
  shared/  src/{auth,task,error}.ts
```

## Run locally

Requirements: Node 24+, pnpm 11 (the exact version is pinned in `packageManager`), and a PostgreSQL database.

```sh
docker compose up -d db               # postgres:17 on 127.0.0.1:5432, or use any Postgres you have
cp .env.example .env                  # then set DATABASE_URL, e.g. postgres://starter:starter@localhost:5432/starter
pnpm install
pnpm db:migrate
pnpm dev                              # API on :3000, web on http://localhost:5173 (Vite proxies /api to the API)
```

Production-style run: `pnpm build`, then `pnpm --filter @app/api start` and serve `apps/web/dist` from any static host behind the same origin as the API.

## Test

```sh
pnpm lint
pnpm typecheck
pnpm test             # all projects: shared, api, web
pnpm test:coverage    # same, with v8 coverage of apps/api/src
```

The API integration tests need a real database whose name contains `test` (the suite drops and recreates its schema, and refuses any other database). With the compose database:

```sh
docker compose exec db createdb -U starter starter_test
DATABASE_URL=postgres://starter:starter@localhost:5432/starter_test pnpm test:coverage
```

Without `DATABASE_URL` the integration tests are skipped and the run prints why. CI always runs them against a `postgres:17` service container.

What the tests cover (66 tests; numbers from the last local run on 2026-10-21):

- **shared** (10): email normalization, password and title limits (including NUL characters), the `done` query filter, the error-code enum.
- **api unit** (29, no database): argon2id parameters, token generation and hashing, expiry boundary, error envelope mapping (zod, body-parser, unknown errors never leak), database errors logged without their SQL parameters, env parsing, cookie parsing, `/health` returning 503 when the database is down, every route present in `/openapi.json`, security headers, CORS, global rate limit.
- **api integration** (17, real Postgres): register → me → logout → session gone; login stores only the token hash; duplicate email 409 (case-insensitive); wrong password and unknown email return the same 401; expired session rejected and deleted; credential validation; `Secure` cookie flag; login rate limit returns 429 on the 11th attempt; task CRUD and filtering; **user B does not see user A's task in the list and gets 404 on update and delete**; input validation 400s; cascade delete.
- **web** (10, jsdom): the API client (request shape, 204, typed `ApiError`, non-JSON errors) and the task list component (render, create, filter, toggle, delete, error display).

Measured coverage of `apps/api/src` (`pnpm test:coverage` with Postgres): **91.5% lines, 91.4% statements, 92.1% branches, 90.9% functions**. The uncovered part is mostly `server.ts` (process entrypoint: listen and signal handling), which the tests do not start.

## API

All bodies are JSON. Full schema: `GET /openapi.json` (OpenAPI 3.1, generated from `packages/shared`).

| Method | Path | Auth | Success |
|---|---|---|---|
| GET | `/health` | no | 200 `{ status: "ok", db: "ok" }`, 503 `{ status: "unavailable", db: "down" }` |
| GET | `/openapi.json` | no | 200 OpenAPI document |
| POST | `/api/auth/register` | no | 201 `{ user }` + `sid` cookie; 409 if the email exists |
| POST | `/api/auth/login` | no | 200 `{ user }` + `sid` cookie; 401 `Invalid credentials` |
| POST | `/api/auth/logout` | yes | 204, session deleted, cookie cleared |
| GET | `/api/auth/me` | yes | 200 `{ user }` |
| GET | `/api/tasks?done=true\|false` | yes | 200 `{ tasks }`, newest first, your tasks only |
| POST | `/api/tasks` | yes | 201 `{ task }` (title 1–200 chars, trimmed) |
| PATCH | `/api/tasks/:id` | yes | 200 `{ task }`; 404 if missing or not yours |
| DELETE | `/api/tasks/:id` | yes | 204; 404 if missing or not yours |

Every error has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [{ "path": "title", "message": "..." }] } }
```

`code` is one of `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`. A 500 always says `Internal server error`; the real error goes to the log only.

## Design decisions

- **Server-side sessions instead of JWT.** The cookie holds an opaque 32-byte random token; the database stores only its SHA-256. Logout and revocation are a row delete, there is no signing key to rotate, and a leaked `sessions` table cannot be replayed. For a same-site SPA talking to its own API, a stateless token buys nothing and makes logout harder. Cost: one indexed lookup per authenticated request. Sessions have a 24-hour absolute expiry; expired rows are rejected and deleted when presented.
- **Cookie flags.** `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=86400`, and `Secure` when `NODE_ENV=production`.
- **argon2id with the OWASP minimum** (`m=19456 KiB, t=2, p=1`). Login with an unknown email still runs one argon2 verify against a dummy hash, so both failure paths do the same work and return the same message.
- **One shared zod package.** Request validation, client types and the OpenAPI document come from the same schemas, so they cannot drift. The web app imports only types from it, so zod is not in the browser bundle.
- **404, not 403, for other users' tasks.** Every task query is scoped by `user_id`, so a task you do not own is indistinguishable from one that does not exist.
- **Plain Drizzle queries.** No repository layer or ORM relations magic: services call the query builder directly, and the SQL migration is generated and committed so it can be reviewed.
- **Database clock for timestamps.** `created_at` and `updated_at` both come from Postgres `now()`. Setting `updated_at` from the Node clock instead was found to let it fall behind `created_at` when the app and database clocks disagree; this came up while writing the integration tests.
- **Express 5 async errors.** Handlers are plain `async` functions; Express 5 forwards rejected promises to the error handler, so there is no wrapper library.
- **`createApp(deps)` without `listen`.** Tests build the app with a real or stub database and drive it with supertest; `server.ts` only wires env, the pool and signal handling (SIGINT/SIGTERM close the HTTP server, then the pool).
- **Rate limits.** 300 requests per 15 minutes per IP globally, 10 per 15 minutes on register and login. `/health` and `/openapi.json` are not limited.

## Limitations

- No email verification and no password reset.
- Registration reveals whether an email already has an account (409 `Email is already registered`). Login does not, and both endpoints share the 10-per-15-minutes rate limit; hiding it fully would need email-based sign-up.
- No CSRF token. Protection relies on `SameSite=Lax` cookies plus JSON-only endpoints; add a token if the API is ever served cross-site.
- The rate limiter keeps counts in memory, per process. Several instances need a shared store. Behind a reverse proxy, set Express `trust proxy` correctly or every client shares the proxy's IP.
- `helmet()` runs with its defaults. The API only serves JSON, so its Content-Security-Policy does not protect the web app; set CSP on whatever serves `apps/web/dist`.
- Single session lifetime, no "remember me", no listing or revoking other sessions.
- `docker-compose.yml` passed `docker compose config` but was not started on the machine this was built on (no local Docker; local tests ran against PostgreSQL 16, CI runs PostgreSQL 17).
- Not deployed; there is no production configuration beyond `NODE_ENV=production`.

## Docs used

- Express 5 migration guide: https://expressjs.com/en/guide/migrating-5.html
- Drizzle ORM, PostgreSQL: https://orm.drizzle.team/docs/get-started/postgresql-new · schema: https://orm.drizzle.team/docs/sql-schema-declaration · migrations: https://orm.drizzle.team/docs/migrations
- zod 4: https://zod.dev/ · changelog: https://zod.dev/v4/changelog
- zod-to-openapi: https://github.com/asteasolutions/zod-to-openapi
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- node-argon2: https://github.com/ranisalt/node-argon2
- helmet: https://helmet.js.org/ · cors: https://github.com/expressjs/cors · express-rate-limit: https://express-rate-limit.mintlify.app/reference/configuration
- pino-http: https://github.com/pinojs/pino-http
- Vitest coverage: https://vitest.dev/guide/coverage · supertest: https://github.com/forwardemail/supertest
- pnpm workspaces: https://pnpm.io/workspaces · filtering: https://pnpm.io/filtering
- GitHub Actions Postgres service containers: https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers
- gitleaks: https://github.com/gitleaks/gitleaks

## License

MIT, see [LICENSE](LICENSE).
