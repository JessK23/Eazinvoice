# Phase 3C.57A â€” ACCT-PROVIDER-FEE-01A Lifecycle Correction

**Baseline:** `c4f12ea43af438deebdf0ef429000383d1786277`
**Scope:** Inactive/deleted provider-fee authority lifecycle only.

## Root cause

The original resolver excluded only deleted records and could return an inactive `5300` as canonical. Shared bootstrap could also recreate around a deleted provider-fee role on another code.

## Correction

The resolver now requires explicit active status. Inactive and deleted provider-fee candidates return deterministic manual-review reasons:

- `provider_fee_account_inactive`
- `provider_fee_account_deleted`

Bootstrap does not create or resurrect a provider-fee authority when a historical inactive/deleted candidate exists. The lifecycle evidence, account ID, timestamps, and historical journals remain unchanged. Provider-fee bootstrap also no longer returns inactive/deleted accounts as usable accounting defaults.

## Preserved architecture

`5300 Payment Provider Fees`, role `provider_fee_expense`, Expense type, debit normal balance, provider neutrality, Migration 025/chart fingerprint behavior, tenant isolation, settlement inertness, PAY-ATOMIC, GST separation, refunds, reversals, and the resolver boundary are unchanged.

## Tests

Added executable coverage for active resolution, inactive/deleted fail-closed behavior, no replacement account, restart/reconstruction blocking, duplicate/incompatible candidates, tenant isolation, and unchanged journal state.

## Verification limitations

Live PostgreSQL execution and multi-process lifecycle verification remain outstanding. No settlement journals, `1110` movement, bank posting, GST, TDS, Banking reconciliation, or payment-model changes were made.

## Files changed

- `apps/api/src/accounting-service.js`
- `apps/api/src/store.js`
- `tests/provider-fee-accounting-authority.test.js`
- this report

Report 117 and Report 118 remain unchanged.

**Verdict:** **PHASE 3C.57A â€” CORRECTION IMPLEMENTED â€” READY FOR COMBINED FINAL ACCEPTANCE**
