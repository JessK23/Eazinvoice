# PHASE 3C.34 — PAY-REQ-03A REMAINING-BALANCE PAYMENTREQUEST REISSUE AUTHORITY

## PHASE:

Phase 3C.34 — implementation/testing completion report. The package remains uncommitted pending independent final acceptance.

## BASELINE:

- Branch: `main`
- `HEAD`: `cf9aef02b3d4180d2a3c4d29a39663c6972dbfd6`
- `origin/main`: `cf9aef02b3d4180d2a3c4d29a39663c6972dbfd6`
- Pre-existing Android and unrelated/untracked artifacts were not modified.

## PACKAGE:

PAY-REQ-03A — explicit remaining-balance PaymentRequest reissue authority. No automatic link delivery, notification, Pay Now UI, QR/UPI, settlement, Banking, or mobile work was added.

## DISCOVERY:

The existing PaymentRequest creation path was the smallest safe integration point. It already used canonical Invoice outstanding and the authoritative persistence wrapper, but allowed multiple active requests while aggregate reservations stayed within capacity. The implementation now closes that bypass and adds an explicit reissue authority without changing Payment, Allocation, PAY-ATOMIC, Accounting, or provider recovery architecture.

## FILES CHANGED:

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `apps/api/src/server.js`
- `tests/payment-request.test.js`
- `tests/payment-request-provider-intent.test.js`
- `tests/payment-atomic.test.js`
- This completion report.

## CANONICAL OUTSTANDING AUTHORITY:

Reissue derives amount only from `documentOutstandingMinor("INVOICE", invoice)`, which includes the committed Credit Note-adjusted receivable authority. Caller-supplied amount is not trusted; a mismatched supplied amount fails closed. Historical PaymentRequest amounts, provider Order amounts, and `Invoice.balanceAmount` are not used as remaining-balance authorities.

## ONE-ACTIVE-REQUEST INVARIANT:

The Store mutation boundary now permits at most one active PaymentRequest for `businessId + invoiceId`. Existing normal creation and explicit reissue both enforce it. Compatible retries return the active authority; an incompatible active request fails closed. Expired, cancelled, and completed requests do not remain active authorities.

## ACTIVE STATUS DEFINITION:

The existing `paymentRequestEffectiveStatus` terminology is preserved. Only effective `active` requests participate in uniqueness/reservation. `completed`, `expired`, and `cancelled` remain historical/non-active states. No new status was introduced.

## REISSUE AUTHORITY:

`reissuePaymentRequest` is exposed through Store, API, and `POST /invoices/:invoiceId/payment-requests/reissue`. It reloads and validates the Invoice inside the existing authoritative mutation, enforces business/workspace scope and collectible lifecycle, derives current canonical outstanding, and creates a distinct PaymentRequest. It rejects zero capacity and stale caller amounts. It never reopens or resizes an existing request.

## REQUEST-KEY IDEMPOTENCY:

Existing business-scoped request-key idempotency remains intact. Same-key compatible creation replays; changed intent fails closed. Invoice-level active uniqueness is complementary: different keys cannot create a second active authority, and compatible active reissue retries converge on the existing request.

## PROVIDER ORDER AUTHORITY:

Request B is a new PaymentRequest with its own identity and, when provider intent is later started, a new deterministic receipt/provider-intent lineage. Request A's provider Order cannot be rebound to Request B. Provider network calls remain outside PostgreSQL mutations.

## PROVIDER RECOVERY:

Existing `creating` / `created` / `recovery_required` behavior was preserved. Provider success followed by local persistence failure remains recoverable by receipt and cannot trigger blind duplicate Order creation.

## PARTIAL PAYMENT:

The executable PAY-ATOMIC test confirms Invoice ₹10,000 → captured/allotted ₹4,000 → Request A completed and immutable → explicit reissue creates Request B for ₹6,000. Payment and allocation counts remain unchanged by reissue.

## CREDIT NOTE:

Reissue consumes the canonical Credit Note-adjusted outstanding. A ₹10,000 Invoice with a posted ₹2,000 Credit Note produces an ₹8,000 reissue, while the historical request amount remains unchanged.

## CREDIT NOTE + PARTIAL PAYMENT:

The Store path derives the current value after both adjustments. The same authority used by PaymentRequest creation, allocation, and PAY-ATOMIC supplies the future ₹5,000 result for ₹10,000 − ₹2,000 Credit Note − ₹3,000 allocation.

## CREDIT NOTE AFTER REQUEST CREATION:

Existing requests remain immutable if a Credit Note changes current capacity. A genuine stale capture remains governed by PAY-ATOMIC: allocation is capped by current capacity and excess remains Customer Advance.

## CREDIT NOTE AFTER PARTIAL PAYMENT:

The reissue path recalculates at mutation time, so ₹10,000 − ₹4,000 allocation − ₹2,000 Credit Note derives ₹4,000 rather than reusing ₹6,000.

## EXACT PAYMENT:

Fully paid Invoices fail closed through the existing Invoice lifecycle/payment guard; no zero-value PaymentRequest is created.

## OVERPAYMENT:

Customer Advance is not treated as negative Invoice outstanding. A fully satisfied/overpaid Invoice therefore cannot receive a remaining-balance request.

## EXPIRED REQUEST:

Expired requests remain historical and are never reactivated. Reissue can create a new request only when current canonical outstanding is positive.

## CANCELLED REQUEST:

Cancelled requests remain historical and cannot be mutated back to active. Reissue creates a distinct request when capacity remains.

## COMPLETED REQUEST:

Completed requests remain immutable. A completed partial request can be explicitly reissued; a completed fully paid request cannot.

## LATE CAPTURE:

PAY-REQ-03A does not alter the accepted late-capture behavior. PAY-IDEM and PAY-ATOMIC preserve genuine money for an old request, cap current allocation, and retain excess as Customer Advance without reopening the old request or overwriting a newer request.

## SECOND GENUINE PAYMENT:

Distinct captured provider Payments remain distinct. Reissue does not change PaymentRequest completion or collapse a second genuine Payment.

## INVOICE LIFECYCLE:

Reissue reuses `assertInvoiceCanReceivePayment` and canonical outstanding checks. Deleted, cancelled/void, fully paid, and otherwise non-collectible Invoice states are rejected according to repository behavior; no new lifecycle values were introduced.

## BUSINESS / WORKSPACE / CUSTOMER ISOLATION:

API authorization resolves the authenticated workspace/business before Store mutation. Store lineage is taken from the persisted Invoice, not caller overrides. Existing provider/PAY-ATOMIC lineage guards remain unchanged. Cross-business and cross-workspace access fails closed.

## CURRENCY:

Reissue derives currency from the Invoice. A caller-supplied incompatible currency fails. No FX conversion was added; subsequent provider intent remains bound to the PaymentRequest currency.

## ACCOUNTING:

Reissue creates no Payment, Payment Allocation, FinancialEvent, Journal, JournalLine, Customer Advance, A/R, Revenue, tax, Banking, settlement, or refund entry. Tests verify existing financial collections remain unchanged by reissue.

## PAYMENTREQUEST COMPLETION:

The hardened 3C.27/3C.27A completion authority was not weakened. Explicit persisted captured status, canonical Payment, provider identity, lineage, receipt-first authority, and verified evidence remain required; allocation remains optional at this boundary.

## PAY-ATOMIC COMPATIBILITY:

PAY-ATOMIC remains the sole verified provider financial-completion authority. Its tests remain green, including partial payment, overpayment, zero-capacity capture, duplicate identity replay, second genuine Payment, and rollback behavior.

## POSTGRESQL CONCURRENCY:

The active-request check and creation run inside the existing `persistenceAdapter.mutateState` authoritative boundary with reload/CAS/advisory-lock behavior. No process-local lock or separate persistence authority was introduced. Live multi-process PostgreSQL execution remains unverified.

## PROVIDER SIDE-EFFECT BOUNDARY:

Reissue creates only local collection intent. Razorpay Order creation remains a later explicit provider-intent operation outside the PostgreSQL transaction. The existing deterministic receipt/recovery path prevents blind retry and ensures Request B cannot reuse Request A's Order.

## API / SERVER BOUNDARY:

Added authenticated `POST /invoices/:invoiceId/payment-requests/reissue`. The route accepts intent metadata such as request key but does not permit the caller to choose authoritative remaining amount, currency, customer, provider Order, or persisted business lineage. No UI or delivery route was added.

## CALLER / CONSUMER SWEEP:

The existing PaymentRequest creation path, the new reissue path, and provider-intent path were audited. Active uniqueness is enforced at Store level, so direct Store/API callers cannot bypass it. No caller reopens completed/expired/cancelled requests, reuses provider Orders, derives from raw `Invoice.balanceAmount`, or creates financial effects during reissue.

## FOCUSED TESTS:

- PaymentRequest, allocation, reissue, and API tests: 36 passed, 0 failed.
- Provider intent, provider identity, PAY-ATOMIC, and persistence-authority tests: 35 passed, 0 failed.
- New coverage includes partial reissue, Credit Note reissue, stale caller amount rejection, zero capacity, active convergence, completed partial reissue, distinct provider-intent receipt, and HTTP reissue.

## REGRESSIONS:

Relevant serial regression completed with **257 passed, 0 failed, 0 skipped** across API, PaymentRequest, provider intent/identity, PAY-ATOMIC, allocation, Customer Advance, persistence, reporting, and authoritative mutation suites.

## LINT:

`npm run lint` passed.

## BUILD:

`npm run build` passed.

## POSTGRESQL REPORT VERIFICATION:

`npm run db:verify-reports` passed: normalized PostgreSQL report totals matched invoices, payments, PO/WO, and profit tables.

## DIFF CHECK:

`git diff --check` reported no content errors. Existing LF/CRLF warnings were non-failing.

## LIVE RAZORPAY:

UNVERIFIED — ENVIRONMENTAL. No live provider call was executed.

## LIVE POSTGRESQL:

UNVERIFIED — ENVIRONMENTAL. No live multi-process race was executed.

## ENVIRONMENTAL LIMITATIONS:

The pre-existing Android modification and unrelated/untracked workspace artifacts remain untouched. Historical Reports 80–86 were not modified. No live Razorpay or multi-process PostgreSQL environment was required for the structural/local acceptance work.

## BLOCKERS CLOSED:

Canonical remaining-balance derivation, one-active-request enforcement, explicit reissue, historical immutability, active replay/conflict behavior, API authorization, financial inertness, and provider-intent separation are implemented and locally verified.

## REMAINING BLOCKERS:

No implementation blocker was identified. Independent final acceptance is still required before any commit. Live Razorpay and live PostgreSQL remain environmental verification items.

## CANDIDATE COMMIT BOUNDARY:

Six implementation/test files:

1. `apps/api/src/store.js`
2. `apps/api/src/index.js`
3. `apps/api/src/server.js`
4. `tests/payment-request.test.js`
5. `tests/payment-request-provider-intent.test.js`
6. `tests/payment-atomic.test.js`

This report is documentation evidence and is intentionally also uncommitted pending acceptance decision.

## STAGING / COMMIT / PUSH:

NONE.

## REPORT:

Created Report 87 only. Report 86 and historical Reports 80–85 were not rewritten.

## FINAL VERDICT:

PHASE 3C.34 — IMPLEMENTATION COMPLETE — READY FOR FINAL ACCEPTANCE

STAGING / COMMIT / PUSH: NONE

## HISTORICAL ACCEPTANCE NOTE — 3C.34A:

The independent 3C.34 Final Acceptance subsequently found one narrow defect in the original implementation: unknown or malformed persisted PaymentRequest statuses were neither recognized as active nor as valid terminal states, so they could bypass the one-active-request lookup. Phase 3C.34 was therefore not commit-ready at that point. Phase 3C.34A hardens effective-status authority fail closed while preserving the valid active, completed, expired, and cancelled lifecycle semantics.
