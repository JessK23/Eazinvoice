# EazInvoice Postgres Transition

EazInvoice still uses JSON persistence by default. The Postgres layer is being added in safe steps so existing users, invoices, subscriptions, and payments are not lost during the transition.

## Current Safe Mode

- `EAZINVOICE_STORAGE=json` keeps JSON as the runtime source of truth.
- `DATABASE_URL` allows maintenance scripts to connect to Postgres.
- `npm run db:migrate` applies Postgres schema migrations.
- `npm run db:import-json` copies the current JSON state into Postgres and keeps a full legacy snapshot.
- `npm run db:verify-state` saves JSON into Postgres, reloads it, and compares the round-trip.
- `npm run db:sync-core` copies the current state into normalized Postgres tables for users, business profiles, customers, invoices, PO/WO records, payments, and subscriptions. It does not delete source application records; line-item mirror rows are refreshed to match their parent invoice or PO/WO.
- `npm run db:report-summary` verifies the read-only Postgres reporting layer before dashboard screens are wired to it.

## Optional Bridge Modes

- `EAZINVOICE_POSTGRES_DUAL_WRITE=true` keeps JSON as the runtime source while also writing saved state to Postgres in the background.
- `EAZINVOICE_CORE_TABLE_SYNC=true` keeps normalized reporting tables updated after runtime saves. Use it only after migrations and `npm run db:sync-core` / `npm run db:verify-core` pass.
- `EAZINVOICE_REPORTS_SOURCE=postgres` lets dashboard report cards and charts use `/reports/summary`. Keep this as `json` until `EAZINVOICE_CORE_TABLE_SYNC=true` is smoke-tested locally.
- `EAZINVOICE_ENTITLEMENTS_SOURCE=postgres` lets `/me`, `/plan/free`, `/plans`, and `/subscriptions/me` read plan/subscription display data from normalized Postgres tables. Keep this as `json` until `npm run db:verify-entitlements` passes against the target database.
- `EAZINVOICE_STORAGE=postgres` starts the API from Postgres state. Use this only after `npm run db:verify-state` passes and after local testing confirms login, invoices, subscriptions, and reports.

## Cutover Rule

Do not enable Postgres as production runtime until:

1. Existing production JSON data has been imported.
2. `npm run db:verify-state` passes against the target database.
3. Admin persistence status shows Postgres reachable and record counts match the expected live data.
4. Login/signup, invoice draft/create, PO/WO draft/create, payments, subscriptions, AI assistant, WordPress API keys, and admin reports have been smoke-tested.

## Core Table Sync Rule

The normalized core tables are for hardening, reporting, and future module work. Until the app is explicitly switched, JSON/state-document storage remains the runtime source. If a sync row looks stale, refresh it with `npm run db:verify-state` and then `npm run db:sync-core`; do not manually delete production records to make counts match. The sync process may refresh child line-item mirror rows for a parent document, but the complete source document remains preserved in the parent `record` column and in the original runtime state.

## Reporting Layer Rule

`/reports/summary` reads from normalized Postgres tables only. It is safe to test alongside the current dashboard because it does not write to storage or replace the existing report flow.

Do not switch dashboard cards to `/reports/summary` until `EAZINVOICE_CORE_TABLE_SYNC=true` has been enabled and smoke-tested for invoice, payment, customer, business profile, and PO/WO writes. Until then, keep `EAZINVOICE_REPORTS_SOURCE=json` and run `npm run db:sync-core` before using the endpoint for verification.

Local opt-in smoke test:

1. Set `EAZINVOICE_CORE_TABLE_SYNC=true`.
2. Set `EAZINVOICE_REPORTS_SOURCE=postgres`.
3. Start the API locally.
4. Create or update one invoice/payment/customer/PO.
5. Run `npm run db:verify-core` and check the dashboard report cards.
6. Switch the flags back to `false` / `json` if anything does not match.

## Entitlement Read Layer Rule

`/me`, `/plan/free`, `/plans`, and `/subscriptions/me` can read plan/subscription display data from normalized Postgres tables when `EAZINVOICE_ENTITLEMENTS_SOURCE=postgres` is enabled. This is a read-only bridge: subscription creation, Razorpay activation, and feature gates still use the current runtime store until those write paths are migrated one by one.

Do not enable this in production until `npm run db:verify-entitlements` confirms the normalized subscription rows match the current runtime state. If verification fails, run `npm run db:sync-core` first; do not delete users or subscriptions manually to make counts match.
