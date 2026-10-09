# Phase 3D.6E — Invoice Async Context and Lifecycle Action Safety Corrections

## Final verdict

**READY FOR RE-ACCEPTANCE**

The two material findings from Report 162 were corrected within the Web Invoice detail boundary. No backend, accounting, authentication, PostgreSQL, Android, Render, or shared-workspace changes were made.

## Baseline

- Branch: `main`
- `HEAD`: `134ac8c57149b450e1602d3aacec9d0e655b02a1`
- `origin/main`: `134ac8c57149b450e1602d3aacec9d0e655b02a1`
- Staging index: empty
- No commit, push, or deployment performed

The pre-existing Invoice candidate and unrelated worktree artifacts were preserved.

## Root causes corrected

1. Invoice detail loads had no immutable context snapshot or generation check, so a delayed old-context response could reach the current detail DOM.
2. Finalize, Archive, and Restore handlers used the existing backend routes without checking that the displayed workspace context and Invoice state were still current before and after submission.

## Changed files

- `apps/web/invoice.html`
- `tests/invoice-detail-web.test.js`
- `docs/eazinvoice-remediation-blueprint/163-phase-3d6e-invoice-async-context-lifecycle-correction.md`

`apps/web/dashboard.js` was not changed by 3D.6E. The existing Phase 3D.5/3D.6A/3D.6C candidate change remains present and uncommitted.

## Request snapshot and stale-response protection

Invoice detail now captures an immutable snapshot containing:

- selected `workspaceOwnerUserId`;
- selected `businessId`;
- Invoice identifier;
- context generation.

The detail loader also owns a load generation. It checks both the load generation and current context:

- after the Invoice response;
- after the Payments, Allocations, and Payment Requests response group;
- before DOM rendering;
- in the error path.

If the snapshot is stale, the response is discarded without rendering financial values, related records, or an error from the old context. A `storage` event for the established workspace-selection key invalidates the current context, hides the previous detail body, and requires a fresh validated context.

This uses a generation/context guard rather than relying on cancellation alone, so a response that settles after cancellation or context change cannot update the page.

## Context invalidation

Workspace membership resolution increments the context generation. A workspace selection change invalidates the detail context and clears the usable workspace options. Invalid or unresolved context therefore prevents subsequent Invoice, Payment, Allocation, and Payment Request reads and prevents lifecycle actions.

The existing explicit-selection fail-closed behavior remains intact: a stale or unauthorized stored owner cannot fall back to a team or first workspace.

## Lifecycle action context safety

Finalize, Archive, and Restore now use a shared Web helper that:

1. verifies the captured context is still current;
2. verifies the Invoice identity still matches the canonical detail route;
3. verifies the expected current Invoice state;
4. refuses a second click while the action is pending;
5. calls the existing scoped route through `detailScopedPath`;
6. ignores delayed success, failure, and refresh results after context invalidation;
7. re-enables the action button only when its captured context is still current.

No new endpoint, header, backend authorization rule, or accounting mutation was introduced. A request already received by the server remains governed by the existing backend authorization/idempotency boundary; the Web guard prevents stale UI responses and stale-context submissions where the request has not yet been sent.

## Preserved financial presentation

The prior accepted behavior remains present:

- Invoice totals, taxes, discounts, currency, paid, outstanding, and credit-adjusted values are displayed from backend responses;
- allocation amount, currency, identity, and date are displayed from allocation records;
- Payments are classified as captured/verified, pending, failed, or unknown;
- Payment Requests display lifecycle state and remain distinct from Payments;
- no browser-side financial calculation or Payment, Allocation, Payment Request, journal, or accounting mutation was added;
- canonical deep links and draft editor compatibility remain unchanged.

## Test coverage

`tests/invoice-detail-web.test.js` now covers the correction contracts for:

- context snapshots and load-generation checks;
- delayed response rejection after workspace changes;
- storage-driven context invalidation;
- lifecycle action context validation;
- scoped lifecycle routes;
- repeated-click protection;
- stale action response suppression.

These focused tests are source/contract-level tests in the repository's existing Web test style. Full browser execution with realistic delayed network fixtures remains an open runtime gate.

## Verification

Focused Web/action regressions:

- **29 passed, 0 failed**

Broader related suite:

- **83 total**
- **78 passed**
- **5 blocked** by restricted Windows localhost `EACCES`
- **0 application assertion failures established**
- **0 skipped**

The five blocked tests were four authentication HTTP tests and one Payment Request HTTP test. They failed before application assertions while connecting to ephemeral `127.0.0.1` ports. No sandbox settings were changed and blocked tests are not counted as passes.

Quality checks:

- `npm run lint`: **passed**
- `npm run build`: **passed**
- `git diff --check`: **passed**; existing LF/CRLF warnings only

## Remaining limitations and open gates

- Real browser delayed-response/context-switch verification remains outstanding.
- Browser refresh, back/forward, responsive, keyboard, and accessibility verification remain outstanding.
- PostgreSQL persistence/reload, multi-process concurrency, and test-role isolation remain outstanding.
- Render deployment and production verification remain outstanding.

## Commit status

Nothing is staged, committed, pushed, or deployed. Reports 155–162 and unrelated artifacts remain outside any commit.

## Next step

Run Phase 3D.6F independent acceptance against the complete Invoice candidate, with behavioral delayed-response fixtures and lifecycle context-change scenarios as required by Report 162.
