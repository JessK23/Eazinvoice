# Phase 3D.15C-2 — Payment Outcome Contract Enhancement

## Baseline

- Branch: `main`
- `HEAD == origin/main == 13acdbb3a418f76fb79c6a5ef1bf5b6d06dcb514`
- No staging, commit, push, or deployment performed.

## Root cause

The Vendor Bill endpoint previously returned only generic `{ error: message }` responses. The shared client now preserves response metadata, but the backend still needed an authoritative outcome field before the Web page could safely release a payment-attempt key.

## Payment transaction boundary

The existing Vendor Bill flow remains unchanged: validation, idempotency lookup, payment construction, accounting posting, state mutation, and persistence continue through the existing authorities. No accounting calculation, journal rule, schema, settlement rule, or new payment path was introduced.

## Outcome contract

The endpoint now returns:

- success: the existing `201` response unchanged;
- definitive pre-recording rejection: `paymentOutcome: "not_recorded"`;
- all unclassified or persistence-related failures: `paymentOutcome: "unknown"`.

Missing Vendor Bills return `404` with `not_recorded`. Draft/ineligible bills, business mismatch, invalid amounts, overpayment, and pre-mutation accounting-period validation failures are explicitly marked `not_recorded` because the payment has not yet been inserted or persisted. The response contains no internal persistence details.

Failures after state mutation or during persistence are not marked `not_recorded`. They remain `unknown`, so the caller retains the original idempotency attempt.

## Idempotency and Web behavior

Existing idempotency keys, replay behavior, payload binding, payment posting, workspace checks, and balance validation are preserved. The Web caller clears the matching attempt only when the structured payload explicitly says `paymentOutcome: "not_recorded"`; HTTP status, message text, network errors, and `unknown` outcomes retain the original key and payload.

## Changed files

- `apps/api/src/store.js`
- `apps/api/src/server.js`
- `apps/web/vendor-bill.js`
- `apps/api/src/client.js` (preserved by 3D.15C-1 and retained)
- `tests/vendor-bill-payment-outcome.test.js`
- `tests/vendor-bill-detail-web.test.js`
- this report

## Verification

- Backend/Web focused tests: **13 passed, 0 failed**
- Full elevated suite: **549 tests, 547 passed, 0 failed, 2 skipped**
- `npm run lint`: **passed**
- `npm run build`: **passed**
- `node --check apps/api/src/client.js`: **passed**
- `git diff --check`: **passed**
- Live PostgreSQL persistence/concurrency: **not run**
- Browser/responsive verification: **not run**
- Render deployment: **not performed**

## Verdict

**READY FOR INDEPENDENT ACCEPTANCE**
