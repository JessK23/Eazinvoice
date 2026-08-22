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

## Local Gradle notes

If the machine default `java -version` is Java 8, set Java explicitly before running Gradle:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

If the user home Gradle cache is not writable in a sandboxed terminal, redirect Gradle to the project temp folder:

```powershell
$env:GRADLE_USER_HOME="C:\Users\Jess\Documents\eazinvoice\.tmp\gradle-home"
```

The `.tmp/` folder is ignored by Git.

## Status

The app is now **release-signing ready**, but it will only become Play Store upload ready after you place your actual `android/key.properties` file and keystore locally.

Latest local signing report on 2026-08-22:

- Debug variant: debug config found, but debug keystore missing from the sandboxed Android home.
- Release variant: `Config: null`, `Store: null`, `Alias: null`.
- Conclusion: release signing is not configured until `android/key.properties` points to the real upload keystore.
