# Android Build Setup

This document captures the Android toolchain required for the EazInvoice P2-3B release-readiness path.

## Local Tools Verified

- Node.js and npm from the project environment.
- Android SDK at `C:\Users\Jess Kurian\AppData\Local\Android\Sdk`.
- Android platform tools are installed, but `adb` is not currently on `PATH`.
- Gradle wrapper: `android/gradle/wrapper/gradle-wrapper.properties` uses Gradle 9.4.1.
- Android Gradle Plugin: `com.android.tools.build:gradle:9.2.1`.
- Android SDK configuration:
  - `compileSdk`: 36
  - `targetSdk`: 36
  - `minSdk`: 24
- Local JDK used for Gradle validation: `C:\Program Files\Java\jdk-24`.

## Recommended Machine Setup

Install or verify:

1. Node.js LTS and npm.
2. Git for Windows.
3. Android Studio with Android SDK Platform 36, build-tools 36.x, platform-tools, emulator, and at least one Play Store emulator image.
4. JDK compatible with the current Android Gradle Plugin. JDK 24 works on this machine; JDK 21 LTS is preferred for team reproducibility if AGP remains compatible.
5. Add these to the user environment:
   - `ANDROID_HOME=C:\Users\Jess Kurian\AppData\Local\Android\Sdk`
   - `%ANDROID_HOME%\platform-tools` on `PATH`
   - `JAVA_HOME` pointing to the selected JDK

Do not commit machine-specific Java or SDK paths into `android/gradle.properties`.

## Release Signing

Release signing is intentionally local-only. The following files must not be committed:

- `android/key.properties`
- `*.jks`
- `*.keystore`
- `*.p12`
- `*.pfx`
- private key material

Expected `android/key.properties` shape:

```properties
storeFile=C:\\secure-path\\eazinvoice-upload-key.jks
storePassword=REPLACE_WITH_LOCAL_SECRET
keyAlias=REPLACE_WITH_UPLOAD_ALIAS
keyPassword=REPLACE_WITH_LOCAL_SECRET
```

P2-3B did not find an existing release/upload keystore on this machine. Do not generate a replacement upload key until the existing Play Console app signing/upload-key situation is confirmed.

## Build Commands

From the repository root:

```powershell
npm install
npm run build
npm test
npm run mobile:check
npm run mobile:sync
```

From `android`:

```powershell
$env:JAVA_HOME="C:\Program Files\Java\jdk-24"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat --version
.\gradlew.bat signingReport
.\gradlew.bat assembleDebug
.\gradlew.bat clean bundleRelease
```

Verify the generated release artifact:

```powershell
jarsigner -verify -verbose -certs android\app\build\outputs\bundle\release\app-release.aab
```

Until release signing is configured, `bundleRelease` can produce an AAB, but it remains unsigned and cannot prove the Play upload path.
