# M-1 on Android

M-1 can run on Android as an installable Progressive Web App (PWA). The Android mode uses the **local safe simulator** in the React UI when the Python API is not available, so the dashboard remains usable without a desktop Python runtime.

## Install on Android
1. On a computer, enter `web/` and run `npm install`, then `npm run build`.
2. Serve `web/dist` over HTTPS (or use a local development server reachable from the phone).
3. Open the site in Chrome on Android.
4. Choose **Install app** / **Add to Home screen**.

For local development, `npm run dev -- --host 0.0.0.0` exposes the Vite server to the local network; open the computer's LAN IP on the phone.

## Android behavior
- Dashboard, scenario selection, live timeline, incidents, recovery status, and JSON reports work in the browser/PWA.
- If `/api/test/stream` is unavailable, M-1 automatically switches to `android-local-safe-simulator`.
- The simulator generates synthetic events only; it does not perform keylogging, persistence, privilege escalation, encryption, disk filling, or other destructive host actions.
- The Python API remains available for desktop/server lab mode.

## Optional APK
The current Android delivery is a PWA rather than a native APK. This avoids shipping a Python runtime and native OS-level security components inside the phone app. The same web build can later be wrapped with Capacitor/Android Studio if a signed APK/AAB is required.
