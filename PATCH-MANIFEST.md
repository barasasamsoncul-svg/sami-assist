# SaMi Runner Dashboard + Mapbox lifecycle refactor

## Files in this overlay

| Path | Change |
| --- | --- |
| `apps/runner/app/(app)/index.tsx` | Reduced route entry; delegates to the feature screen |
| `apps/runner/src/features/runner-dashboard/RunnerDashboardView.tsx` | Root screen composition and existing SaMi dashboard chrome |
| `apps/runner/src/features/runner-dashboard/useRunnerDashboard.ts` | Existing session, runner, jobs, availability, location, polling, and navigation logic extracted into a screen hook |
| `apps/runner/src/features/runner-dashboard/components/RunnerDashboardMapLayer.tsx` | Mapbox native view as a direct child of the screen root plus map overlays |
| `apps/runner/src/features/runner-dashboard/components/RunnerDashboardWorkspace.tsx` | Existing runner workspace and state-specific errand/account UI |
| `apps/runner/src/features/runner-dashboard/components/RunnerDashboardPrimitives.tsx` | Shared button, heading, and route-point components |
| `apps/runner/src/features/runner-dashboard/styles.ts` | Existing Dashboard style definitions moved out of the route |
| `apps/runner/src/features/runner-dashboard/types.ts` | Shared Dashboard model types and Nairobi fallback coordinate |
| `apps/runner/src/features/runner-dashboard/utils.ts` | Existing status and route display helpers |
| `apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxRenderer.kt` | Waits for measured native host, destroys stale MapView/SurfaceView on host detach, creates a fresh view on return, and retries map-load errors up to three times |
| `apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxStyleController.kt` | Adds an explicit forced style retry path |
| `apps/runner/modules/sami-mapbox/src/SaMiMapboxView.tsx` | Trims the public access token before passing it to native code |
| `apps/runner/modules/sami-mapbox/README.md` | Documents the updated native surface contract, location pipeline, architecture, and acceptance tests |
| `apps/runner/README.md` | Documents the Dashboard module layout and local verification |

## Preserved behavior

The Dashboard logic and existing JSX were extracted from the supplied 3,431-line local screen rather than rewritten from scratch. The runner approval and account gates, errand acceptance/progression, availability and permission flow, Expo TaskManager location stream, polling, route state, account navigation, and sign-out logic remain connected to the new components.

The existing SaMi Location service remains the single device-location source. The Mapbox module does not start a second GPS stream. Existing `expo-task-manager` dependency is already in the app manifest; this package does not change package dependencies or lockfiles.

## Verification status

- TypeScript/TSX transpile syntax check: passed.
- TypeScript relationship check against temporary local declarations for external Expo/React Native APIs: passed.
- Full project `npm run typecheck`: not run here; the full local `node_modules` dependency tree is not present in this packaging environment.
- Android Gradle/Mapbox build: not run here; the Android SDK and project Gradle dependency environment are not present in this packaging environment.
- Device behavior: not yet tested with this revised ZIP. The APK must be rebuilt locally before acceptance testing because native Kotlin changed.

No branch, commit, or push is part of this ZIP workflow.
