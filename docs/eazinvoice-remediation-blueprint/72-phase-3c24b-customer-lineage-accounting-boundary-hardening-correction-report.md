# Phase 3C.24B / ACCT-OVERPAY-01A-CORR2 — Customer-Lineage Accounting Boundary Hardening

## Status

Surgical correction implemented against baseline `c578876c9a24ec913192ed2ce26955968d18abd3`. Nothing was staged, committed, pushed, reset, or cleaned. Reports 67–69 and Android/unrelated artifacts remain untouched.

## Residual defect

The combined 3C.24 + 3C.24A acceptance found that Store-created cross-customer allocations were rejected, but the lower Accounting allocation primitive could still receive Customer A's Payment and Customer B's Invoice and post `Dr Customer Advance → Cr A/R`.

## Correction

Both boundaries now fail closed unless:

```text
payment.customerId === invoice.customerId
```

The Accounting service validates this before creating a financial event, journal, or journal line. The Store Accounting wrapper enforces the same invariant. No customer is rebound or inferred, and no partial accounting effect is created.

Receipt-first authority, business ownership, currency checks, allocation reversal, receipt reversal, refunds, and idempotency behavior remain unchanged.

## Verification

The focused suite now passes 6/6, including:

- valid same-customer receipt and allocation;
- missing receipt authority;
- allocation reversal and replay;
- source-payment refund and replay;
- receipt reversal;
- direct lower-level Accounting rejection for cross-customer Payment/Invoice lineage with no new event or journal.

The relevant serial API, Payment Allocation, and customer-advance run passes 186/186 after the correction. Lint and build pass. Report verification and `git diff --check` pass. Live PostgreSQL cross-process concurrency remains `UNVERIFIED — ENVIRONMENTAL`.

## Scope exclusions

No PaymentRequest, Pay Now, remaining-balance link, QR/UPI, settlement, Banking reconciliation, Mobile, Android, UI, tier, Expense, Quotation, or subscription work was added.

## Candidate boundary

- `apps/api/src/accounting-service.js`
- `apps/api/src/store.js`
- `tests/customer-advance-accounting.test.js`
- `docs/eazinvoice-remediation-blueprint/70-phase-3c24-acct-overpay-01a-customer-advance-ledger-foundation-completion-report.md`
- `docs/eazinvoice-remediation-blueprint/71-phase-3c24a-customer-advance-reversal-refund-accounting-correction-report.md`
- `docs/eazinvoice-remediation-blueprint/72-phase-3c24b-customer-lineage-accounting-boundary-hardening-correction-report.md`

This is ready for another independent combined 3C.24 + 3C.24A + 3C.24B acceptance gate, not for commit yet.
