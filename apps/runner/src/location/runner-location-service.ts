import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { getRunnerSession, publishRunnerLocation } from "@/api";

/**
 * One location pipeline for SaMi Runner.
 *
 * Expo Location is the only device-location source. The TaskManager callback
 * receives the fixes in foreground and background, publishes eligible fixes
 * to SaMi, and fans the same fixes out to the visible map. Mapbox receives
 * those fixes through SaMi's custom LocationProvider; Mapbox never starts its
 * own GPS provider.
 */
export const RUNNER_LOCATION_TASK = "sami-runner-live-location-v1";

const TRACKING_ENABLED_KEY = "sami_runner_location_tracking_enabled";
const MIN_PUBLISH_INTERVAL_MS = 5_000;
const MIN_PUBLISH_DISTANCE_METERS = 10;
const MAX_CACHED_FIX_AGE_MS = 15_000;

export type RunnerLocationFix = {
  latitude: number;
  longitude: number;
  bearing: number | null;
  speedMetersPerSecond: number | null;
  horizontalAccuracyMeters: number | null;
  timestamp: number;
  enhanced: false;
};

type LocationTaskPayload = {
  locations?: Location.LocationObject[];
};

type LocationListener = (fix: RunnerLocationFix) => void;

const listeners = new Set<LocationListener>();
let latestFix: RunnerLocationFix | null = null;
let lastPublishedAt = 0;
let lastPublishedCoordinates: { latitude: number; longitude: number } | null = null;
let startInFlight: Promise<void> | null = null;
let stopInFlight: Promise<void> | null = null;

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeLocation(
  location: Location.LocationObject,
): RunnerLocationFix | null {
  const { latitude, longitude, heading, speed, accuracy } = location.coords;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const normalizedHeading = finiteOrNull(heading);
  const normalizedSpeed = finiteOrNull(speed);
  const normalizedAccuracy = finiteOrNull(accuracy);

  return {
    latitude,
    longitude,
    bearing:
      normalizedHeading !== null && normalizedHeading >= 0 && normalizedHeading < 360
        ? normalizedHeading
        : null,
    speedMetersPerSecond:
      normalizedSpeed !== null && normalizedSpeed >= 0
        ? normalizedSpeed
        : null,
    horizontalAccuracyMeters:
      normalizedAccuracy !== null && normalizedAccuracy >= 0
        ? normalizedAccuracy
        : null,
    timestamp: Number.isFinite(location.timestamp)
      ? location.timestamp
      : Date.now(),
    enhanced: false,
  };
}

function distanceBetweenMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const earthRadius = 6_371_000;
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function emitFix(fix: RunnerLocationFix): void {
  latestFix = fix;
  for (const listener of listeners) {
    try {
      listener(fix);
    } catch {
      // A screen listener must not interrupt the background location task.
    }
  }
}

function shouldPublish(fix: RunnerLocationFix): boolean {
  const now = Date.now();
  const elapsed = now - lastPublishedAt;
  const movedMeters = lastPublishedCoordinates
    ? distanceBetweenMeters(lastPublishedCoordinates, fix)
    : Number.POSITIVE_INFINITY;

  if (elapsed < MIN_PUBLISH_INTERVAL_MS && movedMeters < MIN_PUBLISH_DISTANCE_METERS) {
    return false;
  }

  lastPublishedAt = now;
  lastPublishedCoordinates = {
    latitude: fix.latitude,
    longitude: fix.longitude,
  };
  return true;
}

async function handleLocationTask(payload: LocationTaskPayload): Promise<void> {
  const locations = payload.locations;
  if (!Array.isArray(locations) || locations.length === 0) return;

  // A task can be invoked after the app process has been recreated. The
  // persisted flag prevents stale scheduled callbacks from publishing once
  // the Runner has gone offline or signed out.
  let trackingEnabled = false;
  try {
    trackingEnabled =
      (await SecureStore.getItemAsync(TRACKING_ENABLED_KEY)) === "1";
  } catch {
    return;
  }
  if (!trackingEnabled) return;

  const latestLocation = locations[locations.length - 1];
  const fix = normalizeLocation(latestLocation);
  if (!fix) return;

  emitFix(fix);

  if (!shouldPublish(fix)) return;

  try {
    const session = await getRunnerSession();
    if (!session) return;

    await publishRunnerLocation({
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.horizontalAccuracyMeters,
      heading: fix.bearing,
      speed: fix.speedMetersPerSecond,
    });
  } catch {
    // Location collection continues through transient network errors. The
    // next qualifying fix will retry; no coordinates or session data are logged.
  }
}

// Must be declared at module scope for Expo's background JS runtime.
if (!TaskManager.isTaskDefined(RUNNER_LOCATION_TASK)) {
  TaskManager.defineTask(RUNNER_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data || typeof data !== "object") return;
    await handleLocationTask(data as LocationTaskPayload);
  });
}

export function subscribeToRunnerLocation(
  listener: LocationListener,
): () => void {
  listeners.add(listener);
  if (latestFix) listener(latestFix);
  return () => listeners.delete(listener);
}

export async function requestRunnerCurrentLocation(): Promise<RunnerLocationFix> {
  if (latestFix && Date.now() - latestFix.timestamp <= MAX_CACHED_FIX_AGE_MS) {
    return latestFix;
  }

  const foreground = await Location.getForegroundPermissionsAsync();
  const permission = foreground.granted
    ? foreground
    : await Location.requestForegroundPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      "SaMi Runner needs location permission to centre the map on your current position.",
    );
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
    mayShowUserSettingsDialog: true,
  });
  const fix = normalizeLocation(position);

  if (!fix) {
    throw new Error("Your device returned an invalid location. Try again.");
  }

  emitFix(fix);
  return fix;
}

/**
 * Requests the foreground and background permissions from an explicit UI
 * action. The caller must explain background-location use before calling this
 * because Android 11+ opens app Settings for the background permission.
 */
export async function requestRunnerLocationPermissions(): Promise<void> {
  const currentForeground = await Location.getForegroundPermissionsAsync();
  const foreground = currentForeground.granted
    ? currentForeground
    : await Location.requestForegroundPermissionsAsync();

  if (!foreground.granted) {
    throw new Error(
      "Location while using SaMi Runner is required before you can go online.",
    );
  }

  const currentBackground = await Location.getBackgroundPermissionsAsync();
  const background = currentBackground.granted
    ? currentBackground
    : await Location.requestBackgroundPermissionsAsync();

  if (!background.granted) {
    throw new Error(
      "Allow SaMi Runner to access location all the time so customer progress can continue when you switch apps or lock your phone.",
    );
  }

  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error("Turn on your device's Location Services to go online.");
  }
}

/** Starts the single Expo Location stream after permission has been granted. */
export async function startRunnerLocationTracking(): Promise<void> {
  if (startInFlight) return startInFlight;
  if (stopInFlight) await stopInFlight;
  // A concurrent caller may have started while this call awaited a stop.
  if (startInFlight) return startInFlight;

  startInFlight = (async () => {
    const foreground = await Location.getForegroundPermissionsAsync();
    const background = await Location.getBackgroundPermissionsAsync();
    if (!foreground.granted || !background.granted) {
      throw new Error(
        "Enable foreground and background location permissions in SaMi Runner settings to resume live tracking.",
      );
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      throw new Error("Turn on your device's Location Services to resume live tracking.");
    }

    await SecureStore.setItemAsync(TRACKING_ENABLED_KEY, "1");

    try {
      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
        RUNNER_LOCATION_TASK,
      );

      if (!alreadyStarted) {
        await Location.startLocationUpdatesAsync(RUNNER_LOCATION_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2_000,
          distanceInterval: 5,
          deferredUpdatesInterval: 0,
          deferredUpdatesDistance: 0,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.OtherNavigation,
          showsBackgroundLocationIndicator: true,
          ...(Platform.OS === "android"
            ? {
                foregroundService: {
                  notificationTitle: "SaMi Runner is sharing your location",
                  notificationBody:
                    "Location sharing stays active while you are online or completing an errand.",
                  notificationColor: "#000535",
                  killServiceOnDestroy: false,
                },
              }
            : {}),
        });
      }
    } catch (error) {
      await SecureStore.deleteItemAsync(TRACKING_ENABLED_KEY).catch(() => undefined);
      throw error;
    }
  })();

  try {
    await startInFlight;
  } finally {
    startInFlight = null;
  }
}

export async function stopRunnerLocationTracking(): Promise<void> {
  if (stopInFlight) return stopInFlight;
  if (startInFlight) await startInFlight.catch(() => undefined);
  // A concurrent caller may have begun stopping while this call awaited start.
  if (stopInFlight) return stopInFlight;

  stopInFlight = (async () => {
    await SecureStore.deleteItemAsync(TRACKING_ENABLED_KEY).catch(() => undefined);

    try {
      const started = await Location.hasStartedLocationUpdatesAsync(
        RUNNER_LOCATION_TASK,
      );
      if (started) {
        await Location.stopLocationUpdatesAsync(RUNNER_LOCATION_TASK);
      }
    } finally {
      latestFix = null;
      lastPublishedAt = 0;
      lastPublishedCoordinates = null;
    }
  })();

  try {
    await stopInFlight;
  } finally {
    stopInFlight = null;
  }
}

export async function isRunnerLocationTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(RUNNER_LOCATION_TASK);
  } catch {
    return false;
  }
}
