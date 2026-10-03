# Phase 3C.27A / PAY-REQ-02C-GUARD-CORR — Strict Captured Payment Status Authority

## Status

Correction implemented against baseline `0a77726a2b814accd0ac28e760af98c4c68f7eec`. Nothing was staged, committed, pushed, reset, or cleaned. PAY-ATOMIC-01 remains untouched.

## Defect corrected

The 3C.27 completion guard used `normalizeRecordStatus(payment.status, "captured")`. That helper's fallback made a missing or blank persisted status appear captured. A malformed or incomplete Payment could therefore authorize PaymentRequest completion despite having no explicit captured authority.

## Strict authority rule

Prospective completion now reads status only from the persisted canonical Payment resolved by Payment ID. The local guard trims and lowercases that persisted value and accepts it only when it equals `captured`. It does not supply a default. Caller input, including a caller-supplied `status`, cannot override the persisted Payment.

The following fail closed: absent, `undefined`, `null`, empty, whitespace-only, `authorized`, `created`, `pending`, `failed`, `refunded`, `cancelled`, and unknown values. An explicitly persisted `captured` value succeeds; existing normalization conventions permit case and surrounding whitespace without changing the global status helper.

## Boundaries preserved

- Canonical Payment, provider identity, business/workspace/customer/currency/Invoice lineage, and receipt-first accounting proof remain required.
- Allocation remains optional. This guard still does not decide partial payment, overpayment, late payment, already-paid invoices, or second genuine payments.
- Completion still creates no Payment, Allocation, Invoice balance effect, receipt journal, Customer Advance journal, settlement, or Banking mutation.
- Same-Payment completion replay remains idempotent; conflicting Payment/provider references remain rejected.
- Legacy completed requests remain readable; the stricter rule applies to prospective completion.
- PAY-ATOMIC-01, provider webhook financial processing, settlement, UI, QR/UPI, and tier work remain excluded.

## Verification scope

Focused regressions cover absent, null, blank, whitespace, non-captured, refunded, failed, and unknown persisted statuses; explicit captured status; and a caller status that conflicts with the persisted status. The existing valid completion, replay, conflict, lineage, receipt-authority, provider-intent, and persistence tests remain in scope.

Verification completed: focused PaymentRequest/provider suite **24/24 passed**; established serial regression suite **251/251 passed**; `npm run lint` passed; `npm run build` passed; `npm run db:verify-reports` passed; and `git diff --check` passed. Live Razorpay and live multi-process PostgreSQL execution remain environmental verification items, not structural acceptance claims.

## Candidate boundary

- `apps/api/src/store.js`
- `tests/payment-request.test.js`
- `tests/payment-request-provider-intent.test.js`
- `docs/eazinvoice-remediation-blueprint/76-phase-3c27-paymentrequest-financial-completion-authority-hardening-report.md`
- `docs/eazinvoice-remediation-blueprint/77-phase-3c27a-strict-captured-payment-status-authority-correction-report.md`

Report 75 is intentionally excluded, unmodified, untracked, and unstaged. No staging, commit, or push is authorized by this correction package. The next step after verification is the combined 3C.27 + 3C.27A final acceptance gate, followed only then by a commit decision and a fresh PAY-ATOMIC-01 readiness review against the new baseline.
