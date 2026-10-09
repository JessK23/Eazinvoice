# Phase 3D.10A — PO/WO Email Modal Document-Type Correction

## Baseline

- Branch: `main`
- `HEAD == origin/main == f1603f552d530369994ae2f2cb232d23bcf7a613`
- No staging, commit, push, deployment, backend or accounting changes.

## Root cause

The shared email modal used `documentTypeLabel()`, which reads the editor’s `documentTypeSelect`. In a direct Work Order detail route the editor selector can still hold its default Purchase Order value even after the detail loader has validated the persisted record as `wo`.

## Correction

Detail-mode email labeling now derives from the validated persisted `documentRecord.documentType`:

- `po` → Purchase Order
- `wo` → Work Order
- missing/unknown type → no document-specific email modal is opened.

Draft editor behavior continues to use the existing selector-driven behavior. The existing email endpoint, recipient handling, submission, backend authorization and error handling are unchanged.

## Changed files

- `apps/web/invoice.html`
- `tests/po-wo-detail-web.test.js`
- this report

## Context and async safety

The correction uses the already validated detail record and existing workspace/generation guards. It does not infer identity from stale selector state or unvalidated URL parameters.

## Verification

- Focused PO/WO, Invoice detail, Vendor Bill, navigation, routing and Web action regressions: **47 passed, 0 failed**.
- Full repository suite through the approved elevated localhost execution path: **533 total, 531 passed, 0 failed, 2 skipped**.
- The two skips remain unrelated live PostgreSQL checks: PAY-BASE-03 live concurrency and PostgreSQL document-registry persistence.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Browser/responsive verification, live PostgreSQL verification and Render deployment remain open runtime gates.

## Candidate boundary for re-acceptance

- `apps/web/dashboard.js`
- `apps/web/invoice.html`
- `tests/po-wo-detail-web.test.js`
- Report 167
- this correction report

Report 168 remains an acceptance artifact and is not part of the implementation boundary.

## Verdict

READY FOR RE-ACCEPTANCE
