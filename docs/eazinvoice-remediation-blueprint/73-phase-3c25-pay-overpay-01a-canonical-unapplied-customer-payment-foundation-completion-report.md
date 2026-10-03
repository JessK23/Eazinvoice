# Phase 3C.25 / PAY-OVERPAY-01A — Canonical Unapplied Customer Payment Foundation

## Status

Implemented against baseline `2b5ed46c8b90cc540e4ed6f968fdda7ed6ac42ba`. The first independent acceptance found a material receipt-accounting failure-atomicity defect: a failed Customer Advance journal could leave a Payment and return apparent success. That defect is corrected by 3C.25A; this report preserves the original failure rather than treating the first implementation as accepted. Nothing was staged, committed, pushed, reset, or cleaned. The unrelated Android modification and existing workspace artifacts remain untouched.

## Implemented boundary

PAY-OVERPAY-01A extends the existing canonical `Payment` authority; it does not create a second receipt store.

- Added `recordCustomerReceipt` at the Store/API boundary for customer-owned, invoice-unbound receipts.
- New receipts are explicit `paymentType: "customer_receipt"` and `accountingTreatment: "receipt_first"` records.
- The receipt is persisted through AUTH-01 and must post the accepted receipt-first `Dr 1110 / Cr 2110` Customer Advance transition in the same authoritative mutation. 3C.25A rolls back the full mutation if posting fails.
- Provider identity and idempotency reuse PAY-IDEM-01 rules. A replay returns the original Payment; a different provider Payment identity creates a distinct Payment.
- Customer, business, currency, direction, provider-lineage, and idempotency conflicts fail closed.
- Receipt-first allocations automatically post the accepted `Dr 2110 / Cr 1100` transition. Allocation remains the canonical document-application authority.
- Active receipt-first allocations now participate in the Invoice derived payment state. A ₹4,000 allocation against a ₹10,000 Invoice produces `paidAmount = ₹4,000`, `balanceAmount = ₹6,000`, and `paymentStatus = part_paid`.
- Overpayment remains unapplied: a ₹12,000 receipt allocated by ₹10,000 leaves ₹2,000 available on the canonical Payment.
- A second genuine provider Payment is not discarded or merged. A fully satisfied Invoice cannot accept another allocation, so the later receipt remains customer-owned and unapplied.
- Reversed allocations refresh the Invoice derived status and restore Payment availability through the existing reversal/refund authority.
- Customer-owned receipt Payments are visible through the existing payment listing and allocated-payment invoice listing.

## Original acceptance defect and correction

The first 3C.25 candidate failed acceptance because `recordCustomerReceiptLocal` pushed the Payment, accepted a `{ posted: false }` accounting result, and persisted/returned the Payment. Failed FinancialEvents could therefore remain as misleading state. 3C.25A snapshots the authoritative state before composition and restores it when receipt or receipt-first allocation posting does not return `posted: true`. This removes the Payment/Allocation, failed FinancialEvent, and any partial Invoice mutation from the failed authoritative state; retrying the same provider identity or idempotency key can then create exactly one successful receipt.

## Explicit exclusions

No PaymentRequest completion, Pay Now, payment link, QR/UPI, provider settlement, Banking reconciliation automation, PAY-ATOMIC-01, UI/mobile work, tier work, or new Accounting chart structure was added. No automatic second PaymentRequest is generated after a partial payment.

## Verification

- Focused customer-advance and allocation tests after correction: **21/21 passed**.
- Combined serial regression suite before the correction: **244/244 passed**; rerun the full suite after 3.25A before acceptance.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run db:verify-reports`: passed against the configured local PostgreSQL verification environment.
- `git diff --check`: passed.
- Live multi-process PostgreSQL concurrency execution remains **UNVERIFIED — ENVIRONMENTAL**; the implementation continues to use the established AUTH-01 mutation boundary and does not introduce process-local locking.

## Candidate commit boundary

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `tests/payment-allocation.test.js`
- `docs/eazinvoice-remediation-blueprint/73-phase-3c25-pay-overpay-01a-canonical-unapplied-customer-payment-foundation-completion-report.md`
- `docs/eazinvoice-remediation-blueprint/74-phase-3c25a-receipt-accounting-failure-atomicity-correction-report.md`
- `docs/eazinvoice-remediation-blueprint/73-phase-3c25-pay-overpay-01a-canonical-unapplied-customer-payment-foundation-completion-report.md`

This is an implementation completion report only. Run an independent PAY-OVERPAY-01A final acceptance gate before staging or committing.
