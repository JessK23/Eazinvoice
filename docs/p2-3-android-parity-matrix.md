# P2-3 Android SaaS/API Parity Matrix

Status date: 2026-08-16

## Architecture Decision

Android is now scoped as a mobile SaaS client:

`Android -> Auth -> Business Context -> EazInvoice API -> Authoritative Backend -> Mobile Presentation`

The Android app collects intent and displays results. It does not own invoice totals, GST, TDS, payment allocation, credit/refund accounting, postings, compliance, bank reconciliation, period locking, or year-end results.

## Capability Matrix

| Backend capability | Android status | Notes |
| --- | --- | --- |
| Auth | Complete | Email OTP login uses backend auth; Google mobile auth remains deferred. |
| Session expiry/logout | Complete | 401 clears session; logout clears token/business/mobile data. |
| Secure storage | Partial | Uses native Capacitor Preferences if present, otherwise browser storage fallback. Add an Android Keystore-backed plugin before public release if Preferences is unavailable. |
| Business switch | Complete | Multi-business switch clears visible data and reloads by business context. |
| Dashboard / Finance Cockpit | Complete | Mobile metrics are fetched from backend reports/accounting APIs. |
| Customers | Complete | List and create via API. |
| Vendors | Complete | List and create via API. |
| Invoices | Complete | Create draft/issued intent through API; backend returns authoritative totals. |
| Payments | Complete | Customer payment form posts to invoice payment API with idempotency key. |
| Credit Notes | Complete | Simplified source-invoice credit-note workflow. |
| Refunds/Reversals | Simplified Mobile | Customer refund and payment reversal supported; reversal/refund distinction is explicit. |
| Purchase Orders | Complete | PO creation retained; UI states no accounting impact until bill. |
| Vendor Bills | Complete | Vendor bill posting form uses backend purchase/AP engine. |
| Vendor Payments | Complete | Vendor bill payment workflow posts to backend. |
| Vendor Credits | Complete | Simplified vendor-credit workflow. |
| Vendor Recovery | Complete | Supplier recovery posts to backend vendor refund/recovery API. |
| Receivables | Complete | Backend report summary; detailed ageing is compact/mobile. |
| Payables | Complete | Backend vendor-payables summary; detailed ageing is compact/mobile. |
| P&L | Complete | Summary-first backend report. |
| Balance Sheet | Complete | Ledger-derived backend report with integrity/completeness fields where returned. |
| Trial Balance | Simplified Mobile | Read-only summary; dense review remains Web-preferred. |
| General Ledger | Web Preferred | Mobile displays summary only; detailed account drill-down remains Web. |
| GST | Simplified Mobile | Summary and review posture; full register reconciliation remains Web-preferred. |
| TDS | Simplified Mobile | Summary/register posture; filing/governance remains Web-preferred. |
| Banking | Simplified Mobile | Bank/cash and reconciliation summary. Full statement matching/import remains Web-preferred. |
| Periods | Simplified Mobile | Status and readiness review; close/reopen governance remains Web-preferred unless later given a dedicated confirmation UX. |
| Year-End | Simplified Mobile | Preview/readiness only. Execute/reopen/reclose remains Web-preferred. |
| Business/Team | Simplified Mobile | Team/settings posture shown. Secret editing and API-key generation are Web-preferred. |
| Settings | Complete | API endpoint control supports dev/staging/prod; release must use HTTPS. |
| PDF / Share | Partial | Native share intent remains available for loaded authoritative documents; full server PDF retrieval should be added if backend exposes canonical PDFs. |
| Offline | Complete | Offline banner; financial writes are blocked, no silent financial queue. |
| Deep links | Deferred | App architecture is route-ready, but Android intent filters for invoice/payment deep links are deferred. |
| Push notifications | Deferred | No push infrastructure added in P2-3. |

## Play Internal Testing Readiness Checklist

| Area | Status | Notes |
| --- | --- | --- |
| Package ID | Complete | `com.eazinvoice.app` preserved. |
| Version | Complete | Candidate `versionName 1.2.0`, `versionCode 3`; confirm Play Console has not used code 3. |
| Target SDK | Complete | `targetSdkVersion 36`, `compileSdkVersion 36`. |
| Permissions | Complete | Only `INTERNET` is declared. FileProvider exists for sharing. |
| Cleartext traffic | Complete | No broad cleartext permission in manifest. Development HTTP endpoint is UI-warned. |
| Signing | Partial | Example file scrubbed. Actual upload keystore/passwords must remain outside git. |
| Privacy policy | Partial | Mobile links to `https://www.eazinvoice.com/apps/web/privacy.html`; confirm it is publicly accessible and legally final. |
| Account deletion | Deferred | Needs a support/request workflow that distinguishes user deletion from legal financial-record retention. |
| Data safety draft | Complete | See section below. |
| Native debug build | Pending verification | Requires Gradle 9.4.1 wrapper distribution availability. |
| Release AAB | Pending signing/toolchain | Requires valid upload key and Gradle build success. |

## Play Data Safety Draft

EazInvoice processes account identity, business contact data, customer/vendor records, invoices, purchase records, payments, GST/PAN/TAN-style tax identifiers where entered, bank/cash references, compliance/task data, and app diagnostics/audit events. Data is transmitted to the EazInvoice backend over HTTPS in production. The app should not claim zero data collection. Financial services declarations should describe business invoicing/accounting/compliance tooling, not lending, investment, banking, or government filing verification.

## Deferred Hardening

- Run the mobile live workflow against a disposable Postgres/RLS backend when a clean `DATABASE_URL` is available.
- Add a native Android secure-storage plugin if Capacitor Preferences is not present in the final runtime.
- Add Android deep links for authenticated invoice/payment/dashboard navigation.
- Add server-authenticated canonical PDF download/share when the API exposes invoice PDFs.
- Add emulator/physical-device smoke before Play upload.
