# Phase 3D.9 — PO/WO Detail and Lifecycle Presentation

## Package

3D-WEB-02B — Purchase Order / Work Order detail and lifecycle presentation.

## Scope

This implementation exposes the existing Purchase Order authority as a typed Web detail view for Purchase Orders and Work Orders. It keeps the existing draft editor route intact while adding `view=detail` links for issued documents. The detail view validates the persisted `documentType` against the requested `po` or `wo` route before rendering.

The view renders server-authoritative identity, supplier, dates, status, currency, totals, line items, notes and terms. It reuses the established workspace selection, scoped reads, generation checks and fail-closed asynchronous action context used by the Invoice detail surface.

## Supported actions

- Draft edit and delete through the existing Purchase Order authority.
- Draft issue through the existing issue endpoint with the validated workspace context and an idempotency key.
- Print and email for issued documents through the existing document flows.

## Explicit exclusions

This package does not add or imply payment, payable settlement, allocation, accounting, ledger, Banking, archive, restore, cancel or void authority. Purchase Orders and Work Orders remain intent documents; the Web surface does not create a financial effect.

## Changed files

- `apps/web/dashboard.js`
- `apps/web/invoice.html`
- `tests/po-wo-detail-web.test.js`
- this report

Existing Invoice detail tests were retained unchanged; the shared context helpers preserve their established behavior while the PO/WO detail surface uses a separate typed action guard.

## Verification

- Focused PO/WO, Invoice detail, navigation, Vendor Bill and Web action regressions: **46 passed, 0 failed**.
- Repository test suite using the approved elevated localhost execution path: **532 tests, 530 passed, 0 failed, 2 skipped**. The skipped tests were the pre-existing live PostgreSQL suites; no test failures were observed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Live browser/responsive behavior, live PostgreSQL persistence/concurrency, and Render deployment remain separate runtime gates.

No staging, commit, push, deployment, backend, accounting, database, authentication or Android changes are authorized in this package.

## Verdict

READY FOR INDEPENDENT ACCEPTANCE
