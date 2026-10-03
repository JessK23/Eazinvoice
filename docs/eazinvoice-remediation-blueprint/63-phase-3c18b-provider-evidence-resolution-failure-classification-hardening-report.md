# PHASE 3C.18B — PAY-REQ-02B-CORR2 Provider Evidence Resolution and Failure Classification Hardening Report

## 1. Baseline

- Branch: `main`
- `HEAD`: `5c48067e1d035e55f725deb9beb07ab06c094cd4`
- `origin/main`: `5c48067e1d035e55f725deb9beb07ab06c094cd4`
- 3C.18 and 3C.18A remain uncommitted.
- Nothing was staged, committed, or pushed.
- `android/app/build.gradle` and unrelated workspace artifacts were preserved.

## 2. Original residual defects

The combined 3C.18/3C.18A acceptance found that the Razorpay webhook still could not resolve provider evidence through the authoritative chain `Provider Order / receipt → PaymentRequest → Invoice → Business → Workspace`. It also found that selected 4xx responses were treated as definite non-creation without sufficient provider-specific proof, which could permit an unsafe retry.

## 3. Provider evidence resolver

`resolvePaymentRequestProviderEvidence` is now exposed through the existing Store/API authority. It resolves persisted PaymentRequest provider-intent lineage by provider Order ID, deterministic receipt, and validated provider notes. It returns the authoritative PaymentRequest, Invoice, Business, workspace scope, and provider-intent view rather than trusting an identifier alone.

The resolver rejects ambiguity, missing Invoice/business lineage, inconsistent Order ID, receipt, PaymentRequest, Invoice, business, workspace, amount, or currency evidence. Receipt-derived or note-derived IDs are only hints; persisted state remains authoritative.

## 4. Webhook integration

The Razorpay webhook now invokes the resolver before selecting business webhook credentials. A successfully resolved PaymentRequest event is signature-verified using the resolved business credential authority and returns identification-only lineage. It does not create or mutate financial records.

Existing platform subscription, legacy billing-order, and legacy Invoice webhook paths remain in place. Unknown or inconsistent PaymentRequest evidence fails closed rather than falling back to a client-supplied business identity.

## 5. Business and workspace resolution

The resolver derives Business and workspace ownership from persisted PaymentRequest and Invoice records. Provider notes may carry `paymentRequestId`, `invoiceId`, `businessId`, `workspaceOwnerUserId`, and receipt for evidence correlation, but these values cannot override persisted lineage.

Business merchant webhook credentials remain separate from platform billing credentials. No platform-secret fallback was added.

## 6. Failure classification

All non-2xx Razorpay order-creation responses now default to `unknown`, which transitions the PaymentRequest to `recovery_required`. This deliberately includes 400, 401, 403, 404, 409, 422, and 429 until a provider-specific non-creation guarantee is established. Timeouts, network failures, 5xx responses, malformed responses, and missing provider IDs remain recovery-required.

Only a separately justified, deterministic non-creation result may use retryable `failed`. The correction therefore preserves the no-blind-retry rule.

## 7. Recovery behavior

Existing 3C.18A behavior remains intact:

- zero receipt matches fail closed;
- multiple matches fail closed without arbitrary selection;
- persistence failure leaves recovery-safe lineage;
- stale `creating` state cannot issue a second Order;
- amount, currency, receipt, and lineage mismatches cannot bind;
- no Payment, Allocation, completion, Accounting, Banking, settlement, or reconciliation effect occurs.

Provider Order creation now includes the deterministic receipt and workspace lineage in non-secret notes to support later evidence resolution.

## 8. Tests

Added focused coverage for:

- authoritative provider evidence resolution;
- mismatched business lineage;
- Razorpay webhook resolution to PaymentRequest, Invoice, Business, and workspace;
- webhook financial non-effects;
- existing provider-intent creation, recovery, persistence-failure, stale-state, and retry behavior.

Focused relevant suite: **38 passed, 0 failed**.

## 9. Regression results

- Full serial suite: **388 passed, 1 known environmental PostgreSQL registry failure, 1 existing live PostgreSQL concurrency test skipped**.
- Lint: PASS.
- Build: PASS.
- Mobile check: PASS, 8/8.
- PostgreSQL report verification: PASS.
- `git diff --check`: PASS.

The full-suite failure is `db.example.com` DNS resolution in `tests/postgres-document-registry.test.js`; it is environmental and unrelated to this package.

## 10. Live provider/database limitations

**LIVE RAZORPAY: UNVERIFIED — ENVIRONMENTAL.** Controlled HTTP tests were used; no live credentials were used.

**LIVE POSTGRESQL: UNVERIFIED — ENVIRONMENTAL.** The existing AUTH-01/PostgreSQL boundary was reused; live multi-process verification was unavailable.

## 11. Files changed

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `apps/api/src/server.js`
- `tests/payment-request-provider-intent.test.js`
- `docs/eazinvoice-remediation-blueprint/61-phase-3c18-paymentrequest-razorpay-provider-intent-binding-completion-report.md`
- `docs/eazinvoice-remediation-blueprint/62-phase-3c18a-provider-intent-unknown-outcome-orphan-recovery-correction-report.md`
- `docs/eazinvoice-remediation-blueprint/63-phase-3c18b-provider-evidence-resolution-failure-classification-hardening-report.md`

Report 61 was not rewritten. Its original correction-required history remains intact.

## 12. Proposed combined commit boundary

The expected atomic boundary is the seven files above, excluding Android changes, Report 58, temporary files, Gradle artifacts, screenshots, plugins, and unrelated workspace artifacts. Final approval remains the responsibility of the combined acceptance gate.

## 13. Forbidden scope confirmation

PAY-REQ-02C, Payment creation, Payment Allocation, PaymentRequest completion, Pay Now, QR/UPI, settlement, gateway fees/taxes, Banking auto-reconciliation, tier changes, Mobile, Eazy, Android, Expense, and Quotation were not implemented.

## 14. Staging / commit / push

None performed.

## 15. Final verdict

**PHASE 3C.18B — CORRECTION IMPLEMENTED — READY FOR COMBINED FINAL ACCEPTANCE**
