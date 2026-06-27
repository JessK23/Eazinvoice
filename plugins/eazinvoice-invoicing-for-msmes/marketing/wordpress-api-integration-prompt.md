# EazInvoice WordPress API Integration Prompt

Build the EazInvoice WordPress plugin connection flow so customers can use Free, Standard, Pro, and Business tier features inside their own WordPress website.

## Product Flow

1. A customer installs and activates the EazInvoice WordPress plugin.
2. The customer is treated as a Free tier WordPress plugin subscriber by default.
3. The plugin provides an embedded EazInvoice workspace inside WordPress with Dashboard, Create Invoice, Create PO / WO, Subscription, API Access, and Settings pages.
4. To connect deeper features, the customer clicks Open EazInvoice API Settings from the WordPress plugin.
5. The customer logs into their EazInvoice account and opens Account Settings > API / WordPress Integration.
6. The customer generates a WordPress API key from their EazInvoice account.
7. The customer pastes the API key into the WordPress plugin API Access page.
8. The plugin validates the API key against EazInvoice API endpoints.
9. The plugin stores only the sanitized API key and connection metadata in WordPress options.
10. The plugin unlocks WordPress-side features based on the subscription returned by EazInvoice.

## Free Tier

- Embedded WordPress plugin dashboard.
- Embedded Create Invoice screen.
- Embedded Create PO / WO screen.
- Automatic public website EazInvoice button.
- Optional shortcode button.
- Manual invoice and PO / WO workflow.
- Local draft and created records inside WordPress options.
- Upgrade links to EazInvoice pricing.

## Paid Tiers

- Standard: lead-to-invoice draft, customer/service mapping, one site license.
- Pro: invoice automation, PO/WO workflow, reports, up to three site licenses.
- Business: multi-site access, team approval, API access, priority support.

## Security Rules

- Do not auto-login WordPress users into EazInvoice.
- Do not expose API keys on public pages.
- Do not hardcode customer secrets.
- Use WordPress capability checks for admin pages.
- Sanitize and escape all settings.
- Validate API keys server-side before unlocking paid features.

## Future API Endpoints

- `POST /api/wordpress/validate-key`
- `GET /api/wordpress/subscription`
- `POST /api/wordpress/invoices`
- `GET /api/wordpress/invoices`
- `POST /api/wordpress/payments`
