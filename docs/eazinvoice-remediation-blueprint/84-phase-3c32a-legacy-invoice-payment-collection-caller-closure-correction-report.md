# EazInvoice Phase 3.32A â€” ACCT-AR-OUTSTANDING-01A-CORR

## Legacy Invoice Payment and Collection Caller Closure

**Mode:** Surgical implementation candidate; intentionally uncommitted
**Baseline:** `2170828d4977a17ef1c47f48b9fc6d96cee8a165`
**Branch:** `main`
**Result:** `CORRECTION IMPLEMENTED â€” READY FOR COMBINED FINAL ACCEPTANCE`

## Original failure and root cause

Report 83 independently found that 3C.32 protected Payment Allocation, PAY-ATOMIC, and PaymentRequest, but not legacy direct Invoice Payment. The reproduced case was:

```text
Invoice:                       â‚¹10,000
Posted Credit Note:             â‚¹2,000
True canonical outstanding:     â‚¹8,000
Legacy direct Invoice Payment:  â‚¹9,000 accepted
```

`recordInvoicePaymentLocal` still validated through `calculatePaymentState` and `effectiveInvoicePayments` without Credit Note capacity. Legacy Razorpay order, HTTP payment, and payment-link callers also consumed raw/projection balance values.

## Canonical authority reuse

No second formula or financial authority was created. The correction reuses `invoiceOutstandingMinor(invoice)` from 3C.32 and exposes a scoped `getInvoiceOutstandingAmount` Store/API accessor for collection callers.

`calculatePaymentState` remains a legacy payment/status projection and was not changed globally, avoiding historical double counting.

## Legacy Invoice Payment

`recordInvoicePaymentLocal` retains the historical direct-to-A/R Payment model and basic input validation, then rejects the validated amount when it exceeds canonical Credit Note-adjusted capacity.

| Invoice | Credit Note | Legacy Payment | Result |
| ---: | ---: | ---: | --- |
| â‚¹10,000 | â‚¹2,000 | â‚¹9,000 | rejected; no Payment or journal |
| â‚¹10,000 | â‚¹2,000 | â‚¹8,000 | succeeds; outstanding â‚¹0 |
| â‚¹10,000 | â‚¹2,000 | â‚¹4,000 | succeeds; outstanding â‚¹4,000 |

Legacy over-capacity Payments remain rejected; they are not converted into receipt-first Customer Advance. Existing legacy `Dr Clearing / Cr A/R` accounting remains unchanged.

## Legacy Razorpay Order and payment-link callers

Legacy Invoice Razorpay order creation now obtains its amount through the canonical API accessor before the provider request. A â‚¹10,000 Invoice with a â‚¹2,000 Credit Note cannot create an Order for â‚¹9,000 or stale â‚¹10,000; maximum current amount is â‚¹8,000.

The legacy HTTP Invoice Payment route validates against the same accessor. `createInvoicePaymentLink` validates an explicit amount against canonical capacity and defaults to canonical capacity, while `recordGatewayPayment` uses the existing link amount or canonical fallback and remains subject to the legacy Payment guard.

No provider lifecycle redesign was introduced. Existing stale Orders/links are not mutated, and genuine captured evidence remains governed by the existing PAY-ATOMIC path where applicable.

## PAY-ATOMIC and receipt-first compatibility

PAY-ATOMIC was not changed or made identical to the legacy path. The accepted behavior remains:

```text
Invoice â‚¹10,000 âˆ’ Credit Note â‚¹2,000
Captured provider Payment â‚¹9,000

Payment:           â‚¹9,000
Allocation:        â‚¹8,000
Customer Advance:  â‚¹1,000
```

Receipt-first Payments may exceed Invoice capacity because genuine excess money remains Customer Advance. Legacy direct Payments remain capacity-bound.

## Credit Note ordering, full credit, and currency

Credit Note-before-payment and payment-before-Credit-Note use the same canonical capacity. Full and excess Credit Notes floor capacity at zero. Legacy Payment, Order, and link creation produce no positive collectible amount when capacity is zero. Existing append-only Credit Note correction/reversal semantics remain unchanged.

The correction preserves exact-currency, business, customer, workspace, and existing authorization guards. No FX or cross-tenant aggregation was introduced.

## Accounting, idempotency, persistence, and failure atomicity

Accounting was not redesigned:

```text
Legacy Payment:  Dr Clearing / Cr A/R
Receipt-first:   Dr Clearing / Cr Customer Advance
Allocation:      Dr Customer Advance / Cr A/R
Credit Note:     existing governed A/R reduction
```

Rejected legacy over-capacity validation occurs before Payment creation, so it creates no Payment, FinancialEvent, journal, Invoice mutation, A/R mutation, Customer Advance mutation, Allocation, or PaymentRequest mutation. Legacy Payment idempotency and provider identity remain unchanged; a rejected â‚¹9,000 attempt does not poison a valid â‚¹8,000 retry.

The existing authoritative persistence and PostgreSQL transaction boundaries are reused. No process-local financial lock or second persistence authority was introduced.

## Production caller sweep

The corrected financial callers are:

- `recordInvoicePaymentLocal` â€” canonical capacity guard;
- Store `createInvoicePaymentLink` â€” canonical explicit/default amount;
- Store `recordGatewayPayment` â€” canonical fallback plus legacy guard;
- API `getInvoiceOutstandingAmount` â€” scoped authority accessor;
- legacy Razorpay Invoice order creation â€” canonical amount before provider request;
- legacy HTTP Invoice Payment route â€” canonical validation before mutation.

Remaining `Invoice.balanceAmount` reads are compatibility, display, AI/reporting, persistence synchronization, or historical projection consumers and do not authorize new legacy collection amounts.

## Exact changed files

3C.32A changes:

- `apps/api/src/store.js`;
- `apps/api/src/index.js`;
- `apps/api/src/server.js`;
- `tests/payment-allocation.test.js`;
- Report 82 â€” historical correction note;
- this Report 84.

The existing 3C.32 files remain in the combined uncommitted candidate. Report 83 remains unchanged. Reports 75, 79, and 80 remain untouched. Android and unrelated workspace artifacts remain outside scope.

## Tests and checks

- Focused Allocation/Atomic suite: **29/29 passed**;
- broad relevant serial regression: **265/265 passed**;
- `npm run lint`: passed;
- `npm run build`: passed;
- `npm run db:verify-reports`: passed;
- `git diff --check`: passed, with only existing LF-to-CRLF warnings.

Coverage includes legacy â‚¹9,000 rejection, valid â‚¹8,000 payment, canonical payment-link amount, Credit Note-adjusted Allocation/PaymentRequest, and PAY-ATOMIC captured-overpayment preservation.

## Environmental limitations and remaining blockers

Live multi-process PostgreSQL concurrency remains **UNVERIFIED â€” ENVIRONMENTAL**. No live Razorpay was required. The candidate still requires an independent combined final acceptance gate that rescans all legacy callers and replays the direct-payment, collection-initiation, and PAY-ATOMIC distinction.

## Staging / commit / push

**NONE.** The combined 3C.32 + 3C.32A candidate is intentionally unstaged, uncommitted, and unpushed.

## Final verdict

**PHASE 3C.32A â€” CORRECTION IMPLEMENTED â€” READY FOR COMBINED FINAL ACCEPTANCE**
