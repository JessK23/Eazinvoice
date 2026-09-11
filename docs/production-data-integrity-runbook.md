# EazInvoice Production Data Integrity Runbook

## Source Of Truth

Production storage must be `EAZINVOICE_STORAGE=postgres`. JSON and memory stores remain valid for tests, local development, demos, and fixtures only. Production startup must fail if Postgres is not configured, unreachable, missing the required schema migration, or running without the production safety configuration.

As of P2-1C, production financial persistence uses one PostgreSQL transaction to write the compatibility state document, indexed records, normalized core rows, and normalized financial rows. The relational financial tables are the production authority for financially material records. The state document remains a compatibility snapshot and migration aid, not an independent financial source of truth.

Current persistence classes:

- Postgres-authoritative in production: normalized financial records, financial events, journals, journal lines, transactional source records, state document compatibility snapshot, and indexed records.
- JSON-authoritative in local development: `data/eazinvoice-data.json`.
- Memory-only: tests using `persist: false`.
- Compatibility-derived during transition: the state document is written in the same transaction as normalized tables. Divergence must be reported and must not be silently repaired by overwriting relational financial records.

## Required Production Checks

Before deployment:

- Run `npm run db:migrate`.
- Run `npm run db:verify-schema`.
- Run `npm run db:validate-p21c` against a disposable/staging PostgreSQL database before production promotion.
- Run `npm run build`.
- Run `npm test`.
- Run `npm run mobile:check`.
- Confirm `/readyz` returns `200` in the target environment.

Production environment requirements:

- `NODE_ENV=production`
- `EAZINVOICE_ENV=production`
- `EAZINVOICE_STORAGE=postgres`
- `DATABASE_URL` set outside Git
- `EAZINVOICE_POSTGRES_SSL_REQUIRED=true`
- strong `API_KEY_HASH_SECRET`
- strong `ADMIN_ACCESS_KEY`
- explicit `CORS_ALLOWED_ORIGINS` without localhost

## RLS Model

Application authorization remains mandatory. Postgres RLS is a second independent barrier.

Runtime tenant access must set transaction-local context:

- `app.business_id`
- optional `app.actor_user_id`

Service-only maintenance paths may set transaction-local `app.rls_bypass=true`. Do not use persistent session variables on pooled connections.

The runtime database role must not have `BYPASSRLS`. Prefer separate roles:

- migration role for schema changes
- runtime role for the app
- read-only support role for diagnostics

## Backup And Restore

Minimum production expectation:

- automated full Postgres backup at least daily
- encrypted off-host backup storage
- retention policy documented by hosting provider/project
- monthly restore drill into a clean database

Restore drill fixture should include a business, invoice/payment, vendor bill/vendor payment, credit note/vendor credit, refund/reversal, journals, bank reconciliation, compliance snapshot, accounting period, Balance Sheet, and year-end close.

After restore:

- run `npm run db:verify-schema`
- run `npm run db:validate-p21c` in staging/disposable restore drills where practical
- run Postgres state/report verification scripts
- confirm Trial Balance, Balance Sheet, reconciliation, and year-end close state match the source environment

## Failure Handling

Database unavailable:

- Treat production as read/write unavailable.
- Do not switch to JSON or memory.
- Restore database connectivity before financial writes resume.

Migration failure:

- Stop deployment.
- Do not mark failed migration as applied.
- Restore from pre-migration backup if the database is not recoverable through normal rollback.
- Re-run migration in a clean/staging database before retrying production.

Secret compromise:

- Revoke affected provider credentials.
- Rotate external credentials in the hosting environment.
- For `API_KEY_HASH_SECRET`, changing the value invalidates existing API key verification until a versioned hash-secret migration exists. Prefer revoking/reissuing API keys under a controlled customer notice.

Bad release:

- Stop traffic or roll back app version.
- Do not roll back the database unless a migration caused unrecoverable corruption and a tested restore plan exists.
- Preserve audit logs and incident notes.

## Email OTP dependency and recovery

### Architecture guardrail

EazInvoice production architecture is the Render-hosted EazInvoice application/API with PostgreSQL persistence.
Email OTP delivery is an external messaging dependency and must not be treated as the production database or source of truth.

### Inspection record — 2026-09-09

- Local checks and tests confirmed OTP request/verify code paths and fallback branching behavior in this checkout.
- `/readyz` and persistence checks validate application and PostgreSQL readiness, not mailbox delivery by themselves.
- Existing automated tests use mocked delivery behavior and local process state; they do not prove live delivery or live provider credentials.

### Provider selection and impact

`apps/api/src/server.js` uses configured OTP provider endpoints for request/verify, then falls back to app SMTP/local behavior when configured conditions are met.
These provider choices affect message delivery reliability, but they do not replace Render + PostgreSQL as production runtime and data authority.

### Safe delivery acceptance procedure

1. Confirm deployed Render service/environment identity, revision, and OTP-related environment variable presence (without exposing secrets).
2. Verify PostgreSQL production persistence remains authoritative and healthy (`/readyz`, migrations, and persistence checks).
3. Use an explicitly authorized controlled mailbox and account for one end-to-end OTP request and verification flow.
4. Verify production password-reset flow end-to-end (request OTP, verify OTP, set new password, login with new password).
5. Validate SMTP/fallback delivery behavior only in approved isolated conditions; do not break production credentials to induce fallback.
6. Record provider path used, redacted delivery outcome, timestamp, deployed revision, and pass/fail result.

### Known blockers found in this checkout

- **OTP disclosure:** local OTP responses can include `devOtp` in non-production fallback paths; production-facing behavior must keep OTP values out of client responses.
- Fallback OTP generation/verification currently relies on process-local state and should be hardened for multi-instance reliability.
- Timeout/error-hardening for upstream OTP provider calls should be explicitly validated under failure conditions.
- SMTP completeness checks verify field presence, not guaranteed provider deliverability.

Real production OTP delivery, password-reset proof, SMTP/fallback proof (where enabled), and deployed configuration identity remain external acceptance items.
## Deferred Risks

P2-1C closes the major state-document/normalized-table crash window by committing compatibility state and normalized financial records atomically. Remaining hardening should move more request paths to direct repository writes and reduce reliance on full-state replacement, especially before high-volume multi-instance production usage.
