# SaMi Runner

## Runner Dashboard modules

The Expo Router dashboard route is intentionally kept small at `app/(app)/index.tsx`. The screen is composed from the feature modules under `src/features/runner-dashboard/`:

| File | Responsibility |
| --- | --- |
| `useRunnerDashboard.ts` | Session, runner profile, errand loading/polling, availability, location tracking, navigation state, and user actions |
| `RunnerDashboardView.tsx` | Root screen composition and SaMi dashboard chrome |
| `components/RunnerDashboardMapLayer.tsx` | Native SaMi Maps view and map overlays |
| `components/RunnerDashboardWorkspace.tsx` | Runner workspace, account states, offers, active errand actions, and availability UI |
| `components/RunnerDashboardPrimitives.tsx` | Reusable buttons, section headings, and route points |
| `styles.ts` | Screen styles |
| `types.ts`, `utils.ts` | Shared model types and formatting/status helpers |

## Android map lifecycle

The native implementation and its complete rendering contract are documented in [`modules/sami-mapbox/README.md`](modules/sami-mapbox/README.md). In summary, the Mapbox view is rendered as a direct child of the dashboard root; the Android native host must be measured before MapView creation; and detaching from the Android window destroys the old MapView/SurfaceView so a fresh surface is created when the dashboard returns.

## Local verification

Run `npm run typecheck` from this directory. For native Mapbox changes, install a newly built Android binary before device testing; OTA updates cannot install new Kotlin code. Keep changes on the local `main` checkout and push only after the build and device tests pass.
