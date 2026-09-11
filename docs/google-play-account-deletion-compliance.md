# Google Play Account Deletion Compliance

## 1. Current state before change

No authenticated or API account-deletion endpoint existed. The privacy policy already documented an email request to `support@eazinvoice.com` from the registered email address and explained that financial and security records may need to remain retained. The mobile More view had no account-deletion entry.

## 2. Backend deletion model

No new destructive backend endpoint was added. The supported model is a verified email deletion request handled by support. This avoids unsafe cascade deletion and preserves posted accounting, tax, payment, audit and security evidence. It is idempotent at the request-handling level because repeated emails can be reviewed against the same registered identity.

## 3. Public deletion URL

`https://www.eazinvoice.com/apps/web/delete-account.html`

The page is public, identifies EazInvoice, provides the request link and explains verification and retention.

## 4. In-app deletion path

Signed-in mobile users: **More → Account → Review deletion options**. The link opens the public deletion page. No one-tap destructive action is exposed.

## 5. Authentication/verification

The request must originate from the registered email address. Support may request additional confirmation before processing. Existing login, OTP, signup, reset and session behavior were not changed.

## 6. Data deleted/anonymized

Where no retention requirement applies, support may remove or disable personal account access information and anonymize non-required personal metadata and preferences.

## 7. Data retained

Finalized invoices, accounting journals, tax/compliance records, payment records, audit/security records and other business history may be retained where needed for statutory, audit, fraud-prevention, dispute-resolution, legal or record-keeping obligations. No fixed retention period is claimed.

## 8. Business-owner edge cases

Because there is no automatic account mutation endpoint, support must review multi-business membership, sole-owner businesses, ownership transfer needs, subscriptions, API keys and audit relationships before disabling access. No ownership is automatically transferred and no business is orphaned by this change.

## 9. Security controls

No unsecured deletion GET or public deletion API was introduced. The page only creates an email request. Existing tenant isolation, authorization, immutable financial history, API-key controls and audit behavior remain unchanged.

## 10. Tests/results

- `npm run build` — passed.
- `npm test` — passed, 163/163.
- `npm run web:p22-check` — passed.
- `npm run mobile:check` — passed.
- `node tests/mobile-document-actions.test.js` — passed, 8/8.
- `npm run mobile:sync` — passed.
- `npm run release:check` — passed.
- `npm audit` — existing 3 vulnerabilities remain; `npm audit fix` was not run.
- `git diff --check` — passed.

## 11. Deployment requirement

Deploy the updated Web assets so the public URL resolves in production. The mobile link should be released with the next normal Android/Web deployment, but no versionCode, signing or APK change is required solely for this page.

## 12. Google Play field value to use

Account deletion URL: `https://www.eazinvoice.com/apps/web/delete-account.html`

## 13. Known limitations

Deletion is a verified support workflow rather than an in-product automated closure endpoint. Processing time is not fixed. Support must assess ownership and retention constraints case by case.

## 14. Files changed

- `apps/web/delete-account.html`
- `apps/mobile/app.js`
- `apps/mobile/styles.css`
- `tests/mobile-document-actions.test.js`
- `docs/google-play-account-deletion-compliance.md`

## 15. Git status

Changes are uncommitted. Existing auth/API changes, UI redesign documents, plugin ZIPs and `tools/` remain in the working tree and were preserved. No commit or push was performed.
