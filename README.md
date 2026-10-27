# Transaction Ledger API

A small ledger backend: create accounts, post credit/debit transactions, read balances and history, and (bonus) transfer money between accounts atomically.

**Stack:** Node.js 20 · NestJS 10 · TypeScript · PostgreSQL 16 · TypeORM · class-validator / class-transformer · Swagger (OpenAPI)

## Quick start

Requirements: Node 18+ (developed on 20), npm, and Docker (or your own PostgreSQL 13+).

```bash
cp .env.example .env          # no secrets inside; defaults match docker-compose
docker compose up -d          # PostgreSQL on localhost:${DB_PORT} (default 5433)
npm install
npm run start:dev             # http://localhost:3000  (migrations run automatically on boot)
```

- Swagger UI / API docs: **http://localhost:3000/docs** (raw spec: `/docs-json`)
- Run the tests: `npm test` (uses a separate `ledger_test` database, created automatically)
- Production build: `npm run build && npm run start:prod`

**Port 5433 already in use?** Set `DB_PORT` in `.env` (e.g. `DB_PORT=5434`) *before* `docker compose up -d`. Docker Compose publishes the database on that host port and the app and tests connect to the same port, so one variable controls both.

### Without Docker
Create a database and user in your local PostgreSQL, then set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (and `TEST_DB_NAME` for tests) in `.env`. The user needs permission to create databases for the tests. Migrations run on application start; you can also run them manually with `npm run migration:run`.

## API overview

All bodies and responses are JSON with snake_case fields. Full schemas and examples: Swagger at `/docs`.

| Method | Path | Purpose | Success | Error statuses |
|---|---|---|---|---|
| POST | `/accounts` | Create account `{name}` | 201 | 400 |
| GET | `/accounts/:id/balance` | `{account_id, balance}` | 200 | 400, 404 |
| POST | `/accounts/:id/transactions` | Add transaction `{type, amount, reference_id, description?}` | 201 | 400, 404, 409, 422 |
| GET | `/accounts/:id/transactions?type=&page=&limit=` | History, latest first | 200 | 400, 404 |
| POST | `/transfers` | Bonus: `{from_account_id, to_account_id, amount, reference_id, description?}` | 201 | 400, 404, 409, 422 |

There are deliberately **no** update/delete endpoints for transactions or accounts.

### Example

```bash
curl -s -X POST localhost:3000/accounts -H 'content-type: application/json' -d '{"name":"Alice"}'
# -> {"id":"<uuid>","name":"Alice","balance":"0.00","created_at":"..."}

curl -s -X POST localhost:3000/accounts/<uuid>/transactions -H 'content-type: application/json' \
  -d '{"type":"credit","amount":100,"reference_id":"order-1","description":"top up"}'

curl -s "localhost:3000/accounts/<uuid>/transactions?type=credit&page=1&limit=10"
# -> {"data":[...],"meta":{"current_page":1,"page_size":10,"total_records":1,"total_pages":1}}
```

### Error format (every error)

```json
{
  "statusCode": 422,
  "error": "INSUFFICIENT_BALANCE",
  "message": "Insufficient balance for this debit",
  "details": { "account_id": "...", "requested_amount": "150" },
  "path": "/accounts/.../transactions",
  "timestamp": "2026-10-27T17:20:50.610Z"
}
```

| Status | `error` code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad/missing fields, unknown fields (e.g. `balance` on account creation), bad `type`, `page`, `limit`. `details` lists `{field, messages[]}` |
| 400 | `INVALID_ACCOUNT_ID` | Account id is not a UUID |
| 400 | `INVALID_REQUEST_BODY` | Malformed JSON body |
| 400 | `SAME_ACCOUNT_TRANSFER` | Transfer source equals destination |
| 404 | `ACCOUNT_NOT_FOUND` | Well-formed id that does not exist |
| 409 | `DUPLICATE_TRANSACTION` | `reference_id` already used on that account; `details.transaction` holds the original. Nothing is created or changed |
| 422 | `INSUFFICIENT_BALANCE` | Debit/transfer larger than the balance. Nothing is created or changed |

## How integrity is guaranteed

- **Atomicity:** adding a transaction runs in one DB transaction: lock account row → check duplicate → update balance → insert ledger row. Any error rolls back both.
- **Concurrency:** `SELECT ... FOR UPDATE` serializes writers per account, so parallel debits cannot overdraw and parallel duplicates yield one 201 and the rest 409. Debits also use a conditional `UPDATE ... WHERE balance >= amount`.
- **Database constraints (migration `InitSchema`):**
  - `UNIQUE (account_id, reference_id)`
  - `CHECK (balance >= 0)`, `CHECK (amount > 0)`, `CHECK (type IN ('credit','debit'))`, non-blank name and reference
  - FK `transactions.account_id → accounts.id`
  - A trigger rejects any `UPDATE`/`DELETE` on `transactions`, so immutability holds even for direct SQL.
- **Money:** `NUMERIC(19,2)`. Amounts stay strings in the app, and balance arithmetic is done in SQL, so there is no floating-point drift.
- **Transfers:** debit and credit legs are written in a single DB transaction. Both account rows are locked in id order, so opposite-direction transfers cannot deadlock. A failure at any point rolls back both legs.

## Project structure

```
src/
  main.ts, app.module.ts, app.setup.ts      bootstrap, wiring, shared pipes/filters
  config/                                   DB options from env
  database/                                 TypeORM data source + migrations
  common/                                   error filter + domain exceptions, pagination, money validator
  accounts/                                 entity, DTOs, service, controller
  transactions/                             entity, DTOs, service (atomic ledger core), controller
  transfers/                                bonus: atomic transfer
test/                                       e2e suites against a real PostgreSQL
```

## Tests

`npm test` runs 80+ e2e tests against a real PostgreSQL (`ledger_test`): accounts, validation, credit/debit math, insufficient balance, duplicate references (incl. concurrent), pagination/filter/sort, atomicity (forced failure mid-operation), concurrent debits, immutability (API and DB level), DB constraints, and transfers (rollback, deadlock-freedom, overdraw races).

## Assumptions

1. **Account id in the URL.** `account_id` for a transaction comes from the path (`/accounts/:id/transactions`), not the body.
2. **No authentication/authorization**, single currency, and no account update/delete endpoints. The brief didn't ask for them.
3. **Money format:** requests accept a JSON number or numeric string, greater than 0, with at most 2 decimals. Responses return decimal **strings** (`"100.00"`) to avoid float rounding.
4. **Balances can never be negative** (no overdraft).
5. **Duplicate = same `reference_id` on the same account**, regardless of type/amount: it returns 409 with the original transaction. A *rejected* debit (422) does not consume its `reference_id`.
6. **Status codes:** insufficient balance is 422 and duplicate is 409, so clients can tell them apart. Malformed UUID is 400 and an unknown account is 404.
7. **Strict input:** unknown body fields are rejected (400), notably a client-supplied `balance`. Names and `reference_id` are trimmed. `type` is lowercase only.
8. **`description` is optional** (max 500 chars). `reference_id` max 100 chars. Name max 255. Amount max 17 integer digits.
9. **Pagination:** `page` defaults to 1 and `limit` to 20 (max 100). A page beyond the last returns 200 with empty `data`. Ordering is `created_at DESC, id DESC`. `created_at` uses `clock_timestamp()`, and writes per account are serialized by the row lock, so order is stable.
10. **Transfers** use the same `reference_id` on both legs (allowed because uniqueness is per account). Reusing it on either account returns 409 and nothing moves. Both legs share a `transfer_id` visible in history.
11. The brief's numbering skips section 6; "Atomicity" was treated as part of section 5 (Data Integrity).
12. Schema is managed by migrations only (`synchronize` is off) and applied automatically on boot.
