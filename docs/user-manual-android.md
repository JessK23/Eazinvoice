# EazInvoice Android Application User Manual

## Purpose

The Android app is the mobile-first EazInvoice workspace for quick invoicing, PO/WO creation, reports, and subscription-aware access.

## Testing Build

Use Android Studio to open the `android` folder and run the app on an emulator or physical Android device.

The current debug APK path is:

`C:\Users\r\Documents\eazinvoice\android\app\build\outputs\apk\debug\app-debug.apk`

## Login

1. Open the EazInvoice app.
2. Login with email OTP and password.
3. Confirm the profile name and plan status are visible after login.

## Main Mobile Sections

- **Home**: plan status, quick actions, and account summary.
- **AI Assistant**: paid-tier AI command workspace.
- **Invoices**: draft, create, view, payment status, and summary actions.
- **PO / WO**: purchase/work order drafts and created records.
- **Reports**: revenue, expenses, profit/loss, and compliance snapshots.
- **Business**: Business tier team, approval, SMTP, gateway, API, and audit tools.
- **Subscription**: current plan and upgrade information.
- **Help**: operational guide and release/testing checklist.

## Play Store Release Readiness

Before publishing:

1. Confirm production API URL points to `https://www.eazinvoice.com`.
2. Confirm login, invoice, PO/WO, reports, and subscription screens work on mobile width.
3. Create a release keystore and store passwords outside the repository.
4. Build a signed AAB from Android Studio.
5. Upload the AAB to Google Play Console internal testing first.

## Security Notes

- Never commit keystore files or signing passwords.
- Use internal testing before production release.
- Verify logout and session expiry on the device.

