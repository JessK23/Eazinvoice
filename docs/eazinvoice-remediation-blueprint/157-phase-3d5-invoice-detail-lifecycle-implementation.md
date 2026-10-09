# Phase 3D.5 — Invoice Detail and Lifecycle Presentation Implementation

**Package:** 3D-WEB-02A
**Baseline:** `134ac8c57149b450e1602d3aacec9d0e655b02a1`
**Mode:** Narrow Web implementation; not staged, committed, pushed, or deployed

## Final verdict

**READY FOR INDEPENDENT ACCEPTANCE**

The implementation adds a canonical `view=detail` mode to the existing Invoice URL without replacing the legacy `?invoice=<id>` editor behavior. Invoice list entries now open the detail mode for non-draft records, while draft records remain editable through the existing editor path.

## Changed files

- `apps/web/invoice.html`
- `apps/web/dashboard.js`
- `tests/invoice-detail-web.test.js`
- `docs/eazinvoice-remediation-blueprint/157-phase-3d5-invoice-detail-lifecycle-implementation.md`

No API server, Store, Accounting, Payment, Allocation, authentication, Android, PostgreSQL, or Render files were changed.

## Canonical route and API contracts reused

Canonical detail route:

`/apps/web/invoice.html?invoice=<invoice-id>&view=detail`

The view reuses the existing authenticated endpoints:

- `GET /invoices/:id`
- `GET /payments`
- `GET /payment-allocations?documentType=INVOICE&documentId=<id>`
- `GET /payment-requests?invoiceId=<id>`
- `POST /invoices/:id/finalize`
- `POST /invoices/:id/archive`
- `POST /invoices/:id/restore`

No new backend endpoint or financial mutation was introduced.

## Invoice detail coverage

The detail surface displays, when returned by the backend:

- invoice number or draft number;
- customer;
- invoice and due dates;
- currency;
- lifecycle and payment status;
- subtotal, discount, tax, total, paid, outstanding, and credit-adjustment fields;
- line items;
- linked payment records;
- allocation count and Payment Request count.

Unavailable optional fields are presented as `Unavailable`; the Web does not invent replacement accounting values.

## Lifecycle action matrix

| State | Web behavior |
|---|---|
| Draft | Shows Edit Draft and Finalize Invoice. Finalization uses the existing endpoint. |
| Issued/finalized | Read-only presentation with Archive Invoice where supported. |
| Archived | Read-only presentation with Restore Invoice where supported. |
| Missing/unauthorized/API failure | Hides the detail body and shows a safe unavailable/error state. |

The view does not add cancellation, reversal, payment creation, allocation, journal posting, or manual balance adjustment.

## Payment and allocation presentation

Payment history is read from the existing payments authority and filtered to the loaded Invoice identifier in the Web projection. Allocations are read from the existing document-filtered allocation authority. Payment Requests are read for the same Invoice. If any auxiliary read is unavailable, the surface reports that limitation instead of creating a new endpoint or inferring financial state.

The detail view contains no `recordInvoicePayment`, `createPaymentAllocation`, or `createPaymentRequest` call. It cannot create a second financial authority.

## Tenant, business, and authorization safety

The detail request retains the existing bearer-token boundary and server-side Invoice lookup. The browser does not fall back to another Invoice, business, or workspace when the requested record is unavailable. Existing server authorization and business scoping remain authoritative.

## Deep-link compatibility

Existing `?invoice=<id>` links continue to load the established editor behavior. New dashboard links use `view=detail` for non-draft Invoice records. Draft list entries continue to use the editor route so existing draft editing is not broken.

## Verification

Focused test added:

- `tests/invoice-detail-web.test.js` — deep-link routing, backend-authority reuse, lifecycle action boundaries, legacy editor compatibility, and unavailable-state handling.

The implementation was checked with source-level focused tests and syntax/build checks after editing. Browser execution, responsive rendering, PostgreSQL persistence/reload, multi-process concurrency, test-role isolation, and Render deployment were not performed in this package and remain open verification gates.

## Independent acceptance criteria

- detail route loads only the requested authenticated Invoice;
- list-to-detail links use `view=detail` without breaking draft editor links;
- all displayed financial values originate from backend responses;
- finalized and archived state behavior is read-only and lifecycle-valid;
- finalize/archive/restore use existing backend authorities;
- payments, allocations, and Payment Requests are displayed read-only;
- missing, unauthorized, auxiliary API failure, and optional-field states are safe;
- no new financial mutation or backend authority exists;
- focused Web tests, relevant navigation tests, lint, build, and diff check pass;
- browser runtime limitations are reported separately.

## Open verification items

- actual browser deep-link, back/forward, and responsive runtime behavior;
- live PostgreSQL persistence/reload and multi-process concurrency;
- isolated PostgreSQL test-role verification;
- production deployment and live workflow verification.
