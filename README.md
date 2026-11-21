# SaMi Mapbox recreation lifecycle fix

## Scope

This bundle replaces exactly one file:

`apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxRenderer.kt`

It changes the MapView recreation lifecycle only:

1. Stops the previous MapView through SaMi's lifecycle controller.
2. Cancels native subscriptions.
3. Removes the old MapView from its Android parent before calling `onDestroy()`.
4. Schedules the replacement MapView for the next UI animation frame.
5. Uses a recreation sequence guard to ignore stale queued recreation callbacks.

It does not modify the dashboard, location, navigation, Mapbox versions, Expo config, or tokens.

## Apply

Extract the archive at the repository root (`C:\dev\sami-assist-web`) so the included `apps/runner/...` path overlays the existing file.

Then run the local Android Release build as you normally do. Do not clean the build directory for this change.

## Acceptance test

1. Launch the isolated screen with `surface=surface`; confirm map, zoom and style changes.
2. Switch SurfaceView to TextureView; wait for `map_ready_verified` and confirm the map is visible.
3. Switch TextureView back to SurfaceView; confirm the map returns.
4. Repeat each direction twice.
5. Navigate away from the isolated route and return; confirm the map becomes visible again.

A successful Gradle build alone does not pass these device tests.
