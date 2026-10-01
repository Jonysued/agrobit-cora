# Lucient Android

Version 1.0.3, versionCode 4, package `com.lucient.app`.

Android uses the same frontend as iOS and the web: QR camera, lot outlines,
well markers at saved coordinates, durable offline operations and synchronization
when connectivity returns while the app is open or resumes.

Build with JDK 21, Android SDK 36 and build tools 36.0.0:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run android:sync
cd android
./gradlew assembleRelease
```

Set the public Supabase variables locally. Never commit private signing files.
Sign the release APK with the original Lucient certificate (alias `lucient`).
Increase versionCode for each update. Install over the existing app to keep local
data; do not uninstall when there are unsynchronized operations.

Assets are bundled, so startup and QR decoding do not require a network.
Satellite maps and data not previously downloaded still require internet.
Android can suspend closed apps, so synchronization resumes when Lucient opens.

The APK is compiled and signature-verified; camera permissions and reconnection
must also be exercised on a physical Android phone.
