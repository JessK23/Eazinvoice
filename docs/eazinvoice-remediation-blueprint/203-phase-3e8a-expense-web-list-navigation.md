# Phase 3E.8A — Expense List and Purchases Navigation

## Scope

Implemented the read-only Expense entry point under Purchases. The dashboard now reads the existing workspace-scoped `GET /expenses` authority and presents supported Expense fields without creating, reversing, filtering, sorting, paginating, or deriving financial values in the browser.

## Changed files

- `apps/web/dashboard.html` — Purchases navigation and read-only Expenses surface.
- `apps/web/dashboard.js` — workspace-scoped Expense loading, stale-context protection, rendering, loading/empty/error states and retry.
- `tests/expense-web-list.test.js` — focused Web integration coverage.
- `tests/accounting-ownership.test.js` — updates the historical capability assertion to recognize the approved Purchases surface.
- `tests/vendor-bill-web-exposure.test.js` — scopes the existing Vendor Bill isolation assertion to the Vendor Bill section.

## Financial and security boundaries

- No backend, accounting, journal, payment, creation or reversal behavior changed.
- The existing API client and backend authorization remain authoritative.
- Responses are discarded if the active workspace changes while the request is pending.
- The UI does not claim server-side search, filtering, sorting or pagination.
- No non-existent Expense detail or creation route is advertised.

## Verification

- Focused Expense/navigation and affected ownership/Vendor Bill regressions: **13 passed, 0 failed**.
- All Web-labelled tests: **111 passed, 0 failed**.
- Repository lint: **passed**.
- Repository build/syntax checks: **passed**.
- `git diff --check`: **passed**.
- Full repository suite: **496 passed, 66 failed, 2 skipped**. The failures are outside the phase-specific Web regression set and include existing environment/runtime-sensitive coverage; they require separate triage and are not reported as a full-suite pass.
- PostgreSQL persistence/concurrency, browser/responsive behavior and production deployment remain separate open runtime gates.

## Verdict

READY FOR EXPENSE CREATE FORM IMPLEMENTATION
