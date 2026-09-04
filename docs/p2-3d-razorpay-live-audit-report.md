# P2-3D Razorpay Live Subscription And Webhook Audit

Date: 2026-08-23

## A. Razorpay Audit Objective

Prove the production commercial path:

`Normal User -> Standard Yearly Checkout -> Razorpay Order -> Live Payment -> Server Signature Verification -> Webhook Signature Verification -> Subscription Activation -> Standard Entitlement`

This report covers the local code/configuration audit and automated regression checks. It does not mark the live audit passed because no real live Standard yearly payment and Razorpay dashboard webhook delivery have been completed in this task.

## B. Environment Configuration

Production environment values must be confirmed through the authenticated Admin UI or Render environment screen:

- `RAZORPAY_KEY_ID`: pending live production confirmation.
- Mode: pending live production confirmation. Live mode requires a `rzp_live_...` key id.
- `RAZORPAY_KEY_SECRET`: pending production confirmation.
- `RAZORPAY_WEBHOOK_SECRET`: pending production confirmation.

No secret values should be copied into this report.

## C. Admin Gateway

- Route: `GET /admin/gateway`.
- Unauthenticated browser navigation should continue to return `401` or equivalent unauthorized behavior.
- Authenticated non-admin users must be blocked.
- Authenticated configured admins can view safe metadata through `/apps/web/admin.html#gateway`.
- Admin UI path uses `apiClient.getAdminGateway(token)`, which sends `Authorization: Bearer <token>`.
- Admin output masks key id and exposes only booleans for key secret and webhook secret.

## D. Pricing

Authoritative backend catalog confirms:

- Plan: `standard`.
- Billing cycle: yearly.
- Monthly display price: INR 199.
- Yearly checkout amount: INR 2,388.
- Razorpay order amount: 238,800 paise.

## E. Checkout

Local automated order creation proves Standard yearly uses 238,800 paise.

Live checkout is still pending. Do not proceed unless the checkout screen shows INR 2,388 and the production gateway status shows live mode.

## F. Payment Verification

Server route: `POST /billing/razorpay/verify`.

The backend verifies Razorpay checkout signature using:

`orderId|paymentId` with `RAZORPAY_KEY_SECRET`

Automated tests confirm an invalid signature keeps the user on Free and a valid signature activates the paid subscription.

## G. Subscription Activation

Authoritative activation happens in `activateVerifiedRazorpayOrder()`, not in the browser checkout callback alone.

For subscription orders, activation:

- creates one active subscription,
- records plan, amount, monthly amount, annual amount, currency, billing cycle, order id, and payment id,
- syncs user entitlements,
- records a business audit event,
- marks the billing order consumed.

## H. Entitlement Verification

Automated tests confirm Standard unlocks `razorpayCollections` after verified payment and remains locked after invalid payment verification.

## I. Persistence

Live persistence must still be verified after real payment by reload/logout/login and checking the active plan again.

## J. Webhook Configuration

Application route:

`POST /webhooks/razorpay`

Expected production URL:

`https://www.eazinvoice.com/webhooks/razorpay`

The route is public, does not require normal user auth, and verifies `X-Razorpay-Signature` using `RAZORPAY_WEBHOOK_SECRET` before parsing JSON.

Recommended selected events for the current implementation:

- `payment.captured`
- payment-link payment events if invoice payment links are enabled

Do not subscribe to unrelated events until handlers are explicitly required.

## K. Webhook Delivery

Live Razorpay dashboard delivery is still pending.

Required live evidence:

- webhook destination is `https://www.eazinvoice.com/webhooks/razorpay`,
- delivery for the audit payment reaches EazInvoice,
- HTTP response is 2xx,
- no signature failure appears in Render logs.

## L. Signature Verification

Implemented:

- checkout payment signature verification uses `RAZORPAY_KEY_SECRET`,
- webhook signature verification uses `RAZORPAY_WEBHOOK_SECRET`,
- webhook verification uses the exact raw request body before JSON parsing.

Razorpay documentation confirms the webhook secret does not need to be the merchant API secret and that signature validation must use the raw webhook body.

## M. Duplicate / Idempotency

Implemented:

- duplicate billing orders are deduped by `gatewayOrderId`,
- duplicate checkout verification returns the existing subscription,
- duplicate invoice payment capture checks existing gateway order/payment ids.

Automated tests confirm duplicate subscription verification does not create a second subscription.

## N. Render Configuration

Pending authenticated production confirmation:

- `RAZORPAY_KEY_ID` configured and live.
- `RAZORPAY_KEY_SECRET` configured.
- `RAZORPAY_WEBHOOK_SECRET` configured.
- Service restarted/redeployed after any env change.

## O. Razorpay Dashboard Evidence

Pending live transaction:

- live order id,
- live payment id,
- captured status,
- webhook delivery event id/status,
- webhook HTTP response.

No card, UPI, bank, API secret, webhook secret, or bearer token should be recorded.

## P. Security

Confirmed locally:

- admin gateway masks key id,
- admin gateway exposes booleans, not secrets,
- direct `/admin/gateway` browser navigation is not a valid authenticated test,
- admin UI sends bearer token through the API client,
- Admin Login route does not grant privileges by itself; backend admin identity remains authoritative.

## Q. Tests Added

Added:

- Razorpay webhook raw-body regression test.

Adjusted:

- Removed `/webhooks/razorpay` from the generic per-IP rate limiter so legitimate Razorpay retry deliveries are not blocked before signature verification.

Existing tests already cover:

- invalid payment signature rejection,
- verified payment activation,
- duplicate payment verification idempotency,
- invalid webhook signature rejection,
- signed webhook acceptance path.

## R. Verification Results

Passed on 2026-08-23:

- `npm run build`
- `node tests\api.test.js`: 139/139
- `npm run web:p22-check`: 32/32
- `npm run mobile:check`: 8/8
- `npm audit`: 0 vulnerabilities

Known local limitation:

- `node --test tests/api.test.js --test-name-pattern "razorpay"` fails in this Windows sandbox with `spawn EPERM`; direct `node tests\api.test.js` passed.

Production fetch limitation:

- Local shell could not reach `https://www.eazinvoice.com/readyz` or `/admin/gateway` because outbound requests were refused through the local proxy path. Use the browser/Admin UI or Render logs for production evidence.

## S. Issues Found

1. Live payment cycle remains unverified.
2. Production Razorpay mode and secret booleans still need authenticated confirmation.
3. Webhook dashboard delivery and response status still need live evidence.
4. Generic rate limiting included the webhook route before this task, which could interfere with retries.
5. Raw-body webhook regression coverage was missing.

## T. Fixes Made

1. Removed `/webhooks/razorpay` from the generic sensitive-route rate limiter.
2. Added a regression test proving webhook signature validation is bound to the exact raw request body.

## U. Remaining Blockers

Before real payment:

1. Open `/apps/web/admin.html#gateway` as a configured admin.
2. Confirm Razorpay is enabled.
3. Confirm mode is live.
4. Confirm key secret is configured.
5. Confirm webhook secret is configured.
6. Confirm webhook URL is `https://www.eazinvoice.com/webhooks/razorpay`.
7. Confirm Razorpay Dashboard webhook secret matches Render.
8. Confirm Standard Yearly checkout amount is INR 2,388.
9. Use a normal non-admin audit user with no real customer data.

After explicit approval:

1. Complete exactly one live Standard Yearly payment.
2. Confirm backend active plan becomes Standard.
3. Reload/logout/login and verify persistence.
4. Confirm a Standard-only entitlement works.
5. Confirm Razorpay Dashboard shows captured payment.
6. Confirm webhook delivery returned 2xx.

## V. Razorpay Closure Decision

**RAZORPAY LIVE AUDIT NOT PASSED**

Exact blocker: no verified live Standard yearly transaction, captured Razorpay payment, production webhook 2xx delivery, and post-payment persistent Standard entitlement evidence has been collected yet.
