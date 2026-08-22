# EazInvoice UI/UX Product Audit

Status date: 2026-08-22

Purpose: define the UI/UX work required before selling EazInvoice to real users and promoting it through ads. This is an implementation guide, not a redesign mood board.

## Product Positioning

EazInvoice should feel like a trustworthy finance workspace for Indian MSMEs: invoicing, purchase orders/work orders, customer/vendor tracking, payments, reports, GST/TDS readiness, Business controls, and mobile access.

The current product already has broad functionality. The main UX risk is not missing screens; it is that new buyers may struggle to understand what is production-ready, what plan unlocks which feature, and what action they should take next.

## Surfaces Audited

- Public landing page: `apps/web/index.html`, `apps/web/home.js`, `apps/web/styles.css`.
- Auth and onboarding: `apps/web/auth.html`, `apps/web/auth.js`, `apps/web/onboarding.html`, `apps/web/onboarding.js`.
- SaaS workspace: `apps/web/dashboard.html`, `apps/web/dashboard.js`.
- Invoice/PO workflow: `apps/web/invoice.html`, `apps/web/invoice.js`.
- Subscription pages: `apps/web/subscription.html`, `apps/web/subscription.js`, `apps/web/subscription-confirmation.html`.
- Account/API access: `apps/web/access.html`, `apps/web/access.js`.
- Android shell: `apps/mobile/index.html`, `apps/mobile/app.js`, `apps/mobile/styles.css`.
- WordPress plugin entry: `plugins/eazinvoice-billing-workspace-msmes/src/index.php`, `plugins/eazinvoice-billing-workspace-msmes/styles.css`.

## What Is Working

- The landing page explains the core market: Indian MSMEs and GST-ready invoicing.
- Logged-in users get direct links to invoice creation, PO creation, reports, AI, and subscription.
- The dashboard includes a real business context bar for active business, GSTIN/tax state, financial year, plan, and role.
- Sidebar navigation has a complete finance-oriented information architecture: sales, purchases, accounting, banking, compliance, Business workspace, subscription, and help.
- AI Agent UI is already framed as a paid feature and uses a chat-like workspace with examples.
- Mobile is scoped as a SaaS client and avoids silent offline financial writes.
- WordPress plugin includes settings, API validation, privacy/help pages, and paid-tier messaging.

## Must Fix Before Paid Ads

1. Public claims must match verified release status.
   - Do not claim Android Play availability until signing and Play release are complete.
   - Do not imply automated GST filing, tax/legal advice, banking, lending, or fully autonomous AI accounting.
   - Payment and paid-tier claims should say available after live Razorpay verification.

2. First screen conversion should become buyer-focused.
   - The landing hero should answer: who it is for, what it does, why it is safer than spreadsheets, and what plan to start with.
   - Primary CTA should be consistent: "Start Free" for visitors, "Open Workspace" for logged-in users.
   - Secondary CTA should support trust: pricing, manual/demo, or login.

3. Pricing and plan gates need clearer UX.
   - Free, Standard, Pro, and Business should show exact yearly billed amounts and strongest included features.
   - Locked paid actions should explain which plan unlocks them and link to subscription.
   - Admin preview controls should never look like real customer entitlements.

4. Dashboard density needs buyer-ready grouping.
   - Current navigation is powerful but dense. Keep the finance categories, but highlight the top daily actions: create invoice, create PO/WO, collect payment, view receivables, view payables, open reports.
   - Accounting, banking, GST/TDS, and Business controls should remain available but feel like organized modules instead of a wall of links.

5. Onboarding must reduce blank-workspace anxiety.
   - After signup, users should see a clear setup checklist: business profile, GST/tax details, first customer/vendor, first invoice/PO, subscription choice.
   - Each checklist item should open the exact screen required.

6. Trust and compliance copy must be visible.
   - Add visible links to privacy, account deletion/support, user manuals, and WordPress/plugin information.
   - Avoid legal/tax-certification claims. Use "GST/TDS readiness" and "reports for review" unless a certified workflow is later added.

7. Mobile and WordPress availability should be truthfully messaged.
   - Mobile page should show APK/internal testing status until Play release is signed and approved.
   - WordPress plugin marketing should point to the canonical slug `eazinvoice-billing-workspace-msmes` and current version `1.0.7`.

## Recommended UI Implementation Order

### Phase 1: Sales-Safe Public Entry

- Rewrite landing hero and top CTAs for paid-ad traffic.
- Add a concise "Who this is for" strip for freelancers, agencies, consultants, shops, coaching centers, and service MSMEs.
- Add release-safe plan cards with yearly billing amounts.
- Add a visible launch-status note for Android and WordPress until external releases are approved.
- Keep the existing product preview, but make it less decorative and more inspection-friendly.

### Phase 2: Logged-In First-Run Experience

- Add a setup checklist to dashboard/onboarding.
- Route checklist items to business profile, customers/vendors, first invoice, first PO/WO, and subscription.
- Show an empty-state dashboard that teaches the next business action instead of showing mostly zero metrics.

### Phase 3: Workspace Navigation Polish

- Add a compact "Daily actions" band at the top of dashboard.
- Keep detailed sidebar groups, but reduce repeated links that point to the same dashboard section.
- Make plan/role restrictions visually consistent across AI, Business, gateway, SMTP, and API key controls.

### Phase 4: Mobile And WordPress Commercial Polish

- Align mobile page copy with Play readiness.
- Add screenshots only after signed/release smoke passes.
- Align WordPress marketing/ad copy with the plugin package and WordPress.org review state.

### Phase 5: Visual Design Pass

- Move from the current mixed decorative palette toward a calmer finance-product interface.
- Keep brand color accents, but use more neutral surfaces for dense operational screens.
- Make buttons, forms, cards, and tables consistent across web, mobile, and WordPress.

## Technical Guardrails

- Do not move financial calculations to the browser for visual convenience.
- Do not bypass API entitlements in UI gating.
- Do not expose secrets in UI, local storage, logs, plugin markup, or audit metadata.
- Do not hide external blockers with marketing copy.
- Preserve direct test coverage for subscription, Business permissions, WordPress actions, and mobile workflows after UI edits.

## Definition Of Done For UI Sales Readiness

- Landing page is accurate enough for paid traffic.
- Signup and first-run flow give users an obvious next step.
- Pricing/plan language matches implemented entitlements.
- Android and WordPress claims match actual release state.
- Dashboard has a clear daily-action layer.
- No UI copy claims government filing, legal/tax advice, autonomous accounting, or store availability before verification.
- Build, release check, and focused UI-related tests pass after changes.
