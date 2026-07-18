# EazInvoice Release and Verification SOP

## Web Release

1. Run local checks:
   - `npm run lint`
   - `npm run build`
   - `npm test`
   - `npm run db:check`
   - `npm run db:verify-core`
   - `npm run db:verify-reports`
2. Confirm no real user data is removed.
3. Commit and push to GitHub.
4. Confirm Render deploy finishes successfully.
5. Test live login, invoice creation, PO/WO creation, reports, and subscription pages.

## Razorpay Live Subscription Verification

The paid plans must create yearly collection amounts:

- Standard: INR 2,388 yearly = 238800 paise.
- Pro: INR 5,988 yearly = 598800 paise.
- Business: INR 11,988 yearly = 1198800 paise.

Verification steps:

1. Confirm Render environment variables:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET`
2. Confirm the key is live mode when collecting real payments.
3. Make one controlled live payment.
4. Confirm Razorpay webhook is received.
5. Confirm the user subscription changes to the selected plan.
6. Confirm Postgres entitlement reads match runtime state.
7. Confirm paid features unlock and free restrictions remain visible for free users.

## WordPress Plugin Release

1. Run the plugin through Plugin Check locally.
2. Confirm GPL-compatible license headers.
3. Confirm all output is escaped and all inputs are sanitized.
4. Confirm nonces exist for admin form submissions.
5. Package the plugin folder or commit to WordPress.org SVN.

## Android Release

1. Confirm Android Studio Gradle JDK is set to bundled Java 17.
2. Confirm the app uses the production EazInvoice URL.
3. Create or select the Play Store upload keystore.
4. Build a signed AAB.
5. Upload to Play Console internal testing.
6. Test login, invoices, PO/WO, reports, subscriptions, and logout.

## Go / No-Go Criteria

Do not release if:

- Login or OTP fails.
- Subscriptions activate the wrong plan or amount.
- Reports do not match created records.
- Admin-only controls appear for normal users.
- Secrets appear in UI, logs, Git, or plugin output.

