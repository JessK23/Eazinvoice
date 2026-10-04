# EazInvoice Phase 3C.32 â€” ACCT-AR-OUTSTANDING-01A

## Canonical Invoice Outstanding / Receivable Capacity Authority

**Mode:** Implementation candidate; intentionally uncommitted
**Baseline:** `2170828d4977a17ef1c47f48b9fc6d96cee8a165`
**Branch:** `main`
**Target package:** `ACCT-AR-OUTSTANDING-01A`
**Verdict:** `IMPLEMENTATION COMPLETE â€” READY FOR INDEPENDENT ACCEPTANCE; NOT APPROVED FOR COMMIT`

## Historical correction note â€” Phase 3.32A

The subsequent independent Phase 3.32 acceptance found that this initial implementation had not yet closed the legacy direct Invoice Payment and legacy collection callers. In particular, `recordInvoicePaymentLocal` and legacy collection paths could still make capacity decisions from `calculatePaymentState` or raw `Invoice.balanceAmount` without the Credit Note-adjusted authority. Phase 3.32A corrected those callers surgically while preserving the distinction between capacity-bound legacy Payments and PAY-ATOMICâ€™s genuine captured-overpayment behavior. This report records the original 3.32 implementation candidate; Report 84 records the correction.

## Original defect and root cause

Phase 3.31 reproduced a material divergence:

```text
Invoice total:          â‚¹10,000
Posted Credit Note:      â‚¹2,000
True collectible A/R:    â‚¹8,000
Operational balance:    â‚¹10,000
```

`Invoice.balanceAmount` was a payment projection based on `calculatePaymentState` and effective payments. Posted Credit Notes correctly reduced Accounts Receivable in Accounting and were included by receivables reporting, but they did not participate in the operational capacity calculation. PaymentRequest creation, Payment Allocation, and PAY-ATOMIC therefore consumed an incomplete authority.

## Canonical outstanding authority selected

The implementation adds one Store/domain-level derived primitive, `invoiceOutstandingMinor(invoice)`. It is the single operational authority used by Invoice capacity consumers. It derives from authoritative state rather than caller-provided balances:

```text
Invoice face amount
- effective direct Invoice Payments and active Invoice Allocations
- applicable posted Credit Notes
+ governed processed Credit Note refunds
```

The result is zero-floored. The helper preserves the existing effective-payment and refund functions rather than creating a second receipt store or inventing new refund semantics.

## Invoice.balanceAmount

`Invoice.balanceAmount` remains a compatibility/read projection. It is refreshed from the canonical helper after Invoice payment refresh and after a posted Credit Note is created or posted through update. It no longer overrides the canonical value at financial mutation boundaries.

Invoice payment status remains compatible with existing lifecycle semantics. A finalized Invoice whose canonical capacity is zero is presented as paid; draft, deleted, cancelled, and void lifecycle treatment is not redesigned.

No destructive migration or historical Payment rewrite was introduced.

## Credit Note treatment

Applicable posted Credit Notes are included only when they match the Invoice source, business, customer lineage where present, and currency. Draft notes do not reduce capacity. A Credit Note currency must match its source Invoice currency at creation/update, so a cross-currency note cannot silently reduce Invoice capacity.

Credit Note Accounting remains unchanged: the existing governed journal reduces A/R. The new authority consumes that existing financial meaning; it does not create another journal.

## Payment Allocation treatment

Invoice Allocation validation now uses the canonical authority. Both constraints remain enforced:

```text
Allocation <= available Payment capacity
Allocation <= canonical Invoice receivable capacity
```

With a â‚¹10,000 Invoice and â‚¹2,000 posted Credit Note, a â‚¹9,000 allocation is rejected and an â‚¹8,000 allocation is accepted. Receipt-first Payment accounting, customer ownership, business/workspace isolation, currency checks, idempotency, and reversal behavior remain in their existing boundaries.

## PAY-ATOMIC adoption

PAY-ATOMIC now derives its safely allocable amount from the same canonical authority. A genuine captured â‚¹9,000 provider Payment against a â‚¹10,000 Invoice with a â‚¹2,000 Credit Note becomes:

```text
Canonical Payment:       â‚¹9,000
Invoice Allocation:      â‚¹8,000
Remaining Customer Advance: â‚¹1,000
```

The captured Payment is not discarded, the PaymentRequest is not rebound, and the existing provider/idempotency behavior remains unchanged.

## PaymentRequest compatibility

PaymentRequest creation now consumes the canonical Invoice capacity through `documentOutstandingMinor`. Remaining-balance PaymentRequest generation is not implemented here. This package only ensures that any future request is bounded by Credit Note-adjusted capacity.

## Legacy Payment and receipt-first Payment

Legacy Invoice-bound Payments continue to be represented through `effectiveInvoicePayments`; they are not converted into allocations and are not double-counted. Receipt-first Payments without an Allocation still do not reduce Invoice outstanding. They remain Customer Advance/unapplied receipts until an actual Allocation occurs.

## Reversals and refunds

Allocation reversals continue to flow through existing active-allocation filtering and accounting reversal behavior. Credit Note refunds are included through `customerRefundMinorForInvoice`, matching the existing governed A/R restoration semantics. Payment reversals and receipt refunds continue to use their existing effective-payment and Customer Advance authorities.

The implementation does not introduce a new reversal state machine. It relies on the existing append-only Credit Note/reversal/refund model and zero-floors collectible capacity.

## Zero floor and representative outcomes

The canonical authority now produces the required outcomes:

| Scenario | Result |
| --- | ---: |
| â‚¹10,000 Invoice, no activity | â‚¹10,000 outstanding |
| â‚¹10,000 Invoice, â‚¹2,000 Credit Note | â‚¹8,000 outstanding |
| â‚¹10,000 Invoice, â‚¹4,000 Allocation, â‚¹2,000 Credit Note | â‚¹4,000 outstanding |
| â‚¹10,000 Invoice, â‚¹10,000 Credit Note | â‚¹0 outstanding |
| â‚¹10,000 Invoice, â‚¹12,000 Credit Note | â‚¹0 outstanding; existing customer-credit treatment remains governed elsewhere |
| â‚¹10,000 Invoice, â‚¹2,000 Credit Note, â‚¹9,000 captured receipt | â‚¹8,000 Allocation + â‚¹1,000 unapplied |

The capacity derivation is event-order independent for the covered Credit Note and Allocation combinations because both are derived from authoritative state rather than decrementing a mutable balance blindly.

## Customer, business, workspace, and currency isolation

Credit Note inclusion requires the source Invoice and Credit Note to share business lineage, and customer lineage is checked when both sides carry a customer. Exact currency matching is enforced for the Credit Note and Invoice. Existing Payment/Allocation workspace, business, customer, and currency guards remain active.

The package does not add FX conversion or cross-workspace aggregation.

## Accounting relationship

Accounting is unchanged and remains authoritative for journal meaning:

```text
Invoice issue:   A/R recognition
Receipt:         Dr 1110 / Cr 2110 Customer Advance
Allocation:      Dr 2110 / Cr 1100 A/R
Credit Note:     existing governed A/R reduction
Legacy Payment:  existing governed direct A/R reduction
```

The Store authority now agrees with the Credit Note A/R reduction without posting journals merely to calculate capacity.

## Reporting relationship

No broad reporting rewrite was needed. Receivables reporting already incorporated posted Credit Notes and refunds. The implementation makes the operational Invoice projection, PaymentRequest capacity, Allocation capacity, and PAY-ATOMIC capacity agree with that established reporting result for the targeted scenarios.

## Persistence and concurrency

The helper is derived from authoritative state and is evaluated inside existing financial mutation boundaries. No second persistence authority or process-local financial lock was introduced. Existing PostgreSQL authoritative reload, transaction/advisory locking, row locking, CAS/versioned persistence, and rollback behavior remain unchanged.

Live multi-process PostgreSQL verification remains environmental and is not claimed by this report.

## Idempotency and failure atomicity

No new financial effect is created by re-evaluating outstanding. Existing Payment, provider identity, Allocation, Credit Note, reversal, refund, and PAY-ATOMIC idempotency paths remain in force. If canonical capacity rejects an Allocation, no allocation or journal is created. PAY-ATOMIC preserves genuine captured money as Payment/Customer Advance when Invoice capacity is lower than the captured amount.

## Historical compatibility

Existing `Invoice.balanceAmount`, direct Payments, receipt-first Payments, Payment Allocations, Credit Notes, reversals, refunds, and completed PaymentRequests remain readable. The package does not migrate historical Payments or reinterpret a legacy Payment as an Allocation.

## Focused implementation coverage

Added executable coverage for:

- posted Credit Note-adjusted Allocation capacity;
- rejection of a â‚¹9,000 Allocation against â‚¹8,000 true outstanding;
- valid â‚¹8,000 Allocation with â‚¹1,000 remaining Customer Advance;
- Credit Note-adjusted PaymentRequest reservation;
- PAY-ATOMIC â‚¹9,000 capture becoming â‚¹8,000 Allocation plus â‚¹1,000 unapplied.

## Regression results

The broad relevant serial regression completed with **263 passing tests, 0 failures**. The focused Allocation/Atomic suite completed with **27 passing tests, 0 failures**.

Additional checks passed:

- `npm run lint`;
- `npm run build`;
- `npm run db:verify-reports`;
- `git diff --check`.

The diff check emitted only the repositoryâ€™s existing LF-to-CRLF warnings, including the unrelated Android file; no whitespace error was reported.

## Exact implementation boundary

The package changes are:

- `apps/api/src/store.js` â€” canonical Invoice outstanding authority and adoption by Invoice projection, PaymentRequest, Allocation, PAY-ATOMIC, and Credit Note currency/projection paths;
- `tests/payment-allocation.test.js` â€” Credit Note capacity and PaymentRequest reservation coverage;
- `tests/payment-atomic.test.js` â€” Credit Note-adjusted PAY-ATOMIC overpayment coverage;
- `docs/eazinvoice-remediation-blueprint/82-phase-3c32-acct-ar-outstanding-01a-canonical-invoice-outstanding-authority-completion-report.md` â€” this report.

The pre-existing `android/app/build.gradle` modification and unrelated untracked artifacts are outside this package and were not touched.

Reports 75, 79, 80, and 81 were not modified.

## Environmental limitations

No live Razorpay was required. Live multi-process PostgreSQL concurrency remains **UNVERIFIED â€” ENVIRONMENTAL**. This does not replace the source-level requirement that the helper be evaluated within the existing authoritative mutation transaction.

## Remaining blockers

The implementation candidate must still pass the independent final acceptance gate. That gate should specifically attack:

1. Invoice â†’ Credit Note â†’ Allocation capacity;
2. Invoice â†’ Credit Note â†’ PAY-ATOMIC capacity and preservation of excess capture;
3. Credit Note and Allocation reverse-order equivalence;
4. Credit Note reversal/refund semantics;
5. cross-customer/business/workspace/currency isolation;
6. legacy Payment compatibility and no double counting;
7. authoritative transaction behavior under concurrent Credit Note and Allocation/PAY-ATOMIC mutation.

PAY-REQ-03A remaining-balance reissue remains intentionally outside this package.

## Staging / commit / push

**NONE.** The candidate is intentionally unstaged, uncommitted, and unpushed for independent acceptance.

## Final verdict

**3C.32 / ACCT-AR-OUTSTANDING-01A â€” IMPLEMENTATION COMPLETE â€” READY FOR INDEPENDENT FINAL ACCEPTANCE; NOT APPROVED FOR COMMIT**
