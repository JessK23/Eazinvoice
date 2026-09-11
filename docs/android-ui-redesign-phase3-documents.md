# EazInvoice Android UI Redesign Phase 3 — Documents

## 1. Scope

Focused the mobile Sales and Purchases experience around Invoice, Purchase Order and Work Order creation. Reports, Compliance and AI Agent were left unchanged. Quotation remains deferred because no authoritative quotation route or model exists.

## 2. Backend/API capability review

Confirmed existing authoritative routes: `POST /invoices`, `POST /invoices/:id/finalize`, `POST /purchase-orders`, and `POST /purchase-orders/:id/issue`. The purchase-order model accepts `documentType: "wo"`, and server/store logic treats Work Orders as purchase/work-order records with non-accounting behavior. No quotation endpoint or store model was found.

## 3. Invoice implementation

Sales now opens with a focused New Invoice workflow: back action, customer and date fields, repeatable item rows, Add item control, server-authoritative totals notice, lifecycle status and Save Draft/Create Invoice action. Payment, credit, refund and reversal forms are progressively disclosed under a separate section. Existing invoice finalization, archive, print/PDF and sharing actions remain on saved records.

## 4. Purchase Order implementation

Purchases now opens with a focused New Purchase Order workflow: vendor, PO/expected dates, repeatable items, total notice and Save PO Draft. Vendor Bill and supplier recovery workflows are separated below. The PO notice explicitly preserves its non-accounting boundary.

## 5. Work Order status

Implemented a dedicated New Work Order form using the existing purchase/work-order API with `documentType: "wo"`. It supports party, dates, project/reference, repeatable work items, notes and draft save. It remains non-accounting and uses the existing issue lifecycle on saved records.

## 6. Quotation status

Deferred. No authoritative quotation endpoint or model was found in the API, store or Web document flow. No client-only quotation persistence or invented route was added.

## 7. Reusable document components

Added shared document header, item editor/item row, totals notice, status badge, focused document card and progressive disclosure patterns. Item rows use repeated form names and are collected into API payloads by `documentItems`.

## 8. Lifecycle safeguards

Draft status remains the default for mobile-created documents. Final invoice numbering continues to occur only through the existing finalize endpoint. Print/Save as PDF remains presentation-only. Issued/finalized records continue to use existing immutable/archive behavior. Purchase and work orders continue through the existing issue endpoint and do not create payable journals merely by being issued.

## 9. Navigation behavior

The approved five-item bottom navigation remains Home, Sales, Purchases, Accounting and More. Document headers provide an in-app Back action routed to Home without changing native/browser history semantics. Reports remains accessible from Dashboard actions.

## 10. Responsive validation

Shared item rows use a four-column layout on wider mobile widths and collapse to two columns with the description spanning full width at the narrow breakpoint. Document headers, totals notices and primary buttons remain readable at representative 320–412px widths. A physical Android device pass remains a release-stage check.

## 11. Tests/results

- `npm run build` — passed.
- `npm test` — passed, 161/161.
- `npm run mobile:check` — passed after preserving all existing route contracts.
- `node tests/mobile-document-actions.test.js` — passed, 6/6.
- `npm run mobile:sync` — passed.
- `npm run release:check` — passed, including AAB/APK checks.
- `npm audit` — existing 3 vulnerabilities remain; no automatic fix was run.
- `git diff --check` — passed.

## 12. Deferred gaps

Quotation requires an authoritative backend model and route. Detailed edit screens for existing drafts, richer calculated totals, contextual payment actions and final device visual validation remain future polish.

## 13. Files changed

- `apps/mobile/app.js`
- `apps/mobile/styles.css`
- `tests/mobile-document-actions.test.js`
- `docs/android-ui-redesign-phase3-documents.md`

## 14. Git status

Changes are uncommitted. Existing auth/API changes, the Phase 1–2 audit/report, plugin ZIPs and `tools/` remain in the working tree and were not cleaned, reset or committed.
