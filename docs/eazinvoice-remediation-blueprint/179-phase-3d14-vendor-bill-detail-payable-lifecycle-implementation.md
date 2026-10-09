# Phase 3D.14 — Vendor Bill Detail and Payable Lifecycle Implementation

## Scope

Implemented the Web-only Vendor Bill detail surface using the existing Vendor Bill, workspace, and vendor-payment authorities. No backend, accounting, payment, migration, or deployment changes were made.

## Changes

- Added `apps/web/vendor-bill.html` as a deep-linkable Vendor Bill detail page.
- Added `apps/web/vendor-bill.js` for authoritative loading, payable display, explicit source-reference display, existing vendor-payment submission, and fail-closed workspace/context handling.
- Added a View link to the existing Vendor Bills list in `apps/web/dashboard.js`.
- Added `tests/vendor-bill-detail-web.test.js` covering route exposure, authority reuse, workspace isolation, payable fields, lifecycle bounds, idempotency, and browser-side authority exclusions.

## Explicit exclusions

- No new API endpoints or financial authority.
- No inferred PO/WO source links.
- No archive/cancel/restore capability.
- No vendor-bill email/PDF workflow.
- No browser-side accounting or payment allocation.

## Verification

- Focused Vendor Bill/Web regression set: **46 passed, 0 failed**.
- `npm run lint`: **passed**.
- `npm run build`: **passed**.
- `node --check apps/web/vendor-bill.js`: **passed**.
- `git diff --check`: **passed**.
- Full suite through the approved elevated localhost execution path: **542 tests, 540 passed, 0 failed, 2 skipped**. The two skipped tests are the existing live PostgreSQL concurrency checks.
- The restricted non-elevated full-suite attempt produced the known Windows localhost `EACCES` failures; it is not treated as application evidence. The elevated rerun completed without those failures.
- PostgreSQL persistence/reload and multi-process concurrency, browser/responsive, and production deployment remain separate runtime gates.

## Verdict

READY FOR INDEPENDENT ACCEPTANCE
