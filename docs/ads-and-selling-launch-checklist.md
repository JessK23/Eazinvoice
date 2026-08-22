# EazInvoice Ads And Selling Launch Checklist

Status date: 2026-08-22

Purpose: prepare EazInvoice for controlled selling first, then paid ads after production blockers are closed.

## Launch Position

EazInvoice is not ready for broad paid ads yet. It is close enough to prepare a controlled launch with selected early users after payment, database, and production smoke checks pass.

Best first market:

- Indian freelancers, agencies, consultants, creators, coaching centers, service providers, small shops, and MSMEs that need invoices, PO/WO records, customers/vendors, payments, reports, and GST/TDS readiness.

Best first product promise:

- "A web and mobile-ready billing workspace for Indian MSMEs to create invoices, manage PO/WO workflows, track payments, review reports, and use AI-assisted drafting on paid plans."

## Safe Claims

- GST-ready invoicing.
- Purchase order and work order workflows.
- Customer, vendor, payment, receivable, payable, and report tracking.
- Standard, Pro, and Business yearly plans after Razorpay live verification.
- AI-assisted invoice, PO/WO, and report drafting for Pro and Business.
- Business workspace controls for teams, approvals, API keys, SMTP/gateway settings, notifications, and audit trail after staging validation.
- WordPress freemium plugin package version `1.0.7`, pending WordPress.org review/upload if not yet live.

## Claims To Avoid

- Government GST filing.
- CA-certified accounting.
- Legal, tax, banking, lending, or investment advice.
- Fully autonomous AI accounting.
- Android Play Store availability before signed release approval.
- WordPress.org availability before the plugin page is approved/live.
- Payment automation before live Razorpay checkout and webhook verification.

## Required Before First Paid Customer

- Production deployment uses PostgreSQL, not JSON persistence.
- `npm run build` passes.
- Direct API tests pass.
- Web and mobile parity checks pass.
- Release check passes.
- Database schema validation passes in normal terminal/CI.
- Razorpay live or controlled production-mode checkout verifies Standard, Pro, and Business yearly amounts.
- Webhook signature validation updates subscription state.
- Privacy policy, account deletion/support path, refund/cancellation terms, and contact details are public.
- SMTP/gateway/API secrets are not exposed in UI, API responses, logs, plugin output, or audit metadata.

## Required Before Broad Ads

- First paid customer flow is tested end to end.
- At least one production-like smoke test covers signup, onboarding, invoice creation, payment/subscription activation, paid feature unlock, and cancellation/downgrade path.
- Landing page copy reflects only verified features.
- Analytics/conversion tracking is installed without collecting unnecessary sensitive financial data.
- Android claims are removed or marked "coming soon" until Play release is approved.
- WordPress claims are marked "plugin package ready" until WordPress.org listing is approved.
- Support process is defined for billing, login, invoice problems, and data deletion.

## Suggested Campaign Sequence

1. Founder-led early access.
   - Reach 10-20 known MSME users manually.
   - Offer setup help and collect workflow feedback.

2. Controlled paid launch.
   - Promote Free, Standard, and Pro first.
   - Offer Business only to users who need team/API/gateway controls and can be onboarded carefully.

3. Low-budget search ads.
   - Focus on direct-intent keywords: invoice software India, GST invoice app, purchase order software, MSME billing software.
   - Landing page should send users to Start Free, pricing, and manual/demo content.

4. WordPress traffic.
   - After WordPress.org approval, promote the free plugin as a lead channel into paid EazInvoice plans.

5. Android traffic.
   - After signed Play release and internal/closed testing, add Android-specific ads and store badges.

## Launch Go/No-Go

Go for controlled selling when:

- Production database, payment activation, privacy/support, and smoke tests pass.
- Landing page is sales-safe.
- First customer onboarding path is clear.

No-go for broad ads when:

- Android signing is still unresolved and ads mention Android availability.
- Razorpay live verification is incomplete.
- Database schema validation cannot run.
- Public copy claims unavailable, unverified, or regulated capabilities.
