# Phase 3C.59 â€” PAY-SETTLE-01B Narrow Settlement Journal Authority

**Mode:** Implementation complete; ready for independent final acceptance
**Baseline:** `b173acb395af4fffd9840beedc53768408013b15`
**Scope:** Simple zero-tax provider settlement accounting only.

## Supported settlement class

The new posting authority accepts only evidence with valid provider/business/merchant identity, verified provenance, captured Payment linkage covering the exact gross amount, same supported currency, active tenant bank destination, active canonical `provider_fee_expense` authority at `5300`, valid accounting period, zero tax, no withholding, no adjustments, and valid migration state.

Unsupported GST/tax, TDS/withholding, adjustments, FX, invalid linkage, inactive/deleted authorities, invalid destinations, and ambiguous migration remain ledger-inert.

## Journal

For gross `10,000`, fee `200`, and net `9,800`:

```text
Dr actual bank                 9,800
Dr 5300 Provider Fee Expense     200
Cr 1110 Provider Clearing      10,000
```

Zero-fee settlements omit the zero-value fee line. Existing accounting journal/event infrastructure is reused.

## Transaction and idempotency

Posting is exposed as an authenticated action for a specific ProviderSettlement. With PostgreSQL configured, the operation runs through the existing authoritative `mutateState` transaction boundary. It validates evidence, linkage, destination, fee authority, clearing authority, arithmetic, and accounting identity before creating the financial event/journal and transitioning `accountingStatus` to `posted` within the same state mutation.

The accounting identity is versioned as `provider_settlement_posted:v1` and includes business, provider, merchant, and ProviderSettlement identity. Identical retries return the existing journal; conflicts fail closed.

## Accounting boundaries

Payment, Allocation, Customer Advance, A/R, Invoice, and PaymentRequest economics remain unchanged. Banking statement import/reconciliation remains untouched. GST, tax documents, TDS, withholding, FX, refund/chargeback, and settlement-adjustment accounting are not implemented.

## Verification

- Focused/relevant serial tests: **97 passed, 0 failed**.
- Lint: **PASS**.
- Build: **PASS**.
- PostgreSQL state verification: **PASS**.
- PostgreSQL report verification: **PASS**.
- Diff check: **PASS**, with expected CRLF warnings only.
- Live PostgreSQL settlement concurrency: **not verified**.
- Live Razorpay settlement evidence: **not verified**.

## Files changed

- `apps/api/src/accounting-service.js`
- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `tests/provider-settlement-accounting.test.js`
- this report

No previous reports, Android files, or unrelated artifacts were modified. Nothing was staged, committed, or pushed.

## Remaining blockers

Independent final acceptance must still challenge PostgreSQL concurrency/crash behavior, Payment clearing coverage, bank/fee authority revalidation, closed periods, tenant isolation, and unsupported-class inertness. Broader GST/tax-document settlement and Banking reconciliation remain future packages.

## Verdict

**PHASE 3C.59 IMPLEMENTATION COMPLETE â€” READY FOR INDEPENDENT FINAL ACCEPTANCE**
