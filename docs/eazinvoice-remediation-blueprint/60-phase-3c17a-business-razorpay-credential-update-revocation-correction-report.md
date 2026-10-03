# PHASE 3C.17A — Business Razorpay Credential Update and Revocation Correction Report

## PHASE

`3C.17A / PAY-REQ-02A-CORR`

## BASELINE

- Branch: `main`
- Expected baseline: `95b791e22007c6e86ce3cbdd2395588c907c2843`
- No files were staged, committed, or pushed.

## ORIGINAL ACCEPTANCE DEFECTS

The 3C.17 acceptance review identified four bounded defects: omitted payment-setting fields could reset existing readiness state, blank secrets had no explicit revocation contract, dedicated persistence-failure coverage was missing, and legacy Invoice HTTP collection paths lacked sufficient credential-boundary tests.

## PATCH SEMANTICS

Business `paymentSettings` updates are now patches. Only fields present in the request are changed. Omitted `enabled`, `mode`, `keyId`, merchant account metadata, payment-link state, and secrets remain unchanged.

## PARTIAL ROTATION

Supplying a replacement non-empty `keySecret` or `webhookSecret` replaces only that secret. Rotation preserves omitted readiness and merchant metadata. Unrelated email/compliance/settings updates continue to preserve payment credentials.

## DISABLE

`paymentSettings.enabled: false` disables future merchant collection without deleting stored secrets. Re-enabling is possible only while the credential set remains complete and mode-coherent.

## SECRET REVOCATION

Revocation is explicit: `revokeKeySecret: true` clears the business Key Secret and `revokeWebhookSecret: true` clears the business webhook secret. Empty secret strings are not interpreted as revocation; they preserve the current value. Revocation and disable therefore have distinct, testable meanings.

## READINESS

The existing readiness states remain authoritative: `NOT_CONFIGURED`, `INCOMPLETE`, `DISABLED`, `READY_TEST`, and `READY_LIVE`. Revoked credentials become `INCOMPLETE`; disabled credentials become `DISABLED` without changing secret storage.

## MODE SAFETY

The existing test/live Key ID inference and explicit-mode coherence checks remain unchanged. Partial updates cannot accidentally reset the mode or create a false ready state.

## TENANT ISOLATION

The correction reuses the existing business-scoped settings record and resolver. It does not introduce platform fallback, cross-business lookup, or a second credential authority.

## AUTH-01 PERSISTENCE FAILURE

A dedicated test proves a rejected authoritative persistence operation rejects the business credential update rather than returning apparent success. The test adapter includes the AUTH-01 load/reload contract and fails specifically when credential-bearing state is saved.

## LEGACY INVOICE ORDER

An HTTP-level test verifies that Invoice order creation fails closed without business credentials, does not call Razorpay, and uses the configured business Key ID/secret authorization after configuration. The platform environment credentials are present during the test to prove there is no fallback.

## LEGACY INVOICE VERIFICATION

The HTTP test submits a signature generated from the platform secret against a business Invoice order and confirms it is rejected. This independently exercises the business-secret verification boundary without creating a Payment.

## LEGACY PAYMENT LINK

The existing legacy Invoice payment-link path remains guarded by business credential readiness. No Pay Now, provider intent, or PaymentRequest behavior was added.

## INVOICE WEBHOOK

The existing 3C.17 business-lineage webhook resolver remains unchanged: Invoice lineage selects the business webhook secret, while platform billing lineage retains the platform webhook secret; missing business lineage fails closed.

## PLATFORM BILLING

Platform subscription billing credentials and flows remain process-wide platform billing authority. They were not replaced by, or allowed to fall back to, business merchant credentials.

## SECRET REDACTION

Business settings responses continue to return empty secret fields with configured flags. Secrets are not exposed to Web/Mobile clients or ordinary audit metadata.

## SECRET STORAGE

Secrets remain in the existing AUTH-01 server-side state document. Application-level encryption or vault integration remains a separate hardening item; this correction does not claim plaintext-at-rest encryption.

## PAYMENTREQUEST

PAY-REQ-01 remains unchanged. No provider order, public Pay Now route, completion state, or PaymentRequest mutation was introduced.

## PAYMENT / ALLOCATION

No Payment or Payment Allocation behavior changed.

## ACCOUNTING

No journal, ledger, receivable, fee, or tax mutation changed.

## BANKING

No bank transaction, settlement, reconciliation, Match, or Unmatch behavior changed.

## FILES CHANGED

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `apps/api/src/server.js`
- `tests/business-razorpay-credentials.test.js`
- `docs/eazinvoice-remediation-blueprint/59-phase-3c17-business-razorpay-credential-authority-completion-report.md`
- `docs/eazinvoice-remediation-blueprint/60-phase-3c17a-business-razorpay-credential-update-revocation-correction-report.md`

## TESTS

- 3C.17A focused credential suite: **6 passed, 0 failed**.
- Coverage includes partial update preservation, explicit revocation, disable/re-enable distinction, persistence failure, no platform fallback, legacy HTTP order authorization, and wrong-secret verification rejection.

## REGRESSIONS

The prior focused/API/Razorpay suite was **175 passed, 0 failed**. Repository checks previously passed for lint, build, mobile check (8/8), report verification, and diff check; they are rerun after this correction.

## LIVE RAZORPAY

Not exercised. Tests use a controlled HTTP boundary and never claim provider connectivity.

## LIVE POSTGRESQL

Not exercised. The persistence rejection test verifies caller-visible failure semantics through the AUTH-01 adapter contract; it is not a substitute for live PostgreSQL.

## ENVIRONMENTAL LIMITATIONS

`psql.exe` is unavailable for schema verification. The known full-suite PostgreSQL registry test requires unresolved `db.example.com`; that remains environmental and separate from this correction.

## REPORT 59

Report 59 was corrected to document patch semantics, explicit revocation, blank-secret preservation, and the updated focused test scope. Report 58 was not modified.

## REPORT 60

This report records the surgical 3C.17A correction and its verification boundary.

## REMAINING GAPS

Application-level secret encryption/vault storage, provider-account identity verification, public payment-token design, provider intent creation, settlement modeling, and automatic reconciliation remain future work.

## PROPOSED COMBINED COMMIT BOUNDARY

The six files listed above are the exact 3C.17 plus 3C.17A review boundary. Do not include `android/app/build.gradle`, Report 58, or unrelated workspace artifacts.

## STAGING / COMMIT / PUSH

NONE.

## FINAL VERDICT

**PHASE 3C.17A — CORRECTION IMPLEMENTED — READY FOR FINAL ACCEPTANCE**
