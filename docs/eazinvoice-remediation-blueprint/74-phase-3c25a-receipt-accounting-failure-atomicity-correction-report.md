# Phase 3C.25A / PAY-OVERPAY-01A-CORR — Receipt Accounting Failure Atomicity

## Status

Surgical correction implemented against baseline `2b5ed46c8b90cc540e4ed6f968fdda7ed6ac42ba`. Nothing was staged, committed, pushed, reset, or cleaned.

## Original defect

The first 3C.25 acceptance reproduced a material failure: receipt creation pushed a canonical Payment, `postCustomerReceiptUnapplied` returned `{ posted: false }` after a journal failure, and the caller still received apparent success. The failed FinancialEvent could remain while the Payment appeared to have unapplied capacity.

## Root cause

The receipt composition treated the accounting result as data rather than a success condition. Allocation composition already removed the Allocation on failure, but could leave the failed FinancialEvent created by the accounting primitive.

## Correction

`recordCustomerReceiptLocal` now snapshots authoritative state before adding the Payment. It requires `receiptAccounting.posted === true`; otherwise it restores the snapshot and throws. This rollback removes the Payment, failed FinancialEvent, and any partial accounting state.

Receipt-first allocation now snapshots state before adding the Allocation. If `postCustomerPaymentAllocation` fails or is not posted, the snapshot is restored. This removes the Allocation, failed allocation FinancialEvent, and any Invoice mutation from the failed state.

The existing PostgreSQL `mutateState` boundary remains the authoritative transaction wrapper. No process-local financial lock, second persistence authority, compensating cleanup store, or PAY-ATOMIC implementation was added.

## Resulting failure semantics

- Failed receipt returns an error, with no usable Payment or unapplied capacity.
- Failed receipt leaves no successful receipt FinancialEvent or journal.
- The same provider identity can retry after the failure condition is removed and creates exactly one successful Payment.
- The same idempotency key can retry after rollback and converges to one successful receipt.
- Failed allocation leaves no active Allocation, no Invoice balance change, and no allocation accounting authority.
- Successful receipt remains `Dr 1110 / Cr 2110`.
- Successful allocation remains `Dr 2110 / Cr 1100`.
- Legacy Invoice Payment remains `Dr 1110 / Cr 1100` and is unchanged.

## Scope exclusions

No PaymentRequest completion, Pay Now, QR/UPI, settlement, Banking automation, gateway fee/tax, Mobile/Android, tier, or PAY-ATOMIC-01 work was added.

## Verification

- Focused Customer Advance and Payment Allocation tests: **21/21 passed**.
- New executable coverage includes receipt failure rollback, provider retry, manual receipt failure, fully unapplied failure, allocation accounting failure, Invoice rollback, capacity restoration, and successful retry.
- Lint, build, PostgreSQL report verification, and `git diff --check` must be rerun as part of the combined final acceptance.
- Live multi-process PostgreSQL concurrency remains **UNVERIFIED — ENVIRONMENTAL**.

## Changed-file boundary

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `tests/payment-allocation.test.js`
- `docs/eazinvoice-remediation-blueprint/73-phase-3c25-pay-overpay-01a-canonical-unapplied-customer-payment-foundation-completion-report.md`
- `docs/eazinvoice-remediation-blueprint/74-phase-3c25a-receipt-accounting-failure-atomicity-correction-report.md`

Run one combined 3C.25 + 3C.25A independent acceptance gate before staging or committing.
