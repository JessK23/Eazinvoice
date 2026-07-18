# EazInvoice Paid Tier Completion Roadmap

This roadmap tracks paid subscription implementation against the Master Development plan. Update it whenever a feature moves from planned to active.

## Current Tier Catalog

| Tier | Price | Status | Current usable features | Pending build work |
| --- | ---: | --- | --- | --- |
| Free | INR 0/month | Active | Email OTP auth, basic invoices and PO/WO, drafts, manual payment tracking, PDF/print, basic reports, customer/vendor records, one primary business/profile, free WordPress plugin connector | Ongoing polish and bug fixes only for current free scope |
| Standard | INR 199/month, billed yearly at INR 2,388 | Mostly active | Free features, higher limits, WhatsApp sharing gates, Razorpay invoice collection/payment-link foundation, recurring draft scheduler, WordPress paid-tier messaging | Final live Razorpay verification, branding-removal polish, recurring schedule UI refinements |
| Pro | INR 499/month, billed yearly at INR 5,988 | Mostly active | Standard features, AI invoice/PO/report assistant, AI usage limits and indicators, advanced report categories, multiple business/profile capacity | AI Agent upgrade, advanced exports, deeper analytics graphs and report polish |
| Business | INR 999/month, billed yearly at INR 11,988 | Active with hardening in progress | Pro features, team/sub-user access, role-based workspace permissions, approvals, API keys, Business SMTP settings, Business Razorpay gateway settings, compliance dashboard, audit trails, notification delivery history | Production role-access audit, external communication retry hardening, priority support workflow, final API documentation, role-specific UI polish |

Enterprise pricing is intentionally ignored for now.

## Completed Foundation

1. Plan catalog and entitlement gates exist for Free, Standard, Pro, and Business.
2. Admin preview mode exists for testing tiers and must remain admin-only.
3. Razorpay order and signature verification flow exists for yearly paid activation.
4. PostgreSQL mirroring exists for core users, subscriptions, invoices, PO/WO, payments, and reports while local runtime remains supported.
5. Invoice and PO/WO lifecycle hardening exists for draft, create, update, delete, payments, and report impact.
6. Business workspace features exist for sub-users, approvals, API keys, compliance, SMTP/gateway settings, audit events, and notification delivery history.

## Remaining Master Development Work

1. Business-tier production security hardening
   - Keep owner/admin roles impossible for sub-users.
   - Verify Accountant and Viewer permissions across records, reports, compliance, API keys, settings, and notifications.
   - Keep invite links disabled; sub-users log in with their assigned email.
   - Keep audit metadata sanitized so secrets never appear in UI or logs.

2. Business-tier external communication hardening
   - Send approval alerts, compliance reminders, gateway failure notices, and team action notices through validated Business SMTP.
   - Keep retry status, failed/not-configured states, and audit history visible.
   - Avoid exposing SMTP passwords or gateway secrets.

3. Razorpay live subscription audit
   - Confirm Standard orders are INR 2,388 yearly / 238800 paise.
   - Confirm Pro orders are INR 5,988 yearly / 598800 paise.
   - Confirm Business orders are INR 11,988 yearly / 1198800 paise.
   - Confirm successful payment updates runtime and PostgreSQL entitlements consistently.

4. AI Agent upgrade after Master Development stabilization
   - Keep current AI Assistant as command-based draft/report support.
   - Upgrade to AI Agent only after subscriptions, reports, compliance, and workspace security are stable.
   - Add customer-service chatbot separately after AI Agent architecture is safe.

5. WordPress plugin parity
   - Keep WordPress.org free plugin compliant.
   - Add paid-tier messaging, API connection validation, invoice/PO entry points, and upgrade flow aligned with web tiers.
   - Do not expose paid features unless API entitlement confirms them.

6. Android app parity
   - Build mobile-first UI for auth, dashboard, invoices, PO/WO, reports, subscriptions, and AI Assistant.
   - Keep APK/AAB size lean.
   - Reuse backend entitlements instead of duplicating plan logic in the app.

## Release Guardrails

- Do not reset, delete, or deregister existing users during any release.
- Do not expose user data without authentication and workspace ownership/team permission checks.
- Do not treat local JSON storage as production-safe without PostgreSQL sync/verification.
- Admin Preview Mode must never create a payment, subscription, or permanent entitlement.
- Secrets must never appear in API responses, audit metadata, browser logs, or WordPress plugin output.
