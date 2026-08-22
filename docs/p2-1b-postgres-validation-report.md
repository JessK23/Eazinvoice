# P2-1B Real PostgreSQL, RLS & Recovery Validation

Date: 2026-08-15

## Environment

- Validation target: disposable local PostgreSQL cluster under `.tmp/pg-p21b-data`
- Host/port: `localhost:55432`
- Source database: `eazinvoice_p21b_test`
- Restore database: `eazinvoice_p21b_restore`
- PostgreSQL version: 17.11
- Tools verified: `psql`, `pg_dump`, `pg_restore`
- Existing local Windows PostgreSQL service was not used because the `.env` password for `localhost:5432` was not valid on this computer.

No remote Supabase/project database was mutated.

## Commands

- `npm run db:validate-p21b` against `postgres://postgres@localhost:55432/postgres`
- `npm run db:verify-schema` against `postgres://postgres@localhost:55432/eazinvoice_p21b_test`
- `npm run build`
- `npm test`
- `npm run mobile:check`

## Results

- Clean migration from `001` through `022`: PASS
- Canonical migration tracking for every migration file: PASS
- Required schema marker `022_production_data_integrity_rls`: PASS
- Schema inventory: 54 `eazinvoice_*` tables
- RLS enabled and forced on tenant-owned canonical tables: PASS
- Runtime role `eazinvoice_p21b_runtime`: not superuser, no `BYPASSRLS`, no createdb, no createrole
- Business A/B RLS read isolation: PASS
- Cross-tenant write rejection: PASS
- Transaction-local tenant context leak check: PASS
- Production startup with Postgres authoritative storage and SSL-enabled disposable DB: PASS
- Production JSON storage fallback rejection: PASS
- `/readyz` healthy response against compatible Postgres: PASS
- Backup with `pg_dump`: PASS
- Restore with `pg_restore` into separate database: PASS
- Restored financial summary matched source: PASS
- Baseline tests: `141/141` PASS

## Fixes Made During Validation

- Added missing `eazinvoice_vendors` and `eazinvoice_reports` schema needed by clean migration `012`.
- Corrected migration `020` to index the actual journal table, `eazinvoice_journal_entries`.
- Added missing migration markers for `006_business_audit_events`, `007`, and `016` through `021`.
- Normalized `014` and `015` to record in `eazinvoice_migrations` instead of `eazinvoice_schema_migrations`.
- Added `scripts/postgres-p21b-validate.mjs` and `npm run db:validate-p21b`.

## Remaining Production Caveat

P2-1B proves that the PostgreSQL deployment foundation, RLS barrier, startup guard, schema verification, and backup/restore path work against a real database.

It does not convert all financial workflows to fully normalized per-operation PostgreSQL writes. The current production path still includes state-document persistence with derived normalized tables, as noted in the production data-integrity runbook. Before customer production rollout, the next hardening work should prove or replace that persistence path for high-risk operations such as invoice issue, payment capture, vendor bill posting, refunds, opening balances, and year-end close.
