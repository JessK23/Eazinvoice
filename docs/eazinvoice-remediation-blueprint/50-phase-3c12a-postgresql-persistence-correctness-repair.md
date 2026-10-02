# PHASE 3C.12A POSTGRESQL PERSISTENCE CORRECTNESS REPAIR

## Baseline

- Branch: `main`
- `HEAD`: `4883ccc59ced135928207a11b993d4c16feb9f5d`
- `origin/main`: `4883ccc59ced135928207a11b993d4c16feb9f5d`
- Existing PAY-BASE-02 and PAY-BASE-03 work was preserved.
- No staging, commit, push, reset, cleanup, Android, Web UI, Mobile, Eazy, Payment Request, or settlement work was performed.

## Acceptance Defect

The combined acceptance gate found that PostgreSQL CAS could reject a stale ordinary writer, but `persist()` did not await the asynchronous adapter save. The mutation could therefore return apparent success before the CAS failure surfaced.

## Persistence Call Graph

`Payment lifecycle mutation → store.persistAndReturn() → persistenceAdapter.save() → PostgreSQL expected-version/CAS → primary state transaction → indexed/normalized synchronization → caller success or rejection`.

The PostgreSQL adapter now also exposes `reload()`. On persistence failure, the store reloads the authoritative state before propagating the error.

## Async Mutation Changes

`persist()` now returns a tracked Promise when the adapter is asynchronous. Payment recording and Payment reversal writers use `persistAndReturn()`, so PostgreSQL-backed calls complete only after persistence succeeds. In-memory adapters continue returning synchronously.

The corresponding invoice-payment, vendor-payment, customer-reversal, vendor-reversal, and gateway payment server paths now await their existing API operations.

## CAS Failure Propagation

Expected-version failure remains explicit. The caller receives the PostgreSQL stale-state error, the response is not reported as successful, and the local store reloads the latest authoritative snapshot before the failure is returned.

## Local State Recovery

On asynchronous persistence rejection, the store invokes the existing adapter's authoritative reload path and replaces its local state. This prevents a failed local mutation from remaining in the process as apparent committed authority.

## Allocation Transaction Preservation

PAY-BASE-03 allocation creation and reversal continue using the PostgreSQL transaction, advisory authority lock, primary-state `FOR UPDATE`, authoritative reload, validation, counter update, atomic persistence, and commit/rollback path. They do not route through ordinary fire-and-forget persistence.

## Ordinary Writer Race

The new behavioral test proves that a simulated CAS rejection is awaited, propagated, and followed by local-state restoration. The stale writer does not leave a Payment or counter in local state.

## Allocation vs Ordinary Writer Race

The PostgreSQL allocation path remains protected by the PAY-BASE-03 transaction boundary. A stale ordinary Payment lifecycle writer now awaits the CAS result and cannot report success after rejection. Live two-connection execution remains environmental/unverified.

## Payment Reversal Interaction

Current limitation intentionally preserved: a Payment may be fully reversed while active allocation metadata remains. Available allocation becomes zero, no new allocation can be created, legacy document balances remain driven by existing Payment semantics, and no duplicate accounting event is created. Stronger allocation-release linkage remains future settlement work.

## Accounting Boundary

Unchanged. No allocation journals, ledger entries, AR/AP postings, tax postings, or accounting events were introduced.

## Banking Boundary

Unchanged. No statement lines, bank transactions, reconciliation matches, unmatches, or settlement records were introduced.

## Files Changed

```text
apps/api/src/store.js
apps/api/src/postgres-persistence-adapter.js
apps/api/src/server.js
tests/payment-allocation.test.js
tests/persistence-awaiting.test.js
docs/eazinvoice-remediation-blueprint/47-phase-3c11-payment-allocation-completion-report.md
docs/eazinvoice-remediation-blueprint/49-phase-3c12-payment-allocation-transaction-boundary-completion-report.md
docs/eazinvoice-remediation-blueprint/50-phase-3c12a-postgresql-persistence-correctness-repair.md
```

`apps/api/src/index.js`, `apps/api/src/client.js`, `apps/api/src/postgres-state.js`, Report 48, Report 46, Android, and unrelated artifacts were preserved from the prior candidate state.

## Tests Added/Changed

- Added persistence/CAS failure propagation and local-state recovery test.
- Added Payment reversal with active allocation limitation test.
- Existing Payment Allocation, lineage, idempotency, persistence-registration, reversal, tenant, and direction tests remain passing.

## Validation Results

- Focused persistence/allocation/AUTH suite: **20 passed, 0 failed, 1 skipped**.
- `npm run build`: **PASS**.
- `npm run lint`: **PASS**.
- `npm run mobile:check`: **PASS — 8/8**.
- `npm run db:verify-reports`: **PASS**.
- `git diff --check`: **PASS**, with normal line-ending warnings only.
- Serial full suite from the unchanged candidate: **347 passed, 1 environmental failure, 1 skipped**.
- Default `npm test`: **environmental Windows `spawn EPERM` failure**.

## Environmental Limitations

- `psql.exe` is unavailable, so `npm run db:verify-schema` cannot execute.
- No isolated reachable PostgreSQL environment was available for live multi-connection allocation/stale-writer testing.
- The live PostgreSQL concurrency result remains **UNVERIFIED — ENVIRONMENTAL**.

## Remaining Runtime Verification

The next combined final acceptance gate must verify all ordinary PostgreSQL mutation routes that can call `persist()`, plus live allocation-vs-ordinary-writer and ordinary-writer-vs-ordinary-writer scenarios where PostgreSQL infrastructure is available.

## Proposed Commit Boundary

After final acceptance, commit the combined PAY-BASE-02, PAY-BASE-03, and 3C.12A candidate files only. Do not include `android/app/build.gradle` or unrelated untracked artifacts.

## Final Verdict

**PHASE 3C.12A — VERIFIED WITH LIVE POSTGRESQL OUTSTANDING — READY FOR COMBINED FINAL ACCEPTANCE**
