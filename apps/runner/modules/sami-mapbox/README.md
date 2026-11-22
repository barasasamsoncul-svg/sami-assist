# SaMi Mapbox native module — Stage 1 foundation

## Native ownership

- `SaMiMapboxView` is the Expo native host and owns one native Mapbox `MapView` child.
- The ExpoView opts into `shouldUseAndroidLayout`, so Android measures and lays out the child when it is inserted or requests layout; React Native/Yoga continues to own the outer ExpoView bounds.
- The Mapbox `MapView` is inserted directly into the ExpoView. No intermediate native container is used.
- `MapInitOptions` uses Mapbox's standard default plugin list except for the ScaleBar plugin. The compass, logo, attribution, and Mapbox lifecycle plugin remain available; the distance scale ornament is intentionally removed.
- Android rendering uses Mapbox's supported `TextureView` surface. It participates in normal Android view composition and is selected for the Runner's animated screen transitions; this trades some rendering throughput and memory for view-hierarchy compatibility.
- A temporary React/Expo screen detach retains the same `MapView`, style and camera. Mapbox's view lifecycle handles stopping and resuming rendering as the map view detaches and reattaches. Expo disposal destroys the native map.

## Location ownership

SaMi Runner's existing `runner-location-service` remains the only device-location source. The native module receives those fixes and configures Mapbox's puck through SaMi's custom location provider. Do not start a second GPS subscription or a Navigation SDK trip session in this module.

## Stage boundaries

Stage 1 covers stable native map creation, native child layout, default Mapbox lifecycle ownership, basic rendering readiness and retention across screen transitions. Theme polish, camera/location behavior, routing/voice guidance, network resilience and production performance remain in their later roadmap stages.

## Acceptance checks

1. Cold launch displays a loaded Mapbox style without tapping Locate Me or another control.
2. Open a different Runner screen and return: the same native `MapView` is reused and renders again without a manual refresh.
3. Background and foreground the app: Mapbox resumes through its built-in lifecycle handling.
4. The selected Runner theme still supplies the map's day/night style; the existing global `SaMiOverlay` and `RunnerDashboardChrome` remain unchanged.
5. SaMi's existing location fixes continue to update the puck; no duplicate device-location source is started.

A successful Android build is necessary but does not prove visible rendering. Complete the device acceptance checks above before pushing.
