# EAZINVOICE PHASE 3C.8 / 3D-ACCT-02 — GENERAL LEDGER WEB EXPOSURE

## 1. Baseline

- Repository: `C:\Users\Jess\Documents\eazinvoice`
- Branch: `main`
- HEAD: `c6505aa060402f376c58755fcfa3a4eabb12667c`
- `origin/main`: `c6505aa060402f376c58755fcfa3a4eabb12667c`
- Phase 3C.7 is committed and synchronized.
- Pre-existing `android/app/build.gradle` modification was preserved.
- Unrelated untracked artifacts were preserved and not staged.

## 2. Package objective

Expose the existing server-side General Ledger capability as a dedicated, scoped, read-only Accounting Web surface. No ledger engine, posting behavior, persistence authority, reporting authority, Expense workflow, Quotation workflow, Mobile surface, or Eazy surface was added.

## 3. Architecture documents reviewed

Reviewed the persistence, reporting, Web transformation, action traceability, accounting preservation, end-state, feature-location, conflict, runtime, test traceability, dependency, wave, atomic-package, Phase 3C entry, 3C.7 completion, and Page & Flow Exposure Completeness documents listed in the implementation brief. Current production code was treated as authoritative where older documents differed.

## 4. Current backend GL contract

The existing route is `GET /accounting/general-ledger`. The server maps supported query parameters into the existing financial reporting capability:

`workspaceOwnerUserId`, `businessId`, `from`, `to`, `asOf`, `accountId`, `accountCode`, `bankAccountId`, `financialYear`, `closeDate`, and `includeClosingEntries`.

The Web exposes only the supported subset needed here: workspace/business scope, `from`, `to`, and `accountCode`. The response provides `businessId`, `period`, `filters`, and `rows`. Rows include backend-provided date, journal/source metadata, account identity, description, debit, credit, running balance, and balance side. No pagination contract was found.

## 5. Before/after page structure

Before:

```text
Accounting
  ├─ Summary
  ├─ Chart / Accounts
  ├─ Trial Balance
  └─ account-level ledger drill-down

Backend: General Ledger existed
Web: dedicated General Ledger surface missing
```

After:

```text
Accounting
  ├─ Summary
  ├─ Chart / Accounts
  ├─ Trial Balance
  ├─ General Ledger
  └─ account-level ledger drill-down

Backend: unchanged
Accounting engine: unchanged
```

## 6. Before/after flow

Before: Accounting navigation → broad Accounting panel → account drill-down only; dedicated GL route was not consumed by the Web.

After: `Accounting → General Ledger → getGeneralLedger → GET /accounting/general-ledger → existing authority → read-only rows/empty/error state → Accounting / General Ledger → END`.

Filter and refresh controls stay in the same Accounting context. No automatic Invoice, Customer, Vendor, Vendor Bill, Expense, Quotation, Payment, Banking, or Compliance handoff exists.

## 7. Accounting ownership

The new section is marked `data-surface-owner="accounting"` and `data-surface-purpose="general-ledger-read"`. Navigation uses the existing dashboard hash router with `#general-ledger`. No second router or SPA framework was introduced.

## 8. General Ledger Web implementation

`dashboard.html` now contains a dedicated read-only General Ledger page with heading, supported filters, loading state, empty state, error state, backend row rendering, and refresh/clear controls. `dashboard.js` loads the page when its hash is selected and renders backend-provided values without calculating balances.

## 9. API-client reuse

One thin centralized adapter was added: `apiClient.getGeneralLedger(token, filters)`, targeting `/accounting/general-ledger`. No direct scattered fetch and no second API client were added.

## 10. Workspace/business scope

The request begins with `selectedWorkspaceOptions()`, preserving the existing workspace owner and business context. Server authorization and scope resolution remain authoritative.

## 11. Entitlement behavior

No entitlement logic changed. Existing server-side session, workspace, authorization, and plan behavior remains in force.

## 12. Read-only guarantee

The new surface contains no POST, PATCH, DELETE, journal-create, journal-edit, journal-delete, payment, reconciliation, persistence, or browser accounting mutation. Refresh, filter, and clear controls issue only the existing GET request.

## 13. Accounting-engine preservation

Debit, credit, and running-balance values are displayed from the response. The browser does not derive totals, recalculate balances, post journals, or mutate accounting state.

## 14. Reporting-authority preservation

AUTH-03 remains unchanged. The Web consumes the existing General Ledger capability; it does not create a second reporting engine or move posting authority into Reports.

## 15. Persistence-authority preservation

AUTH-01 remains unchanged. No source switch, migration, schema change, backfill, browser persistence, or runtime/PostgreSQL cutover was introduced.

## 16. Account drill-down relationship

The existing account-level drill-down remains in the Accounting panel and continues using `getLedgerAccountEntries`. The dedicated GL view is a complementary broader read surface, not a replacement or competing authority.

## 17. Command Center separation

Command Center remains summary, alert, shortcut, navigation, and operational overview. No General Ledger CRUD or operational ownership was placed there.

## 18. Reports separation

Reports remains analytical/report consumption. The new GL page is explicitly owned by Accounting and does not mutate invoices, bills, payments, journals, or reconciliation.

## 19. Banking separation

Banking remains responsible for bank records, settlement, and reconciliation. Bank-related ledger rows may be displayed as accounting evidence, but no Banking action was added.

## 20. Compliance separation

Compliance remains responsible for GST/TDS workflows. No tax calculation or compliance mutation was added.

## 21. Customer/Vendor/Vendor Bill preservation

Sales still owns Customers. Purchases still owns Vendors and Vendor Bills. The GL page only displays source metadata returned by the backend and adds no master-data editing.

## 22. Expense status

Expense remains **CONDITIONAL**. No Expense entity, route, page, lifecycle, posting, or navigation was added.

## 23. Quotation status

Quotation remains **BLOCKED**. No Quotation entity, route, page, lifecycle, or scaffold was added.

## 24. Button/action/result matrix

| Control | Handler | Client/API | Authority | Result | Final context | Side effects |
|---|---|---|---|---|---|---|
| General Ledger navigation | Existing hash navigation / `showDashboardPage` | None | Accounting page ownership | Opens page | Accounting / General Ledger | None |
| Refresh General Ledger | `loadGeneralLedger` | `getGeneralLedger` → `GET /accounting/general-ledger` | Existing accounting/reporting authority | Rows, empty state, or error | Accounting / General Ledger | Read only |
| Load Ledger | Filter form submit → `loadGeneralLedger` | Same GET with supported filters | Existing scoped authority | Filtered authoritative rows | Accounting / General Ledger | Read only |
| Clear filters | Reset handler → `loadGeneralLedger` | Same GET with workspace scope | Existing scoped authority | Unfiltered scoped rows | Accounting / General Ledger | Read only |
| Existing account drill-down | Existing `loadLedgerDrilldown` | `getLedgerAccountEntries` → account ledger GET | Existing accounting authority | Account entries | Accounting | Read only |

## 25. Tests added

Added `tests/general-ledger-web-exposure.test.js`. It verifies production-grounded navigation, Accounting ownership, centralized client reuse, existing server route/scope parameters, backend-provided value rendering, absence of mutation controls, preservation of drilldown and existing ownership boundaries, and continued absence of Expense/Quotation workflows.

## 26. Regression results

Validation completed:

- Focused GL/ownership/authority/vendor-bill suite: **48 passed, 0 failed**.
- `npm run build`: **PASS**.
- `npm run lint`: **PASS**.
- `npm run mobile:check`: **PASS** (`8/8`).
- `npm run db:verify-reports`: **PASS**; PostgreSQL report totals matched normalized invoices, payments, PO/WO, and profit tables.
- `git diff --check`: **PASS**; only existing line-ending warnings were reported.
- Full `npm test`: **UNAVAILABLE — ENVIRONMENTAL**; Windows Node test workers fail with `spawn EPERM` before assertions.
- `npm run db:verify-schema`: **UNAVAILABLE — ENVIRONMENTAL**; `psql.exe` was not found.

## 27. Runtime verification

Browser verification of final hash, network sequence, rendered rows, empty/error states, tenant isolation, and absence of unexpected mutations was not performed through a safe existing browser mechanism. Runtime status is **UNVERIFIED**.

## 28. Environmental limitations

Full `npm test` may encounter Windows Node worker `spawn EPERM`. Schema verification may be unavailable if `psql.exe` is not installed. These are reported as environmental limitations and were not bypassed by changing production code.

## 29. Exact files changed

- `apps/api/src/client.js`
- `apps/web/dashboard.html`
- `apps/web/dashboard.js`
- `tests/general-ledger-web-exposure.test.js`
- `docs/eazinvoice-remediation-blueprint/42-phase-3c8-completion-report.md`

No backend business logic, accounting service, reporting authority, persistence authority, KYC, DocumentService, Mobile, Eazy, Android, migration, or package manifest was changed.

## 30. Proposed commit boundary

Only the five files listed in section 29 belong to Phase 3C.8. The pre-existing `android/app/build.gradle` modification and unrelated untracked artifacts remain outside the package.

## 31. Recommended commit message

`feat(web): expose general ledger under accounting`

## 32. Final verdict

Phase 3C.8 implements the smallest coherent General Ledger exposure: a dedicated Accounting Web page, existing scoped backend capability, supported filters, backend-value rendering, preserved drill-down, and read-only end state. No authority or unrelated domain was changed.

**PHASE 3C.8 — VERIFIED WITH RUNTIME ITEMS OUTSTANDING**
