# Render Deployment Migration Gate (Phase 2D)

This project keeps PostgreSQL schema migration as a deployment operation, not a request-serving startup operation.

## Deployment Order

1. Build
2. Pre-deploy migration gate (`npm run deploy:render-predeploy`)
   - runs `npm run db:migrate`
   - runs `npm run db:verify-schema`
3. Start (`npm start`)
4. Runtime startup schema guard in `createServerAsync`
5. Health checks

If migration or schema verification fails, deployment must fail closed and the new release must not start.

## Render Dashboard Configuration

Use dashboard-managed service settings unless your team explicitly adopts Blueprint ownership.

- Build Command: `npm ci`
- Pre-Deploy Command: `npm run deploy:render-predeploy`
- Start Command: `npm start`

## Required Environment

- `EAZINVOICE_STORAGE=postgres`
- `DATABASE_URL` (Render secret)
- `EAZINVOICE_REQUIRED_SCHEMA_MIGRATION` (optional override; defaults to repository required migration)

Do not store real credentials in Git, `.env.example`, or client-side code.

## Migration Concurrency Safety

`scripts/postgres-check.mjs --migrate` now acquires a PostgreSQL advisory lock before inspecting/applying migrations.

- Lock key is process-wide for migrations.
- If another migration runner holds the lock, migration exits non-zero and fails closed.
- Lock is released on explicit unlock and also automatically on process/session termination.

## Rollback Compatibility Policy

Automatic DOWN migrations are not used.

Schema changes should follow expand/migrate/contract:

1. Expand with backward-compatible additions.
2. Migrate application usage.
3. Contract only after older app versions are no longer rollback candidates.

When practical, keep database changes backward-compatible with the immediately previous deployed app version.

## Local Procedure

1. `npm run db:migrate`
2. `npm run db:verify-schema`
3. `npm start` (or `npm run dev`)

Runtime startup keeps the fail-closed schema compatibility guard and must not be weakened.
