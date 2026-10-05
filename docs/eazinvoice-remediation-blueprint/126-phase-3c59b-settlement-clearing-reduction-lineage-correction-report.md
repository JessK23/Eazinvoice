# Phase 3C.59B â€” Settlement Clearing Reduction Lineage Correction

**PHASE:** 3C.59B / PAY-SETTLE-01B-CORR-02
**BASELINE:** `b173acb395af4fffd9840beedc53768408013b15`
**ROOT CAUSE:** Settlement availability independently summed refund and reversal rows without proving that their economic reductions were distinct.

## Existing authorities

The existing refund and reversal domains remain authoritative. Their posted
financial-event IDs or journal IDs are the available persisted economic
identities. No refund, reversal, or journal model was redesigned.

## Authoritative lineage and availability

Settlement posting now uses one centralized
`effectiveProviderClearingAvailable` calculation. Completed reductions are
deduplicated by their posted financial-event/journal identity. The same
authoritative identity is counted once; distinct identities may reduce the
same Payment independently. A completed reduction without posted accounting
identity is ambiguous and fails closed. Reductions exceeding captured value
are inconsistent and fail closed rather than being clamped.

The result distinguishes available, ambiguous, and inconsistent states. Posted
ProviderSettlement linkage is deducted separately as committed consumption.
The calculation runs inside the existing authoritative mutation transaction.

## Refund/reversal behavior

- Pending, failed, or non-accounted records do not reduce availability.
- Full and partial accounted reductions reduce availability in minor units.
- Duplicate representations sharing an authoritative financial identity count
  once.
- Shared refund/reversal lineage counts once.
- Distinct refund/reversal lineage may count both.
- Missing or conflicting lineage fails closed.

## Settlement behavior

Prior posted settlement consumption is included. Duplicate Payment references
remain rejected. The accepted journal remains unchanged:

```text
Dr Actual Bank                 net
Dr 5300 Payment Provider Fees  fee
Cr 1110 Provider Clearing      gross
```

Migration 025/fingerprint validation, PostgreSQL transaction authority,
idempotent retry, destination bank validation, provider-fee authority,
unsupported-class inertness, and Banking inertness remain unchanged.

## Verification

- Focused settlement/evidence/fee suites: **24 passed, 0 failed**.
- Accounting, migration, Payment, PAY-ATOMIC, Allocation, Customer Advance,
  recovery, Banking, and reporting regressions: **80 passed, 0 failed**.
- Explicit coverage includes shared-lineage deduplication, distinct refund and
  reversal reductions, missing-lineage ambiguity, over-reduction, Migration 025,
  prior settlement linkage, and ledger inertness.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**.
- `npm run db:verify-state`: **PASS**.
- `npm run db:verify-reports`: **PASS**.
- `git diff --check`: **PASS**, with expected LF/CRLF warnings only.

**LIVE POSTGRESQL VERIFICATION OUTSTANDING**
**LIVE RAZORPAY VERIFICATION OUTSTANDING**

## Report 125 blocker

Report 125's double-subtraction blocker is addressed without amount-only
deduplication or a new refund/reversal authority. Ambiguous persisted states
remain ledger-inert.

## Scope leakage

No refund/reversal redesign, new accounting postings, settlement journal
redesign, GST, tax documents, TDS, FX, Banking reconciliation, PAY-ATOMIC,
UI, Android, QR/UPI, or live Razorpay changes were made.

## Files changed

- `apps/api/src/store.js`
- `tests/provider-settlement-accounting.test.js`
- this Report 126

Reports 121â€“125 were not modified. Nothing was staged, committed, or pushed.

## Final verdict

**PHASE 3C.59B â€” CORRECTION IMPLEMENTED â€” READY FOR COMBINED FINAL ACCEPTANCE**
