# Phase 3D.15A — Vendor Bill Payment History and Idempotency Correction

## Baseline

- `HEAD == origin/main == 13acdbb3a418f76fb79c6a5ef1bf5b6d06dcb514`
- Report 180 identified missing payment-history loading and deterministic same-day payment keys.

## Corrections

- Vendor Bill detail now reads the existing scoped `/payments` authority and displays only payments whose persisted `vendorBillId` and business match the current bill/workspace.
- Payment history distinguishes an empty result from an unavailable payment service.
- Each rendered payment form receives a secure UUID-backed attempt key on first submission. The key remains attached across retries, blocks concurrent double-submit, binds the original payload, and is replaced when a successful refresh renders a new form.
- Network/ambiguous failures retain the original attempt identity and never auto-generate a replacement key.

## Authority and exclusions

No backend, accounting, payment-posting, database, Android, or deployment changes were made. Payable totals and acceptance of payments remain backend-authoritative.

## Verification

- Focused Vendor Bill/Web regression set: **47 passed, 0 failed**.
- Full suite through the approved elevated localhost execution path: **543 total, 541 passed, 0 failed, 2 skipped**. The two skipped tests are the existing live PostgreSQL concurrency checks.
- `npm run lint`: **passed**.
- `npm run build`: **passed**.
- `node --check apps/web/vendor-bill.js`: **passed**.
- `git diff --check`: **passed**.
- Existing PostgreSQL persistence/reload and multi-process concurrency, browser/responsive, and production deployment remain separate runtime gates.

## Verdict

READY FOR RE-ACCEPTANCE
