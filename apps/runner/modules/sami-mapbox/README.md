# SaMi Maps — Android native renderer and Runner location

SaMi Maps is a SaMi-owned Expo native module backed by the official Mapbox Maps SDK. It does not use `@rnmapbox/maps`.

## Android rendering contract

- Android uses **SurfaceView only**. TextureView is not exposed as a production option.
- `SaMiMapboxRenderer` creates a Mapbox `MapView` only after the Expo native host has a non-zero measured width and height.
- The Mapbox `MapView` is a direct child of the Expo native host. Do not insert an additional native wrapper around the dashboard map view.
- The renderer owns Activity lifecycle forwarding, native view creation and destruction, camera policy, style changes, diagnostics, and first-frame readiness.
- When an Expo host detaches from the Android window, SaMi stops and destroys its old `MapView` and `SurfaceView`. It does not retain a detached SurfaceView. A new MapView is created after the host is attached and measured again. This is intentional: a retained SurfaceView can remain attached to an invalid Android surface after Expo Router navigation.
- Map style/tile loading failures receive up to three bounded automatic retries. The renderer reports retry and exhaustion diagnostics; it does not silently loop forever.
- React Native overlays are rendered as siblings above the native map. Keep map overlays `position: absolute` and avoid wrapping the native MapView in another absolute-fill native View.

## Single-source location contract

- `apps/runner/src/location/runner-location-service.ts` is the single device-location source, using Expo Location and Expo TaskManager.
- The TaskManager task is defined at module scope and imported by the root Expo Router layout before routes mount.
- Foreground and background fixes use the same task. Eligible fixes are published through the existing authenticated Runner location endpoint.
- The visible dashboard subscribes to those exact fixes and passes them to the native Mapbox view.
- Android uses an Expo Location foreground service while the Runner is online or has a trackable active errand. Sharing stops when the Runner goes offline or signs out.
- Mapbox receives those fixes through `SaMiMapboxLocationProvider`; its default device-location provider is replaced before the puck is enabled. This avoids starting a second GPS stream.
- Background permission is requested only after an explanatory user action when the Runner goes online. Android may open app Settings for the “Allow all the time” permission.

## Runner Dashboard structure

The route at `app/(app)/index.tsx` is intentionally a small route entry. Dashboard code is separated into:

- `src/features/runner-dashboard/useRunnerDashboard.ts` — authenticated runner state, errands, availability, location subscription, polling, and navigation actions.
- `src/features/runner-dashboard/components/RunnerDashboardMapLayer.tsx` — direct-child native Mapbox view and map overlays.
- `src/features/runner-dashboard/components/RunnerDashboardWorkspace.tsx` — account state, active errand, offers, availability, and account actions.
- `src/features/runner-dashboard/components/RunnerDashboardPrimitives.tsx` — shared dashboard buttons, headings, and route points.
- `src/features/runner-dashboard/styles.ts` — shared dashboard visual styles.
- `src/features/runner-dashboard/utils.ts` and `types.ts` — display helpers and shared model types.

The dashboard preserves the existing runner approval gate, account restrictions, errand acceptance and progression, availability rules, location permissions, background tracking, polling, route guidance state, and sign-out flow.

## Verification route

The temporary route `apps/runner/app/mapbox-lab.tsx` remains an isolated renderer test without location permissions or Navigation SDK sessions. Open the fixed SurfaceView test:

```powershell
adb shell am start -a android.intent.action.VIEW -d "samirunner://mapbox-lab" com.sami.runner
```

## Required verification after native changes

From `apps/runner`:

```powershell
npm run typecheck
```

Because the Android renderer source changes are native Kotlin, build and install a new Android binary; an OTA update cannot install these changes. After installation verify:

1. Dashboard map loads on a cold launch and reports `native_host_has_size`, `map_view_has_size`, `map_loaded`, and `map_ready_verified`.
2. Open another Runner page, return to Dashboard, and verify a new `MapView` generation loads instead of a blank surface.
3. Background and foreground the app, then verify the map becomes ready again.
4. Switch day/night theme and confirm style changes load without hiding the existing overlays.
5. Test GPS and active-errand navigation only after the base map lifecycle tests pass.

Do not commit or push this local refactor until typecheck, native build, and device acceptance tests pass.
