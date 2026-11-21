# SaMi Runner — Location Stage 2

## What this stage adds

This stage connects the verified SurfaceView Mapbox renderer to one SaMi-owned live-location pipeline.

- Expo Location is the only source of device GPS fixes.
- Expo TaskManager receives the same location stream while the Runner is using the app and in the background, subject to OS permissions and lifecycle limits.
- Eligible fixes are sent through the existing authenticated `POST /api/runner/location` client.
- The visible dashboard subscribes to those same fixes and injects them into Mapbox through `SaMiMapboxLocationProvider`.
- Mapbox uses SaMi's custom location provider; it does not start a second GPS feed.
- SurfaceView is fixed for production. The map-lab SurfaceView/TextureView switch is removed.
- The Go Online action explains and requests background permission before completing the online transition.
- Going offline or signing out stops the location task.
- Existing online/trackable work attempts to resume the task when the Runner dashboard opens.
- Locate Me obtains a fresh position when needed and explicitly recentres the map.
- The camera follows while the Runner is online or completing a trackable errand, unless the dashboard is covered.

Navigation route calculation, map matching, turn-by-turn instructions and voice guidance remain a separate phase.

## Safety and privacy behaviour

- The task publishes only while the explicit tracking-enabled marker exists in SecureStore. Stopping tracking clears the marker before asking the OS to stop updates.
- The task does not log GPS coordinates or session credentials.
- The task uses the current Runner session and the existing API client; credentials are not copied into the native Mapbox module.
- Background permission is requested only after the user chooses Go Online and accepts the explanation. If permission is denied, SaMi does not complete the online transition.
- Android displays a foreground-service notification during live tracking.
- Force-stop, user termination, power management and OS permission restrictions may suspend or stop location updates. The app attempts to resume a registered task when reopened; tracking after force-stop is not guaranteed.
- The Runner should go offline when a shift is over. App closure is not the way to stop location sharing.

## Apply the corrected bundle

The patch script normalizes CRLF files on Windows and uses the actual renderer documentation from the current `main` branch. It also avoids two overlapping dashboard edits: the `locateMe`-to-Availability replacement already removes the old `handleMapLocation` callback and duplicate location publisher, so the script must not attempt to remove those same blocks again. The repaired script validates all source anchors in memory before writing any existing file and preserves each target file's original line-ending style.

Copy `sami-location-stage2-repaired.zip` into `C:\dev\sami-assist-web`, then run: 

```powershell
cd C:\dev\sami-assist-web
Expand-Archive .\sami-location-stage2-repaired.zip -DestinationPath . -Force
node .\apps\runner\scripts\apply-sami-location-stage2.mjs
git diff --check
git status --short
```

Run the Node command directly. Do not run the older `apply-sami-location-stage2.ps1` helper from Downloads; it invokes a stale script copy and its untracked-file allowlist does not match this bundle.

The patch script requires the `main` branch. It permits only the new files from this bundle (and the old/new Stage 2 ZIP names) to be untracked. Do not proceed if it reports an unrelated working-tree change or a missing anchor. It never commits or pushes.

## Install the SDK-matched TaskManager dependency

```powershell
cd C:\dev\sami-assist-web\apps\runner
npx expo install expo-task-manager
npm run typecheck
```

Expo must select the TaskManager version compatible with the installed SDK 58 packages. Do not hand-edit `package-lock.json`.

## Build a new Android Release APK

```powershell
cd C:\dev\sami-assist-web\apps\runner\android
.\gradlew.bat assembleRelease
```

This stage adds Kotlin native Mapbox Location integration and Expo TaskManager, so a new native Release APK is required. OTA cannot add native classes.

Install the APK: 

```powershell
adb install -r ".\app\build\outputs\apk\release\app-release.apk"
```

## Device acceptance tests

Perform the first tests while stationary and safely away from traffic.

1. Open `samirunner://mapbox-lab`. Confirm the map renders and the day/night style switch still works. The surface-switch control is removed.
2. Open the Runner dashboard while offline. Tap Locate Me. Grant foreground location permission if asked. Confirm the puck appears at the device's position and the camera recentres.
3. Tap Go Online. Read the background-location explanation and choose Continue. Grant foreground and background location permission. On Android versions that open Settings, select **Allow all the time**, then return to SaMi Runner.
4. Confirm the Runner becomes online and Android shows the SaMi location foreground-service notification.
5. Leave SaMi in the background for a short stationary test, then return. Confirm the map remains visible and usable.
6. Tap Go Offline. Confirm the notification stops and location sharing is no longer active.
7. Sign out. Confirm the location task is stopped before the session is cleared.
8. Navigate away from the dashboard and return. Confirm the map remains visible and the location puck is restored when a current fix is available.

If any test fails, capture the full typecheck/build error or the exact visible behaviour before changing more files. Do not share a Mapbox secret token; redact it from logs.

## Files in this bundle

New files: `runner-location-service.ts`, `SaMiMapboxLocationProvider.kt` and `SaMiMapboxLocationController.kt`. The apply script updates the existing native module, native view, renderer, TypeScript public API, map-lab route, Runner dashboard, root Expo Router layout and Runner package manifest. It does not change `app.config.ts`, Mapbox dependency versions, backend routes or Navigation SDK routing.
