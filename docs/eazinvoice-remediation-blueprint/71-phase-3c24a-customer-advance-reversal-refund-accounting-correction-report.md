# Phase 3C.24A / ACCT-OVERPAY-01A-CORR — Customer Advance Reversal, Refund, and Allocation-Authority Correction

## Status and baseline

This is an uncommitted surgical correction to the Phase 3C.24 candidate. The expected baseline remains `c578876c9a24ec913192ed2ce26955968d18abd3`; nothing was staged, committed, pushed, reset, or cleaned.

Reports 67–69 remain untouched. Report 70 was corrected to preserve the fact that 3C.24 originally failed acceptance and to record this correction.

## Original defects

The 3C.24 gate found four material issues:

1. Reversing a receipt-first allocation restored derived capacity but left the allocation journal posted.
2. Reversing a receipt-first Payment did not reduce Customer Advance Accounting.
3. Refunds linked through `customerRefunds.sourcePaymentId` were not consumed by derived unapplied capacity.
4. Allocation Accounting could be invoked without a posted receipt-first Customer Advance authority.

## Correction implemented

- Allocation reversal now posts a source-linked reversal journal:
  - Debit `1100 Accounts Receivable`.
  - Credit `2110 Customer Advances / Unapplied Customer Receipts`.
- Receipt-first Payment reversal now posts:
  - Debit `2110 Customer Advances / Unapplied Customer Receipts`.
  - Credit `1110 Bank / Payment Clearing`.
- Receipt-first refunds linked to `sourcePaymentId` use the same Customer Advance reduction, while existing Credit Note refund accounting remains unchanged.
- `getPaymentUnappliedAmount` / allocation capacity now subtracts effective source-payment refunds and posted payment reversals, while active allocation reversal restores capacity.
- Allocation Accounting fails closed unless a compatible posted receipt event exists for the same Payment, business, customer, currency, and amount.
- Allocation reversal, Payment reversal, and refund retry identities reject conflicting material payloads and replay identical requests without duplicate journals.
- Partial allocation reversal remains unsupported; the existing canonical reversal is full-allocation only.

## Authority and compatibility

The correction reuses the existing Payment, PaymentAllocation, payment-reversal, customer-refund, financial-event, immutable-journal, and authoritative persistence authorities. It does not create a second receipt store or a parallel public payment workflow.

Legacy Invoice Payments still use direct `Dr Clearing → Cr A/R` accounting. Legacy allocation reversals without a receipt-first allocation journal remain non-accounting, preserving historical behavior. Customer Advance reductions apply only when the receipt-first authority is present.

Customer ownership, business ownership, invoice lineage, currency, and allocation/payment identity are validated before the new transitions. Customer Advance reductions are capped by effective unapplied capacity so supported reversal/refund sequences cannot make the attributable advance negative.

## Required scenario

For a ₹12,000 receipt and ₹10,000 Invoice allocation:

1. Receipt posts Clearing ₹12,000 / Customer Advance ₹12,000.
2. Allocation posts Customer Advance ₹10,000 / A/R ₹10,000.
3. Unapplied capacity is ₹2,000.
4. Allocation reversal posts A/R ₹10,000 / Customer Advance ₹10,000 and restores capacity to ₹12,000.
5. A ₹2,000 source-payment refund posts Customer Advance ₹2,000 / Clearing ₹2,000 and leaves ₹10,000 available.
6. A further allocation exceeding ₹10,000 fails; refunded money cannot be reused.

No revenue, tax, PaymentRequest, settlement, Banking, or gateway effect is introduced.

## Verification

Focused tests cover receipt authority, balanced receipt/allocation/reversal/refund journals, capacity restoration, refund reuse prevention, receipt reversal, duplicate replay, conflicting retry rejection, and legacy allocation compatibility. The focused suite passes 5/5. Relevant API and Payment Allocation regressions pass 185/185 in the serial run.

Lint/build and live PostgreSQL verification remain environmental checks for the combined final acceptance gate. The production PostgreSQL path reuses the existing authoritative mutation/advisory-lock boundary; no process-local financial lock was added.

## Deferred work

PAY-OVERPAY-01A, PAY-ATOMIC-01, remaining-balance PaymentRequests, Pay Now/QR/UPI, provider settlement, gateway fees/tax, Banking reconciliation, customer-credit redemption, and broader refund-domain redesign remain deferred.

## Candidate boundary

- `apps/api/src/accounting-service.js`
- `apps/api/src/store.js`
- `tests/customer-advance-accounting.test.js`
- `docs/eazinvoice-remediation-blueprint/70-phase-3c24-acct-overpay-01a-customer-advance-ledger-foundation-completion-report.md`
- `docs/eazinvoice-remediation-blueprint/71-phase-3c24a-customer-advance-reversal-refund-accounting-correction-report.md`

This boundary remains unstaged and requires one combined 3C.24 + 3C.24A final acceptance gate.

## Subsequent 3C.24B correction

The combined acceptance independently found one residual defect: the lower-level Accounting allocation primitive did not independently require `payment.customerId === invoice.customerId`, even though the normal Store allocation route did. Phase 3.24B adds that Accounting-boundary guard and a direct primitive regression. The combined 3C.24–3C.24B candidate remains uncommitted pending another independent acceptance gate.
