# EazInvoice — Phase 3C.11 PAY-BASE-02 Surgical Correction Report

## BASELINE

- Repository: `C:\Users\Jess\Documents\eazinvoice`
- Branch: `main`
- `HEAD`: `4883ccc59ced135928207a11b993d4c16feb9f5d`
- `origin/main`: `4883ccc59ced135928207a11b993d4c16feb9f5d`
- The unrelated `android/app/build.gradle` modification was preserved.
- Report 46 was read as architectural evidence and was not modified.
- No files were staged, committed, pushed, reset, restored, stashed, or cleaned.

## CORRECTION SCOPE

This surgical correction addressed only the four acceptance findings for PAY-BASE-02:

- direct Payment lineage safety;
- payload-aware allocation idempotency;
- complete registration of allocation state in the existing PostgreSQL state/counter conventions;
- assessment of cross-process allocation concurrency.

Payment redesign, unbound/general Payments, Payment Request, Razorpay, UPI, Settlement, Expense, Quotation, Web, Mobile, and Eazy work were excluded.

## PAYMENT MODEL

The shared `state.payments` collection remains authoritative. Invoice Payments retain `invoiceId`; Vendor Bill Payments retain `vendorBillId` and `vendorId`. Existing partial/multiple payments, accounting lineage, reversals, refunds, and legacy balance calculations remain unchanged.

`state.paymentAllocations` records the explicit relationship:

`Payment → allocated amount → Invoice or Vendor Bill`

Allocations remain separate from Payments and do not become a second balance authority in this correction.

## CORRECTION A — DIRECT PAYMENT LINEAGE

Implemented and tested.

- An Invoice-bound Payment can allocate only to its original Invoice.
- A Vendor-Bill-bound Payment can allocate only to its original Vendor Bill.
- A bound Payment cannot be used to give another commercial document a second financial meaning.
- Direction and business-scope validation remain enforced.

A future explicit `unbound/general` Payment type is **not implemented** here.

## CORRECTION B — IDEMPOTENCY

Implemented and tested.

An existing allocation idempotency key is replayable only when the request matches the original Payment, document type, document ID, amount, and normalized currency. Reuse of the same key with a different payload is rejected rather than silently returning the first allocation.

## CORRECTION C — PERSISTENCE REGISTRATION

Implemented and tested.

`paymentAllocations` now participates in the existing PostgreSQL state collection list, normalized snapshot handling, fallback reconstruction/indexing path, allocation counter derivation, and `palloc` ID prefix convention. The focused persistence reconstruction test confirms that allocation records, idempotency keys, and the next allocation counter survive reload through the registered state path.

This establishes the collection registration needed by the current generic state persistence model. It does not, by itself, establish transactional cross-process mutation safety.

## HISTORICAL COMPATIBILITY

The existing direct Payment → Invoice/Vendor Bill link remains authoritative for current document balances. New allocation records are persisted prospectively but are not added again to `paidAmount`, `balanceAmount`, or `paymentStatus` calculations. This avoids double-counting historical direct-linked Payments.

No Payment IDs, accounting journals, document balances, or historical records were rewritten.

## CORRECTION D — CROSS-PROCESS CONCURRENCY

**UNRESOLVED — STOP CONDITION REACHED.**

The current production PostgreSQL path loads a full state snapshot into the runtime store and persists asynchronously through the existing adapter. Allocation availability and document outstanding checks therefore occur in Node memory before the snapshot write. The current store operation is synchronous within one Node process, but it does not provide a PostgreSQL transaction/row lock or equivalent conditional write that serializes competing writers across processes or instances.

Adding another JavaScript mutex would not solve this boundary. The correction therefore does not claim that two simultaneous production instances are prevented from allocating the same available amount. A separate persistence/concurrency foundation package is required before this allocation authority can be considered production-safe under multi-process deployment.

## ACCOUNTING / BANKING AUTHORITY

Unchanged.

Allocation creation and reversal do not create journals, financial events, AR/AP postings, bank entries, reconciliation matches, or unmatches. Existing Payment accounting remains authoritative. Banking remains the reconciliation authority. Payment Request, gateway settlement, Expense, Quotation, Mobile, and Eazy remain outside this correction.

## TEST COVERAGE

The focused allocation suite now has **9 passed, 0 failed**, covering persistence registration/reconstruction, direct Invoice and Vendor Bill lineage, partial allocation, idempotent replay, changed-payload rejection, over-allocation guards, tenant/direction safety, explicit reversal, and no duplicate accounting/Banking effect.

## VALIDATION RESULTS

- `node --test --test-isolation=none tests/payment-allocation.test.js`: **9 passed, 0 failed**.
- `node --test --test-isolation=none tests/*.test.js`: **346 passed, 1 failed**. The failure is `postgres-document-registry.test.js`, blocked by the environment's `db.example.com` DNS resolution failure.
- `npm test`: **environmental failure**; all parallel workers hit the known Windows Node `spawn EPERM` limitation.
- `npm run build`: **PASS**.
- `npm run lint`: **PASS**.
- `npm run mobile:check`: **PASS — 8/8**.
- `npm run db:verify-reports`: **PASS**.
- `npm run db:verify-schema`: **UNAVAILABLE — ENVIRONMENTAL**, because `psql.exe` is not installed.
- `git diff --check`: **PASS**, with only normal line-ending warnings.

## FILES CHANGED

```text
apps/api/src/store.js
apps/api/src/index.js
apps/api/src/server.js
apps/api/src/client.js
apps/api/src/postgres-state.js
tests/payment-allocation.test.js
docs/eazinvoice-remediation-blueprint/47-phase-3c11-payment-allocation-completion-report.md
```

The unrelated `android/app/build.gradle` modification and unrelated untracked artifacts were preserved. Report 46 was not modified.

## GIT STATE

- Branch remains `main`.
- `HEAD` and `origin/main` remain `4883ccc59ced135928207a11b993d4c16feb9f5d`.
- PAY-BASE-02 correction files remain unstaged.
- No commit or push was performed.

## PAY-BASE-03 CONCURRENCY FOLLOW-UP

PAY-BASE-03 has now added the missing AUTH-01 transaction boundary for PostgreSQL mode. Allocation mutations and allocation reversals reload the current `primary` state document inside a PostgreSQL transaction, serialize the authoritative state mutation, and persist state/index updates through the same transaction. The 3C.12A repair additionally makes Payment lifecycle writers await ordinary PostgreSQL persistence and recover local state when CAS fails.

This does not change the PAY-BASE-02 domain model. Direct Payment lineage, payload-aware idempotency, persistence registration, legacy balance compatibility, Accounting authority, and Banking authority remain as documented above.

Live multi-connection PostgreSQL execution remains environmental/unverified because no isolated reachable PostgreSQL integration database is available in this environment. The combined PAY-BASE-02/PAY-BASE-03/3C.12A candidate still requires its independent final acceptance gate before commit.

## REQUIRED FOLLOW-UP BEFORE COMMIT

Run the independent PAY-BASE-02/PAY-BASE-03 final acceptance gate, including live PostgreSQL concurrency and stale-writer tests where infrastructure permits. Do not commit until that gate verifies the combined boundary.

Only after that foundation is accepted should the architecture proceed to explicit Bound/Unbound Payment design, Payment Request, gateway flows, or settlement integration.

## FINAL VERDICT

**PHASE 3C.11 PAY-BASE-02 + PAY-BASE-03 — IMPLEMENTED, FINAL ACCEPTANCE REQUIRED**

PAY-BASE-02 corrections A–D now have an implementation boundary in PostgreSQL mode. No commit is approved yet because independent final acceptance and live multi-process verification remain required.
