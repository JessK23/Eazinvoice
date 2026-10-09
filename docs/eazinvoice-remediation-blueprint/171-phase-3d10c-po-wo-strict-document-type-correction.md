# Phase 3D.10C — Strict PO/WO Persisted Document-Type Validation

## Baseline

- Branch: `main`
- `HEAD == origin/main == f1603f552d530369994ae2f2cb232d23bcf7a613`
- No staging, commit, push or deployment.

## Root cause and correction

The detail loader previously used `String(documentRecord?.documentType || "po").toLowerCase()`. That converted missing, null, empty and malformed values into a valid Purchase Order identity. The loader now accepts only an exact persisted `documentType` of `po` or `wo`; all other values fail closed before header, supplier, item, amount or action rendering.

The detail body and action container are cleared/hidden at the start of a load, and the previous saved record is cleared. Invalid or mismatched responses therefore cannot leave stale document actions or email context available.

## Validation matrix

| Persisted type | Requested route | Result |
| --- | --- | --- |
| exact `po` | `po` | render PO detail |
| exact `wo` | `wo` | render WO detail |
| missing/null/empty/unknown/wrong-case/malformed | either | fail closed |
| exact `po` | `wo` | fail closed |
| exact `wo` | `po` | fail closed |

The Report 169 email-modal correction remains intact: valid persisted `po` and `wo` records label the shared modal correctly, while invalid records cannot open it.

## Changed files

- `apps/web/invoice.html`
- `tests/po-wo-detail-web.test.js`
- this report

No backend, document storage, accounting, payment, database, authentication, Android or deployment files were changed.

## Verification

- Focused PO/WO, Invoice, Vendor Bill, navigation and Web action suite: **48 passed, 0 failed**.
- Full regression suite: **534 tests, 532 passed, 0 failed, 2 skipped**.
- Skipped tests were the existing `PAY-BASE-03 live PostgreSQL concurrency suite` and `postgres document registry persists authoritative metadata`; they remain runtime/database verification gaps, not PO/WO failures.
- Lint: passed.
- Build: passed.
- `git diff --check`: passed.
- Browser/responsive verification, live PostgreSQL persistence/concurrency, test-role isolation and Render deployment remain open runtime gates.

## Verdict

READY FOR RE-ACCEPTANCE
