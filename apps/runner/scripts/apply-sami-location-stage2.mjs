import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const expectedBranch = 'main';
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
if (branch !== expectedBranch) {
  throw new Error(`Run this from the main branch. Current branch: ${branch || '(detached HEAD)'}`);
}
const allowedBundleFiles = new Set([
  'SAMI-LOCATION-STAGE2-INSTRUCTIONS.md',
  'sami-location-stage2.zip',
  'sami-location-stage2-fixed.zip',
  'sami-location-stage2-repaired.zip',
  'apps/runner/scripts/apply-sami-location-stage2.mjs',
  'apps/runner/src/location/runner-location-service.ts',
  'apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxLocationProvider.kt',
  'apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxLocationController.kt',
]);
const statusLines = execFileSync(
  'git',
  ['status', '--porcelain', '--untracked-files=all'],
  { encoding: 'utf8' },
).split(/\r?\n/).filter(Boolean);
const unexpectedChanges = statusLines.filter((line) => {
  const statusCode = line.slice(0, 2);
  const relativePath = line.slice(3).trim().replace(/^"(.*)"$/, '$1').replace(/\\/g, '/');
  return statusCode !== '??' || !allowedBundleFiles.has(relativePath);
});
if (unexpectedChanges.length > 0) {
  throw new Error(
    `Unexpected working-tree changes detected. Only the new files from this bundle may be untracked:\n${unexpectedChanges.join('\n')}`,
  );
}
const requiredBundleFiles = [
  'SAMI-LOCATION-STAGE2-INSTRUCTIONS.md',
  'apps/runner/scripts/apply-sami-location-stage2.mjs',
  'apps/runner/src/location/runner-location-service.ts',
  'apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxLocationProvider.kt',
  'apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxLocationController.kt',
];
for (const requiredPath of requiredBundleFiles) {
  if (!fs.existsSync(path.join(root, requiredPath))) {
    throw new Error(`Bundle file is missing: ${requiredPath}. Extract the complete ZIP at the repository root first.`);
  }
}
if (!['sami-location-stage2.zip', 'sami-location-stage2-fixed.zip', 'sami-location-stage2-repaired.zip'].some((name) => fs.existsSync(path.join(root, name)))) {
  throw new Error('Copy sami-location-stage2-fixed.zip into the repository root before applying the bundle.');
}

const originalLineEndings = new Map();
function readRepoFile(relativePath) {
  const raw = fs.readFileSync(path.join(root, relativePath), 'utf8');
  originalLineEndings.set(relativePath, raw.includes('\r\n') ? '\r\n' : '\n');
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  const count = first < 0 ? 0 : source.split(needle).length - 1;
  if (count !== 1) {
    throw new Error(`Expected exactly one patch anchor for ${label}; found ${count}. No files have been written.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}
function replaceRegion(source, start, end, replacement, label) {
  const first = source.indexOf(start);
  if (first < 0 || source.indexOf(start, first + start.length) >= 0) {
    throw new Error(`Could not identify the start of ${label}; no files have been written.`);
  }
  const afterStart = first + start.length;
  const last = source.indexOf(end, afterStart);
  if (last < 0) throw new Error(`Could not identify the end of ${label}; no files have been written.`);
  return source.slice(0, first) + replacement + source.slice(last);
}

const files = new Map();
const put = (p, content) => files.set(p, content);

// Native Mapbox Expo module: expose actual device fixes to the Mapbox puck.
{
  const p = 'apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxModule.kt';
  let s = readRepoFile(p);
  s = replaceOnce(
    s,
    '            Prop("showUserLocation", false) { view: SaMiMapboxView, value: Boolean ->\n                view.setShowUserLocation(value)\n            }',
    '            Prop("showUserLocation", false) { view: SaMiMapboxView, value: Boolean ->\n                view.setShowUserLocation(value)\n            }\n            Prop("hasUserLocation", false) { view: SaMiMapboxView, value: Boolean ->\n                view.setHasUserLocation(value)\n            }\n            Prop("userLatitude", -1.2921) { view: SaMiMapboxView, value: Double ->\n                view.setUserLatitude(value)\n            }\n            Prop("userLongitude", 36.8219) { view: SaMiMapboxView, value: Double ->\n                view.setUserLongitude(value)\n            }\n            Prop("userBearing", 0.0) { view: SaMiMapboxView, value: Double ->\n                view.setUserBearing(value)\n            }\n            Prop("hasUserBearing", false) { view: SaMiMapboxView, value: Boolean ->\n                view.setHasUserBearing(value)\n            }\n            Prop("recenterRequestId", 0) { view: SaMiMapboxView, value: Int ->\n                view.setRecenterRequestId(value)\n            }',
    'native location props',
  );
  s = replaceOnce(s,
    '            // The following props are retained for source compatibility while\n            // location and navigation are rebuilt as separate feature layers.\n            // They intentionally do not start any location or trip-session work.',
    '            // Location props inject fixes from SaMi Location into the Mapbox\n            // puck. They do not start another device-location source or trip session.',
    'native module location prop description');
  put(p, s);
}

{
  const p = 'apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxView.kt';
  let s = readRepoFile(p);
  s = replaceOnce(s,
    '    /**\n     * Compatibility setters retained while the Runner dashboard is migrated.\n     * Stage 1 deliberately does not start location or Navigation SDK services.\n     */',
    '    /**\n     * Receives location fixes from SaMi Location. This view never starts its own\n     * device-location provider or Navigation SDK trip session.\n     */',
    'native Mapbox view documentation');
  s = replaceOnce(s,
    '    fun setScreenActive(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit',
    '    fun setScreenActive(value: Boolean) {\n        updateConfig { it.copy(screenActive = value) }\n    }',
    'screen active setter');
  s = replaceOnce(s,
    '    fun setShowUserLocation(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit',
    '    fun setShowUserLocation(value: Boolean) {\n        updateConfig { it.copy(showUserLocation = value) }\n    }\n\n    fun setHasUserLocation(value: Boolean) {\n        updateConfig { it.copy(hasUserLocation = value) }\n    }\n\n    fun setUserLatitude(value: Double) {\n        updateConfig { it.copy(userLatitude = value) }\n    }\n\n    fun setUserLongitude(value: Double) {\n        updateConfig { it.copy(userLongitude = value) }\n    }\n\n    fun setUserBearing(value: Double) {\n        updateConfig { it.copy(userBearing = value) }\n    }\n\n    fun setHasUserBearing(value: Boolean) {\n        updateConfig { it.copy(hasUserBearing = value) }\n    }\n\n    fun setRecenterRequestId(value: Int) {\n        updateConfig { it.copy(recenterRequestId = value) }\n    }',
    'native view location setters');
  s = replaceOnce(s,
    '    fun setLocationPulsingEnabled(@Suppress("UNUSED_PARAMETER") value: Boolean) = Unit',
    '    fun setLocationPulsingEnabled(value: Boolean) {\n        updateConfig { it.copy(locationPulsingEnabled = value) }\n    }',
    'location pulsing setter');
  s = replaceOnce(s,
    '    fun setCameraMode(@Suppress("UNUSED_PARAMETER") value: String) = Unit',
    '    fun setCameraMode(value: String) {\n        updateConfig { it.copy(cameraMode = value) }\n    }',
    'camera mode setter');
  // A production build is fixed to SurfaceView. Keep the legacy native prop
  // harmless during migration, but never allow it to recreate a TextureView.
  s = replaceOnce(s,
    '    fun setRenderSurface(value: String) {\n        updateConfig {\n            it.copy(renderSurface = if (value == "texture") "texture" else "surface")\n        }\n    }',
    '    fun setRenderSurface(@Suppress("UNUSED_PARAMETER") value: String) {\n        updateConfig { it.copy(renderSurface = "surface") }\n    }',
    'fixed SurfaceView policy');
  put(p, s);
}

{
  const p = 'apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxRenderer.kt';
  let s = readRepoFile(p);
  s = replaceOnce(s,
    '    Plugin.Mapbox(Plugin.MAPBOX_GESTURES_PLUGIN_ID),\n    Plugin.Mapbox(Plugin.MAPBOX_LOGO_PLUGIN_ID),',
    '    Plugin.Mapbox(Plugin.MAPBOX_GESTURES_PLUGIN_ID),\n    Plugin.Mapbox(Plugin.MAPBOX_LOCATION_COMPONENT_PLUGIN_ID),\n    Plugin.Mapbox(Plugin.MAPBOX_LOGO_PLUGIN_ID),',
    'Mapbox location plugin registration');
  s = replaceOnce(s,
    '    val renderSurface: String = "surface",\n)',
    '    val renderSurface: String = "surface",\n    val screenActive: Boolean = true,\n    val showUserLocation: Boolean = false,\n    val hasUserLocation: Boolean = false,\n    val userLatitude: Double = SaMiMapboxDefaults.DEFAULT_LATITUDE,\n    val userLongitude: Double = SaMiMapboxDefaults.DEFAULT_LONGITUDE,\n    val userBearing: Double = 0.0,\n    val hasUserBearing: Boolean = false,\n    val cameraMode: String = "free",\n    val locationPulsingEnabled: Boolean = false,\n    val recenterRequestId: Int = 0,\n)',
    'Mapbox config location fields');
  s = replaceOnce(s,
    ' * Owns one Mapbox MapView instance and the events required to prove that it\n * has rendered a real frame. This class intentionally contains no location\n * provider, location permission, navigation session, route or voice code.',
    ' * Owns the native Mapbox surface and rendering lifecycle. SaMi Location\n * injects position fixes through a custom provider; this renderer never\n * requests device location or starts a second GPS subscription.',
    'renderer architecture documentation');
  // The current main-branch configureMapControls() method has no location-source
  // comment block. Location ownership is documented at the renderer header and
  // the MapInitOptions section below, so there is no source anchor to replace here.
  s = replaceOnce(s,
    '    private var styleController: SaMiMapboxStyleController? = null',
    '    private var styleController: SaMiMapboxStyleController? = null\n    private var locationController: SaMiMapboxLocationController? = null',
    'Mapbox location controller field');
  s = replaceOnce(s,
    '                // It also excludes the location component: Stage 1 must not\n                // request, subscribe to or publish device location.\n                plugins = SA_MI_MAPS_STAGE_ONE_PLUGINS,',
    '                // Location is enabled only through SaMi\'s custom provider,\n                // which receives the single Expo Location stream.\n                plugins = SA_MI_MAPS_STAGE_ONE_PLUGINS,',
    'Mapbox custom location source documentation');
  s = replaceOnce(s,
    '                textureView = config.renderSurface == "texture",',
    '                textureView = false,',
    'fixed SurfaceView renderer');
  s = replaceOnce(s,
    '            configureMapControls(createdMapView)\n            subscribeToMapEvents(createdMapView, mapGeneration)',
    '            configureMapControls(createdMapView)\n            locationController = SaMiMapboxLocationController(createdMapView, diagnostics)\n            subscribeToMapEvents(createdMapView, mapGeneration)',
    'initialise Mapbox location component');
  s = replaceOnce(s,
    '            lifecycle.attach()\n        } catch (error: Exception) {',
    '            lifecycle.attach()\n            locationController?.update(config)\n        } catch (error: Exception) {',
    'apply initial SaMi location config');
  s = replaceOnce(s,
    '        if (\n            previous.initialLatitude != config.initialLatitude ||\n            previous.initialLongitude != config.initialLongitude ||\n            previous.initialZoom != config.initialZoom ||\n            previous.initialBearing != config.initialBearing\n        ) {\n            applyInitialCamera()\n        }\n    }',
    `        if (\n            previous.initialLatitude != config.initialLatitude ||\n            previous.initialLongitude != config.initialLongitude ||\n            previous.initialZoom != config.initialZoom ||\n            previous.initialBearing != config.initialBearing\n        ) {\n            applyInitialCamera()\n        }\n\n        // The same Expo Location fixes update the puck and follow camera.\n        // The Mapbox location component is configured with SaMi's custom\n        // provider, so it never opens a second device GPS subscription.\n        locationController?.update(config)\n    }`,
    'update Mapbox puck from SaMi location');
  s = replaceOnce(s,
    '        val currentMapView = mapView\n        mapView = null\n        styleController = null',
    '        val currentMapView = mapView\n        mapView = null\n        styleController = null\n        locationController?.dispose()\n        locationController = null',
    'dispose Mapbox location controller');
  s = replaceOnce(s,
    '        val bearing = input.initialBearing.takeIf { it.isFinite() } ?: 0.0\n        val style = input.mapStyleURL.trim().ifBlank { SaMiMapboxDefaults.DAY_STYLE }\n        val surface = if (input.renderSurface == "texture") "texture" else "surface"',
    '        val bearing = input.initialBearing.takeIf { it.isFinite() } ?: 0.0\n        val style = input.mapStyleURL.trim().ifBlank { SaMiMapboxDefaults.DAY_STYLE }\n        val surface = "surface"\n        val userLatitude = input.userLatitude.takeIf { it.isFinite() && it in -90.0..90.0 } ?: SaMiMapboxDefaults.DEFAULT_LATITUDE\n        val userLongitude = input.userLongitude.takeIf { it.isFinite() && it in -180.0..180.0 } ?: SaMiMapboxDefaults.DEFAULT_LONGITUDE\n        val userBearing = input.userBearing.takeIf { it.isFinite() && it >= 0.0 && it < 360.0 } ?: 0.0\n        val cameraMode = input.cameraMode.takeIf { it == "free" || it == "follow" || it == "navigation" } ?: "free"',
    'normalise SaMi location configuration');
  s = replaceOnce(s,
    '            initialBearing = bearing,\n            renderSurface = surface,\n        )',
    '            initialBearing = bearing,\n            renderSurface = surface,\n            screenActive = input.screenActive,\n            userLatitude = userLatitude,\n            userLongitude = userLongitude,\n            userBearing = userBearing,\n            cameraMode = cameraMode,\n        )',
    'return normalized SaMi location config');
  put(p, s);
}

{
  const p = 'apps/runner/modules/sami-mapbox/src/SaMiMapbox.types.ts';
  let s = readRepoFile(p);
  s = replaceOnce(s,
    '  /** @deprecated Dashboard visibility does not control the native MapView lifecycle. */\n  screenActive?: boolean;',
    '  /** Dashboard focus gates follow-camera movement; it does not stop the location task. */\n  screenActive?: boolean;\n\n  /** Feed the live fix from SaMi Location into Mapbox\'s puck. */\n  hasUserLocation?: boolean;\n  userLatitude?: number;\n  userLongitude?: number;\n  userBearing?: number;\n  hasUserBearing?: boolean;\n  recenterRequestId?: number;',
    'public live-location props');
  s = replaceOnce(s,
    '  /** @deprecated Location will be implemented as a separate SaMi Maps layer. */\n  showUserLocation?: boolean;',
    '  /** Enables the location puck when a valid SaMi Location fix is available. */\n  showUserLocation?: boolean;',
    'public showUserLocation documentation');
  s = replaceOnce(s,
    '  /** @deprecated Location will be implemented as a separate SaMi Maps layer. */\n  puckBearing?: SaMiPuckBearing;',
    '  /** Location puck orientation supplied by SaMi Location. */\n  puckBearing?: SaMiPuckBearing;',
    'public puck bearing documentation');
  s = replaceOnce(s,
    '  /** @deprecated Location will be implemented as a separate SaMi Maps layer. */\n  locationPulsingEnabled?: boolean;',
    '  /** Enables the Mapbox puck pulse while the Runner is sharing location. */\n  locationPulsingEnabled?: boolean;',
    'public location pulse documentation');
  s = replaceOnce(s,
    '  /** @deprecated Navigation will be implemented as a separate SaMi Maps layer. */\n  cameraMode?: SaMiMapCameraMode;',
    '  /** Follow the injected SaMi Location fix when set to follow/navigation. */\n  cameraMode?: SaMiMapCameraMode;',
    'public camera mode documentation');
  s = replaceOnce(s,
    'export type SaMiMapRenderSurface = "surface" | "texture";',
    'export type SaMiMapRenderSurface = "surface";',
    'pin production renderer to SurfaceView');
  put(p, s);
}

{
  const p = 'apps/runner/modules/sami-mapbox/src/SaMiMapboxView.tsx';
  let s = readRepoFile(p);
  s = replaceOnce(s,
    '      renderSurface={props.renderSurface ?? "surface"}',
    '      renderSurface="surface"\n      showUserLocation={props.showUserLocation ?? false}\n      hasUserLocation={props.hasUserLocation ?? false}\n      userLatitude={props.userLatitude ?? props.initialLatitude ?? -1.2921}\n      userLongitude={props.userLongitude ?? props.initialLongitude ?? 36.8219}\n      userBearing={props.userBearing ?? 0}\n      hasUserBearing={props.hasUserBearing ?? false}\n      locationPulsingEnabled={props.locationPulsingEnabled ?? false}\n      cameraMode={props.cameraMode ?? "free"}\n      recenterRequestId={props.recenterRequestId ?? 0}',
    'public component location props');
  put(p, s);
}

// Dashboard: use one Expo Location task for foreground/background updates and
// inject each fix into Mapbox. Remove its old second location publisher.
{
  const p = 'apps/runner/app/(app)/index.tsx';
  let s = readRepoFile(p);
  s = replaceOnce(s,
    'import * as Location from "expo-location";',
    'import * as Location from "expo-location";\nimport {\n  requestRunnerCurrentLocation,\n  requestRunnerLocationPermissions,\n  startRunnerLocationTracking,\n  stopRunnerLocationTracking,\n  subscribeToRunnerLocation,\n} from "@/location/runner-location-service";',
    'dashboard location service import');
  s = replaceOnce(s,
    '  publishRunnerLocation,\n',
    '',
    'remove dashboard duplicate location publisher import');
  s = replaceOnce(s,
    '  const [cameraFollowing, setCameraFollowing] = useState(false);\n',
    '  const [cameraFollowing, setCameraFollowing] = useState(false);\n  const [mapRecenterRequestId, setMapRecenterRequestId] = useState(0);\n',
    'dashboard recenter state');
  s = replaceRegion(s,
    '  const requestCurrentLocation = useCallback(async () => {',
    '\n  const locateMe = useCallback(async () => {',
    `  const requestCurrentLocation = useCallback(async () => {\n    const fix = await requestRunnerCurrentLocation();\n\n    const coords: Coordinates = {\n      latitude: fix.latitude,\n      longitude: fix.longitude,\n    };\n\n    if (mountedRef.current) {\n      setLocation(fix);\n      setCameraFollowing(true);\n      void updateCurrentLocationName(coords);\n    }\n\n    return {\n      coords,\n      position: fix,\n    };\n  }, [updateCurrentLocationName]);\n`,
    'dashboard one-shot location request');
  s = replaceRegion(s,
    '  const locateMe = useCallback(async () => {',
    '\n  /* ------------------------------------------------------------------ */\n  /* AVAILABILITY',
    `  const locateMe = useCallback(async () => {\n    if (locationBusy || signingOut) return;\n\n    setLocationBusy(true);\n    setError("");\n\n    try {\n      await requestCurrentLocation();\n      setCameraFollowing(true);\n      setMapRecenterRequestId((current) => current + 1);\n    } catch (cause) {\n      if (mountedRef.current) {\n        setError(\n          cause instanceof Error\n            ? cause.message\n            : "Your location could not be detected.",\n        );\n      }\n    } finally {\n      if (mountedRef.current) {\n        setLocationBusy(false);\n      }\n    }\n  }, [locationBusy, signingOut, requestCurrentLocation]);\n`,
    'dashboard locate-me action');
  // The locateMe-to-Availability replacement above already removes the obsolete
  // handleMapLocation callback and its second location publisher. Do not patch
  // that same region again: those anchors no longer exist after the replacement.
  s = replaceOnce(s,
    '          onLocationChanged={handleMapLocation}\n',
    '',
    'remove duplicate native map location listener');
  s = replaceOnce(s,
    '          cameraMode={\n            activeRouteTarget\n              ? "navigation"\n              : cameraFollowing\n                ? "follow"\n                : "free"\n          }',
    '          cameraMode={\n            activeRouteTarget\n              ? "navigation"\n              : navigationActive || cameraFollowing\n                ? "follow"\n                : "free"\n          }',
    'automatically follow live location while Runner is online or on an active errand');
  s = replaceOnce(s,
    '          initialLatitude={displayCoordinates.latitude}\n          initialLongitude={displayCoordinates.longitude}',
    '          initialLatitude={DEFAULT_COORDINATES.latitude}\n          initialLongitude={DEFAULT_COORDINATES.longitude}',
    'keep initial Mapbox camera independent from live GPS');
  s = replaceOnce(s,
    '          showUserLocation\n',
    '          showUserLocation={Boolean(location)}\n          hasUserLocation={Boolean(location)}\n          userLatitude={location?.latitude ?? displayCoordinates.latitude}\n          userLongitude={location?.longitude ?? displayCoordinates.longitude}\n          userBearing={location?.bearing ?? 0}\n          hasUserBearing={location?.bearing != null}\n          recenterRequestId={mapRecenterRequestId}\n',
    'bind live SaMi location to Mapbox');
  s = replaceOnce(s,
    '          initialPitch={0}\n',
    '',
    'remove unsupported Mapbox pitch prop');
  // The old locateMe publication was removed when that callback was replaced
  // above. The shared Expo Location task is now the only publisher.
  s = replaceOnce(s,
    '          accuracy: result.position.coords.accuracy,\n          heading: result.position.coords.heading,\n          speed: result.position.coords.speed,',
    '          accuracy: result.position.horizontalAccuracyMeters,\n          heading: result.position.bearing,\n          speed: result.position.speedMetersPerSecond,',
    'availability initial location field mapping');
  // Explain why background permission is requested before Android 11+ opens Settings.
  s = replaceOnce(s,
    '      if (!isOnline) {\n        const result = await requestCurrentLocation();',
    `      if (!isOnline) {\n        const backgroundPermission = await Location.getBackgroundPermissionsAsync();\n        if (!backgroundPermission.granted) {\n          const continueToSettings = await new Promise<boolean>((resolve) => {\n            Alert.alert(\n              "Allow background location",\n              "While you are online or completing an accepted errand, SaMi Runner needs to keep sharing your location when you switch apps or lock your phone. Android may open Settings so you can choose Allow all the time. Tracking stops when you go offline or finish the errand.",\n              [\n                { text: "Not now", style: "cancel", onPress: () => resolve(false) },\n                { text: "Continue", onPress: () => resolve(true) },\n              ],\n              { cancelable: true, onDismiss: () => resolve(false) },\n            );\n          });\n          if (!continueToSettings) return;\n        }\n\n        await requestRunnerLocationPermissions();\n        const result = await requestCurrentLocation();`,
    'background permission rationale before online');
  s = replaceOnce(s,
    '      setCameraFollowing(!isOnline);\n      if (!isOnline) {',
    '      setCameraFollowing(!isOnline);\n      if (isOnline) {\n        await stopRunnerLocationTracking();\n      } else {\n        setMapRecenterRequestId((current) => current + 1);\n        try {\n          await startRunnerLocationTracking();\n        } catch (trackingCause) {\n          // Do not leave a Runner marked online without a functioning live\n          // location stream. Best-effort server rollback, then surface error.\n          const rollback = await setRunnerAvailability(false).catch(() => null);\n          if (rollback?.availability) {\n            setRunner((current) => current\n              ? { ...current, availability: rollback.availability }\n              : current);\n          }\n          throw trackingCause;\n        }\n      }\n      if (!isOnline) {',
    'start live tracking after online transaction and rollback if it fails');
  // The Expo TaskManager pipeline publishes location once, independent of
  // whether the Dashboard screen is mounted or another app is foregrounded.
  s = replaceOnce(s,
    '  const mapScreenActive = Boolean(\n    isDashboardFocused && appIsActive,\n  );',
    '  const mapScreenActive = Boolean(\n    isDashboardFocused && appIsActive,\n  );\n\n  const shouldTrackRunnerLocation = Boolean(\n    runner &&\n      authorized &&\n      (isOnline || activeJobIsTrackable) &&\n      !signingOut,\n  );\n\n  useEffect(() => {\n    // Do not stop a persisted shift while the dashboard is temporarily\n    // unmounted. Explicit offline and sign-out actions stop the task.\n    if (!runner || loading) return;\n\n    if (shouldTrackRunnerLocation) {\n      void startRunnerLocationTracking().catch(async (cause) => {\n        if (isOnline && !activeJobIsTrackable) {\n          const rollback = await setRunnerAvailability(false).catch(() => null);\n          if (rollback?.availability && mountedRef.current) {\n            setRunner((current) => current\n              ? { ...current, availability: rollback.availability }\n              : current);\n          }\n        }\n        if (mountedRef.current) {\n          setError(\n            cause instanceof Error\n              ? cause.message\n              : "Live Runner location could not be started.",\n          );\n        }\n      });\n    } else {\n      void stopRunnerLocationTracking().catch(() => undefined);\n    }\n  }, [runner, loading, shouldTrackRunnerLocation, isOnline, activeJobIsTrackable]);',
    'persistent runner location lifecycle');
  // Subscribe the visible dashboard to the exact same Expo task fixes that
  // are published to SaMi and injected into the Mapbox puck.
  s = replaceOnce(s,
    '  const requestCurrentLocation = useCallback(async () => {',
    '  useEffect(() => {\n    return subscribeToRunnerLocation((fix) => {\n      if (!mountedRef.current) return;\n      setLocation(fix);\n      if (isDashboardFocused) {\n        void updateCurrentLocationName({\n          latitude: fix.latitude,\n          longitude: fix.longitude,\n        });\n      }\n    });\n  }, [isDashboardFocused, updateCurrentLocationName]);\n\n  const requestCurrentLocation = useCallback(async () => {',
    'dashboard subscription to shared location task');
  s = replaceOnce(s,
    '  const goToSignedOut = useCallback(() => {\n    router.dismissAll();',
    '  const goToSignedOut = useCallback(() => {\n    void stopRunnerLocationTracking().catch(() => undefined);\n    router.dismissAll();',
    'stop location after signed-out transition');
  s = replaceOnce(s,
    '            try {\n              await clearRunnerSession();',
    '            try {\n              await stopRunnerLocationTracking().catch(() => undefined);\n              await clearRunnerSession();',
    'stop location before clearing runner credentials');
  // The dashboard no longer needs a second local distance/publish pipeline.
  const distanceStart = 'function distanceBetweenMeters(\n';
  const distanceEnd = '\nfunction formatRouteDistance(\n';
  if (s.includes(distanceStart)) {
    s = replaceRegion(s, distanceStart, distanceEnd, '', 'remove duplicate Dashboard distance helper');
  }
  s = replaceOnce(s,
    '  const lastPublishedAtRef = useRef(0);\n  const lastPublishedCoordinatesRef = useRef<Coordinates | null>(null);\n',
    '',
    'remove duplicate Dashboard location publisher state');
  put(p, s);
}

// The diagnostic route keeps SurfaceView fixed; runtime surface switching is not a product feature.
{
  const p = 'apps/runner/app/mapbox-lab.tsx';
  let s = readRepoFile(p);
  s = replaceOnce(s,
    'import {\n  SaMiMapboxView,\n  type SaMiMapDiagnosticEvent,\n  type SaMiMapRenderSurface,\n} from "../modules/sami-mapbox/src";',
    'import { SaMiMapboxView, type SaMiMapDiagnosticEvent } from "../modules/sami-mapbox/src";',
    'remove surface selector type from map lab');
  s = replaceOnce(s,
    '  surface?: string | string[];\n',
    '',
    'remove surface route parameter');
  s = replaceOnce(s,
    '  const requestedSurface = firstParam(params.surface);\n  const requestedStyle = firstParam(params.style);\n\n  const initialSurface: SaMiMapRenderSurface =\n    requestedSurface === "texture" ? "texture" : "surface";\n\n  const initialStyle = requestedStyle === "night" ? NIGHT_STYLE : DAY_STYLE;\n\n  const [renderSurface, setRenderSurface] =\n    useState<SaMiMapRenderSurface>(initialSurface);',
    '  const requestedStyle = firstParam(params.style);\n  const renderSurface = "surface" as const;\n  const initialStyle = requestedStyle === "night" ? NIGHT_STYLE : DAY_STYLE;',
    'fix Mapbox lab to SurfaceView');
  s = replaceOnce(s,
    '        <Pressable\n          accessibilityRole="button"\n          onPress={() => {\n            setStatus("RECREATING MAP VIEW");\n            setErrorMessage("");\n            setRenderSurface((current) => current === "texture" ? "surface" : "texture");\n          }}\n          style={styles.controlButton}\n        >\n          <Text style={styles.controlText}>Test {renderSurface === "texture" ? "SurfaceView" : "TextureView"}</Text>\n        </Pressable>\n',
    '',
    'remove SurfaceView TextureView switch control');
  put(p, s);
}

{
  const p = 'apps/runner/modules/sami-mapbox/README.md';
  const s = `# SaMi Maps — Native renderer and live location

SaMi Maps is a SaMi-owned Expo native module backed by the official Mapbox Maps SDK for Android. It does not use \`@rnmapbox/maps\`.

## Rendering contract

- Android uses SurfaceView only. TextureView is not exposed as a production option.
- The native renderer owns MapView lifecycle, the 2D camera, style changes, loading diagnostics and first-frame readiness.
- SaMi Maps does not request location permissions or open its own Android GPS source.
- React Native overlays are rendered above the map by the Runner screen; verify their stacking on the target devices.

## Single-source location contract

- \`apps/runner/src/location/runner-location-service.ts\` is the single device-location source, using Expo Location and Expo TaskManager.
- The TaskManager task is defined at module scope and imported by the root Expo Router layout before routes mount.
- Foreground and background fixes use the same task. Eligible fixes are published through the existing authenticated Runner location endpoint.
- The visible dashboard subscribes to those exact fixes and passes them to the native Mapbox view.
- Android uses an Expo Location foreground service while the Runner is online or has a trackable active errand. Sharing stops when the Runner goes offline or signs out.
- Mapbox receives those fixes through \`SaMiMapboxLocationProvider\`; its default device-location provider is replaced before the puck is enabled. This avoids starting a second GPS stream.
- Background permission is requested only after an explanatory user action when the Runner goes online. Android may open app Settings for the “Allow all the time” permission.

## Native Mapbox location implementation

- \`SaMiMapboxLocationProvider.kt\` accepts validated coordinates and bearing from SaMi Location.
- \`SaMiMapboxLocationController.kt\` controls the puck, course bearing, optional pulse, recenter requests and follow camera.
- The camera follows only when the dashboard is active and the camera mode is \`follow\` or \`navigation\`; the native puck can still receive new fixes while the dashboard is covered.
- The Mapbox location component is enabled with the custom provider, never with a separate Mapbox-owned GPS request.

## Verification route

The temporary route \`apps/runner/app/mapbox-lab.tsx\` remains an isolated renderer test without location permissions or Navigation SDK sessions. Open the fixed SurfaceView test:

\`\`\`powershell
adb shell am start -a android.intent.action.VIEW -d "samirunner://mapbox-lab" com.sami.runner
\`\`\`

The test route keeps the day/night style switch and native diagnostics. It no longer exposes a SurfaceView/TextureView selector.

## Required local dependency installation

From \`apps/runner\`, run:

\`\`\`powershell
npx expo install expo-task-manager
\`\`\`

The task-manager version is SDK-matched by Expo. Then run the app typecheck and build a new Android Release binary because this stage adds native Kotlin code and a TaskManager dependency. An OTA update cannot install the native module changes.

## Scope remaining after Location

Navigation remains a separate phase: route calculation, map matching, trip session, turn-by-turn instructions and voice guidance are not implemented by this Location stage.
`;
  put(p, s);
}

// Register the background task before Expo Router starts mounting routes.
{
  const p = 'apps/runner/app/_layout.tsx';
  let s = readRepoFile(p);
  s = replaceOnce(s,
    'import { RunnerThemeProvider } from "@/theme";',
    'import "@/location/runner-location-service";\nimport { RunnerThemeProvider } from "@/theme";',
    'register Runner location task at root module load');
  put(p, s);
}

// Add the SDK-matched TaskManager peer to the Runner app manifest.
{
  const p = 'apps/runner/package.json';
  const pkg = JSON.parse(readRepoFile(p));
  pkg.dependencies["expo-task-manager"] = "~58.0.14";
  const sorted = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)));
  pkg.dependencies = sorted;
  put(p, JSON.stringify(pkg, null, 2) + '\n');
}

// All edits were computed in memory and all anchors validated before writing.
for (const [relativePath, content] of files) {
  const target = path.join(root, relativePath);
  const eol = originalLineEndings.get(relativePath) ?? '\n';
  const output = eol === '\r\n' ? content.replace(/\n/g, '\r\n') : content;
  fs.writeFileSync(target, output, 'utf8');
}

console.log(`Applied SaMi Location Stage 2 changes to ${files.size} existing files.`);
console.log('New module files from this bundle must already be extracted into their listed apps/runner paths.');
console.log('Next: from apps/runner run `npx expo install expo-task-manager`, then run typecheck.');
