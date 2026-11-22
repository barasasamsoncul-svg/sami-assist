# SaMi Runner — first Mapbox integration restoration (theme + global shell preserved)

This overlay replaces complete files on your existing local `main`. It does not create a branch, commit, or push.

## Before applying

From `C:\dev\sami-assist-web`:

```powershell
git status --short
```

Keep a copy of any uncommitted changes. The ZIP contains complete replacements for five files only.

## Apply

Extract this ZIP into the repository root, preserving the relative paths.

Review the exact changed files:

```powershell
git diff -- "apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxView.kt"
git diff -- "apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxRenderer.kt"
git diff -- "apps/runner/src/features/runner-dashboard/RunnerDashboardView.tsx"
git diff -- "apps/runner/app/_layout.tsx"
```

Build and install:

```powershell
cd apps\runner\android
.\gradlew.bat assembleRelease
adb install -r ".\app\build\outputs\apk\release\app-release.apk"
```

Do not push until the visual and lifecycle acceptance checks in `PATCH-MANIFEST.md` pass.

## Preserved unchanged

- `apps/runner/src/theme.ts` — single global theme context and the global `SaMiOverlay`.
- `apps/runner/src/components/SaMiOverlay.tsx` — existing shared overlay implementation.
- `apps/runner/src/components/RunnerDashboardChrome.tsx` — existing dashboard chrome, theme integration and `showOverlay()` calls.
- `apps/runner/src/features/runner-dashboard/useRunnerDashboard.ts` — existing selected-theme map style, screen focus, AppState and single location pipeline.
- `RunnerDashboardMapLayer`, `RunnerDashboardWorkspace`, camera, style, location, route and voice controllers.
- Package manifests, lockfiles, Expo config, Gradle dependencies, credentials, API and database code.
