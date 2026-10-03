# PHASE 3C.18A — PAY-REQ-02B-CORR Provider Intent Unknown-Outcome and Orphan Recovery Correction Report

## 1. Baseline

- Branch: `main`
- `HEAD`: `5c48067e1d035e55f725deb9beb07ab06c094cd4`
- `origin/main`: `5c48067e1d035e55f725deb9beb07ab06c094cd4`
- 3C.18 remains uncommitted.
- No files were staged, committed, or pushed.

## 2. Original defects

The independent 3C.18 acceptance gate found that all transport/provider errors were effectively retryable failures. A timeout could therefore cause a second Razorpay order even if the first request had been accepted. The gate also found that a Razorpay-success/local-persistence failure left only theoretical receipt/notes lineage: no implemented server-side resolver could bind an orphan order back to PaymentRequest, Invoice, and business.

## 3. Corrected state machine

The provider-intent states are now:

`none → creating → created`

`creating → failed` only for a classified definite provider rejection.

`creating → recovery_required` for transport uncertainty, malformed/ambiguous responses, provider success followed by local binding failure, lookup ambiguity, or recovery mismatch.

`created` is immutable. `failed` may be retried only when the provider definitively rejected creation. `creating` and `recovery_required` never create a replacement order blindly.

## 4. Definite provider failure

The Razorpay helper classifies selected deterministic 4xx rejection responses as `definite_failure`. These may transition to `failed`. The API returns a generic safe failure message and creates no financial effect.

## 5. Unknown provider outcome

Network interruption, timeout, 5xx response, malformed success, missing provider order ID, or any non-conclusive transport condition is classified as unknown. The route transitions the intent to `recovery_required`, blocks new order creation, and returns an explicit recovery-required response.

## 6. Deterministic receipt

The receipt remains `eaz_preq_<PaymentRequest ID>` with a stable bounded length. It is generated from authoritative PaymentRequest identity before the external call and does not change on retry or recovery.

## 7. Provider notes / lineage

Razorpay order notes contain only authoritative non-secret identifiers: `paymentRequestId`, `invoiceId`, and `businessId`. No secret, credential, or browser-controlled identity is included.

## 8. Recovery mechanism

The provider-intent route now performs server-side Razorpay order lookup by the deterministic receipt when a PaymentRequest is `creating` or `recovery_required`. Exactly one matching order is required. The existing order is then rebound through the authoritative PaymentRequest mutation path.

Zero matches do not authorize a new order. Multiple matches fail closed as ambiguous. Recovery validates provider order ID, amount, currency, receipt, and any returned PaymentRequest/Invoice/business notes before binding.

## 9. Stale creating recovery

A persisted `creating` state is treated as a recovery candidate on a later initiation attempt. It is never interpreted as permission to call Razorpay again. The route first performs deterministic lookup and either binds one verified existing order or leaves the request recovery-required.

## 10. Provider success/local persistence failure

If Razorpay returns an order but local binding persistence rejects, the caller receives failure and the subsequent authoritative state remains or becomes recovery-required. A later request performs receipt lookup rather than creating a second order. No financial mutation occurs.

## 11. Amount/currency validation

Recovery requires provider amount to equal the PaymentRequest amount in minor units and provider currency to equal the PaymentRequest currency. Receipt and safe provider notes must also match. Mismatches remain recovery-required and are never rebound.

## 12. Tenant validation

Recovered provider evidence must match the immutable PaymentRequest, Invoice, business, and workspace lineage. Business credentials are resolved from that authoritative business; platform credentials are never used.

## 13. Cancellation behavior

Cancellation remains blocked for `creating`, `created`, and `recovery_required`. Uncertain provider lineage cannot be erased.

## 14. Expiry behavior

Expired requests cannot create a new provider order. Existing `creating`, `created`, or `recovery_required` lineage remains eligible for safe lookup/recovery and is not destroyed by expiry.

## 15. Financial non-effects

This correction creates no Payment, Payment Allocation, PaymentRequest completion, refund, reversal, journal, ledger event, bank receipt, settlement, fee, tax, or reconciliation effect.

## 16. Tests

The focused provider-intent suite now covers:

- normal creation and replay;
- known provider rejection;
- unknown outcome and retry blocking;
- deterministic receipt;
- matching provider recovery;
- amount/lineage mismatch;
- stale creating recovery;
- expired uncertain lineage;
- local created-state persistence failure;
- cancellation and financial non-effects.

## 17. Regression results

- Correction provider-intent suite: **9 passed, 0 failed**.
- Combined API, PaymentRequest, credential, Razorpay, persistence, and Payment Allocation suite: **206 passed, 0 failed**.
- Full serial suite: **386 passed, 1 known environmental PostgreSQL registry failure, 1 existing live PostgreSQL concurrency test skipped**.
- Lint: PASS.
- Build: PASS.
- Mobile check: PASS, 8/8.
- PostgreSQL report verification: PASS.
- `git diff --check`: PASS.

## 18. Live Razorpay

**UNVERIFIED — ENVIRONMENTAL.** Provider HTTP was controlled in tests; no live credentials were used.

## 19. Live PostgreSQL

**UNVERIFIED — ENVIRONMENTAL.** The existing authoritative mutation boundary is reused, but live multi-process verification was unavailable.

## 20. Exact files changed

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `apps/api/src/server.js`
- `tests/payment-request-provider-intent.test.js`
- `docs/eazinvoice-remediation-blueprint/61-phase-3c18-paymentrequest-razorpay-provider-intent-binding-completion-report.md`
- `docs/eazinvoice-remediation-blueprint/62-phase-3c18a-provider-intent-unknown-outcome-orphan-recovery-correction-report.md`

`android/app/build.gradle` and unrelated workspace artifacts remain excluded.

## 21. Proposed combined commit boundary

Commit the six files above atomically only after the combined final acceptance gate. Do not include Android or unrelated artifacts.

## 22. Staging / commit / push

None performed.

## 23. Final verdict

**PHASE 3C.18A — CORRECTION IMPLEMENTED — READY FOR COMBINED FINAL ACCEPTANCE**

## 24. 3C.18B correction addendum

The subsequent combined acceptance identified two residual issues that were outside this report's original route-recovery scope: the Razorpay webhook did not resolve provider evidence through `PaymentRequest → Invoice → business/workspace`, and the provider helper classified selected 4xx responses as definite non-creation without sufficient repository evidence.

3C.18B addresses those residual issues by adding a canonical authoritative provider-evidence resolver, wiring identification-only resolution into the webhook path, adding workspace/business lineage to provider notes, and making non-2xx provider responses conservatively `unknown` unless a narrower provider-specific proof is later established. This report remains historically accurate for 3C.18A; the combined acceptance boundary must include the 3C.18B changes and Report 63.
