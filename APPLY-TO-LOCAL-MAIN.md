# Apply SaMi Runner Dashboard + native Mapbox refactor to local `main`

This is an overlay ZIP. Its folders already begin at `apps/runner/`; extract the ZIP into the **repository root** (`C:\\dev\\sami-assist-web`), not into `apps/runner`.

## 1. Protect the current local work

Open PowerShell:

```powershell
cd C:\dev\sami-assist-web
git status --short
```

Review the status and keep your existing local changes. The ZIP replaces only the files listed in `PATCH-MANIFEST.md`; it does not touch `.env` files, tokens, lockfiles, app configuration, or unrelated apps.

## 2. Extract over the local `main` checkout

Use Windows File Explorer to extract the ZIP into `C:\dev\sami-assist-web`, accepting replacement only for the listed paths. No Git branch is created, and no commit or push is made by this package.

Alternatively, with the ZIP saved in Downloads:

```powershell
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\sami-runner-dashboard-map-refactor.zip" -DestinationPath "C:\dev\sami-assist-web" -Force
```

## 3. Typecheck

```powershell
cd C:\dev\sami-assist-web\apps\runner
npm run typecheck
```

Resolve any reported TypeScript errors before building.

## 4. Build and install a new Android binary

The renderer and style-controller changes are native Kotlin. An OTA update cannot deliver these changes; build a new APK:

```powershell
cd C:\dev\sami-assist-web\apps\runner\android
.\gradlew.bat assembleRelease
adb install -r .\app\build\outputs\apk\release\app-release.apk
```

## 5. Device acceptance tests

1. Cold-launch SaMi Runner and verify the Dashboard displays the Mapbox map, not a blank/white surface.
2. Open another Runner page and return to Dashboard. Verify the map recreates and renders.
3. Background the app and return. Verify the map renders again.
4. Switch the user-selected day/night theme and verify the style reloads.
5. Only after those base map tests pass, test location puck, availability, active errands, route guidance, and voice guidance.

The Android logs should show the relevant sequence: `native_host_has_size`, `map_view_created`, `map_view_has_size`, `map_loaded`, and `map_ready_verified`. On a return from another screen, a new MapView generation is expected because the old SurfaceView is intentionally destroyed on host detach.

## 6. Commit/push only after the local tests pass

```powershell
cd C:\dev\sami-assist-web
git status --short
```

Keep working on your existing local `main`. Commit and push only after typecheck, APK build, and device acceptance tests succeed.
