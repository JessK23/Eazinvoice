# Phase 3C.29 / PAY-ATOMIC-01 — Verified Provider Payment Atomic Completion

## Status

Implementation complete against baseline `2b7b44eae8c8506e32ef282e985332f10e5278f6`. Nothing was staged, committed, pushed, reset, cleaned, or stashed. Android and unrelated workspace artifacts were untouched.

## Implementation

Added one canonical Store authority, `completeVerifiedProviderPaymentAtomic`, which executes provider-payment financial completion through one outer authoritative mutation. The PostgreSQL path reloads and locks authoritative state, creates a non-persisting local Store, composes local financial primitives, returns one final state, and persists once.

The Razorpay webhook now invokes this authority only after raw-body signature verification and after provider evidence has been resolved to persisted PaymentRequest → Invoice → Business/Workspace lineage. Provider network work remains outside the financial mutation.

## Atomic financial chain

The operation revalidates PaymentRequest, Invoice, business, workspace, customer, currency, provider Order, provider Payment identity, and explicit captured status inside the mutation. It then:

1. Reuses a compatible canonical external Payment or creates one canonical customer receipt Payment.
2. Posts receipt-first Accounting: Dr 1110 Clearing, Cr 2110 Customer Advance.
3. Re-reads current Invoice capacity and derives `min(Payment available, Invoice outstanding)` server-side.
4. Creates at most one active Invoice Allocation and its Customer Advance → A/R journal.
5. Completes the PaymentRequest through the hardened local authority.
6. Commits all resulting state once.

Allocation remains optional. PaymentRequest completion is allowed for partial, zero-allocation, already-paid, and overpayment cases.

## Behavioral coverage

- Exact payment closes the Invoice and PaymentRequest.
- Partial payment consumes the original PaymentRequest while leaving the Invoice balance available for a future new request.
- Overpayment is derived from current Invoice capacity and remains Customer Advance.
- Zero-allocation genuine captures remain canonical unapplied Payments.
- Same provider Payment replay creates no duplicate Payment, journal, Allocation, or completion.
- A second genuine provider Payment is preserved independently and cannot rebind the first completion.
- Non-captured evidence fails closed.
- Conflicting amount and Order identity fail closed.
- Persistence failure leaves no applied local financial state.

## Rollback and idempotency

All local mutations occur inside the outer transaction. A thrown receipt, allocation, completion, or final persistence failure rolls back the entire authoritative state. External Payment identity remains the primary financial idempotency key: business + provider + providerPaymentId.

## Accounting and exclusions

Only approved receipt-first and allocation balance-sheet entries are produced. No revenue, tax, gateway-fee, gateway-GST, settlement, Banking, or reconciliation effects were added. No Pay Now UI, QR, UPI, remaining-balance request, tier, Mobile, Android, Eazy, Expense, Quotation, or subscription work was added.

## Verification

- Focused PAY-ATOMIC tests: **9/9 passed**.
- Financial/provider/PaymentRequest regression subset: **64/64 passed**.
- Broad serial regression suite: **260/260 passed**.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run db:verify-reports`: passed.
- `git diff --check`: passed.
- Live Razorpay execution: **UNVERIFIED — ENVIRONMENTAL**.
- Live multi-process PostgreSQL execution: **UNVERIFIED — ENVIRONMENTAL**.

## Files changed

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `apps/api/src/server.js`
- `tests/payment-atomic.test.js`
- `tests/payment-request-provider-intent.test.js`
- `docs/eazinvoice-remediation-blueprint/79-phase-3c29-pay-atomic-01-verified-provider-payment-atomic-completion-report.md`

Report 75 was not modified. No staging, commit, or push was performed. The next step is the independent PAY-ATOMIC-01 final acceptance gate.
