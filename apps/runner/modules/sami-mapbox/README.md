# SaMi Maps — Native renderer and live location

SaMi Maps is a SaMi-owned Expo native module backed by the official Mapbox Maps SDK for Android. It does not use `@rnmapbox/maps`.

## Rendering contract

- Android uses SurfaceView only. TextureView is not exposed as a production option.
- The native renderer owns MapView lifecycle, the 2D camera, style changes, loading diagnostics and first-frame readiness.
- SaMi Maps does not request location permissions or open its own Android GPS source.
- React Native overlays are rendered above the map by the Runner screen; verify their stacking on the target devices.

## Single-source location contract

- `apps/runner/src/location/runner-location-service.ts` is the single device-location source, using Expo Location and Expo TaskManager.
- The TaskManager task is defined at module scope and imported by the root Expo Router layout before routes mount.
- Foreground and background fixes use the same task. Eligible fixes are published through the existing authenticated Runner location endpoint.
- The visible dashboard subscribes to those exact fixes and passes them to the native Mapbox view.
- Android uses an Expo Location foreground service while the Runner is online or has a trackable active errand. Sharing stops when the Runner goes offline or signs out.
- Mapbox receives those fixes through `SaMiMapboxLocationProvider`; its default device-location provider is replaced before the puck is enabled. This avoids starting a second GPS stream.
- Background permission is requested only after an explanatory user action when the Runner goes online. Android may open app Settings for the “Allow all the time” permission.

## Native Mapbox location implementation

- `SaMiMapboxLocationProvider.kt` accepts validated coordinates and bearing from SaMi Location.
- `SaMiMapboxLocationController.kt` controls the puck, course bearing, optional pulse, recenter requests and follow camera.
- The camera follows only when the dashboard is active and the camera mode is `follow` or `navigation`; the native puck can still receive new fixes while the dashboard is covered.
- The Mapbox location component is enabled with the custom provider, never with a separate Mapbox-owned GPS request.

## Verification route

The temporary route `apps/runner/app/mapbox-lab.tsx` remains an isolated renderer test without location permissions or Navigation SDK sessions. Open the fixed SurfaceView test:

```powershell
adb shell am start -a android.intent.action.VIEW -d "samirunner://mapbox-lab" com.sami.runner
```

The test route keeps the day/night style switch and native diagnostics. It no longer exposes a SurfaceView/TextureView selector.

## Required local dependency installation

From `apps/runner`, run:

```powershell
npx expo install expo-task-manager
```

The task-manager version is SDK-matched by Expo. Then run the app typecheck and build a new Android Release binary because this stage adds native Kotlin code and a TaskManager dependency. An OTA update cannot install the native module changes.

## Scope remaining after Location

Navigation remains a separate phase: route calculation, map matching, trip session, turn-by-turn instructions and voice guidance are not implemented by this Location stage.
