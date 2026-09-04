# P2-3C Play Signing Closure Report

Date: 2026-08-23

## Verdict

P2-3C is aligned with the Master Development Plan, but it is not fully closable from this machine alone.

The Android codebase is ready for the next Play Console decision step, but Play upload readiness remains blocked by one external identity decision:

`Play Console app/signing state -> upload key fingerprint -> valid versionCode -> signed AAB -> internal testing`

No replacement upload key should be generated until the Play Console state for `com.eazinvoice.app` is confirmed.

## Current Confirmed State

| Area | Status | Evidence |
| --- | --- | --- |
| Product scope | PASS | Android remains part of the EazInvoice web/Android SaaS product; WordPress plugin work is not part of this P2-3C task. |
| Application ID | PASS | `com.eazinvoice.app` in `capacitor.config.json` and Android Gradle config. |
| Version candidate | NEEDS PLAY CONSOLE CONFIRMATION | `versionCode 3`, `versionName 1.2.0`; Play Console must confirm no uploaded release has used version code `3` or higher. |
| Target SDK | PASS | `targetSdkVersion 36`, `compileSdkVersion 36`, `minSdkVersion 24`. |
| Current Google Play target API rule | PASS | Official Google Play requirement checked on 2026-08-23: new apps and updates must target Android 16/API 36 or higher from 2026-08-31. |
| Production API default | PASS | Native runtime defaults to `https://www.eazinvoice.com`; local/emulator API remains only as development fallback logic. |
| Release signing config | BLOCKED | `gradlew signingReport` still reports release `Config: null`, `Store: null`, `Alias: null`. |
| Local upload key | BLOCKED | No usable upload/release keystore or `android/key.properties` found locally. |
| Existing release AAB | BLOCKED | `android/app/build/outputs/bundle/release/app-release.aab` exists but `jarsigner -verify` reports `jar is unsigned`. |
| Git secret safety | PASS | Root `.gitignore` excludes `android/key.properties`, `*.jks`, `*.keystore`, `*.p12`, `*.pfx`, `*.pem`, `.env*`, and `android/app/google-services.json`. |
| Manifest permissions | PASS | Only `android.permission.INTERNET` found; FileProvider is non-exported. |
| Cleartext/debuggable scan | PASS | No broad cleartext or debuggable release flag found in manifest scan. |
| Local code checks | PASS | `npm run build`, `npm run mobile:check`, and `npm audit` passed on 2026-08-23. |

## Play Console Facts Required

Before changing signing files or generating any new upload key, collect these from Google Play Console:

1. Whether `com.eazinvoice.app` is already registered.
2. Whether Play App Signing is enabled.
3. Whether an Upload Key Certificate already exists.
4. The Upload Key Certificate SHA-1 and SHA-256 fingerprints.
5. The highest `versionCode` ever uploaded to any track, including discarded internal/closed/open/production releases.

Use current Play Console areas such as App Integrity/App Signing, Release tracks, and Bundle Explorer/App Bundle details.

## Decision Logic

If Play Console has an existing upload certificate:

- Find the matching local keystore or complete the official upload-key reset process.
- Configure local `android/key.properties` only after the correct key is known.
- Run `gradlew signingReport` and compare fingerprints with Play Console.
- Upload only if fingerprints match.

If `com.eazinvoice.app` has never been registered or uploaded:

- Ask for explicit approval before creating a new long-term upload keystore.
- Store the keystore outside Git and back it up securely.
- Configure `android/key.properties` locally.
- Build and verify a signed AAB before internal testing.

If highest uploaded `versionCode` is:

- Less than `3`: keep `versionCode 3`.
- Equal to `3`: increment to `4`.
- Greater than `3`: increment to at least highest + 1.

## Next Required Action

Open Google Play Console and provide the five facts above. Until then, Android remains suitable for controlled local/debug validation, but not for Play upload, public Android marketing, or broad paid advertising that claims Play Store availability.
