# Android Play Internal Testing Runbook

This runbook is the P2-3B path from source code to Play Console internal-testing readiness.

## Preflight

1. Confirm the Play Console package name is `com.eazinvoice.app`.
2. Confirm the highest `versionCode` already uploaded to Play Console.
3. Treat current `versionCode 3` as a candidate only. Increase it if Play Console already has version code 3 or higher.
4. Confirm whether the Play listing already has an upload key. If yes, use that existing upload key. Do not generate a replacement key casually.
5. Confirm the public production API URL for release builds.

## Build And Test

Run:

```powershell
npm install
npm run build
npm test
npm run web:p22-check
npm run mobile:check
npm run mobile:sync
npm audit
```

Then run Android:

```powershell
cd android
$env:JAVA_HOME="C:\Program Files\Java\jdk-24"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat signingReport
.\gradlew.bat assembleDebug
.\gradlew.bat clean bundleRelease
```

Verify signing:

```powershell
jarsigner -verify -verbose -certs app\build\outputs\bundle\release\app-release.aab
```

The release AAB is Play-ready only when this verification reports a signed artifact from the intended upload key.

## Native Runtime Smoke

Use a real Android device or Play Store emulator:

```powershell
adb devices
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell monkey -p com.eazinvoice.app -c android.intent.category.LAUNCHER 1
```

Minimum smoke checklist:

- App launches without AndroidRuntime crash.
- Login screen renders.
- API base defaults to production in native runtime.
- User can authenticate against the intended QA or production-like backend.
- Business switcher loads businesses for the authenticated membership.
- Core sales workflow works: create customer, create invoice, view authoritative totals.
- No test-only authentication shortcut is present in release builds.

## Play Console Internal Testing

Before upload:

1. Upload the signed release AAB.
2. Confirm Play App Signing/upload-key continuity.
3. Complete store listing:
   - App name: EazInvoice
   - Short description: Invoicing, GST-ready accounting workflows, payments, and finance cockpit for businesses.
   - Full description should emphasize invoices, purchases, payments, GST/TDS readiness, reports, and business controls without claiming statutory filing unless that capability is enabled.
4. Complete Privacy Policy URL and account-deletion URL.
5. Complete Data Safety.
6. Provide review credentials or test instructions if the reviewer needs to access authenticated features.
7. Confirm financial-services declarations applicable to the exact production feature set.
8. Add screenshots for phone form factors.
9. Add internal testers.
10. Roll out to internal testing.

## Candidate Release Notes

```text
EazInvoice Android 1.2.0 adds authenticated SaaS access, business switching, invoice and payment workflows, purchase and vendor visibility, Finance Cockpit summaries, compliance summaries, and mobile-ready error/offline handling.
```

## Do Not Claim Yet

Do not claim Play readiness until:

- Existing upload key is located or Play Console confirms a new upload-key path.
- Signed AAB verification passes.
- Play Console confirms `versionCode 3` is valid or the version code is increased.
- Native authenticated API smoke passes on a real device or emulator.
