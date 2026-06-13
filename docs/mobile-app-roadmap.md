# EazInvoice Mobile App Roadmap

## App Name

EazInvoice - Money Managed Easy

## Current Build

The current mobile build is a mobile-first PWA-style app shell at:

`apps/mobile/index.html`

It includes:

- Branded EazInvoice header and app manifest.
- Free tier dashboard.
- Create invoice flow.
- Create Purchase Order / Work Order flow.
- Local draft/created records in browser localStorage.
- Realtime income, expense, and profit summary.
- Subscription feature view.

## Android Packaging Direction

After the web app API is hosted, package the mobile app using one of these paths:

1. Capacitor Android wrapper around the mobile app.
2. Trusted Web Activity pointing to the hosted EazInvoice mobile URL.
3. React Native/Expo rewrite if native device APIs become important.

Recommended first launch path: Capacitor or Trusted Web Activity. It keeps the same web/API codebase and reduces duplicate work.

## Live Requirements

- Purchased EazInvoice domain.
- Hosted web app and API.
- HTTPS certificate.
- Production database.
- Email OTP provider.
- Android app icon and Play Store graphics.

