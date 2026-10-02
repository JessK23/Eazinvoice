# Phase 3C.7 / 3D-ACCT-01 — Accounting Ownership Completion Report

## 1. Baseline

- Branch: `main`
- `HEAD`: `bda000fabb31890fc9864eaf58f242b8ec1699ca`
- `origin/main`: `bda000fabb31890fc9864eaf58f242b8ec1699ca`
- Expected Vendor Bill baseline commit is synchronized.
- Pre-existing `android/app/build.gradle` modification was preserved.
- Unrelated untracked files were preserved and not staged.

## 2. Package objective

This package establishes Web surface ownership among Command Center, Accounting, Reports, Banking, and Compliance while reusing existing backend authorities. It does not rebuild accounting or reporting and does not implement Expense, Quotation, Banking, Mobile, or Eazy work.

## 3. Files changed by 3C.7

- `apps/web/dashboard.html`
- `tests/accounting-ownership.test.js`
- `docs/eazinvoice-remediation-blueprint/40-phase-3c7-completion-report.md`

`apps/web/dashboard.js`, `apps/api/src/client.js`, `server.js`, `store.js`, authority modules, migrations, manifests, Android, Mobile, Eazy, and deployment files were not changed.

## 4. Current-state accounting matrix

| Capability | Current route | Current service/authority | Current data authority | Current Web location | Target owner |
|---|---|---|---|---|---|
| Accounting Summary | `GET /accounting/summary` | Existing accounting API/store implementation | PostgreSQL accounting implementation when configured; unavailable otherwise | `#accounting` | Accounting |
| General Ledger | `GET /accounting/general-ledger` | Existing financial reporting service | Accounting ledger and source events | Backend capability; no dedicated Dashboard GL view currently exposed | Accounting operational view when later exposed |
| Trial Balance | `GET /accounting/trial-balance` | Existing financial reporting service | Accounting ledger and journals | `#accounting` | Accounting operational view |
| Profit & Loss | `GET /reports/profit-loss` | Existing financial reporting service | Accounting ledger and financial events | `#report-profit-loss` | Accounting interpretation; Reports consumption |
| Accounts Receivable | `GET /reports/receivables` | Existing financial reporting service | Invoice/customer authority and accounting projection | Reports detail route | Accounting operational interpretation; Reports view |
| Accounts Payable | `GET /reports/vendor-payables` | Existing financial reporting service | Vendor Bill/purchase/vendor authority and accounting projection | Reports detail route | Accounting operational interpretation; Reports view |
| AR ageing | `GET /reports/ageing` | Existing financial reporting service | Invoice/customer authority | Reports detail route | Reports consumption of Accounting projection |
| AP ageing | `GET /reports/payables-ageing` | Existing financial reporting service | Purchase/vendor bill/vendor payment authority | Reports detail route | Reports consumption of Accounting projection |
| Sales reports | `GET /reports/sales` | Existing financial reporting service | Invoice/customer authority | Reports | Reports |
| Purchase reports | `GET /reports/purchase-register` and related routes | Existing financial reporting service | PO/WO, Vendor Bill, and vendor authority | Reports | Reports |
| GST reports | `GET /reports/gst-*`, `GET /accounting/gst-summary` | Existing compliance/accounting reporting services | Tax/compliance and accounting posting authority | Reports, Accounting GST reconciliation, Compliance | Compliance workflow; Reports/Accounting consumption |
| TDS reports | `GET /reports/tds-*` | Existing compliance/reporting services | TDS/compliance authority | Advanced workflows and Reports | Compliance workflow; Reports consumption |
| Bank accounts | `/bank/accounts` | Existing bank service/store | Bank account authority | Advanced Banking tab / Accounting bank book | Banking |
| Bank transactions | Bank statement/import routes | Existing bank service/store | Bank statement and transaction authority | Advanced Banking tab | Banking |
| Reconciliation | `/bank/reconciliation/*`, `/reports/bank-reconciliation` | Existing banking/reconciliation service | Bank matches and statement lines | Advanced Banking tab and Reports | Banking mutation; Reports projection |
| Invoice accounting | Invoice lifecycle and accounting routes | Existing invoice/accounting authority | Invoice, journal, financial event | Sales invoice workflow and Accounting views | Sales transaction → Accounting |
| Vendor Bill accounting | `/vendor-bills` and payment routes | Existing Vendor Bill/payment/accounting authority | Vendor Bill, AP, journal, payment | Purchases → Vendor Bills | Purchases transaction → Accounting |
| Payments | Invoice/Vendor Bill payment routes | Existing payment authorities | Payment and accounting event records | Sales/Purchases workflows | Payment authority → Accounting |
| Credits/refunds/reversals | Existing correction/payment routes | Existing credit/refund/reversal services | Source transaction and correction journals | Advanced workflows | Existing domain authority → Accounting |

## 5. Confirmed ownership conflicts

- Reports was linked under the Command Center navigation group even though it is a separate analytical/report-consumption owner.
- The Accounting surface was described as a generic ledger view derived from invoices, PO/WO records, and payments, which obscured its backend accounting authority.
- The Reports Expenses card described PO/WO-derived “expenses” despite no dedicated Expense workflow being implemented.
- Accounting, Reports, Banking, and Compliance were presented through a shared dashboard shell without explicit surface markers.

The correction is intentionally presentation and ownership-level. No backend source-of-truth conflict was found that requires an accounting or reporting engine change.

## 6. Implementation summary

The Web shell now marks:

- Command Center home as `command-center / operational-summary`;
- Accounting as `accounting / accounting-operations`;
- Reports and report detail as `reports / report-consumption`;
- Advanced workflow tabs carry ownership markers individually: Accounting for corrections/period/year-end controls, Banking for settlements/reconciliation, and Compliance for GST/TDS. The existing mixed shell remains one router surface; the markers describe actual tab ownership without presenting it as a second Accounting engine.

Navigation now places Reports in its own Reports group, adds an explicit Accounting Overview entry, labels the purchase reporting destination as A/P and Purchase Reporting, and labels the existing advanced Accounting entry as Accounting Governance. Existing hashes, router behavior, API methods, and backend routes are reused.

## 7. Before/after Web ownership

| Surface | Before | After 3C.7 |
|---|---|---|
| Command Center | Dashboard plus adjacent Reports link and finance summary | Operational summary, alerts, shortcuts, and links; not the Accounting or Reports owner |
| Accounting | Accounting panel existed but its authority was not explicit | Canonical Accounting operational surface backed by existing Accounting API routes |
| Reports | Reports panel existed and was grouped with Command Center | Explicit Reports owner for analytical/report consumption |
| Banking | Bank Book/Cash Book and reconciliation links were distributed across Accounting/Reports | Existing Banking capability remains intact; no second ledger or new Banking implementation |
| Compliance | GST/TDS links and profile/drill-downs were distributed in the shell | Compliance remains a separate workflow authority and was not moved into Accounting |

## 8. Command Center boundary

Command Center retains the operational dashboard, KPI summaries, readiness signals, alerts, and navigation. Its financial cockpit remains a summary of API-backed records. It does not own ledger balances, journal posting, P&L calculation, AR/AP authority, or reconciliation mutation.

## 9. Accounting boundary

Accounting owns the canonical operational interpretation of the existing Accounting Summary, chart, journals, books, trial balance, ledger, period, opening-balance, and year-end capabilities where those routes exist. The browser requests and renders backend results; it does not calculate authoritative balances.

## 10. Reports boundary

Reports owns analytical and report consumption. It uses the existing `/reports/summary` and `/reports/*` routes and does not mutate invoices, Vendor Bills, payments, journals, or reconciliation. A shared backend projection may serve both Accounting and Reports contexts; this package did not fork or duplicate it.

## 11. Banking boundary

Banking remains the owner of bank accounts, statement evidence, settlement, and explicit reconciliation. Existing Accounting Bank Book/Cash Book views were not rewritten, and no new bank persistence, matching logic, posting logic, or Banking workflow was introduced.

## 12. Compliance boundary

GST/TDS and statutory readiness remain Compliance-owned workflows. Accounting may reflect resulting postings, and Reports may consume compliance projections, but this package did not move compliance authority or tax rules into the browser.

## 13. Accounting Summary behavior

The Accounting page continues to call `apiClient.getAccountingSummary(token, workspaceOptions)`, which maps to `GET /accounting/summary`. The existing backend determines PostgreSQL availability and returns an honest unavailable/error result when appropriate. The Web renders that result and does not substitute Command Center totals.

## 14. General Ledger behavior

The General Ledger backend capability remains implemented at `GET /accounting/general-ledger` through the existing financial reporting service. A dedicated General Ledger Web view is **not currently exposed**: the Dashboard presents Accounting Summary, Trial Balance information, chart/account information, and account-level Ledger Drill-down where supported. No browser ledger calculation, dedicated GL handler, or local ledger state was added. A dedicated Web GL exposure remains future work if the target architecture requires it.

## 15. Trial Balance behavior

The existing `GET /accounting/trial-balance` route remains the authoritative report route. The Accounting page renders the existing trial-balance result and uses the existing ledger-account API for drill-down. No second calculator was introduced.

## 16. P&L behavior

P&L remains served by the existing `GET /reports/profit-loss` route and financial reporting service. Its accounting interpretation remains backend-owned; Reports remains the consumption surface for the existing report detail.

## 17. AR/AP behavior

AR and AP remain projections of existing invoice/customer and purchase/Vendor Bill/payment authorities. The package did not create AR/AP persistence or client-side balance calculations. Existing ageing and payable routes remain report-consumption endpoints while Accounting remains the canonical accounting interpretation.

## 18. Reporting reuse

The existing centralized `client.js` methods and server routes are reused. `/reports/summary` remains governed by AUTH-03: PostgreSQL-selected reporting is fail-closed and runtime reporting is used only under the existing compatibility selection. Runtime financial report routes remain their existing financial-reporting services.

## 19. Accounting authority preservation

Invoice finalization, Vendor Bill posting, payments, credits, refunds, reversals, manual journals, and period/year-end operations remain backend-owned. Opening a page or refreshing a read view does not create a financial mutation.

## 20. AUTH-03 conformance

`apps/api/src/reporting-authority.js` and its tests were not changed. Existing tests continue to confirm that Reports is distinct from Accounting, Compliance, Banking, and Command Center; PostgreSQL-selected `/reports/summary` is fail-closed; and Accounting Summary has its documented PostgreSQL/unavailable behavior.

## 21. Persistence authority preservation

No persistence module, authority matrix, migration, source switch, or compatibility behavior was changed.

## 22. Workspace/business isolation

Accounting refresh continues to pass `selectedWorkspaceOptions()` through the existing API client. No new query construction, persistence, or scope bypass was introduced.

## 23. Entitlement preservation

No entitlement or plan gate was changed. Existing server-side access and plan behavior remains authoritative.

## 24. Vendor Bill preservation

Vendor Bills remain under Purchases with the dedicated `vendor-bills` surface and existing API adapter. No Vendor Bill route, form, payment, status, posting, or terminal behavior was changed.

## 25. Expense future boundary

Expense was not implemented. There is no new Expense entity, route, table, migration, API method, page, or accounting rule. The clarified ownership leaves the future path as Purchases → Expense workflow → existing Accounting authority → optional Banking/payment relationship → Reports.

## 26. Quotation future boundary

Quotation was not implemented. No quotation entity, lifecycle, API, persistence, or Web page was added.

## 27. Mobile/Eazy boundary

No Mobile or Eazy file was changed. The mobile parity check was run only as a regression check.

## 28. Button/action traceability

| Button/navigation | Handler | API | Authority | Result/final context |
|---|---|---|---|---|
| Accounting Overview / Chart and Trial Balance | Existing hash navigation and `showDashboardPage`; `refreshAccountingSummary` on initialization/refresh | `GET /accounting/summary`, journal/book/GST APIs | Existing Accounting, journal, and compliance authorities | Render currently exposed backend results; remain in Accounting |
| Refresh Accounting | Existing `refreshAccountingBtn` listener | Existing Accounting API client methods | Accounting backend | Refreshes views only; no automatic financial mutation |
| Reports | Existing hash navigation and report rendering | `/reports/summary` and existing `/reports/*` methods | AUTH-03 reporting authority and underlying domain authorities | Render analysis; remain in Reports |
| A/P and Purchase Reporting | Existing report-detail navigation | Existing report routes | Vendor Bill/purchase/payment projections | Report consumption; no Vendor Bill mutation |
| Accounting Governance | Existing advanced-workflow navigation | Existing accounting period/journal/year-end routes | Existing Accounting governance authority | Existing backend-controlled action/result |

## 29. Updated page ownership matrix

| Surface | Current owner | Target owner | 3C.7 result |
|---|---|---|---|
| Command Center | Dashboard shell | Command Center | Explicit marker; summary/navigation boundary clarified |
| Customers | Sales | Sales | Preserved |
| Invoices | Sales | Sales | Preserved |
| Vendors | Purchases | Purchases | Preserved |
| PO/WO | Purchases | Purchases | Preserved |
| Vendor Bills | Purchases | Purchases | Preserved |
| Accounting Summary | Accounting panel/backend Accounting | Accounting | Explicit canonical ownership marker and copy; governance tabs are individually marked |
| General Ledger | Backend Accounting capability; no dedicated Dashboard GL view | Future Accounting operational view | Backend preserved; current Web exposure explicitly not claimed |
| Trial Balance | Accounting panel/report route | Accounting operational view | Existing authority preserved |
| P&L | Reports route with Accounting interpretation | Accounting interpretation; Reports consumption | No calculation or route change |
| AR | Reports route/projection | Accounting interpretation; Reports consumption | No persistence or calculation change |
| AP | Reports route/projection | Accounting interpretation; Reports consumption | No persistence or calculation change |
| Reports | Command Center-adjacent shell link | Reports | Separate navigation group and markers |
| Banking | Mixed Accounting/Reports links | Banking | Existing capability preserved; future exposure remains separate |
| Compliance | Compliance/Reports/advanced shell links | Compliance | Separate workflow authority preserved |
| Expense — future | Not implemented | Purchases → existing Accounting authority | Not implemented |
| Quotation — future | Not implemented | Sales non-posting workflow | Not implemented |

## 30. Focused tests

`node --test --test-isolation=none tests/accounting-ownership.test.js tests/web-navigation-ownership.test.js tests/vendor-bill-web-exposure.test.js tests/reporting-authority.test.js tests/persistence-authority.test.js tests/kyc-document-authority.test.js tests/action-contract.test.js`

Result: **43 passed, 0 failed**.

The new focused test file verifies explicit ownership markers, reuse of existing Accounting routes/client methods, Reports separation, absence of Expense/Quotation implementation, and read-only Accounting loading.

## 31. Regression results

- `npm run build`: PASS
- `npm run lint`: PASS
- `npm run mobile:check`: PASS (`8/8`)
- `npm run db:verify-reports`: PASS — PostgreSQL report totals matched normalized invoices, payments, PO/WO, and profit tables.
- `npm test`: unavailable before assertions because the Windows Node test runner failed to spawn workers with `spawn EPERM`.

## 32. Runtime verification

Static and API-contract verification passed. Browser runtime verification of final URL/hash state, live unauthorized behavior, workspace switching, absence of network mutations during page loading, and live Vendor Bill navigation was not performed in this package.

Runtime status: **PARTIAL**.

## 33. Environmental limitations

- Normal `npm test` is unavailable in this Windows environment because Node’s test runner encounters `spawn EPERM`; the focused suite passed with single-process isolation.
- `npm run db:verify-schema` is unavailable because `psql.exe` was not found. No repository or production code was changed to bypass this limitation.
- Browser runtime verification remains outstanding.

## 34. `git diff --check`

Passed for the 3C.7 changes.

## 35. Proposed commit boundary

Only these three files belong to the 3C.7 package:

- `apps/web/dashboard.html`
- `tests/accounting-ownership.test.js`
- `docs/eazinvoice-remediation-blueprint/40-phase-3c7-completion-report.md`

Do not include `android/app/build.gradle` or any unrelated untracked artifact.

## 36. Recommended commit message

`feat(accounting): establish accounting surface ownership`

## 37. Final verdict

**PHASE 3C.7 — VERIFIED WITH RUNTIME ITEMS OUTSTANDING**

The package remains within the selected surface-ownership boundary. Accounting, Reports, Banking, Command Center, and Compliance retain distinct roles; no accounting engine, reporting engine, posting logic, persistence authority, migration, Expense workflow, Quotation workflow, Mobile code, or Eazy code was changed.
