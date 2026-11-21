# SaMi Maps — Stage 1: Native renderer

This module is SaMi-owned and uses the official Mapbox Maps SDK for Android. It does not use `@rnmapbox/maps`.

## Stage 1 boundary

The Android implementation in this stage owns only:

- Native `MapView` creation and destruction.
- Single-owner Activity lifecycle forwarding and native view attach/detach handling. The default Mapbox lifecycle plugin is excluded so it cannot duplicate SaMi's forwarding.
- 2D camera initialization and gesture policy.
- Map style changes.
- Map loading errors, renderer setup errors and render-frame diagnostics.
- A readiness event that requires all of the following: Mapbox reports the map loaded, at least one render frame has finished, and the native map view has non-zero dimensions while attached to the window.

The Stage 1 MapInitOptions plugin list is explicit: camera, gestures, logo and attribution only. It excludes the default Mapbox lifecycle plugin and the Mapbox location component. SaMiMapboxLifecycle is the one lifecycle owner. No Expo Location API, device-location request, location permission prompt, location puck, Navigation SDK trip session, route calculation or voice guidance is started in Stage 1.

## Public component

Import `SaMiMapboxView` from this module's `src` entry point. The native view accepts:

- `accessToken`
- `mapStyleURL`
- `initialLatitude`
- `initialLongitude`
- `initialZoom`
- `initialBearing`
- `renderSurface` (`texture` or `surface`)

`renderSurface` is a creation-time setting. Changing it recreates the native MapView so the two Android rendering surfaces can be tested independently.

## Isolated Android verification screen

The temporary route `apps/runner/app/mapbox-lab.tsx` renders only the SaMi Maps component plus a small diagnostic panel. It does not call Expo Location, request permissions, start Navigation SDK, or import the Runner dashboard.

Open the default SurfaceView test (Mapbox SDK default):

```powershell
adb shell am start -a android.intent.action.VIEW -d "samirunner://mapbox-lab?surface=surface" com.sami.runner
```

Open the TextureView comparison test:

```powershell
adb shell am start -a android.intent.action.VIEW -d "samirunner://mapbox-lab?surface=texture" com.sami.runner
```

Open the night-style test:

```powershell
adb shell am start -a android.intent.action.VIEW -d "samirunner://mapbox-lab?surface=surface&style=night" com.sami.runner
```

The app must be built as a native Android binary after native module changes. An OTA update cannot add or replace Kotlin native code. The first run tests SurfaceView because this is Mapbox 11.35.0's documented default (`textureView = false`); the second run compares TextureView without changing any dashboard code.

## Important compatibility note

The legacy location and navigation props/events remain typed and registered temporarily so the existing Runner dashboard source is not broken while the standalone renderer is tested. In Stage 1 those setters are intentionally inert. The dashboard must not be used to judge Stage 1 location or navigation behaviour.

## Build dependencies

This Stage 1 patch intentionally leaves the currently pinned Android Maps SDK `11.35.0`, Navigation SDK `3.35.0`, `app.config.ts`, the Mapbox config plugin and the Expo module registration file unchanged. Dependency upgrades are a separate, explicit decision after the renderer baseline is verified.
