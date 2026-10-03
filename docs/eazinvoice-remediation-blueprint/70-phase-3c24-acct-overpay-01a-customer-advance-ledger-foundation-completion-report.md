# Phase 3C.24 / ACCT-OVERPAY-01A — Customer Advance / Unapplied Receipt Ledger Foundation

## Status

Implementation complete for final acceptance. This report is intentionally uncommitted and is part of the proposed Phase 3C.24 evidence boundary.

Baseline before this package: `c578876c9a24ec913192ed2ce26955968d18abd3`.

No files were staged, committed, or pushed. Reports 67–69 were preserved unchanged.

## Implemented boundary

The package adds the smallest receipt-first Accounting foundation needed before a future unapplied customer-payment workflow:

- Adds governed system account `2110`, `Customer Advances / Unapplied Customer Receipts`, as a current-liability account with role `customer_advances`.
- Adds the canonical receipt posting primitive:
  - Debit `1110 Bank / Payment Clearing`.
  - Credit `2110 Customer Advances / Unapplied Customer Receipts`.
- Adds the canonical Invoice allocation posting primitive:
  - Debit `2110 Customer Advances / Unapplied Customer Receipts`.
  - Credit `1100 Accounts Receivable`.
- Uses the existing `financialEvents` and immutable accounting-journal authority for idempotent replay.
- Requires Payment customer ownership and validates customer/business lineage before either receipt or allocation posting.
- Derives unapplied availability from canonical Payment amount, active Payment Allocations, effective source-payment refunds, and effective payment reversals; no second receipt store was introduced.
- Copies `invoice.customerId` onto newly recorded Invoice-bound Payments, while leaving existing Payment records readable and preserving their direct-payment lineage.

The new store methods are accounting primitives for the next atomic completion package. They are not exposed as a public Pay Now, gateway, Banking, or manual receipt workflow in this package.

## Historical acceptance and 3C.24A correction

3C.24 did not pass its original final-acceptance gate. That gate correctly found that allocation reversal, receipt/refund reduction, and receipt-authority enforcement were incomplete. Phase 3C.24A corrected those defects in place by adding source-linked, idempotent reversal/refund journals, refund-aware derived capacity, strict receipt-authority validation before Customer Advance → A/R posting, and conflict checks for canonical reversal/refund retries.

The corrected candidate remains uncommitted and requires a combined 3C.24 + 3C.24A acceptance gate.

## Compatibility decision

Existing Invoice Payments continue to use `postPaymentCaptured` (`Dr Bank / Payment Clearing → Cr Accounts Receivable`). Existing allocations are not automatically reposted through Customer Advance, because doing so would double-count historical direct Invoice Payments. The receipt-first primitives are therefore explicit and composable by the future PAY-OVERPAY-01A / PAY-ATOMIC flow, which will create and post a receipt-first Payment as one authoritative mutation.

No PaymentRequest completion, provider verification, settlement, Banking reconciliation, or customer-credit redemption was added. Existing legacy Invoice Payment and Credit Note refund paths remain separate; receipt-first refunds and reversals use their own Customer Advance reductions.

## Verification

Focused regression coverage passes for:

- Customer Advance account classification and code.
- Balanced receipt-first journal directions.
- Balanced allocation transition directions.
- Customer/business ownership rejection.
- Receipt and allocation idempotent replay without duplicate journals.
- Derived unapplied amount after a partial allocation.
- Preservation of Invoice customer lineage.
- Allocation reversal restores Customer Advance and capacity without recreating cash.
- Receipt-first refund/reversal reduces Customer Advance and cannot make it negative.
- Missing receipt authority and conflicting retry payloads fail closed.

The original 3C.24 run passed 201 tests but was rejected by acceptance. The corrected focused suite and relevant serial regressions pass; JavaScript syntax checks for `accounting-service.js` and `store.js`, plus `git diff --check`, also pass.

Live PostgreSQL execution was not available in this environment. The primitives use the existing `mutateState`/authoritative transaction boundary when that adapter is present, but live cross-process verification remains for the final acceptance gate.

## Proposed atomic boundary

1. `apps/api/src/accounting-service.js`
2. `apps/api/src/store.js`
3. `tests/customer-advance-accounting.test.js`
4. This completion report

The next step is a read-only final acceptance gate for ACCT-OVERPAY-01A, with special attention to real Accounting-service authority, replay semantics, legacy-payment non-regression, customer ownership, and the PostgreSQL transaction path.
