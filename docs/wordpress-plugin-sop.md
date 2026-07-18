# EazInvoice WordPress Plugin SOP

## Purpose

This SOP explains how a WordPress site owner installs and uses the EazInvoice plugin.

## Plugin Installation

1. In WordPress Admin, open **Plugins > Add New**.
2. Search for **EazInvoice Billing Workspace for MSMEs** after WordPress.org approval.
3. Install and activate the plugin.
4. Open **EazInvoice** in the WordPress Admin sidebar.

## Initial Configuration

1. Open **EazInvoice > Settings**.
2. Enter:
   - Account email.
   - API key generated from the EazInvoice Business/API page.
   - Workspace URL, normally `https://www.eazinvoice.com/apps/web/index.html`.
   - API settings URL, normally `https://www.eazinvoice.com/apps/web/dashboard.html#business-workspace`.
3. Validate the connection.
4. Enable or disable the automatic public site button.

## Free Plugin Features

- WordPress admin dashboard summary.
- Create invoice workspace page.
- Create PO/WO workspace page.
- Basic local draft and created records.
- Public EazInvoice CTA button.
- Shortcode: `[eazinvoice_button]`.

## Paid Plugin Features

Paid features unlock according to the EazInvoice subscription connected through API:

- Standard: WhatsApp sharing, recurring invoice assistance, and branding-related upgrades.
- Pro: AI invoice/PO/report assistant and advanced reporting.
- Business: team access, approvals, API keys, gateway settings, audit logs, and business communication tools.

## How Site Visitors Use It

The automatic button can be shown on the public site. The site owner can also place the shortcode on specific pages. The button should direct the user to the configured EazInvoice workspace.

## WordPress.org SVN Release Process

1. Prepare the plugin folder:
   `C:\Users\r\Documents\eazinvoice\plugins\eazinvoice-invoicing-for-msmes`
2. Confirm `readme.txt` stable tag matches the plugin header version.
3. Copy plugin files into SVN `trunk`.
4. Copy banners/icons/screenshots into SVN `assets`.
5. Commit using TortoiseSVN with the WordPress.org SVN username and SVN password.
6. Confirm the new version appears at:
   `https://wordpress.org/plugins/eazinvoice-billing-workspace-msmes/`

## Security Notes

- Do not store API secrets in public pages.
- Use WordPress nonces for form submissions.
- Escape all output and sanitize all input.
- Do not add public external links without user-controlled settings.

