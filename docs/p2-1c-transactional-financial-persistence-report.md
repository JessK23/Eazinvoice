# P2-1C PostgreSQL Transactional Financial Persistence Report

Date: 2026-08-15

## Decision

P2-1C makes PostgreSQL schema `023_transactional_financial_persistence` the required production schema. Production must run with `EAZINVOICE_STORAGE=postgres`; JSON and memory remain development/test modes only.

## Architecture Before

The application mutated domain state, saved a PostgreSQL state document, and then scheduled normalized relational table sync separately. A crash between those steps could leave the state document and relational tables divergent.

## Architecture After

Production Postgres save now commits these together in one transaction:

1. state document compatibility snapshot
2. indexed records
3. normalized core rows
4. normalized financial rows
5. divergence check
6. audit event

If any step fails, PostgreSQL rolls the transaction back.

## Normalized Authority

The relational financial tables are the production authority for invoices, payments, vendor bills, financial events, journals, journal lines, corrections, settlements, bank reconciliation records, compliance snapshots, accounting periods, opening balances, and year-end records. The state document remains a compatibility snapshot during the transition.

## Validation

- `npm run db:validate-p21c`: PASS
- Required migration: `023_transactional_financial_persistence`
- Atomic save rollback after injected failure: PASS
- State-vs-normalized count parity: PASS
- Duplicate invoice number constraint: PASS
- Duplicate payment idempotency constraint: PASS
- Journal debit/credit check constraint: PASS
- P2-1B base migration/RLS/backup/restore validator reused: PASS

## Remaining Risk

P2-1C removes the immediate production crash window between state-document persistence and normalized financial table sync. A later hardening pass should still migrate high-volume request paths from full-state replacement to direct, per-workflow repository writes with row-level locks.
