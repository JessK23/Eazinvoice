# EazInvoice Android Testing Checklist

## Current Build

- App name: EazInvoice
- Android package id: com.eazinvoice.app
- Build path for Android Studio: android
- Mobile source: apps/mobile
- Packaging: Capacitor Android

## Local Mobile Browser Test

1. Open `apps/mobile/index.html` through the local server.
2. Test at phone width around 390 x 844.
3. Test at tablet width around 768 x 1024.
4. Create an invoice draft.
5. Create a completed invoice.
6. Create a PO.
7. Create a WO.
8. Confirm Home counts update.
9. Confirm Reports revenue, expenses, and profit update.
10. Confirm bottom navigation works without layout overlap.

## Android Studio Test

1. Open Android Studio.
2. Choose `Open`.
3. Select `C:\Users\r\Documents\eazinvoice\android`.
4. Let Gradle finish syncing.
5. Run the app on an emulator.
6. Run the app on a real Android phone with USB debugging.
7. Confirm launcher icon shows the EazInvoice logo.
8. Confirm the app opens to the mobile dashboard.
9. Confirm forms accept input and save records.
10. Confirm the app remains portrait and touch-friendly.

## Play Console Internal Test

1. Build a signed Android App Bundle from Android Studio.
2. Upload the `.aab` to Internal testing.
3. Add tester email addresses.
4. Test install from Play Store internal testing link.
5. Test on at least one lower-end Android phone and one larger screen.

## Before Public Launch

- Connect mobile app to the production EazInvoice API and Supabase-backed database.
- Replace localStorage records with authenticated account records.
- Add production privacy policy URL.
- Add Play Store screenshots.
- Add Play Store feature graphic.
- Add app signing key backup process.
- Add release build verification.
