# EazInvoice Phase 3.32 + 3.32A Combined Final Acceptance

**Mode:** Read-only independent adversarial acceptance
**Baseline:** `2170828d4977a17ef1c47f48b9fc6d96cee8a165`
**Branch:** `main`
**Verdict:** `READY TO COMMIT`

## Boundary and baseline

`HEAD == origin/main` at the expected baseline. The staged index is empty. The combined candidate consists of the 3.32/3.32A production changes, focused tests, Report 82 with its historical correction note, and Report 84. Report 83 remains unchanged and historical. Reports 75, 79, 80, and 81, Android changes, and unrelated workspace artifacts remain outside the candidate.

No files were modified by this acceptance gate.

## Canonical authority

`invoiceOutstandingMinor(invoice)` is the single Store-level Credit Note-adjusted receivable-capacity authority. It derives from effective direct Invoice Payments, active Allocations, applicable posted Credit Notes, governed refunds, and a zero floor. `Invoice.balanceAmount` remains a refreshed compatibility projection.

PaymentRequest, Payment Allocation, PAY-ATOMIC, legacy direct Invoice Payment, legacy payment-link creation, legacy HTTP payment validation, and legacy Razorpay Invoice Order amount selection all consume this authority. Remaining raw `balanceAmount` reads are display, AI, reporting, persistence synchronization, or compatibility consumers and do not authorize new financial collection capacity.

## Independent adversarial money-path results

| Path | Adversarial case | Result |
| --- | --- | --- |
| Legacy direct Payment | â‚¹10,000 Invoice âˆ’ â‚¹2,000 Credit Note; attempt â‚¹9,000 | **Rejected**, with no Payment/journal/effect |
| Legacy direct Payment | Same state; attempt â‚¹8,000 | **Accepted** using existing direct-to-A/R semantics |
| Legacy collection/link | Same state; request â‚¹9,000 or stale â‚¹10,000 | **Rejected**; canonical maximum is â‚¹8,000 |
| PAY-ATOMIC | Genuine captured â‚¹9,000 against â‚¹8,000 true A/R | **Preserved**: â‚¹9,000 Payment, â‚¹8,000 Allocation, â‚¹1,000 Customer Advance |

This deliberate distinction is intact: legacy direct Payments remain capacity-bound, while genuinely captured provider money is never discarded.

## Acceptance checklist

1. YES â€” baseline, branch, synchronized HEAD, and empty index.
2. YES â€” exact combined candidate boundary; Android excluded.
3. YES â€” Report 83 unchanged; Reports 75/79/80/81 untouched.
4. YES â€” canonical authority exists and includes posted Credit Notes once.
5. YES â€” operational capacity and A/R reporting agree at â‚¹8,000.
6. YES â€” legacy â‚¹9,000 Payment rejects before mutation.
7. YES â€” rejected Payment creates no Payment, FinancialEvent, journal, Invoice effect, A/R effect, Allocation, or Customer Advance.
8. YES â€” exact â‚¹8,000 and partial â‚¹4,000 legacy Payments preserve direct-to-A/R accounting.
9. YES â€” legacy path creates no Customer Advance.
10. YES â€” PAY-ATOMIC preserves â‚¹9,000, allocates â‚¹8,000, and leaves â‚¹1,000 Advance.
11. YES â€” direct Allocation cannot exceed true A/R.
12. YES â€” legacy Order/link/HTTP collection paths use canonical capacity.
13. YES â€” PaymentRequest capacity remains capped at â‚¹8,000.
14. YES â€” full/excess Credit Notes floor capacity at zero.
15. YES â€” Payment/Credit Note ordering, replay, idempotency, failure atomicity, customer/business/workspace isolation, and currency guards remain coherent.
16. YES â€” Accounting, A/R, GL, Trial Balance, and reporting boundaries remain unchanged and coherent.
17. YES â€” no PAY-REQ-03, Banking, settlement, QR, UPI, UI, Mobile, or unrelated scope leakage.
18. YES â€” `calculatePaymentState` no longer bypasses a material financial capacity decision.
19. YES â€” no unexplained raw `balanceAmount` financial-capacity consumer remains.
20. YES â€” AUTH-01 persistence and existing PostgreSQL transaction architecture preserved; no process-local financial lock added.
21. UNVERIFIED â€” live multi-process PostgreSQL execution remains environmental.

## Tests and checks

Independently executed:

- focused Allocation/Atomic suite: **29/29 passed**;
- broad relevant serial regression: **265/265 passed**;
- `npm run lint`: passed;
- `npm run build`: passed;
- `npm run db:verify-reports`: passed;
- `git diff --check`: passed, with only existing LF-to-CRLF warnings.

The focused tests execute production boundaries for legacy over-capacity rejection, exact legacy payment, canonical payment-link capacity, Credit Note-adjusted PaymentRequest/Allocation, and PAY-ATOMIC captured-overpayment preservation.

## Report history

- Report 82: historically corrected to record the original acceptance failure and 3.32A repair;
- Report 83: unchanged failed-acceptance evidence;
- Report 84: correction completion report;
- Report 85: this combined acceptance.

## Approved commit boundary

Approved for commit after user-controlled staging verification:

- `apps/api/src/store.js`;
- `apps/api/src/index.js`;
- `apps/api/src/server.js`;
- `tests/payment-allocation.test.js`;
- `tests/payment-atomic.test.js`;
- `docs/eazinvoice-remediation-blueprint/82-phase-3c32-acct-ar-outstanding-01a-canonical-invoice-outstanding-authority-completion-report.md`;
- `docs/eazinvoice-remediation-blueprint/84-phase-3c32a-legacy-invoice-payment-collection-caller-closure-correction-report.md`.

Report 83 is historical evidence and is not part of the approved implementation boundary. Report 85 is the acceptance record and should be handled according to the repositoryâ€™s report-commit convention.

Recommended commit message:

```text
feat(accounting): enforce canonical credit-adjusted invoice outstanding
```

## Live PostgreSQL

**UNVERIFIED â€” ENVIRONMENTAL.** No live multi-process PostgreSQL race run was available. Structural authoritative reload/lock/CAS/persistence boundaries remain intact.

## Staging / commit / push

**NONE.** This gate performed no staging, commit, or push.

## Final verdict

**PHASE 3C.32 + 3C.32A COMBINED FINAL ACCEPTANCE â€” READY TO COMMIT**
