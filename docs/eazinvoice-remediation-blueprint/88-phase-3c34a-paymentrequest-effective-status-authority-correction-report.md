# PHASE 3C.34A / PAY-REQ-03A-CORR — STRICT PAYMENTREQUEST EFFECTIVE-STATUS AUTHORITY

## BASELINE:

- Branch: `main`
- `HEAD`: `cf9aef02b3d4180d2a3c4d29a39663c6972dbfd6`
- `origin/main`: `cf9aef02b3d4180d2a3c4d29a39663c6972dbfd6`
- Existing Phase 3C.34 candidate remained intact and unstaged.

## ORIGINAL DEFECT:

The 3C.34 acceptance found that arbitrary unknown PaymentRequest statuses were returned unchanged by `paymentRequestEffectiveStatus()`. They were therefore neither effective `active` nor recognized terminal history, allowing the active-request lookup to skip them and permit a second collection authority for the same business + Invoice.

## ROOT CAUSE:

Status normalization accepted any non-empty string as a lifecycle status. The one-active-request check compared only with `active`, so missing, blank, malformed, and unknown persisted status values were ambiguous but treated as safely absent from active authority.

## VALID STATUS AUTHORITY:

The repository-established PaymentRequest lifecycle statuses are `active`, `completed`, `expired`, and `cancelled`. Active expiry remains derived from `expiresAt`; no new lifecycle status was introduced.

## FAIL-CLOSED STATUS RULE:

`paymentRequestEffectiveStatus()` now returns `unknown` for missing, null, blank, whitespace-only, malformed, or arbitrary unknown persisted status. Collection authority paths call a strict status assertion and block ambiguous requests. Historical records are not mutated, deleted, or silently normalized.

## ORDINARY CREATE BEHAVIOR:

Ordinary PaymentRequest creation now checks for ambiguous status before request-key replay and active creation. A different request key cannot bypass an ambiguous existing request. Valid active requests still replay or reject deterministically according to the existing compatibility rules.

## REISSUE BEHAVIOR:

Explicit remaining-balance reissue uses the same strict authority through the existing Store mutation. Ambiguous requests block reissue; valid completed, expired, and cancelled requests still permit a new request when canonical outstanding is positive.

## REQUEST-KEY IDEMPOTENCY:

Valid same-key compatible replay and conflicting-intent rejection remain unchanged. Request-key behavior cannot override ambiguous lifecycle authority or Invoice-level active uniqueness.

## PROVIDER-ORDER SAFETY:

Provider-intent initiation, binding, recovery, failure handling, and evidence resolution now reject ambiguous request status before creating or binding new provider authority. Existing Razorpay recovery behavior is unchanged; no new provider Order is created by a rejected ambiguous-status attempt.

## FINANCIAL INERTNESS:

The correction creates or mutates no Payment, Allocation, Customer Advance, A/R, FinancialEvent, Journal, JournalLine, Invoice financial balance, Banking, or settlement state.

## PAY-ATOMIC COMPATIBILITY:

PAY-ATOMIC was not modified. Exact payment, partial payment, overpayment, zero-allocation capture, late capture, second genuine Payment, Customer Advance, and completion regressions remain green.

## CANONICAL OUTSTANDING COMPATIBILITY:

The Credit Note-adjusted canonical outstanding authority was not changed. Valid reissue continues to derive current capacity from that authority rather than raw `Invoice.balanceAmount`, historical request amount, or provider data.

## TENANT ISOLATION:

Ambiguous status checks are scoped to the same persisted Invoice and business. Existing business, workspace, Invoice, customer, currency, and provider lineage checks remain unchanged.

## CONCURRENCY:

The status assertion and one-active-request decision remain inside the existing authoritative PostgreSQL mutation boundary. No process-local lock or second persistence authority was introduced. Live multi-process PostgreSQL remains unverified.

## TESTS:

- Focused PaymentRequest/provider/PAY-ATOMIC/allocation/Customer Advance suite: **76 passed, 0 failed**.
- Added executable coverage for undefined, null, blank, whitespace, unknown, and malformed statuses across ordinary create, reissue, and provider-intent initiation.
- Added positive controls for completed, expired, and cancelled reissue.
- Confirmed no provider intent is created when ambiguous status blocks initiation.

## REGRESSIONS:

Relevant serial regression: **259 passed, 0 failed, 0 skipped**.

## LINT:

`npm run lint` passed.

## BUILD:

`npm run build` passed.

## POSTGRESQL REPORT VERIFICATION:

`npm run db:verify-reports` passed; normalized PostgreSQL report totals matched.

## DIFF CHECK:

`git diff --check` passed with only non-failing LF/CRLF warnings.

## ENVIRONMENTAL LIMITATIONS:

Live Razorpay and live multi-process PostgreSQL were not executed. Android and unrelated/untracked workspace artifacts were not modified.

## REPORT 87:

Report 87 was updated with a historical acceptance note stating that original 3C.34 was not commit-ready because of the malformed-status bypass and that 3C.34A repaired it. Its original implementation conclusion was not rewritten.

## EXACT CHANGED-FILE BOUNDARY:

Combined 3C.34 + 3C.34A candidate:

1. `apps/api/src/store.js`
2. `apps/api/src/index.js`
3. `apps/api/src/server.js`
4. `tests/payment-request.test.js`
5. `tests/payment-request-provider-intent.test.js`
6. `tests/payment-atomic.test.js`
7. `docs/eazinvoice-remediation-blueprint/87-phase-3c34-pay-req-03a-remaining-balance-paymentrequest-reissue-authority-completion-report.md`
8. `docs/eazinvoice-remediation-blueprint/88-phase-3c34a-paymentrequest-effective-status-authority-correction-report.md`

## STAGING / COMMIT / PUSH:

NONE.

## FINAL VERDICT:

PHASE 3C.34A — CORRECTION IMPLEMENTED — READY FOR COMBINED FINAL ACCEPTANCE

No staging, commit, or push was performed.

STAGING / COMMIT / PUSH: NONE
