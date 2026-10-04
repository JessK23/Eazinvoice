# EazInvoice — Phase 3C.36 / PAY-REQ-04 / PAY-REQ-02D Completion Report

## PHASE

Phase 3C.36 — Public PaymentRequest Customer-Safe Access and Pay Now Backend Authority.

## BASELINE

Implementation started from `main` with:

- `HEAD`: `9383388d958fec9637c188d422a90437c5a5daed`
- `origin/main`: `9383388d958fec9637c188d422a90437c5a5daed`
- no staged changes

The pre-existing Android modification and unrelated/untracked artifacts were left untouched.

## DISCOVERY

The existing PaymentRequest, provider-intent, PAY-ATOMIC, Customer Advance, Allocation, and canonical outstanding authorities were reused. No second Payment, provider Order, accounting, or settlement model was introduced.

The implementation adds a stable high-entropy public access token to newly created PaymentRequests, a public-safe Store projection, unauthenticated lookup, and an explicit public checkout-preparation path. Merchant-authenticated PaymentRequest management remains separate.

## PUBLIC ACCESS IDENTITY

New requests receive `eaz_payreq_` plus 32 cryptographically random bytes encoded with base64url. The token is non-sequential, not derived from Invoice/PaymentRequest/provider IDs, distinct per request, and persisted with the PaymentRequest. Reissued requests receive their own identity because reissue creates a new PaymentRequest record.

The token is not returned by the public projection and contains no merchant secret.

## PUBLIC LOOKUP AUTHORITY

Added `GET /public/payment-requests/:token`. It resolves only the persisted token and returns 404 for missing, malformed, internal-ID, mutated, or otherwise invalid credentials. It does not accept caller-supplied amount, currency, Invoice, business, workspace, customer, provider, Order, or status authority.

## CUSTOMER-SAFE PROJECTION

The public response contains effective lifecycle status, historical requested amount/currency, expiry, payment eligibility/block reason, business display name, safe Invoice number/description, and provider name. It excludes internal PaymentRequest/Invoice/business/workspace IDs, raw token, provider intent, merchant account, credential data, accounting IDs, journal data, Customer Advance data, and unrelated records.

## LIFECYCLE AUTHORITY

The projection uses the existing strict effective-status authority. Active requests are payable only when the current Invoice remains collectible for the full historical request amount. Completed, expired, cancelled, and unknown/malformed states are non-payable. Public access never reopens, resizes, or reissues a request.

## CANONICAL OUTSTANDING

Checkout preparation revalidates `invoiceOutstandingMinor(invoice)` before any provider-intent mutation. A Credit Note or other reduction that leaves current outstanding below the historical request amount makes the request non-payable with `amount_no_longer_collectible`. A zero outstanding balance is also blocked. Historical request evidence is retained; PAY-REQ-03A remains the only reissue authority.

## PROVIDER INTENT

Public preparation calls the existing PaymentRequest provider-intent authority. It uses system-scoped business merchant credentials only after validating the public token and before mutating provider-intent state. Existing deterministic receipt, provider lineage, recovery, credential separation, and no-blind-retry rules remain in force.

## CHECKOUT HANDOFF

Added `POST /public/payment-requests/:token`. It returns a safe provider checkout projection and business public key ID after authoritative preparation, recovery, or replay. Merchant secrets never leave the server. Repeated compatible calls replay an existing created intent or require recovery; they do not create a second Order.

## PAY-ATOMIC COMPLETION BOUNDARY

Lookup and checkout preparation create no Payment, Allocation, FinancialEvent, journal, Customer Advance, A/R effect, or Invoice balance effect. Financial completion remains exclusively:

`verified provider evidence → PAY-ATOMIC → Payment → receipt accounting → Allocation/Customer Advance → Invoice effect → PaymentRequest completion`.

## CALLBACK / RETURN BOUNDARY

No browser-success completion path was added. The new public routes do not accept provider success, captured status, Payment, Allocation, Invoice, or completion assertions from the client.

## PROVIDER VERIFICATION

The existing webhook evidence resolver and PAY-ATOMIC path remain unchanged. Provider Order, PaymentRequest, Invoice, business, workspace, amount, currency, merchant credential, explicit captured status, and external Payment identity checks remain authoritative.

## IDEMPOTENCY

Public lookup is read-only. Preparation uses the existing persisted `creating`/`created`/`recovery_required` state and deterministic receipt. It does not create PaymentRequests, Payments, Allocations, journals, or duplicate provider Orders on replay.

## REISSUED REQUEST BEHAVIOR

Reissued requests receive separate persisted public tokens. Old tokens resolve only to their own historical status and never reveal or redirect to a replacement request.

## LATE PAYMENT

Public checkout blocks stale or terminal collection initiation, but the implementation does not change the accepted PAY-ATOMIC rule that genuinely captured provider money is preserved through the existing financial authority.

## SECOND GENUINE PAYMENT

No change to accepted second-payment behavior. Distinct captured provider identities remain distinct canonical Payments, cannot rebind an old PaymentRequest, and excess money remains governed by Customer Advance/unapplied-payment authority.

## ACCOUNTING

No new accounting behavior was added. Public lookup and checkout preparation are financially inert; existing receipt-first Customer Advance, Allocation, reversal, refund, and PAY-ATOMIC journals remain the authorities.

## TENANT ISOLATION

Public lookup is bound solely to the persisted token's PaymentRequest lineage. Caller-supplied tenant identifiers are not used. Preparation derives business, workspace, Invoice, amount, currency, and provider context from the authoritative request.

## SECURITY / ENUMERATION

Random, malformed, truncated, mutated, internal-ID, and request-key values fail closed without revealing internal record existence. The public projection is deliberately minimal and does not expose secrets or internal financial identifiers. The public route is separate from authenticated management routes.

## API BOUNDARY

Added Store/API methods for public projection, internal preparation context, and public preparation. Added only the two public server routes required for lookup and checkout handoff. No existing internal PaymentRequest route was made public. No Web UI was added.

## CONCURRENCY / PERSISTENCE

Provider-intent state mutation reuses the existing AUTH-01 authoritative persistence boundary. The stale-outstanding check occurs inside the provider-intent local mutation before an intent is returned or created. No process-local financial lock or second persistence authority was introduced.

Live multi-process PostgreSQL concurrency remains environmental verification, not executed by this package.

## LEGACY COMPATIBILITY

Legacy Invoice payment and payment-link paths remain unchanged. The new public route does not reuse or silently convert the legacy path into a second public financial authority. Existing PaymentRequest, Credit Note, PAY-IDEM, PAY-OVERPAY, PAY-ATOMIC, reversal, refund, Accounting, and Banking behavior remained green in focused regressions.

## FILES CHANGED

1. `apps/api/src/store.js`
2. `apps/api/src/index.js`
3. `apps/api/src/server.js`
4. `tests/payment-request-public.test.js`

No Web, Android, QR/UPI, notification, settlement, or Banking files were changed.

## FOCUSED TESTS

- `tests/payment-request-public.test.js`: **4 passed, 0 failed**.
- PaymentRequest/provider/PAY-ATOMIC focused run: **42 passed, 0 failed**.
- Public tests cover opaque identity, safe projection, internal-ID rejection, financial inertness, Credit Note stale-order blocking, cancellation, and unauthenticated HTTP lookup.

## REGRESSIONS

The broad serial repository suite reported **438 passed, 1 failed, 1 skipped** out of 440 tests. The skipped test is the live PostgreSQL concurrency suite. The single failure was `tests/postgres-document-registry.test.js`, which attempted to resolve the configured environmental host `db.example.com` and failed with `ENOTFOUND`; it is unrelated to this package and was not converted into a pass.

## LINT

`npm run lint` passed.

## BUILD

`npm run build` passed.

## POSTGRESQL REPORT VERIFICATION

`npm run db:verify-reports` passed: PostgreSQL report totals matched normalized invoices, payments, PO/WO, and profit tables.

## DIFF CHECK

`git diff --check` passed. LF/CRLF warnings were reported for existing Windows working-copy files and are non-content warnings.

## LIVE RAZORPAY

UNVERIFIED — ENVIRONMENTAL. No live Razorpay network call was executed.

## LIVE POSTGRESQL

UNVERIFIED — ENVIRONMENTAL. No live multi-process PostgreSQL concurrency execution was performed. The broad suite's unrelated document-registry test could not resolve `db.example.com`.

## ENVIRONMENTAL LIMITATIONS

The broad suite is not fully green because of the unrelated external-host failure above. The Android modification and unrelated/untracked artifacts remain outside this candidate. No staging, commit, push, reset, clean, or discard operation was performed.

## BLOCKERS CLOSED

- Opaque persisted public PaymentRequest identity.
- Customer-safe public projection.
- Separate unauthenticated lookup and checkout-preparation routes.
- Lifecycle and malformed-status enforcement.
- Credit Note/current-outstanding stale-order protection.
- Reuse of existing provider-intent recovery and PAY-ATOMIC authorities.
- Financial inertness before verified provider capture.

## REMAINING BLOCKERS

No implementation stop condition was discovered. Independent final acceptance remains required before commit. Live Razorpay and live multi-process PostgreSQL remain unverified, and the unrelated `db.example.com` test failure should remain classified as environmental unless it recurs in a relevant path.

## PROPOSED COMMIT BOUNDARY

1. `apps/api/src/store.js`
2. `apps/api/src/index.js`
3. `apps/api/src/server.js`
4. `tests/payment-request-public.test.js`

Report 90 is documentation evidence and is intentionally uncommitted pending acceptance.

## STAGING / COMMIT / PUSH

NONE.

## FINAL VERDICT

**PHASE 3C.36 — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT FINAL ACCEPTANCE.**

The backend public PaymentRequest authority is implemented without Web UI, QR/UPI, notifications, settlement, Banking, or new financial authority. The Credit Note/stale-provider-order boundary is explicitly fail-closed.
