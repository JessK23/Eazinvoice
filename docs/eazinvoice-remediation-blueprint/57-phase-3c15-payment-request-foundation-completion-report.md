# EAZINVOICE — PHASE 3C.15 / PAY-REQ-01
## PaymentRequest Persistence + API + Lifecycle Foundation Completion Report

**Baseline:** `61805899ef55a55ff7cc95cb86168a9a8dea7ca1`  
**Branch:** `main`  
**Scope:** Provider-neutral collection intent only. No Pay Now UI, provider integration, QR/UPI, settlement, reconciliation, accounting, banking, mobile, Android, Expense, Quotation, or Report 55 changes.

## 1. Discovery findings

The repository already has:

- Invoice `balanceAmount` and `paymentStatus` as the existing invoice authority;
- Payment as the confirmed money-movement authority;
- Payment Allocation as the Payment-to-document relationship authority;
- AUTH-01 persistence completion through Store persistence and `mutateState`;
- PAY-BASE-03 PostgreSQL advisory-lock/authoritative-state transaction infrastructure.

PAY-REQ-01 therefore adds a collection-intent entity around those authorities without redesigning them.

## 2. PaymentRequest model

`paymentRequests` is a first-class AUTH-01 state collection with `preq_` IDs, counters, and PostgreSQL state normalization. Records include business/workspace scope, one `invoiceId`, `documentType: "INVOICE"`, currency, requested amount, lifecycle timestamps, request key, optional provider/reference fields, and metadata.

PaymentRequest is not Payment, Allocation, Accounting, Banking, or Settlement.

## 3. Invoice binding and amount authority

Creation loads the existing Invoice, validates its business and owner scope, requires a non-draft collectible Invoice, validates positive amount and matching currency, and compares the request against the existing Invoice `balanceAmount`. No competing balance calculation or Invoice mutation was introduced.

Invoice binding is permanent. The API accepts only `invoiceId`; no Vendor Bill or redirect operation exists.

## 4. Reservation model

Active, non-expired PaymentRequests reserve their `requestedAmount` against the Invoice’s current collectible outstanding amount. Reservations are considered only during PaymentRequest creation and do not change Invoice balance or payment status.

Creation uses the existing PostgreSQL `mutateState` transaction path when available. That path obtains the existing advisory transaction lock, reloads authoritative state, validates reservations, persists the complete state, and commits atomically. No JavaScript-only concurrency primitive was added.

Live PostgreSQL concurrency execution was not available in this environment; it remains unverified rather than claimed as a runtime pass.

## 5. Lifecycle, expiry, cancellation, and terminal behavior

Implemented states are `active`, `completed`, `expired`, and `cancelled`.

- Expiry is evaluated from `expiresAt` without a scheduler.
- Expired requests release reservation capacity and cannot initiate new collection through this package.
- Cancellation is tenant-scoped, idempotent for already-cancelled/expired requests, and releases capacity.
- Completion is available only through a constrained internal API requiring verified payment evidence and a provider reference; there is no public completion route.
- Completed, cancelled, and expired requests cannot be reactivated.
- Verified late provider evidence can remain architecturally processable through the constrained internal completion path; provider callback execution is not implemented here.

No lifecycle operation creates Payment, Allocation, Accounting, Banking, or settlement records.

## 6. Idempotency and tenant scope

Creation supports business-scoped `requestKey`/`idempotencyKey`. Same material intent replays the existing request; changed Invoice, amount, currency, or expiry is rejected.

List, get, create, and cancel operations use existing workspace/business authorization. Cross-business Invoice access, read, and cancellation are rejected or return not-found semantics without leaking data.

## 7. API

Added provider-neutral endpoints:

- `GET /payment-requests`
- `GET /payment-requests/:id`
- `POST /payment-requests`
- `POST /payment-requests/:id/cancel`

No `/pay`, `/complete`, `/razorpay`, or `/allocate` endpoint was added. Centralized client adapters were added for the four supported routes.

## 8. Authority boundaries

- **Payment:** unchanged and not created by PaymentRequest creation.
- **Payment Allocation:** unchanged; no allocation is created.
- **Accounting:** zero journal or ledger effects.
- **Banking:** no statement, bank, or reconciliation mutation.
- **Razorpay:** existing subscription and billing-order behavior unchanged; no PaymentRequest connection.
- **Tiers:** no enforcement or entitlement changes.
- **UI:** no Web, Mobile, Eazy, QR, Pay Now, or customer payment page changes.

## 9. Files changed

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `apps/api/src/server.js`
- `apps/api/src/client.js`
- `apps/api/src/postgres-state.js`
- `tests/payment-request.test.js`
- `docs/eazinvoice-remediation-blueprint/57-phase-3c15-payment-request-foundation-completion-report.md`

`Report 55` was not modified. The pre-existing `android/app/build.gradle` change and unrelated workspace artifacts remain outside this package.

## 10. Validation

Focused PaymentRequest suite: **9 passed, 0 failed**.

Relevant AUTH/PAY/Invoice/Payment/Allocation/Accounting/Banking/Razorpay/Vendor Bill regression: **227 passed, 0 failed, 1 existing live-PostgreSQL skip**.

Full serial repository suite: **371 passed, 1 environment-only failure, 1 existing live-PostgreSQL skip**. The failure is the pre-existing `tests/postgres-document-registry.test.js` attempt to connect to unresolved `db.example.com` (`ENOTFOUND`); no PaymentRequest test failed.

- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run mobile:check`: PASS (8/8)
- `npm run db:verify-reports`: PASS
- `git diff --check`: PASS
- `npm run db:verify-schema`: environmentally unavailable because `psql.exe` is not configured.

## 11. Remaining PaymentRequest work

PAY-REQ-01 does not implement provider order/link creation, Invoice Pay Now, dynamic QR, UPI, UTR verification, Payment creation from provider success, automatic Payment Allocation, GatewaySettlement, fee/tax accounting, or bank auto-reconciliation.

## 12. Proposed next package

The next package should be a separate provider-integration boundary, likely **PAY-REQ-02 — Invoice-bound Pay Now / Razorpay PaymentRequest Integration**, subject to final acceptance of this foundation. It should create or retrieve Payment and deterministic Allocation only after verified provider evidence. Gateway settlement remains later.

## 13. Proposed commit boundary

Commit only the seven files listed in Section 9. Do not stage, commit, or push as part of this implementation task.

## Final verdict

**PHASE 3C.15 — VERIFIED WITH LIVE POSTGRESQL OUTSTANDING — READY FOR FINAL ACCEPTANCE**
