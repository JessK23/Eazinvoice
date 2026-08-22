# P2-3B Play Readiness Matrix

Status key: `PASS`, `BLOCKED`, `NEEDS CONFIRMATION`, `DEFERRED`.

| Area | Status | Evidence / Decision |
| --- | --- | --- |
| Android package name | PASS | `com.eazinvoice.app` in Capacitor and Android Gradle config. |
| Target SDK | PASS | `targetSdk 36`; Google Play requires Android 16/API 36 for new apps and updates from 31 August 2026. |
| Gradle wrapper | PASS | Gradle wrapper is configured for 9.4.1. |
| Android Gradle Plugin | PASS | AGP 9.2.1 configured. |
| Release version | NEEDS CONFIRMATION | `versionCode 3`, `versionName 1.2.0`; Play Console highest uploaded versionCode must be checked before upload. |
| Release upload key | BLOCKED | No existing release/upload keystore found locally; `signingReport` shows release config/store/alias are null. |
| Signed AAB | BLOCKED | `bundleRelease` can produce an AAB, but `jarsigner -verify` reports the artifact is unsigned until `android/key.properties` is configured. |
| Debug APK | PASS | Debug APK can be built and installed locally. |
| Native launch | PASS | Emulator launch renders the EazInvoice login shell without an app crash. |
| Native authenticated workflow | NEEDS CONFIRMATION | Requires confirmed QA/production-like API endpoint and authentication path; not a substitute for signed-release verification. Fresh debug launch was visually verified, but signed-release login/sales workflow remains blocked by release signing. |
| Release default API | PASS | Native runtime now defaults to the production API base instead of Capacitor's `https://localhost` origin. |
| Test-only auth in release | PASS | No E2E auth secret or test-auth shortcut is bundled in the Android client. |
| Secrets in repo | PASS | Signing files and local credentials are ignored; existing scan found only placeholders/source references. |
| Privacy policy | PASS | Web privacy page now includes account-deletion request language and financial-record retention explanation. |
| Account deletion | NEEDS CONFIRMATION | App/store listing needs a public URL for account deletion. Legal retention of invoices, ledgers, tax records, and audit logs should be disclosed. |
| Data Safety | NEEDS CONFIRMATION | Draft categories below; final answers must match actual production telemetry, payments, analytics, and support tooling. |
| Financial-services declaration | NEEDS CONFIRMATION | EazInvoice is finance/accounting software; confirm exact Play policy declarations for the enabled production features. |
| Store listing assets | DEFERRED | Screenshots, feature graphic, support URL, and final listing copy still need Play Console preparation. |
| Internal-testing upload | BLOCKED | Requires signed AAB and valid versionCode. |

## Data Safety Draft

Expected collected data categories:

- Account identifiers: name, email, phone if enabled.
- Business profile: business name, GSTIN/tax IDs where configured, address, contacts.
- Financial records: invoices, customers, vendors, purchases, payments, credits, refunds, ledgers, tax/compliance records.
- App activity and diagnostics: login/session events, audit events, errors, device/runtime diagnostics if production monitoring is enabled.

Expected use:

- Account management and authentication.
- Business invoicing/accounting/compliance functionality.
- Security, fraud prevention, auditability, troubleshooting, and legal compliance.

Expected deletion posture:

- User account/access deletion can be requested.
- Business financial records may need retention for legal, tax, accounting, audit, dispute, security, or anti-fraud purposes.
- Any retained records should be disclosed clearly and access should be restricted.

## Official Policy References Checked

- Android target API requirements: https://developer.android.com/google/play/requirements/target-sdk
- Play app setup, versioning, and signing: https://support.google.com/googleplay/android-developer/answer/9859152
- Play Console app requirements: https://support.google.com/googleplay/android-developer/answer/10788890
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111

## P2-3B Verification Results

Validated on 16 August 2026:

| Check | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm test` | PASS, 141/141 |
| `npm run web:p22-check` | PASS, 32/32 |
| `npm run mobile:check` | PASS, 8/8 |
| `npm run mobile:sync` | PASS |
| `npm audit` | PASS, 0 vulnerabilities |
| `npm run web:e2e` | PASS, 2/2 |
| `npm run web:e2e:live` | PASS, 3 passed / 2 skipped |
| `gradlew --version` | PASS, Gradle 9.4.1 on JDK 24 |
| `gradlew signingReport` | PASS command, but release signing is null |
| `gradlew assembleDebug` | PASS |
| `gradlew clean bundleRelease` | PASS build, unsigned AAB |
| `jarsigner -verify ... app-release.aab` | BLOCKED, reports `jar is unsigned` |
| Emulator debug install and launch | PASS, login shell rendered and production API base displayed |

Generated local artifacts:

- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/bundle/release/app-release.aab`
- `native-launch-p23b.png`

## P2-3B Closure Decision

P2-3B cannot be fully closed on this machine yet. The Android product is functionally strong, but release readiness remains blocked by missing upload-key continuity and unsigned release AAB evidence.

The next required action is to obtain the existing Play upload key or confirm the Play Console upload-key reset/new-listing path, then rebuild and verify a signed release AAB before internal testing.
