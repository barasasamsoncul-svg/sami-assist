# SaMi native Mapbox module

This is a SaMi-owned Expo native module. It integrates Mapbox's official Android and iOS SDKs directly. It does not use `@rnmapbox/maps` or another community Mapbox wrapper.

## SDK versions

| Platform | SDK | Version |
|---|---|---:|
| Android | Mapbox Maps SDK | 11.35.0 |
| Android | Mapbox Navigation SDK Core | 3.35.0 |
| Android | Navigation UI Maps utilities | 3.35.0 |
| Android | Navigation Voice | 3.35.0 |
| iOS | Mapbox Maps SDK | 11.35.0 |
| iOS | Mapbox Navigation SDK Core | 3.35.0 |
| iOS | Mapbox Navigation Native | 324.35.0 |
| iOS | Mapbox Common | 24.35.0 |
| iOS | Mapbox Core Maps | 11.35.0 |
| iOS | Turf | 4.1.0 |

Android uses official NDK 27 artifacts and pins NDK 27.1.12297006 for 16 KB page-size compatibility.

iOS uses the official Mapbox Swift Package Manager repositories through React Native 0.88.1's `spm_dependency` CocoaPods integration. The SaMi config plugin makes the SaMi Mapbox pod dynamic and adds an app build phase to embed Mapbox's transitive dynamic runtime frameworks. SaMi owns the presentation and interaction UI; Mapbox's prebuilt UIKit navigation interface is not installed.

## Credentials

Two different Mapbox tokens are required:

- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`: public runtime token used by the app. Configure it in each EAS environment.
- `MAPBOX_DOWNLOADS_TOKEN`: secret token with the `Downloads:Read` scope. Configure it as an EAS environment secret for development, preview, and production.

Never commit either real token. Never prefix the downloads token with `EXPO_PUBLIC_`.

The EAS `eas-build-pre-install` hook validates the downloads token. On iOS it also writes the required Mapbox entry to the build worker's `~/.netrc` with owner-only permissions before CocoaPods resolves the Swift packages.

For local Android Gradle builds, provide `MAPBOX_DOWNLOADS_TOKEN` in the shell environment. For local iOS pod installation, run `scripts/configure-mapbox-credentials.js` with `EAS_BUILD_PLATFORM=ios` after setting the token.

## Native module status

The module is registered on Android and iOS and the native SDK dependencies are connected. The native MapView, camera, route, and navigation-session APIs will be implemented in the next integration stage. The existing Runner dashboard remains untouched until that native view is ready to replace the legacy map.
