# M-1 Native Android

This directory contains the native Android delivery of M-1. It is an Android application (Kotlin Activity + bundled offline WebView UI), not merely a browser bookmark/PWA. The dashboard and bounded safe simulator are packaged into the APK/AAB, so it works without a Python runtime or Node.js on the phone.

## Build locally

Open `android/` in Android Studio (JDK 17, Android SDK 35), or use Gradle after installing Android tooling:

```bash
gradle assembleDebug
gradle bundleRelease
```

Outputs:
- `app/build/outputs/apk/debug/app-debug.apk`
- `app/build/outputs/bundle/release/app-release.aab`

Release AAB signing should be configured with your own Android keystore before publishing.

## Android behavior

The Android build is offline-first and uses synthetic, bounded events. It does not implement real keylogging, persistence, privilege escalation, ransomware, disk filling, or other destructive host behavior. Desktop Linux/Windows/macOS functionality remains in the parent project and is unchanged.
