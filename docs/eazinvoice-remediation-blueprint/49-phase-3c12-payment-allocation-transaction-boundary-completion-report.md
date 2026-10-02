# EazInvoice — Phase 3C.12 PAY-BASE-03 Completion Report

## PHASE

`3C.12 — PAY-BASE-03 PostgreSQL Payment Allocation Transaction Boundary`

## BASELINE

- Branch: `main`
- `HEAD`: `4883ccc59ced135928207a11b993d4c16feb9f5d`
- `origin/main`: `4883ccc59ced135928207a11b993d4c16feb9f5d`
- Existing uncommitted PAY-BASE-02 changes were preserved.
- Report 48 was read and left unchanged.
- Android, Reports 45–47, and unrelated untracked artifacts were preserved.
- No files were staged, committed, pushed, reset, restored, stashed, or cleaned.

## REPORT 48 DECISION CONSUMED

PAY-BASE-03 implements the Report 48 selection: a PostgreSQL transaction-scoped mutation boundary over the existing AUTH-01 primary state document, rather than a Payment-only lock, second allocation authority, Redis lock, filesystem lock, or process-local mutex.

## AUTH-01 TRANSACTION PRIMITIVE

`apps/api/src/postgres-state.js` now provides a client-scoped authoritative mutation path. It uses the existing PostgreSQL pool and `withPostgresTransaction()`, loads the current state inside the transaction, invokes a deterministic mutation callback, persists the resulting primary state, rebuilds indexed records, performs the existing normalized synchronization, and commits through the same client. Any error rolls back the transaction.

`apps/api/src/postgres-persistence-adapter.js` exposes this as `mutateState()` and tracks the committed state-document version. PostgreSQL-mode allocation creation and reversal in `apps/api/src/store.js` use a temporary non-persisting store over the transaction's current state, then refresh the current process's state after commit.

## LOCK / CAS STRATEGY

The primary state row is protected with a transaction-scoped advisory lock keyed to the AUTH-01 state key, followed by `SELECT ... FOR UPDATE` on `eazinvoice_state_documents(state_key = 'primary')`. The advisory step also closes the first-row initialization race.

Normal PostgreSQL snapshot saves carry the adapter's expected state version. A stale writer fails with `Postgres authoritative state changed before this write could commit.` rather than overwriting a newer allocation. 3C.12A additionally makes Payment lifecycle writers await that result and restore local state on failure; the combined final acceptance must verify the remaining ordinary mutation routes.

## AUTHORITATIVE STATE RELOAD

The transaction reloads `eazinvoice_state_documents.state` and `version` after acquiring the authoritative mutation protection. If the state document is absent, the existing indexed-record reconstruction path is used while the advisory lock prevents competing initialization.

## PAYMENT AVAILABILITY REVALIDATION

The allocation callback resolves Payment, reversals, active allocations, currency, status, and available amount from the freshly loaded transaction state. It does not rely on the API process's pre-existing snapshot for the authoritative decision.

## DOCUMENT OUTSTANDING REVALIDATION

The callback resolves the target Invoice or Vendor Bill and recomputes its outstanding allowance from the freshly loaded state. Different Payments competing for one document are serialized by the same primary state boundary. Legacy balance compatibility remains unchanged; allocations are not promoted to the current Invoice/Vendor Bill balance authority.

## DIRECT PAYMENT LINEAGE

Preserved:

- Invoice-bound Payment → original Invoice only.
- Vendor-Bill-bound Payment → original Vendor Bill only.

No unbound/general Payment model was introduced.

## IDEMPOTENCY INSIDE TRANSACTION

The existing payload-aware idempotency check now runs against the transaction-reloaded state. Identical concurrent requests serialize so the second request replays the committed allocation. Same-key changed-payload requests conflict. No process-local idempotency state is authoritative.

## COUNTER SAFETY

Allocation counter advancement remains part of the primary state mutation. Allocation IDs and `paymentAllocation` counter state commit or roll back together. The existing `paymentAllocations` collection and `palloc` counter registration remain intact.

## PRIMARY STATE ATOMICITY

Primary state document update, indexed-record replacement, normalized synchronization, divergence checking, and audit event are executed on the same PostgreSQL client transaction. A failure after the state-document update rolls back the entire transaction.

## INDEX / PROJECTION CONSISTENCY

The generic `eazinvoice_records` index and existing normalized synchronization are invoked within the same transaction as the primary state document. They remain projections/reconstruction support, not a second allocation authority.

## STALE WRITER PROTECTION

The PostgreSQL adapter stores the loaded state-document version. Its normal `save()` path locks the authority and checks that expected version before writing. An allocation mutation updates the adapter's current version after commit. A stale process therefore cannot commit an older full snapshot over a newer allocation. 3C.12A surfaces the rejection for Payment lifecycle writers instead of allowing apparent success.

## MULTI-PROCESS GUARANTEE

The architecture now has a production-safe PostgreSQL serialization boundary for the primary state mutation: separate API instances contend on PostgreSQL transaction ownership, reload committed state, validate against it, and cannot overwrite a newer version through the adapter's CAS check.

Live two-connection execution was not available in this environment, so the runtime multi-process guarantee is structurally implemented but not live-verified here.

## ROLLBACK

The existing `BEGIN`/`ROLLBACK` helper is retained. Validation failure, idempotency conflict, direct-lineage failure, insufficient Payment/document availability, injected persistence failure, and normalized-sync divergence all occur before commit and leave no allocation, counter advance, Payment mutation, document mutation, journal, or Banking match.

## IN-MEMORY STATE AFTER COMMIT

After a successful PostgreSQL authoritative mutation, the current store replaces its local state with the committed transaction result and the adapter records the new state version. Non-PostgreSQL stores retain their existing synchronous fixture behavior and are not represented as cross-process safety.

## ACCOUNTING AUTHORITY CHANGED:

NO. Allocation remains non-accounting metadata/application state.

## BANKING AUTHORITY CHANGED:

NO. No statement, bank transaction, match, unmatch, or auto-reconciliation behavior changed.

## PAYMENT REQUEST IMPLEMENTED:

NO.

## UNBOUND PAYMENT IMPLEMENTED:

NO.

## GATEWAY SETTLEMENT IMPLEMENTED:

NO.

## EXPENSE / QUOTATION:

NO.

## MOBILE / EAZY / ANDROID:

UNCHANGED.

## FILES CHANGED

```text
apps/api/src/postgres-state.js
apps/api/src/postgres-persistence-adapter.js
apps/api/src/store.js
apps/api/src/server.js
tests/payment-allocation-postgres-concurrency.test.js
docs/eazinvoice-remediation-blueprint/47-phase-3c11-payment-allocation-completion-report.md
docs/eazinvoice-remediation-blueprint/49-phase-3c12-payment-allocation-transaction-boundary-completion-report.md
```

`apps/api/src/index.js` and `apps/api/src/client.js` were preserved without PAY-BASE-03 changes. Report 48 was not modified.

## TEST RESULTS

- Focused PAY-BASE-02/PAY-BASE-03 suite: **10 passed, 0 failed, 1 skipped**.
- Serial full suite: **347 passed, 1 failed, 1 skipped** across 349 tests.
- The single failure is the pre-existing PostgreSQL document-registry test blocked by `db.example.com` DNS resolution.
- `npm run build`: **PASS**.
- `npm run lint`: **PASS**.
- `npm run mobile:check`: **PASS — 8/8**.
- `npm run db:verify-reports`: **PASS**.
- `git diff --check`: **PASS**, with normal line-ending warnings only.

## POSTGRESQL INTEGRATION RESULT

The live multi-process/concurrent PostgreSQL suite is **UNVERIFIED — ENVIRONMENTAL**. The repository has no isolated reachable PostgreSQL integration environment available for this run; the focused integration test is explicitly skipped unless `EAZINVOICE_POSTGRES_CONCURRENCY_INTEGRATION=true` is set against an isolated database. No multi-process PASS is claimed.

## ENVIRONMENTAL LIMITATIONS

- `npm test` remains unavailable under the Windows Node parallel-worker environment because every worker hits `spawn EPERM`.
- `npm run db:verify-schema` is unavailable because `psql.exe` is not installed.
- Live PostgreSQL concurrency and stale-writer execution could not be run because the configured external test host resolves as `db.example.com` and is unavailable.

## REMAINING PAYMENT WORK

Payment Request, Bound Payment links/QR, Pay Now, generic/unbound Payment, Razorpay/UPI, Gateway Settlement, allocation-aware document balances, Expense, Quotation, Mobile, and Eazy remain intentionally unimplemented.

## PROPOSED COMMIT BOUNDARY

After independent final acceptance, the combined safe foundation may commit only the PAY-BASE-02 and PAY-BASE-03 files listed above plus the existing PAY-BASE-02 boundary files. The unrelated Android modification and unrelated artifacts must remain outside that commit.

## STAGING / COMMIT / PUSH:

NONE.

## FINAL VERDICT

**PHASE 3C.12 — VERIFIED WITH RUNTIME ITEMS OUTSTANDING**

The AUTH-01 PostgreSQL transaction boundary and stale-writer protection are implemented without changing Payment, Accounting, Banking, or future commercial payment domains. Independent final acceptance is still required before committing the combined PAY-BASE-02/PAY-BASE-03 foundation, and live PostgreSQL concurrency remains environmental/unverified.
