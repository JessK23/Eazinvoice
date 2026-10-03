# PHASE 3C.18 — PAY-REQ-02B PaymentRequest Razorpay Provider Intent Binding Completion Report

## 1. Baseline

- Branch: `main`
- `HEAD`: `5c48067e1d035e55f725deb9beb07ab06c094cd4`
- `origin/main`: `5c48067e1d035e55f725deb9beb07ab06c094cd4`
- No files were staged, committed, or pushed.
- Existing Android, Gradle, temporary, audit, screenshot, plugin, and tool artifacts remain untouched.

## 2. Discovery findings

PAY-REQ-01 already persists a business-scoped, Invoice-bound PaymentRequest and owns reservation/lifecycle state. PAY-REQ-02A already exposes the business Razorpay credential resolver and keeps platform subscription credentials separate. Existing `billingOrders` records are used by subscription and legacy Invoice collection, so extending them for PaymentRequest provider intents would create mixed lineage semantics. The smallest safe model is therefore provider-intent lineage directly on the existing PaymentRequest.

## 3. Selected persistence model

The existing `paymentRequests` collection remains the sole authority. No new collection, counter, database, or persistence engine was introduced. Each PaymentRequest may now contain a provider-intent object with lifecycle, provider order identity, amount, currency, mode, merchant account reference, provider status, deterministic receipt, and creation timestamp.

## 4. Provider Intent model

The provider intent model is:

`PaymentRequest.providerIntent = { provider, status, providerOrderId, amount, currency, mode, merchantAccountId, providerStatus, receipt, createdAt }`

The status boundary is `creating`, `created`, or `failed`. Provider order identity is assigned only from the Razorpay response. No client-supplied provider order ID, secret, amount, currency, Invoice, or business identity is authoritative.

## 5. PaymentRequest binding

Every created intent stores the originating PaymentRequest ID through the owning record and Razorpay notes. The PaymentRequest itself remains permanently Invoice-bound. There is no mutation path that moves the intent to another PaymentRequest, Invoice, business, or workspace.

## 6. Invoice binding

Before initiation, the authoritative PaymentRequest and its Invoice are reloaded and checked for matching business identity and currency. The provider request uses the PaymentRequest’s persisted amount/currency and never accepts a replacement Invoice ID from the client.

## 7. Business credential resolution

The HTTP initiation route resolves credentials through the committed PAY-REQ-02A business authority with `writeRecords` access. It requires `READY_TEST` or `READY_LIVE`, uses the business Key ID/secret, and never falls back to platform subscription credentials. Platform billing routes remain unchanged.

## 8. Provider amount/currency authority

The amount comes from `PaymentRequest.requestedAmount` and is converted to Razorpay minor units with integer rounding. Currency comes from the persisted PaymentRequest and is normalized uppercase. The HTTP body does not accept amount, currency, Invoice, or business overrides.

## 9. Lifecycle eligibility

Initiation requires an existing, tenant-visible PaymentRequest with a valid Invoice, matching business, compatible currency, and non-terminal lifecycle. Cancelled and completed requests are rejected. Provider initiation is not a financial completion operation.

## 10. Expiry

An expired PaymentRequest cannot initiate a new provider intent. Existing provider lineage remains stored on the PaymentRequest so future verified callbacks can resolve the original request even if the provider event arrives late. No late-payment financial handling was added.

## 11. Cancellation / initiation race

Before provider initiation, cancellation continues to work. Once the request is `creating` or `created`, cancellation is rejected so the system cannot discard a real provider-side collection possibility. No refund or provider cancellation behavior was invented.

## 12. Idempotency

The first initiation transaction reserves the PaymentRequest as `creating`. A retry after successful binding returns the existing provider intent and does not call Razorpay again. A simultaneous request observing `creating` receives an in-progress conflict. A provider failure is explicitly marked `failed`, allowing a bounded later retry because no provider order was returned.

## 13. Concurrency

The reservation and binding mutations use the existing `persistenceAdapter.mutateState` authority when PostgreSQL is selected. This gives the provider-intent reservation the same authoritative transaction boundary as PaymentRequest mutations and prevents two committed active intents for one request. Live PostgreSQL concurrency was not available and remains outstanding.

## 14. Provider failure

If Razorpay order creation fails, the PaymentRequest is marked `failed` rather than `created`. No Payment, Allocation, Accounting, or Banking mutation occurs. Provider responses are not treated as payment evidence.

## 15. Orphan provider-intent risk / recovery

Razorpay and AUTH-01 cannot participate in one distributed transaction. If Razorpay returns an order and the subsequent local binding persistence fails, the PaymentRequest remains in the `creating` boundary and the provider order identity may be orphaned externally. The response does not falsely claim success. Deterministic receipt/notes contain the PaymentRequest, Invoice, and business identifiers so an operational recovery process can reconcile the orphan without guessing. Automatic financial completion is deferred to PAY-REQ-02C.

## 16. Provider lineage

Persisted lineage resolves:

`Razorpay order → PaymentRequest → Invoice → business/workspace`

The provider order ID is server-created and persisted only after Razorpay returns it. Provider metadata contains non-secret identifiers only.

## 17. Tenant isolation

The authenticated API wrapper resolves the current workspace and business before mutation. Cross-business access is rejected. The provider intent stores the original business and workspace lineage and cannot be rebound.

## 18. Secret handling

Only the business Key ID may be returned as a public checkout field. Key Secret and webhook Secret remain server-side. No secrets are placed in provider notes, PaymentRequest metadata, responses, or audit records.

## 19. API surface

Added authenticated internal route:

`POST /payment-requests/:id/provider-intent`

It returns only safe provider-intent fields and the public Razorpay Key ID. No anonymous Pay Now URL, public token, customer page, QR, UPI, or mobile checkout was added.

## 20. AUTH-01 persistence

Provider-intent state is part of the existing PaymentRequest snapshot. Existing persistence failure propagation is reused. No separate provider-intent database or local-only authority was introduced.

## 21. PostgreSQL behavior

The existing PostgreSQL state collection and authoritative mutation transaction are reused. No schema migration or new counter is required because the provider-intent object is an extension of existing PaymentRequest records. Live PostgreSQL execution remains outstanding.

## 22. Payment boundary

Razorpay Order creation does not create a Payment. Payment records remain unchanged.

## 23. Allocation boundary

No Payment Allocation is created. PAY-BASE-02 remains unchanged.

## 24. PaymentRequest completion boundary

Creating or binding a provider intent never completes the PaymentRequest. Verified payment completion remains PAY-REQ-02C.

## 25. Accounting boundary

No journal, ledger posting, A/R reduction, revenue event, cash entry, or fee/tax accounting occurs.

## 26. Banking boundary

No statement line, settlement item, Match, Unmatch, reconciliation record, or bank assumption occurs.

## 27. Legacy Invoice Razorpay compatibility

The existing Invoice Razorpay order, verification, and payment-link paths remain unchanged by this package. PAY-REQ-02B uses the shared Razorpay request helper and credential authority without copying the legacy Payment flow. The new PaymentRequest provider intent is the canonical future entry point for Pay Now; legacy Invoice collection remains compatibility behavior until later migration decisions.

## 28. Tests

New provider-intent tests cover:

- active initiation and business credential use;
- authoritative amount/currency and minor-unit conversion;
- platform credential non-use;
- immutable PaymentRequest/Invoice/business lineage;
- cross-business rejection;
- cancelled, completed, and expired eligibility;
- idempotent retry and cancellation race;
- provider failure without financial effects;
- no Payment or Allocation creation.

## 29. Regressions

- Provider-intent suite: **5 passed, 0 failed**.
- PaymentRequest suite: **9 passed, 0 failed**.
- Business credential suite: **6 passed, 0 failed**.
- Razorpay billing persistence suite: **2 passed, 0 failed**.
- Combined API/Razorpay/PaymentRequest run: **192 passed, 0 failed**.
- Lint: PASS.
- Build: PASS.
- Mobile parity: PASS, 8/8.
- PostgreSQL report verification: PASS.
- `git diff --check`: PASS.

## 30. Live Razorpay

Not exercised. Provider calls were controlled with a test HTTP boundary. No live credentials or real customer payment was used.

## 31. Live PostgreSQL

Not exercised. The transaction boundary is structurally reused, but cross-process provider-intent concurrency remains runtime-unverified.

## 32. Environmental limitations

The repository’s known limitations remain: `psql.exe` may be unavailable, the live PostgreSQL concurrency test may be skipped, and the pre-existing document-registry integration can require resolvable `db.example.com`. These are not implementation failures caused by PAY-REQ-02B.

## 33. Remaining work

- PAY-REQ-02C verified Razorpay payment → Payment → Allocation → PaymentRequest completion.
- Webhook evidence binding and replay protection for financial completion.
- Public Pay Now, single-use link, QR/UPI presentation, and mobile checkout.
- Gateway settlement, fees, taxes, batching, and Banking reconciliation.

## 34. Proposed next package

**3C.18A / PAY-REQ-02B-CORR — Provider Intent Unknown-Outcome and Orphan Recovery Safety**

## 35. Proposed commit boundary

- `apps/api/src/store.js`
- `apps/api/src/index.js`
- `apps/api/src/server.js`
- `tests/payment-request-provider-intent.test.js`
- `docs/eazinvoice-remediation-blueprint/61-phase-3c18-paymentrequest-razorpay-provider-intent-binding-completion-report.md`

Exclude `android/app/build.gradle` and all unrelated workspace artifacts.

## 36. Staging / commit / push

None performed.

## 37. Final verdict

**SUPERSEDED — 3C.18 FINAL ACCEPTANCE FOUND CORRECTION REQUIRED**

## 38. 3C.18A acceptance correction addendum

The independent 3C.18 final acceptance found two material defects in this original implementation:

- transport errors and other indeterminate Razorpay outcomes were treated as ordinary `failed` results, allowing a retry that could create a duplicate provider order;
- if Razorpay succeeded but local `created` persistence failed, the deterministic receipt and provider notes were emitted but no implemented webhook/order resolver could recover the PaymentRequest, Invoice, and business lineage.

The 3C.18A correction adds the explicit non-retryable `recovery_required` state, conservative known-failure classification, deterministic receipt recovery, provider-order amount/currency/lineage validation, stale-`creating` recovery, and server-side recovery routing. Report 61 is therefore not an approval of the original candidate; its original final verdict is superseded until Report 62 and the combined 3C.18/3C.18A acceptance pass.
