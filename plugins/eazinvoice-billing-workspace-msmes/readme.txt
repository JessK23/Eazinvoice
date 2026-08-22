=== EazInvoice Billing Workspace for MSMEs ===
Contributors: eazinvoice
Tags: invoice, billing, gst, msme, freelancer
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 1.0.7
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embedded EazInvoice billing workspace for WordPress MSMEs, freelancers, service businesses, and B2B sellers.

== Description ==

EazInvoice helps WordPress site owners connect visitors, customers, and internal teams to a modern MSME invoicing workspace.

The free plugin gives the site owner an embedded EazInvoice workspace inside WordPress, account connection fields, and an automatic EazInvoice button on the public website. A shortcode remains available for custom placement on service pages, contact pages, or customer portals.

== SOP / How It Works ==

1. Install and activate the plugin from the WordPress Plugins screen.
2. Open the EazInvoice menu inside WordPress.
3. Connect the account email and workspace URL.
4. Validate the API key before using paid features.
5. Use the embedded invoice and PO / WO screens for draft or created records.
6. Use the public website button or shortcode only when you want visitors to open the embedded EazInvoice flow.
7. Use the Android App Center and user manuals on the EazInvoice website for mobile testing and release tracking.
8. Use Find a Feature to locate any EazInvoice WordPress workspace quickly.

= Free Features =

* EazInvoice admin settings page
* Embedded WordPress dashboard
* Native feature search across the EazInvoice WordPress workspace
* In-plugin privacy and data-use guidance
* Embedded create invoice screen
* Embedded PO / WO creation screen
* API Access page for connecting an EazInvoice account
* Live API key validation against the connected EazInvoice account
* Payment Gateway readiness page for Standard, Pro, and Business Razorpay collection flows
* Account email and workspace URL settings
* API key field with connection status and active plan display
* Optional compact public website invoice tab that opens the embedded WordPress invoice screen after the site owner enables it
* Optional invoice CTA shortcode: `[eazinvoice_button]`
* Legacy shortcode alias: `[eazinvoice_free_invoice]`
* Local free-tier draft and created records for invoices and PO/WO documents
* Accounting-ready report messaging for revenue, expense, profit, Balance Sheet, Cash Flow, and GST reporting in connected EazInvoice plans
* Branded upgrade panel for EazInvoice Pro

= Paid WordPress Pro Roadmap =

The paid version is sold independently from eazinvoice.com and can include:

* License/API validation from EazInvoice subscription
* Service inquiry to invoice draft
* B2B quotation and invoice workflows
* Customer and service mapping
* Payment status automation
* Razorpay live payment collection through EazInvoice verified webhooks
* Invoice and PO/WO document view, print, PDF save and email actions
* Purchase Order / Work Order integration
* GST-ready reports
* Optional WooCommerce integration
* Priority support and license-key updates

== Installation ==

1. Upload the `eazinvoice-billing-workspace-msmes` folder to `/wp-content/plugins/`.
2. Activate the plugin through the WordPress Plugins screen.
3. Open `EazInvoice` from the admin menu.
4. Add your account email and workspace URL.
5. Enable the compact public website tab only if you want it, or place `[eazinvoice_button]` on any page for custom placement.
6. Use EazInvoice > Create Invoice inside WordPress.
7. Use EazInvoice > Create PO / WO inside WordPress.
8. Use EazInvoice > API Access to open EazInvoice, generate a WordPress API key, and paste it into the plugin.
9. Use EazInvoice > Privacy to review plugin data use and suggested Privacy Policy text.

== Frequently Asked Questions ==

= Is this the free version? =

Yes. This version is designed for the official WordPress plugin directory and helps drive traffic to the EazInvoice SaaS product.

= Where is the paid version sold? =

Paid upgrades should be sold from EazInvoice. After purchase, the customer updates or refreshes the plugin/license so paid features unlock inside their own WordPress website.

= How does API connection work? =

The customer logs into EazInvoice, opens Account Settings > API / WordPress Integration, generates a WordPress API key, then pastes that key into EazInvoice > API Access inside WordPress. The validation button calls EazInvoice and updates the local plugin plan and connection status.

= Does the plugin store Razorpay keys? =

No. Razorpay live Key Secret and webhook secret should be configured inside EazInvoice. The WordPress plugin shows gateway readiness and can use connected EazInvoice payment workflows, but it does not expose Razorpay secrets on the public WordPress website.

= Does the free plugin include WooCommerce automation? =

No. WooCommerce sync is optional and paid. The core EazInvoice plugin is designed first for service businesses, freelancers, consultants, agencies, and B2B sellers who need simple invoice and billing action from their WordPress site.

= What information does the plugin store in WordPress? =

The plugin stores its settings and locally created document records in the WordPress database. Open EazInvoice > Privacy for a plain-language data-use summary and suggested Privacy Policy text.

== Screenshots ==

1. EazInvoice admin settings and Pro upgrade screen.
2. Embedded EazInvoice dashboard inside WordPress.
3. Embedded create invoice screen inside WordPress.
4. Embedded PO / WO screen inside WordPress.
5. API Access connection screen.
6. Automatic EazInvoice button shown on the public website.
7. Optional shortcode button shown on a WordPress page.

== Changelog ==

= 1.0.7 =
* Added invoice and PO/WO document previews from saved WordPress records.
* Added print and browser Save as PDF actions for saved documents.
* Added Standard, Pro, and Business email actions with clear free-plan upgrade guidance.
* Improved saved-record actions on desktop, tablet, and mobile WordPress screens.

= 1.0.6 =
* Added native feature search across the EazInvoice WordPress admin workspace.
* Added in-plugin privacy and data-use guidance.
* Added suggested EazInvoice text to the WordPress Privacy Policy helper.

= 1.0.5 =
* Added in-plugin SOP and operating guidance for invoices, PO/WO, subscriptions, API access, and releases.
* Added clearer release readiness documentation for WordPress.org, Android, Razorpay, and web application checks.

= 1.0.4 =
* Added accounting and compliance reporting readiness messaging for Balance Sheet, Cash Flow, GST, revenue, expense, and profit workflows.
* Aligned plugin preview content with the EazInvoice web and mobile reporting direction.

= 1.0.3 =
* Updated Standard, Pro, and Business tier pricing to match EazInvoice yearly billing.

= 1.0.2 =

* Updated Standard, Pro, and Business tier pricing to match the EazInvoice SaaS plans without discount pricing.
* Clarified paid WordPress access, AI, gateway, API, and team feature boundaries.

= 1.0.1 =

* Added live EazInvoice API connection validation for WordPress API keys.
* Added Payment Gateway readiness page for paid Razorpay collection flows.
* Clarified that Razorpay secrets stay in EazInvoice and are not exposed by the WordPress plugin.
* Improved paid tier pricing display and connection status preservation.

= 1.0.0 =

* First WordPress.org-ready freemium release.
* Added production-ready plugin headers and GPL licensing.
* Added admin settings page with sanitized settings and WordPress nonces.
* Added automatic public website CTA and optional shortcode CTA.
* Added embedded WordPress dashboard, invoice page, and subscription page.
* Added embedded PO / WO creation page and local free-tier records.
* Added API Access connection page, live connection validation, and API integration prompt.
* Added Payment Gateway readiness page for paid Razorpay collection flows.
* Added responsive admin and public button styling.
* Added freemium upgrade messaging.
