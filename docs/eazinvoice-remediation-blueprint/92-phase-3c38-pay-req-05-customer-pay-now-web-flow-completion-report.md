# PHASE 3C.38 — PAY-REQ-05 / PAY-REQ-02E Customer Pay Now Web Flow Completion Report

## PHASE

Phase 3.38 implements the customer-facing Web Pay Now surface on top of the committed public PaymentRequest and verified-provider authorities. It is a presentation/orchestration package only; it does not create a new financial authority.

## BASELINE

The repository was verified on `main` at baseline `788b98442ced46d07948d59b6ba956bf47dea426`, synchronized with `origin/main` before implementation. No files were staged, committed, or pushed. The pre-existing Android modification and unrelated workspace artifacts remain untouched.

## DISCOVERY

The existing backend already exposes the required public PaymentRequest lookup and provider-intent preparation authorities. The Web product had no dedicated customer-safe Pay Now page. The implementation therefore adds only a static public page, its browser orchestration, a shared API-client adapter, responsive styling, and source-level coverage.

## WEB ROUTE

The public customer surface is `/apps/web/pay-now.html?token=<opaque-public-token>`. The opaque token is the only customer lookup credential. No authenticated workspace route, internal request ID, business ID, invoice ID, or secret is accepted from the browser URL.

## PUBLIC LOOKUP

The page calls the existing `GET /public/payment-requests/:token` endpoint through the shared API client. A malformed, missing, invalid, expired, cancelled, or unavailable token receives a neutral unavailable state and does not expose internal diagnostics.

## CUSTOMER PROJECTION

Only the backend's customer-safe projection is rendered: business name, invoice display number/description, amount, currency, lifecycle status, expiry, and payment eligibility/block reason. The browser does not reconstruct outstanding balance, credit-note effects, reservation capacity, or payment state from invoice fields.

## PAGE STATES

The page covers loading, active/payable, provider preparation, checkout, pending verification, completed, expired, cancelled, stale/non-collectible, invalid, and provider-preparation failure states. Terminal or non-payable projections hide and disable the Pay Now control.

## CHECKOUT PREPARATION

Pay Now calls the existing public `POST /public/payment-requests/:token` authority. The server supplies the provider intent and public key. The page does not create an order, choose an amount, or bypass PaymentRequest lifecycle rules.

## RAZORPAY CHECKOUT

Razorpay Checkout is loaded only after server preparation and only once. Checkout receives the server-returned provider order ID, amount, currency, and public key. No platform secret or business credential is exposed to the browser.

## COMPLETION HANDOFF

The Razorpay browser handler only displays a neutral verification-pending state and polls the existing public GET projection. It does not submit a completion, Payment, Allocation, accounting, invoice-effect, or settlement mutation. A success screen is shown only after the authoritative public projection reports terminal completion.

## PAY-ATOMIC BOUNDARY

PAY-ATOMIC remains the sole authority for verified provider evidence becoming canonical Payment, Customer Advance, Allocation, invoice effect, and PaymentRequest completion. No server-side PAY-ATOMIC code was changed by this package.

## BROWSER AUTHORITY

The browser has no financial authority. Query-string data, Razorpay callback data, callback success, and client-side display state cannot create or complete financial records.

## STALE / CREDIT NOTE

The page trusts `paymentAllowed` and `paymentBlockReason` from the backend. If a Credit Note or another receivable reduction makes the historical request amount non-collectible, the page disables payment and directs the customer to request an updated link. It does not create a replacement request or provider order. A historical provider capture remains subject to the existing server-side late-capture rules.

## PARTIAL PAYMENT

A partial captured payment follows the existing PAY-ATOMIC behavior: the original request is consumed, the Invoice remains open at its current canonical outstanding amount, and this Web package does not automatically issue a replacement request.

## OVERPAYMENT

The page does not discard or cap genuine provider evidence in the browser. Overpayment and Customer Advance treatment remain owned by the existing verified-payment authority.

## LATE PAYMENT

Expired or otherwise closed requests remain server-authoritative. The page cannot reopen them; any captured evidence is handled by the existing backend provider-payment path.

## SECOND GENUINE PAYMENT

The page does not deduplicate or discard provider payments locally. Genuine second captures and their accounting/allocation treatment remain owned by external-payment identity and PAY-ATOMIC authorities.

## IDEMPOTENCY / REPLAY

The page guards duplicate preparation while the request is in flight. Provider-payment idempotency, webhook replay handling, and financial retry semantics remain server-side and unchanged.

## SECURITY

Backend projection values are rendered with `textContent`; status and error messages are also text-only DOM nodes. The page uses no authenticated token, internal identifier, secret, or client-supplied financial amount. Provider script loading is explicit and occurs only when checkout is requested.

## RESPONSIVENESS

The new stylesheet provides a centered desktop payment card, a stacked mobile summary, responsive padding, readable amounts, and a clear terminal/error presentation without changing shared application styles.

## ACCESSIBILITY

The page uses a real keyboard-operable button, semantic heading/summary structure, `role=status` with polite live updates, and `role=alert` for errors. Pay Now is disabled/hidden when the authoritative projection disallows payment.

## API CHANGES

`apps/api/src/client.js` adds only two client adapters for the existing public GET and POST endpoints. No API server route, persistence model, accounting method, PaymentRequest lifecycle, or provider authority was changed.

## FINANCIAL INERTNESS

The Web package introduces no Payment, Payment Allocation, Invoice, Customer Advance, Accounting, Banking, settlement, QR, UPI, notification, or tier mutation. It is limited to customer presentation and provider checkout orchestration.

## FILES CHANGED

Candidate implementation boundary:

1. `apps/api/src/client.js`
2. `apps/web/pay-now.html`
3. `apps/web/pay-now.js`
4. `apps/web/pay-now.css`
5. `tests/web/pay-now.test.js`
6. `docs/eazinvoice-remediation-blueprint/92-phase-3c38-pay-req-05-customer-pay-now-web-flow-completion-report.md`

No other file is approved by this report. The Android modification and unrelated/untracked workspace artifacts are outside the candidate boundary.

## FOCUSED TESTS

- `node --test --test-concurrency=1 --test-isolation=none tests/web/pay-now.test.js`: **3 passed, 0 failed**.
- Payment Allocation regression slice: **19 passed, 0 failed**.
- PaymentRequest regression slice: **19 passed, 0 failed**.

The initial Web test assertion was corrected to inspect the page HTML for the visible Pay Now label; no product defect was involved.

## REGRESSIONS

The full top-level serial suite completed with **441 tests: 439 passed, 1 failed, 1 skipped**. The single failure is the pre-existing PostgreSQL document-registry integration test resolving `db.example.com`; the skip is an existing unavailable-environment case. No failure was introduced by the Web package. The new nested Web tests were run separately and passed.

## LINT

`npm run lint` passed.

## BUILD

`npm run build` passed.

## POSTGRESQL REPORT VERIFICATION

`npm run db:verify-schema` could not run because `psql.exe` is not installed or configured in this environment. This is an environment limitation, not a Web implementation failure.

## DIFF CHECK

`git diff --check` passed. Git emitted only existing line-ending warnings for touched working-tree files.

## LIVE RAZORPAY

Live Razorpay checkout and webhook verification were not run. The implementation relies on the already accepted provider-intent and verified-payment authorities; live credentials are not available in this validation environment.

## LIVE POSTGRESQL

Live PostgreSQL concurrency and persistence verification were not run. This package does not change PostgreSQL or financial mutation logic.

## ENVIRONMENTAL LIMITATIONS

The known `db.example.com` DNS failure and missing `psql.exe` prevented live database checks. These limitations do not invalidate static Web/client validation, but they remain recorded for independent acceptance.

## BLOCKERS

No implementation blocker was found. The package remains subject to the requested independent final acceptance gate. No staging, commit, or push has been performed.

## CANDIDATE COMMIT BOUNDARY

If independently accepted, the atomic candidate is exactly the six files listed under FILES CHANGED. The report itself is evidence only; acceptance must decide whether it belongs in the eventual commit.

## STAGING / COMMIT / PUSH

NONE. This implementation deliberately leaves all changes unstaged and uncommitted.

## FINAL VERDICT

**PHASE 3C.38 — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT FINAL ACCEPTANCE**
