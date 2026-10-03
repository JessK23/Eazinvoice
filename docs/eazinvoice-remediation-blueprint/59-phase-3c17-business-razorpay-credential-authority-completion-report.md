# PHASE 3C.17 — PAY-REQ-02A Business Razorpay Credential Authority Completion Report

## 1. Baseline

- Branch: `main`
- `HEAD`: `95b791e22007c6e86ce3cbdd2395588c907c2843`
- `origin/main`: `95b791e22007c6e86ce3cbdd2395588c907c2843`
- No files were staged, committed, or pushed.
- Report 58 was not modified.
- Pre-existing unrelated workspace artifacts remain untouched.

## 2. Original credential problem

The existing Razorpay helper read `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` process-wide. That is appropriate for EazInvoice collecting its own subscriptions, but unsafe for a business receiving money from its own Invoice customers. Existing Business Settings already stored merchant settings, but Invoice order, verification, and webhook paths did not use them.

## 3. Platform billing authority

Platform subscription billing continues to use the existing environment-based platform credentials. Subscription pricing, KYC, entitlement activation, renewal, cancellation, verification, and order semantics were not redesigned.

## 4. Business merchant credential authority

A canonical server-side `resolveBusinessRazorpayCredentials(businessId, companyId)` authority now resolves credentials from the business-scoped Business Settings record. The authenticated API wrapper enforces existing workspace access; the webhook-only system wrapper is used after business/order lineage has identified the merchant business.

The resolver returns provider, business/company scope, Key ID, server-only secrets, merchant account reference, mode, enabled state, and readiness status. It never falls back to platform credentials.

## 5. Existing storage reused/changed

The existing AUTH-01 `businessSettings.paymentSettings` structure was reused. Minimal fields were normalized for `merchantAccountId`, `mode`, and `enabled`. The follow-up correction makes payment settings updates patch-based: omitted fields are preserved, rather than defaulting readiness fields. Billing-order records retain `businessId` alongside Invoice/company identity so later verification can resolve the correct merchant authority.

## 6. Secret storage assessment

Business secrets remain in the existing server-side AUTH-01 state document. The repository does not provide application-level encryption for these values; this report does not claim that plaintext-at-rest storage is encrypted. Deployment/database-at-rest hardening remains a separate security concern. No weak reversible encoding was introduced.

## 7. Secret redaction

Business Settings reads continue to return empty secret fields plus configured flags. Key secret and webhook secret are not returned to Web/Mobile clients. Audit metadata records configuration state, not secret values. Errors and readiness responses contain no secret material.

## 8. Business isolation

Credential resolution is keyed by authoritative business and optional company scope. Authenticated resolution uses existing workspace permissions. Cross-business resolution is rejected. The webhook system path resolves only after billing-order or Invoice lineage identifies the business.

## 9. No-global-fallback invariant

Missing, disabled, incomplete, or mode-incoherent business credentials return a non-ready status. They do not fall back to `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, or `RAZORPAY_WEBHOOK_SECRET`.

## 10. Test/live mode

Mode is inferred from `rzp_test_`/`rzp_live_` Key IDs unless explicitly configured. An explicit mode that conflicts with the Key ID is `INCOMPLETE`. Readiness states are `NOT_CONFIGURED`, `INCOMPLETE`, `DISABLED`, `READY_TEST`, and `READY_LIVE`. Configuration readiness does not claim live provider connectivity.

## 11. Merchant identity

`merchantAccountId` is supported as a non-secret extensible reference. No invented provider identity is used. Future PAY-REQ-02B/02C must validate that provider payment/order identity belongs to the resolved business merchant.

## 12. Webhook-secret authority

Platform subscription webhooks continue using the platform webhook secret. Invoice webhook processing now resolves the business webhook secret from the Invoice/order business context. Legacy records without business lineage fail verification rather than silently using the platform secret. More advanced account-specific webhook routing remains future work.

## 13. Readiness model

Business collection readiness requires a configured Key ID and Key Secret, coherent test/live mode, and enabled merchant collection. The readiness result is server-derived and secret-free. Webhook secret presence remains separately represented through redacted configuration flags.

## 14. Activation/disable behavior

The existing `paymentLinkEnabled`/`enabled` settings control future merchant collection readiness. Disabled settings prevent legacy Invoice order and payment-link paths from proceeding. Disabling does not mutate Payments, Allocations, Invoices, Accounting, or Banking.

## 15. Rotation behavior

Providing replacement secret material replaces the stored business secret. Omitting secret fields during unrelated settings updates preserves them, including `enabled`, `mode`, webhook secret, and merchant account metadata. Rotation is business-scoped and does not rewrite historical financial lineage.

## 16. Revocation/removal behavior

Disable and secret revocation are separate controls. `paymentSettings.enabled: false` disables future collection while retaining stored secrets; `paymentSettings.revokeKeySecret: true` and `paymentSettings.revokeWebhookSecret: true` explicitly clear the corresponding secret and make readiness incomplete. Empty secret strings are intentionally ignored/preserve the existing value, so blank input is not ambiguous revocation. Existing financial history remains unchanged. Active provider-intent handling is deferred to PAY-REQ-02B because this package creates no provider intents.

## 17. Legacy Invoice collection safety

The legacy `/billing/razorpay/order` Invoice branch now resolves business credentials and passes them to the Razorpay client. It does not use platform credentials. The Invoice verification branch selects the business secret from the persisted Invoice billing-order lineage. The Invoice payment-link route fails closed without ready business credentials. Webhook handling selects the business webhook secret for Invoice lineage and retains the platform secret only for platform billing.

This is a credential-resolution correction only. Payment lifecycle, Payment Allocation, Accounting, and Banking were not redesigned.

## 18. AUTH-01 persistence

Business credential changes continue through the existing Business Settings persistence path. Existing caller propagation remains intact, and no second credential database was introduced. Persistence errors remain authoritative failures rather than apparent successful configuration.

## 19. PostgreSQL compatibility

No new persistence engine or state collection was added. Business Settings and billing-order lineage remain compatible with the existing AUTH-01 PostgreSQL state model. Live PostgreSQL execution was not available for this package.

## 20. PaymentRequest preservation

PAY-REQ-01 was not modified. No provider IDs, completion state, Pay Now route, or provider intent were added to PaymentRequest.

## 21. Payment/Allocation preservation

No Payment or Payment Allocation behavior changed. Credential configuration and readiness produce no Payment, Allocation, refund, reversal, or status effect.

## 22. Accounting preservation

No journal, ledger, A/R, revenue, fee, or tax mutation was introduced.

## 23. Banking preservation

No bank account, statement line, reconciliation candidate, Match, Unmatch, or settlement mutation was introduced.

## 24. Security findings

The important security boundary is now fail-closed business resolution. Remaining security work is application-level encryption or secret-vault hardening, provider-account identity validation, public-token design, and provider-intent replay protection in later packages.

## 25. Files changed

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `apps/api/src/server.js`
- `tests/business-razorpay-credentials.test.js`
- `docs/eazinvoice-remediation-blueprint/59-phase-3c17-business-razorpay-credential-authority-completion-report.md`

`Report 58` and all unrelated files remain unchanged.

## 26. Focused tests

The new credential suite covers:

- platform/business credential separation;
- no global fallback;
- cross-business isolation;
- secret redaction;
- mode mismatch;
- disabled readiness;
- unrelated settings preservation;
- secret rotation.
- partial update preservation and explicit key/webhook revocation;
- persistence rejection surfaced to the caller;
- legacy Invoice HTTP order fail-closed behavior, business-secret authorization, and rejection of a platform-secret verification signature.

Focused Razorpay persistence tests also passed.

## 27. Regression results

- Focused credential suite after 3C.17A: **6 passed, 0 failed**.
- Previous focused/API/Razorpay suite: **175 passed, 0 failed** before the 3C.17A additions.
- Full serial repository suite: **374 passed, 1 environment-only failure, 1 existing live-PostgreSQL skip**.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run mobile:check`: PASS, 8/8.
- `npm run db:verify-reports`: PASS.
- `git diff --check`: PASS.

## 28. Environmental limitations

`npm run db:verify-schema` could not run because `psql.exe` is unavailable. The full suite’s one failure is the pre-existing `tests/postgres-document-registry.test.js` attempt to connect to unresolved `db.example.com` (`ENOTFOUND`). Live Razorpay credentials, provider webhooks, and live PostgreSQL concurrency were not exercised.

## 29. Remaining gaps

- Application-level encryption/secret-vault hardening is not present.
- Provider account identity must be verified during future payment processing.
- Business webhook routing may require account-specific provider configuration.
- PaymentRequest provider-intent binding and atomic completion are not implemented.
- Public Pay Now, QR/UPI, settlement, and reconciliation remain future work.

## 30. Proposed next package

**PAY-REQ-02B — PaymentRequest Provider Intent Binding**

It should consume the business credential authority, create a provider intent tied permanently to one PaymentRequest, persist provider lineage, and remain separate from Payment creation and settlement.

## 31. Proposed commit boundary

Commit only the five files listed in Section 25 after independent final acceptance. Do not include `android/app/build.gradle`, Report 58, or unrelated workspace artifacts.

## 32. Staging/commit/push state

None performed.

## 33. Final verdict

**PHASE 3C.17 — ORIGINAL IMPLEMENTATION REPORT CORRECTED BY 3C.17A — READY FOR FINAL ACCEPTANCE**
