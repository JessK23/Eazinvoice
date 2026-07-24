# EazInvoice Android Release Signing

This project is now prepared to use a local Android release keystore without storing secrets in Git.

## What to create locally

Create a file at:

`android/key.properties`

Copy the structure from `android/key.properties.example` and fill in your own values:

- `storeFile` - absolute path to your upload keystore `.jks`
- `storePassword` - keystore password
- `keyAlias` - your key alias
- `keyPassword` - your key password

## What happens next

When `android/key.properties` exists, the Android release build will:

1. Read the keystore settings.
2. Attach the release signing config automatically.
3. Allow Android Studio or Gradle to produce a signed AAB for Play Console.

## Safe release flow

1. Keep the keystore file outside Git or in a secure local path.
2. Build a signed App Bundle from Android Studio.
3. Upload the AAB to Play Console internal testing first.
4. Verify sign-in, invoice creation, PO/WO, reports, and subscription access on a real device.

## Status

The app is now **release-signing ready**, but it will only become Play Store upload ready after you place your actual `android/key.properties` file and keystore locally.
