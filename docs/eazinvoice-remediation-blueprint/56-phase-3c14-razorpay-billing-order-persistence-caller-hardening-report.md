# EAZINVOICE — PHASE 3C.14 / AUTH-01F
## Razorpay Billing-Order Persistence Caller Hardening Report

**Date:** 2026-10-02  
**Baseline:** `290616ced03a888ad2150ec744778b6ffa690d67`  
**Scope:** Surgical correction only. No PaymentRequest, gateway redesign, Store redesign, or commit/push performed.

## 1. Verdict

**PHASE 3.14 — AUTH-01F VERIFIED — READY FOR FINAL ACCEPTANCE**

The identified Razorpay billing-order caller defect was reproduced from the baseline and corrected at the caller boundary. The route now waits for authoritative persistence before returning success and surfaces persistence failure through its existing request error path.

## 2. Original defect

`POST /billing/razorpay/order` created the authoritative billing-order record with `api.createBillingOrder(...)` but did not await the returned value. Under AUTH-01, that value may be a Promise representing PostgreSQL persistence completion. The route could therefore return HTTP 201 before the billing order was durable, or return success before a CAS/persistence rejection became observable.

## 3. Call path

```text
POST /billing/razorpay/order
  → validate subscription/KYC or invoice entitlement
  → create Razorpay gateway order
  → api.createBillingOrder(...)
  → store.createBillingOrder(...)
  → persist / PostgreSQL authority
  → HTTP 201 only after persistence settles
```

The correction is exactly one caller-level await in `apps/api/src/server.js`. Store, PostgreSQL transaction logic, provider behavior, and billing-order schema were not changed.

## 4. Behavioral verification

The focused regression uses the real HTTP route and an intentionally delayed authoritative persistence adapter.

| Scenario | Expected result | Result |
|---|---|---|
| Persistence delayed | No HTTP 201 before the save resolves; 201 after resolve | PASS |
| Persistence rejects | No apparent success; route returns the existing 400 error path | PASS |

## 5. Caller inventory

The fresh scoped repository sweep found exactly one direct production caller of `createBillingOrder`:

| Location | Role | Status |
|---|---|---|
| `apps/api/src/index.js` | API facade delegating to Store | unchanged |
| `apps/api/src/server.js` | Razorpay billing-order route caller | corrected and awaited |
| `apps/api/src/store.js` | authoritative mutation implementation | unchanged |

No second Razorpay billing-order lifecycle caller was discovered in `apps/api/src`, `tests`, `apps/web`, or `apps/mobile`.

## 6. Boundary preservation

- **AUTH-01:** persistence completion is now propagated through this caller; Store and PostgreSQL authority remain unchanged.
- **PAY-BASE-02:** Payment Allocation persistence and integrity rules are untouched.
- **PAY-BASE-03:** transaction, locking, CAS, and stale-writer protections are untouched.
- **Razorpay:** order creation, signature verification, subscription activation, invoice payment recording, and idempotency behavior are untouched except for awaiting billing-order persistence before success.
- **Accounting:** no accounting mutation or ownership boundary changed.
- **Banking:** no reconciliation or settlement behavior changed.
- **Payment Request:** not implemented; Report 55 remains unchanged.

## 7. Files in the proposed AUTH-01F boundary

- `apps/api/src/server.js`
- `tests/razorpay-billing-order-persistence-awaiting.test.js`
- `docs/eazinvoice-remediation-blueprint/56-phase-3c14-razorpay-billing-order-persistence-caller-hardening-report.md`

## 8. Validation

- Focused AUTH-01F regression: **2 passed, 0 failed**.
- Broader AUTH/PAY/Razorpay/accounting/banking/API regression: **216 passed, 0 failed, 1 skipped**.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**.
- `npm run mobile:check`: **PASS** (8/8).
- The live PostgreSQL concurrency case remains the existing **environment-dependent skip**; no live PostgreSQL server was available for that case.
- Full serial repository suite: **362 passed, 1 failed, 1 skipped**. The sole failure was the pre-existing `tests/postgres-document-registry.test.js` connection attempt to unresolved `db.example.com` (`ENOTFOUND`), not an AUTH-01F failure.
- `npm run db:check`: **environmentally unavailable** because `psql.exe` is not installed or configured through `PSQL_PATH`.
- `npm run db:verify-schema`: **environmentally unavailable** for the same missing-`psql` reason.
- `git diff --check`: **PASS**.
- Normal `npm test` remains unusable in this Windows environment because Node's parallel test runner fails every child file with `spawn EPERM`; the equivalent serial invocation above executed the tests successfully and exposed only the documented live-Postgres DNS failure.

## 9. Remaining work

This correction does not implement PaymentRequest, invoice-bound Pay Now, single-use QR links, automatic Payment Allocation, gateway settlement, or bank auto-reconciliation. Those remain the next architectural/implementation boundary after AUTH-01F final acceptance and separate commit.

## 10. Commit boundary

No files were staged, committed, or pushed during AUTH-01F. The proposed later commit must contain only the three files listed in Section 7. The pre-existing `android/app/build.gradle` modification and unrelated untracked workspace artifacts remain outside the boundary.
