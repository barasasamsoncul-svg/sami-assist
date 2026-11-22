# Patch manifest — first Mapbox integration restoration

Baseline native behavior: `647f6e6e1c55dbe3e0cde27215e7db413b963b4f`.

Replaces five complete files:

- `apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxView.kt`
- `apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxRenderer.kt`
- `apps/runner/src/features/runner-dashboard/RunnerDashboardView.tsx`
- `apps/runner/app/_layout.tsx`
- `apps/runner/modules/sami-mapbox/README.md`

The global theme provider, global SaMiOverlay component, dashboard chrome, Mapbox theme-style selection and single SaMi location pipeline are not replaced. The root layout now owns theme-aware system status-bar presentation; the dashboard's redundant local status-bar override is removed.

No package manifests, lockfiles, Expo config, Gradle dependency versions, secrets, API endpoints, database files, branches, commits or pushes are changed.
