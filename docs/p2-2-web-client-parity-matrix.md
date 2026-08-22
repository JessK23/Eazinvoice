# P2-2 Web Client Parity & Accounting UX

## Architecture Rule

Web collects input and presents results. The API remains authoritative for financial results, accounting postings, compliance interpretation, bank reconciliation evidence, period controls, and reporting.

## Current Web Parity

| Product Area | Web Surface | Backend Authority | P2-2 Status | Notes |
| --- | --- | --- | --- | --- |
| Business context | Global business switcher and Business Workspace selector | `workspaceOwnerUserId` passed to API calls | Improved | Switcher uses the existing membership/workspace model instead of browser-owned business state. |
| Dashboard | Finance Cockpit, metrics, readiness lists | `getReportSummary`, business settings, compliance dashboard | Improved | Owner/accountant views are presented in plain language while keeping API totals authoritative. |
| Sales | Invoice workspace, customers, invoice payments, credit notes | Invoice/payment/credit note API and accounting posting services | Complete for supported backend workflows | Credit-note posting is available from Advanced Financial Workflows with source invoice lineage and backend recalculation. |
| Purchases | PO/WO workspace, vendors, payable signals, vendor credits | Purchase/payment/vendor credit API and accounting posting services | Complete for supported backend workflows | Vendor-credit posting is available from Advanced Financial Workflows with source bill lineage and backend recalculation. |
| Accounting | Chart of accounts, journal entries, GL books, Trial Balance, Balance Sheet, Cash Flow | Accounting/reporting API | Existing | Web presents ledger-derived statements and does not rebalance locally. |
| Settlements | Customer/vendor payment reversal, customer refund, vendor recovery | Settlement/reversal APIs and accounting posting services | Complete for supported backend workflows | Web distinguishes reversal from refund/recovery and backend validates available balances. |
| Banking | Bank/cash account creation, statement line import, match/unmatch, reconciliation summary | Bank/reconciliation backend | Complete for supported backend workflows | Statement import remains evidence only and does not create journals. Matching is backend-validated. |
| Compliance | GST/TDS registers, reconciliation, obligations, compliance profile | Compliance engine and financial report API | Complete for supported backend workflows | Filing semantics remain prepared/readiness oriented, not statutory filing submission. |
| Periods/year end | Period readiness/status, opening balances, year-end readiness/preview/close/reopen | Period/year-end close services | Complete for supported backend workflows | Preview is non-mutating; close/reopen actions require backend authorization and reason where expected. |
| Governance | Team, API keys, approvals, audit trail, delivery events | Business Workspace API | Existing | Role-aware controls already disable mutations for read-only workspace roles. |
| Reports | Revenue, invoices, expenses, PO/WO, P&L, GST, compliance, paid report placeholders | Report summary API | Existing | Detail reports still include some client-side fallback for unavailable summaries. |

## P2-2B Additions

- Advanced Financial Workflows page with Corrections, Settlements, Banking, Periods, Year-End, GST and TDS tabs.
- Credit note and vendor credit posting forms that submit source document, reason, date and adjustment lines to backend services.
- Customer/vendor payment reversal and customer/vendor refund/recovery forms with distinct terminology.
- Bank/cash account creation, manual statement-line import, match and unmatch workflow controls.
- Period readiness, soft-close, close, reopen and opening balance controls.
- Year-end readiness, non-mutating preview, close and reopen controls.
- GST sales/purchase register, GST reconciliation, TDS register, TDS reconciliation and compliance obligation drill-down tables.
- Expanded static web check from 14 checks to cover advanced workflow routes and API wiring.

## Remaining Web UX Gaps

## Closure Position

P2-2B closes the major Web parity gap for supported backend financial workflows. Remaining work should be treated as refinement or future product depth unless browser workflow testing identifies a blocker.
