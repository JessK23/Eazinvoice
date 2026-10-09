# Phase 3D.6A — Invoice Detail Acceptance Corrections

**Package:** 3D-WEB-02A
**Baseline:** `134ac8c57149b450e1602d3aacec9d0e655b02a1`
**Branch:** `main`
**Mode:** Narrow Web-only correction; not staged, committed, pushed, or deployed

## Final verdict

**READY FOR RE-ACCEPTANCE**

The four findings from Report 158 were corrected without changing backend Invoice, Payment, Allocation, Payment Request, Accounting, authentication, or persistence authority.

## Existing candidate preservation

The Phase 3D.5 Invoice detail route and draft-editor compatibility were preserved:

`/apps/web/invoice.html?invoice=<id>&view=detail`

Existing `?invoice=<id>` draft/editor behavior remains intact. Invoice list links continue to route drafts to editing and non-drafts to detail.

## Corrections applied

### Allocation amount presentation

The detail view now renders each returned allocation with its backend-provided identity, amount, currency, payment reference, and date where available. It no longer reduces allocations to a count. It does not derive allocation values from Invoice totals or payment counts.

### Payment status classification

Linked payments are now labeled from persisted status fields as:

- Captured / verified;
- Pending / in progress;
- Failed / rejected;
- Unverified / unknown.

Non-captured records are not presented as settled receipts. No paid or outstanding amount is recalculated in the browser.

### Payment Request lifecycle

Each returned Payment Request now displays its reference, amount, currency, date, and lifecycle classification:

- Pending / active;
- Completed / fulfilled;
- Failed / recovery required;
- Expired / cancelled;
- Unknown.

Payment Requests remain visually and semantically separate from Payments. No Payment Request is treated as verified money.

### Business/workspace context

The detail page now loads the existing `/business/workspaces` authority, resolves the active workspace using the established `eazinvoice_business_workspace_owner` selection, and propagates the existing `workspaceOwnerUserId` and `businessId` query parameters to:

- Invoice detail;
- payments;
- allocations;
- Payment Requests.

If no valid workspace context is available, the detail view fails closed instead of querying by Invoice ID alone or falling back to another business.

## Changed files

- `apps/web/invoice.html`
- `tests/invoice-detail-web.test.js`
- `docs/eazinvoice-remediation-blueprint/159-phase-3d6a-invoice-detail-acceptance-corrections.md`

`apps/web/dashboard.js` remains part of the existing Phase 3.5 candidate and was not expanded by this correction.

## API contracts reused

No new contract was created. The correction uses the existing:

- `GET /business/workspaces`;
- `GET /invoices/:id`;
- `GET /payments`;
- `GET /payment-allocations`;
- `GET /payment-requests`.

No backend dependency was discovered.

## Tenant and authority safety

- bearer-token authentication remains unchanged;
- server-side business/workspace authorization remains authoritative;
- no cross-business fallback is used;
- allocation and payment values are not recomputed;
- no payment, allocation, Payment Request, journal, or accounting mutation was added;
- backend-controlled display values remain escaped before HTML insertion.

## Tests

Focused correction/regression command:

`node --test tests/invoice-detail-web.test.js tests/web-navigation-ownership.test.js tests/vendor-bill-web-exposure.test.js tests/action-contract.test.js`

Result: **26 passed, 0 failed**.

The focused tests now cover allocation amount/currency references, payment and Payment Request lifecycle classifications, workspace propagation, fail-closed context handling, deep-link compatibility, and lifecycle action preservation.

The earlier broader independent run remains accurately classified as:

- 78 total;
- 73 passed;
- 5 blocked by Windows restricted-runner `connect EACCES 127.0.0.1` before application assertions;
- no application assertion failure established for those five tests.

Those five tests were not relabeled as passing and were not bypassed by changing sandbox policy.

## Quality checks

- `npm run lint`: **passed**
- `npm run build`: **passed**
- `git diff --check`: **passed**
- line-ending messages: warnings only

## Open verification items

Still outstanding:

- actual browser deep-link, refresh, back/forward, narrow viewport, keyboard, and accessibility verification;
- PostgreSQL persistence/reload and multi-process concurrency;
- isolated PostgreSQL test-role verification;
- Render deployment and production workflow verification.

## Commit status

Nothing was staged, committed, pushed, or deployed. Reports 155, 156, 157, and 158 plus unrelated worktree artifacts remain preserved.
