# PHASE 3C.47 â€” PAY-SETTLE-01A
## Canonical Provider Settlement / Payout Identity and Persistence â€” Completion Report

**Baseline:** `915d744e2763bc44a132d142499ac9ebe7d4ed2f`
**Scope:** provider settlement identity and persistence only
**Accounting journals / PAY-ATOMIC / Banking reconciliation:** unchanged

## Verdict

**PHASE 3C.47 â€” IMPLEMENTATION COMPLETE â€” READY FOR INDEPENDENT FINAL ACCEPTANCE**

## Implemented

- Added persisted `providerSettlements` state and PostgreSQL collection/counter/prefix support.
- Added canonical provider/business/company/merchant settlement identity using an external provider settlement/payout ID.
- Added immutable evidence for gross amount, fee amount, fee-tax/GST amount, adjustment, net amount, currency, settlement date, provider timestamp, destination account reference, and Payment linkage.
- Enforced `net = gross - fee - feeTax + adjustment`.
- Enforced business, provider, currency, captured-status, and external Payment identity compatibility for linked Payments.
- Prevented linking more than the captured Payment amount across settlement records.
- Added idempotent replay for the same immutable settlement identity and conflict rejection for changed evidence.
- Enforced destination references to active business bank/cash accounts when supplied; clearing account `1110` is not accepted as an actual bank destination.
- Added API accessors for create/get/list settlement records with tenant authorization.
- Added a system-authorized creation path for future provider settlement ingestion; it does not post accounting.
- Marked every new settlement `accountingStatus: not_posted`; no journal or ledger mutation is performed.

## Tests added

- canonical settlement identity, amount integrity, replay, conflict rejection, and accounting neutrality;
- cross-business and over-link protection;
- PostgreSQL collection and counter normalization.

Adjacent regression run: **40 passed, 0 failed**, covering settlement, PAY-ATOMIC, Customer Advance, provider identity, and provider recovery.

## Explicit non-scope

This package does not implement settlement journals, `1110 â†’ bank` clearing, gateway-fee/GST posting, chargebacks, payout adjustments, or Banking reconciliation. Those remain separate acceptance-tested packages.

## Candidate files

- `apps/api/src/store.js`
- `apps/api/src/postgres-state.js`
- `apps/api/src/index.js`
- `tests/provider-settlement.test.js`
- this completion report

Nothing is staged, committed, or pushed.
