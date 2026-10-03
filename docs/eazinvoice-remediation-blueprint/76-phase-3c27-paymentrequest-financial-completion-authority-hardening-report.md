# Phase 3C.27 / PAY-REQ-02C-GUARD — PaymentRequest Financial Completion Authority Hardening

## Status

Implemented against committed baseline `0a77726a2b814accd0ac28e760af98c4c68f7eec`. The first 3C.27 candidate was not accepted because its status fallback was fail-open; 3C.27A corrects that defect. Nothing was staged, committed, pushed, reset, or cleaned. Report 75 remains an untracked historical readiness report and was not modified.

## Original defect

`completePaymentRequest` could previously mark a PaymentRequest completed using only `verifiedPaymentEvidence` and a caller-supplied provider reference. That allowed lifecycle completion without a canonical Payment, provider identity, customer/business/Invoice lineage, or successful Customer Advance receipt accounting.

## Caller sweep

The complete repository contains the Store completion method, its API wrapper, and test/provider-intent callers. The PaymentRequest-owned Razorpay webhook is identification-only and does not call completion. No alternate production path directly mutates `status`, `completedAt`, or completion evidence. Legacy tests were updated to create a valid canonical receipt before prospective completion.

## Hardened completion contract

Prospective completion now requires:

- a persisted canonical Payment ID resolved from authoritative state;
- complete external provider identity via PAY-IDEM rules;
- an explicitly persisted canonical Payment status equal to `captured` after trim/case normalization; missing, null, blank, whitespace, non-captured, and unknown statuses fail closed;
- customer-receipt Payment lineage, not a legacy direct Invoice Payment;
- matching PaymentRequest, Invoice, business, workspace, customer, and currency lineage;
- matching provider Order where the PaymentRequest has an authoritative Order;
- successful persisted receipt-first accounting authority with balanced `1110` debit and `2110` credit;
- verified provider evidence as an additional prerequisite.

Allocation is intentionally not required. Invoice balance is intentionally not required to be zero. This preserves future partial, overpayment, already-paid, second genuine, and late-payment behavior.

Completion stores only lifecycle lineage (`completedPaymentId`, provider Payment/Order identity, completion source, and timestamp). It does not create a second financial store or persist allocation/unapplied balances.

## Idempotency and conflicts

Repeating completion with the same Payment replays safely. A completed request cannot be rebound to a different canonical Payment, provider Payment ID, or provider Order. Missing/partial identity, wrong customer/business/workspace/Invoice/currency, missing receipt authority, and legacy A/R-only accounting fail closed.

Historical completed requests remain readable and replayable. No destructive migration was introduced. New prospective completion uses the hardened contract.

## Financial boundary

This package performs no new financial recognition. It creates no Payment, Allocation, Invoice effect, receipt journal, allocation journal, Customer Advance, settlement, or Banking mutation. It only verifies existing canonical financial authority before changing PaymentRequest lifecycle metadata.

## Persistence and concurrency

The existing AUTH-01 PostgreSQL mutation boundary remains in force: advisory transaction lock, authoritative state reload, state-document `FOR UPDATE`, versioned save, and commit/rollback. Completion is not a process-local authority. Live multi-process PostgreSQL execution remains unverified environmentally.

## Explicit exclusions

No PAY-ATOMIC-01 provider Payment creation, webhook financial processing, automatic Allocation, remaining-balance PaymentRequest, Pay Now, QR/UPI, settlement, gateway fees/taxes, Banking reconciliation, Mobile/Android, tier, Expense, Quotation, Eazy, or subscription work was added.

## Verification

- 3C.27A focused explicit-status regressions: **passed** (invalid persisted statuses reject; explicit persisted `captured` succeeds; caller-supplied status cannot override persisted status).
- Focused PaymentRequest/provider suite: **24/24 passed**.
- Combined serial regression suite: **251/251 passed**.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run db:verify-reports`: passed against local PostgreSQL.
- `git diff --check`: passed.
- Live Razorpay execution: **UNVERIFIED — ENVIRONMENTAL**.
- Live multi-process PostgreSQL execution: **UNVERIFIED — ENVIRONMENTAL**.

## Candidate boundary

- `apps/api/src/store.js`
- `tests/payment-request.test.js`
- `tests/payment-request-provider-intent.test.js`
- `docs/eazinvoice-remediation-blueprint/76-phase-3c27-paymentrequest-financial-completion-authority-hardening-report.md`
- `docs/eazinvoice-remediation-blueprint/77-phase-3c27a-strict-captured-payment-status-authority-correction-report.md`

Run the independent 3C.27 final acceptance gate before staging or committing. After acceptance and commit, rerun PAY-ATOMIC-01 readiness against the new committed baseline.
