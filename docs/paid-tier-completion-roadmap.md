# EazInvoice Paid Tier Completion Roadmap

This roadmap turns the paid subscription promises into implementation slices. It should be updated whenever a feature moves from planned to active.

## Current Tier Catalog

| Tier | Price | Status | Current usable features | Pending build work |
| --- | ---: | --- | --- | --- |
| Free | INR 0/month | Active | Basic GST invoices, PDF/print, manual payments, basic reports, one business profile, free WordPress plugin | None for current free scope |
| Standard | INR 499/month, INR 299 discounted | Partially active | WhatsApp sharing, Razorpay invoice collection links, higher limits, WordPress paid flag | Recurring invoice scheduling, branding removal controls |
| Pro | INR 999/month, INR 699 discounted | Partially active | Standard features, advanced reports, multiple business limits, payment automation gates | AI invoice assistant, AI PO assistant, advanced analytics refinements |
| Business | INR 1999/month, INR 1499 discounted | Planned with foundation | Pro features, highest limits, API/approval/team entitlement flags | Team roles, approval workflows, customer API key portal, priority support workflow |

## Build Order

1. Paid-tier foundation
   - Keep `PLAN_CATALOG` as the source of truth for plan names, prices, limits, features, and implementation status.
   - Keep admin preview mode available only to configured admin users.
   - Add tests that prove Free users stay limited and Admin Preview does not create subscriptions.

2. Razorpay subscription activation
   - Verify paid plan checkout creates an active subscription only after signature verification.
   - Show successful subscription status in the user dashboard.
   - Keep KYC requirements before paid subscription activation.

3. Standard tier completion
   - Make recurring invoice draft templates.
   - Add a safe recurring schedule model before any automatic invoice creation.
   - Add branding removal controls for PDF/print output.

4. Pro tier completion
   - Build AI invoice assistant as a draft generator, not an auto-finalizer.
   - Build AI PO/WO assistant as a draft generator.
   - Log AI usage for future limits and abuse control.
   - Refine advanced report graphs and export options.

5. Business tier completion
   - Add team invitations, roles, and access control.
   - Add approval workflows for invoices, PO/WO, and KYC review.
   - Add API key management and documented API access.
   - Add priority support/account-management workflow.

## Release Guardrails

- Do not reset, delete, or deregister existing users during any paid-tier release.
- Do not treat local JSON storage as production-safe for users, invoices, subscriptions, or payments.
- Before pushing paid-tier functionality live, verify the persistence target and migration path.
- Admin Preview Mode must never create a payment, subscription, or permanent entitlement.

