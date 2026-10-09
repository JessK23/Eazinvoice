# Phase 3D.6C — Invoice Workspace Context Fail-Closed Correction

## Scope

This surgical correction addresses the remaining Invoice detail defect identified by the Phase 3D.6B independent re-acceptance: an invalid persisted workspace selection could fall through to another team workspace or the first available workspace.

No backend, accounting, authentication, database, Android, Render, or financial-authority changes were made.

## Baseline

- Branch: `main`
- `HEAD`: `134ac8c57149b450e1602d3aacec9d0e655b02a1`
- `origin/main`: `134ac8c57149b450e1602d3aacec9d0e655b02a1`
- Staging index: empty before and after the correction

The pre-existing Phase 3.5/3D.6A candidate remains uncommitted. Its unrelated Android and workspace changes were preserved.

## Root cause

Invoice detail workspace resolution previously treated a stored workspace owner as a preference and then fell back to a team workspace, the first available workspace, or a current-user fallback when the stored selection was not found. That could load another business context for a stale or invalid deep link.

## Correction

`apps/web/invoice.html` now distinguishes explicit persisted selection from initial workspace selection:

1. If the workspace membership request fails, Invoice detail context is unavailable and the page fails closed.
2. If an explicit stored workspace owner exists but is not present in the authorized workspace list, the page fails closed with a safe context error.
3. An explicit valid selection is used to build the workspace-scoped detail query.
4. Only when no stored selection exists does the existing initial-selection behavior remain: team workspace, first available workspace, or the existing current-user fallback.
5. Invoice detail loads the Invoice, Payments, Allocations, and Payment Requests only after a valid workspace context has been established. Lifecycle actions remain the existing backend calls and cannot run while detail loading is blocked.

The existing allocation amounts, payment-state classification, Payment Request lifecycle presentation, and business/workspace-scoped reads from Phase 3.6A remain intact.

## Test coverage

`tests/invoice-detail-web.test.js` now verifies:

- explicit stored workspace selection is validated against authorized memberships;
- stale selection produces a fail-closed error;
- stale selection cannot fall through to team/first-workspace selection;
- workspace-membership lookup failure fails closed;
- valid detail reads remain workspace-scoped;
- prior allocation, payment, and Payment Request presentation behavior remains represented.

## Verification

- Focused Web/action regressions: **27 passed, 0 failed**
- Lint: **passed**
- Build: **passed**
- `git diff --check`: **passed** (only existing LF/CRLF warnings were reported)
- PostgreSQL, browser/responsive, and production verification: **not run**

The broader Phase 3D.6B run had five Windows restricted-runner `EACCES` failures while attempting ephemeral localhost HTTP servers. Those were environment execution blocks, not application assertion failures, and remain uncounted as passing tests.

## Commit/deployment status

- No files staged
- No commit created
- No push performed
- No deployment performed
- Report 160 and all unrelated artifacts remain outside this correction

## Verdict

**READY FOR RE-ACCEPTANCE**

The narrow stale-workspace fallback defect is corrected while the previously accepted financial presentation behavior remains unchanged. Phase 3D.6D should independently challenge stale selection, cross-business isolation, asynchronous/context behavior, and the preserved financial presentation paths.
