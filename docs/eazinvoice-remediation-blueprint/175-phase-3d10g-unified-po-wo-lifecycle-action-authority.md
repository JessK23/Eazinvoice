# Phase 3D.10G — Unified PO/WO Lifecycle Action Document-Type Authority

## Baseline

- Branch: `main`
- `HEAD == origin/main == f1603f552d530369994ae2f2cb232d23bcf7a613`
- No staging, commit, push or deployment.

## Correction

The PO/WO action guards now share `isPurchaseDocumentTypeCurrent(documentRecord)`, which requires the exact persisted `po` or `wo` value to equal the requested route type. The shared Issue guard, Print, Email and Delete paths all reject missing, malformed, wrong-case and mismatched records independently of earlier loader validation.

Workspace context, record identity, lifecycle status, stale-response protection, existing backend routes and supported PO/WO actions remain unchanged.

## Scope preservation

- Draft editing/deletion and issued print/email behavior remain supported.
- Archive, restore, cancel, void, payment, settlement and accounting actions remain unavailable.
- No backend, accounting, payment, Invoice, authentication, database, Android or deployment behavior was changed.

## Verification

- Focused PO/WO suite: **11 passed, 0 failed**.
- Full regression suite through the approved elevated localhost execution path: **536 tests, 534 passed, 0 failed, 2 skipped**.
- The skipped tests remain the live PostgreSQL concurrency and PostgreSQL document-registry persistence checks.
- Lint: passed.
- Build: passed.
- `git diff --check`: passed.
- Browser/responsive verification, live PostgreSQL persistence/concurrency, test-role isolation and Render deployment remain open runtime gates.

## Verdict

READY FOR RE-ACCEPTANCE
