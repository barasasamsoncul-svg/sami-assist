# SaMi Maps Stage 1 — file manifest

Baseline inspected: `main` at `37e3c4f21d970485a9fcd52fd86f5bfb98cd77d1`.

This bundle contains complete file replacements and additions. It is not a Git patch and it does not modify GitHub. Copy the files into the same relative paths in the local `apps/runner` project on `main`.

## Replace these existing files

1. `modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxModule.kt`
2. `modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxView.kt`
3. `modules/sami-mapbox/src/SaMiMapbox.types.ts`
4. `modules/sami-mapbox/src/SaMiMapboxView.tsx`
5. `modules/sami-mapbox/src/index.ts`
6. `modules/sami-mapbox/README.md`

## Add these new files

7. `modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxRenderer.kt`
8. `modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxLifecycle.kt`
9. `modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxStyleController.kt`
10. `modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxCameraController.kt`
11. `modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxDiagnostics.kt`
12. `app/mapbox-lab.tsx` — temporary isolated verification route; do not connect the Runner dashboard yet.

## Intentionally unchanged

- `app/(app)/index.tsx` — Runner dashboard remains untouched.
- `app.json`, `app.config.ts`, `eas.json`, `package.json`, `package-lock.json`.
- `plugins/withSamiMapboxNative.js`.
- `modules/sami-mapbox/expo-module.config.json`.
- `modules/sami-mapbox/android/build.gradle` — retain Maps SDK 11.35.0 and Navigation SDK 3.35.0 for this baseline.
- iOS native sources and the existing route/voice controller sources.

## Stage 1 boundary

The test renderer explicitly loads only Mapbox camera, gestures, logo and attribution plugins. It excludes Mapbox's default lifecycle plugin because `SaMiMapboxLifecycle` is the single lifecycle owner, and excludes the Mapbox location component. No Expo Location API, GPS request, location permission prompt, navigation session, route service, voice guidance or dashboard state is started by the isolated map screen.

The default render surface is `SurfaceView`, which matches `MapInitOptions.textureView = false` in Mapbox SDK 11.35.0. A `TextureView` comparison can be launched separately.

## Completion tracker

| Item | Source status | Device status |
|---|---|---|
| 6 replacement files | DONE — complete source prepared | PENDING — compile and runtime checks |
| 6 new files | DONE — complete source prepared | PENDING — compile and runtime checks |
| Android type/API review | DONE — verified against Mapbox Maps SDK 11.35.0 source | PENDING — local Gradle compile |
| Standalone SurfaceView map | NOT TESTED | PENDING |
| TextureView comparison | NOT TESTED | PENDING |
| Lifecycle re-entry and map restoration | NOT TESTED | PENDING |
| Location and navigation layers | NOT STARTED | NOT STARTED |
| Runner dashboard integration | NOT STARTED | NOT STARTED |

No Android SDK/Gradle project is available in the authoring environment, so this bundle has not been compiled or device-tested here. The local Android build and device results are the acceptance gate before dashboard integration.
