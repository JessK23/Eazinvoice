# P2-3F Core Document Lifecycle Remediation

Date: 2026-09-03

## Scope

This pass remediated the core document lifecycle for invoices, purchase orders, work orders, PDF preview behavior, and dashboard actions before the Android/WordPress/client parity pass.

Quotations were not implemented in this phase. The dashboard quotation shortcut is intentionally disabled until a real backend quotation model, persistence layer, numbering lifecycle, and quotation-to-invoice conversion flow exist.

## Implemented

- Added explicit server lifecycle predicates for finalized invoices and issued PO/WO records.
- Added server-authoritative final invoice number allocation at invoice finalization.
- Added server-authoritative PO/WO number allocation at PO/WO issue.
- Preserved draft identity with `draftNumber`; browser-generated draft numbers are no longer treated as legal final numbers.
- Added invoice finalization API path: `POST /invoices/:id/finalize`.
- Added PO/WO issue API path: `POST /purchase-orders/:id/issue`.
- Kept draft save/update on the same record instead of creating another record.
- Made invoice finalization idempotent for repeated/double-click attempts.
- Made PO/WO issue idempotent for repeated/double-click attempts.
- Blocked material edits to issued/finalized invoices; corrections must use controlled credit/reversal/refund/void workflows.
- Blocked material edits to issued PO/WO records; future changes should use revision/cancel/close workflows.
- Blocked ordinary delete for issued/finalized invoices and issued PO/WO records.
- Kept ordinary delete only for draft invoices and draft PO/WO records.
- Disabled PO/WO payment recording. Vendor bills remain the payable/payment workflow.
- Removed PO/WO accounting/payable impact from the business compliance dashboard.
- Added read-only HTML print/PDF preview routes for saved invoices and PO/WO records.
- Updated invoice workflow fallback so PDF preview no longer saves, creates, or finalizes records.
- Updated dashboard actions:
  - Draft invoices: Edit Draft, Finalize, Delete Draft.
  - Issued/finalized invoices: View, Email, Record Payment, Collect Online, View Only marker; no edit/delete.
  - Draft PO/WO: Edit Draft, Issue, Delete Draft.
  - Issued PO/WO: View, Email, View Only marker; no payment/delete.
- Kept WordPress local-record behavior unchanged for this stage.

## Data Observations

The recovered local JSON data previously showed legacy inconsistencies that were not automatically repaired in this pass:

- Invoice duplicate number groups: 1
- Purchase order duplicate number groups: 1
- Posted invoices without journals: 7
- Drafts with posted events: 0

Those are historical data-repair concerns, not code-path failures. They should be handled through an explicit production data integrity/reconciliation run, not silent mutation during a lifecycle patch.

## Verification

- `npm run build`: PASS
- `node tests\api.test.js`: PASS, 140/140
- `npm test`: PASS, 143/143 when rerun outside the Windows sandbox after sandbox `spawn EPERM`
- `node tests\mobile-document-actions.test.js`: PASS, 3/3
- `npm run web:p22-check`: PASS, 32/32
- `npm run mobile:check`: PASS, 8/8
- `npm run mobile:sync`: PASS
- `npm run release:check`: PASS
- `npm audit`: PASS, 0 vulnerabilities
- `git diff --check`: PASS, only Windows LF-to-CRLF warnings

## Remaining Work

- P2-3G client parity:
  - Android draft/finalize/issue UX should use the new explicit endpoints.
  - WordPress should remain local-only for free workflows; paid connected workflows should delegate to EazInvoice instead of pretending local plugin records are SaaS accounting records.
  - PDF/share/email UX should be reviewed across web, Android, and WordPress after this backend lifecycle pass.
- Quotation product work remains unresolved and intentionally disabled from quick actions.
- Existing legacy PO payment records, if any exist in production, need a separate read-only audit and decision.
- Production Render/Postgres validation and live data reconciliation were not run in this pass.

## Closure State

P2-3F CORE DOCUMENT LIFECYCLE - PASSED

