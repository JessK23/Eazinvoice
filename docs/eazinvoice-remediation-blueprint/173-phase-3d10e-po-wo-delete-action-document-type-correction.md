# Phase 3D.10E — Strict PO/WO Delete-Action Document-Type Authority

## Baseline

- Branch: `main`
- `HEAD == origin/main == f1603f552d530369994ae2f2cb232d23bcf7a613`
- No staging, commit, push or deployment.

## Correction

The PO/WO detail loader already required an exact persisted `documentType` of `po` or `wo`, but the draft delete handler still used a separate fail-open expression that defaulted missing values to `po` and normalized casing. The delete guard now reuses `persistedPurchaseDocumentType(documentRecord)` and requires an exact match with the requested type.

Missing, null, empty, malformed, wrong-case and mismatched persisted types therefore cannot enable or execute the delete action. The existing workspace, identity, status and stale-context guards remain unchanged.

## Scope preservation

- Existing valid `po` and `wo` detail behavior is preserved.
- The Report 169 email-modal correction and Report 171 strict detail-loader correction remain intact.
- No backend, document storage, accounting, payment, Invoice, authentication, database, Android or deployment behavior was changed.

## Verification

- Focused PO/WO suite: **10 passed, 0 failed**.
- Full regression suite through the approved elevated localhost execution path: **535 tests, 533 passed, 0 failed, 2 skipped**.
- The skipped tests remain the live PostgreSQL concurrency and PostgreSQL document-registry persistence checks.
- Lint: passed.
- Build: passed.
- `git diff --check`: passed.
- Browser/responsive verification, live PostgreSQL persistence/concurrency, test-role isolation and Render deployment remain open runtime gates.

## Verdict

READY FOR RE-ACCEPTANCE
