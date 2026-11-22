import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import { router, useFocusEffect, useIsFocused } from "expo-router";
import * as Location from "expo-location";
import {
  requestRunnerCurrentLocation,
  requestRunnerLocationPermissions,
  startRunnerLocationTracking,
  stopRunnerLocationTracking,
  subscribeToRunnerLocation,
} from "@/location/runner-location-service";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  acceptRunnerJob,
  clearRunnerSession,
  getRunnerJobs,
  getRunnerMe,
  setRunnerAvailability,
  updateRunnerJobStatus,
  type RunnerJob,
  type RunnerMe,
} from "@/api";
import { useRunnerTheme } from "@/theme";
import type {
  ActiveRouteTarget,
  Coordinates,
  JobsState,
  MapLocation,
  NavigationMode,
} from "./types";
import { DEFAULT_COORDINATES } from "./types";
import {
  formatRouteDistance,
  formatRouteDuration,
  isRestrictedAccount,
  isSessionError,
} from "./utils";
import type {
  SaMiRouteChangedEvent,
  SaMiRouteProfile,
  SaMiVoiceInstructionChangedEvent,
} from "../../../modules/sami-mapbox/src";
import type { RunnerDashboardSection } from "@/components/RunnerDashboardChrome";

const ACTIVE_STATUSES = ["accepted", "in_progress", "completion_submitted"];
const TRACKING_STATUSES = ["accepted", "in_progress"];
const MAPBOX_DAY_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
const MAPBOX_NIGHT_STYLE = "mapbox://styles/mapbox/navigation-night-v1";

export function useRunnerDashboard() {
  const isDashboardFocused = useIsFocused();
  const { colors, mode } = useRunnerTheme();
  const insets = useSafeAreaInsets();

  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState === "active",
  );

  const [runner, setRunner] = useState<RunnerMe | null>(null);

  const [jobs, setJobs] = useState<JobsState>({
    offers: [],
    active: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [jobBusyId, setJobBusyId] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);

  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  const [cameraFollowing, setCameraFollowing] = useState(false);
  const [mapRecenterRequestId, setMapRecenterRequestId] = useState(0);
  const [location, setLocation] = useState<MapLocation | null>(null);
  const [currentLocationName, setCurrentLocationName] = useState("");
  const lastReverseGeocodeAtRef = useRef(0);
  const reverseGeocodeInFlightRef = useRef(false);
  const initialLocationAttemptedRef = useRef(false);
  const initialMapCenterSetRef = useRef(false);
  const dashboardFocusedRef = useRef(isDashboardFocused);
  dashboardFocusedRef.current = isDashboardFocused;
  const [navigationMode, setNavigationMode] =
    useState<NavigationMode>("idle");

  const [routeState, setRouteState] =
    useState<SaMiRouteChangedEvent>({
      status: "idle",
    });

  const [voiceInstruction, setVoiceInstruction] =
    useState<SaMiVoiceInstructionChangedEvent | null>(null);

  const [voiceGuidanceMuted, setVoiceGuidanceMuted] =
    useState(false);

  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const logoutInFlightRef = useRef(false);

  const activeJob = useMemo(
    () =>
      jobs.active.find((job) =>
        ACTIVE_STATUSES.includes(String(job.status)),
      ) ?? null,
    [jobs.active],
  );

  const activeJobIsTrackable =
    Boolean(activeJob) &&
    TRACKING_STATUSES.includes(String(activeJob?.status));

  const approved = runner?.verificationStatus === "approved";
  const restricted = isRestrictedAccount(runner?.accountStatus);
  const isOnline = runner?.availability.isOnline === true;

  const authorized =
    Boolean(runner) &&
    approved &&
    runner?.accountStatus === "active" &&
    runner?.profileComplete === true;

  const navigationActive =
    authorized && (isOnline || activeJobIsTrackable);

  const displayCoordinates =
    location ?? DEFAULT_COORDINATES;

  const onlineLabel = !authorized
    ? restricted
      ? "RESTRICTED"
      : "PENDING"
    : isOnline
      ? "ONLINE"
      : "OFFLINE";

  const canChangeAvailability =
    Boolean(authorized) &&
    !availabilityBusy &&
    !signingOut &&
    (!activeJob || (activeJob.status === "completion_submitted" && isOnline));

  const mapStyleURL =
    mode === "dark" ? MAPBOX_NIGHT_STYLE : MAPBOX_DAY_STYLE;

  /*
   * An accepted errand routes the Runner to pickup.
   * Once started, the route target changes to delivery.
   * Completion-submitted errands do not keep an active route.
   */
  const activeRouteTarget = useMemo<ActiveRouteTarget | null>(() => {
    if (!activeJob) return null;

    const isPickupStage = activeJob.status === "accepted";
    const isDeliveryStage = activeJob.status === "in_progress";

    if (!isPickupStage && !isDeliveryStage) {
      return null;
    }

    const coordinates = isPickupStage
      ? activeJob.pickupCoordinates
      : activeJob.destinationCoordinates;

    const latitude = coordinates?.latitude;
    const longitude = coordinates?.longitude;

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    return {
      latitude,
      longitude,
      label: isPickupStage
        ? activeJob.pickupLabel
        : activeJob.destinationLabel,
      stage: isPickupStage ? "pickup" : "delivery",
    };
  }, [activeJob]);

  const activeJobNeedsRoute =
    activeJob?.status === "accepted" ||
    activeJob?.status === "in_progress";

  const routeCoordinatesMissing =
    Boolean(activeJobNeedsRoute && !activeRouteTarget);

  const routeProfile: SaMiRouteProfile =
    runner?.vehicleType === "bike" ||
    runner?.vehicleType === "bicycle"
      ? "cycling"
      : "driving-traffic";

  const routeInstruction =
    routeState.nextInstruction?.trim() ||
    voiceInstruction?.instruction?.trim() ||
    "Follow the highlighted route";

  const routeSecondaryInstruction =
    routeState.secondaryInstruction?.trim() || "";

  const nextManeuverDistance =
    formatRouteDistance(routeState.stepDistanceRemainingMeters);

  const routeRemainingDistance =
    formatRouteDistance(routeState.distanceRemainingMeters);

  const routeRemainingTime =
    formatRouteDuration(routeState.durationRemainingSeconds);

  const routePanelStatusText =
    routeState.status === "requesting"
      ? "Calculating route"
      : routeState.status === "waiting_for_location"
        ? "Waiting for GPS"
        : routeState.status === "error"
          ? "Route unavailable"
          : routeState.status === "active"
            ? activeRouteTarget?.stage === "pickup"
              ? "NAVIGATING TO PICKUP"
              : "NAVIGATING TO DELIVERY"
            : "Preparing navigation";

  /*
   * Clear old maneuver information when a new errand starts
   * or when the active errand advances from pickup to delivery.
   */
  useEffect(() => {
    setRouteState({ status: "idle" });
    setVoiceInstruction(null);
  }, [activeJob?.id, activeJob?.status]);

  /*
   * The Home route remains mounted underneath pushed Runner pages.
   * Keep its native map active for as long as the app is foregrounded;
   * screen focus controls page data refresh, not map lifetime.
   */
  const mapScreenActive = appIsActive;

  const shouldTrackRunnerLocation = Boolean(
    runner &&
      authorized &&
      (isOnline || activeJobIsTrackable) &&
      !signingOut,
  );

  useEffect(() => {
    // Do not stop a persisted shift while the dashboard is temporarily
    // unmounted. Explicit offline and sign-out actions stop the task.
    if (!runner || loading) return;

    if (shouldTrackRunnerLocation) {
      void startRunnerLocationTracking().catch(async (cause) => {
        if (isOnline && !activeJobIsTrackable) {
          const rollback = await setRunnerAvailability(false).catch(() => null);
          if (rollback?.availability && mountedRef.current) {
            setRunner((current) => current
              ? { ...current, availability: rollback.availability }
              : current);
          }
        }
        if (mountedRef.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Live Runner location could not be started.",
          );
        }
      });
    } else {
      void stopRunnerLocationTracking().catch(() => undefined);
    }
  }, [runner, loading, shouldTrackRunnerLocation, isOnline, activeJobIsTrackable]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        setAppIsActive(nextState === "active");
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);


  /* ------------------------------------------------------------------ */
  /* NAVIGATION                                                          */
  /* ------------------------------------------------------------------ */

  const goToSignedOut = useCallback(() => {
    void stopRunnerLocationTracking().catch(() => undefined);
    router.dismissAll();

    router.replace({
      pathname: "/",
      params: { signedOut: "1" },
    });
  }, []);

  const goToProfile = useCallback(() => {
    router.push("/(app)/profile-setup");
  }, []);

  const goToApplicationStatus = useCallback(() => {
    router.push("/(app)/profile-setup?mode=status");
  }, []);

  /* ------------------------------------------------------------------ */
  /* DASHBOARD DATA                                                      */
  /* ------------------------------------------------------------------ */

  const loadDashboard = useCallback(
    async (refresh = false) => {
      if (
        loadInFlightRef.current ||
        logoutInFlightRef.current
      ) {
        return;
      }

      loadInFlightRef.current = true;

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const [meResult, jobsResult] = await Promise.all([
          getRunnerMe(),
          getRunnerJobs(),
        ]);

        if (!mountedRef.current) return;

        const nextJobs: JobsState = {
          offers: Array.isArray(jobsResult.offers)
            ? jobsResult.offers
            : [],
          active: Array.isArray(jobsResult.active)
            ? jobsResult.active
            : [],
        };

        setRunner(meResult.runner);
        setJobs(nextJobs);

        if (!meResult.runner.profileComplete) {
          router.replace("/(app)/profile-setup");
          return;
        }

        if (
          meResult.runner.verificationStatus !== "approved" &&
          meResult.runner.availability.isOnline
        ) {
          setRunner((current) =>
            current
              ? {
                  ...current,
                  availability: {
                    ...current.availability,
                    isOnline: false,
                  },
                }
              : current,
          );
        }
      } catch (cause) {
        if (!mountedRef.current) return;

        const message =
          cause instanceof Error
            ? cause.message
            : "Your Runner dashboard could not be loaded.";

        if (isSessionError(message)) {
          goToSignedOut();
          return;
        }

        setError(message);
      } finally {
        loadInFlightRef.current = false;

        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [goToSignedOut],
  );

  useFocusEffect(
    useCallback(() => {
      // Focus refreshes dashboard data, but does not mark the still-mounted
      // Home route as unmounted when another page is pushed above it.
      void loadDashboard();
    }, [loadDashboard]),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Offers and active-trip state must not depend on reopening a screen.
  // Refresh only while this dashboard is focused and the app is foregrounded.
  const shouldPollRunnerJobs = Boolean(
    isDashboardFocused && authorized && (isOnline || activeJob) && !signingOut,
  );

  useEffect(() => {
    if (!shouldPollRunnerJobs) return;

    let disposed = false;
    let requestInFlight = false;

    const refreshRunnerJobs = async () => {
      if (
        disposed ||
        !mountedRef.current ||
        AppState.currentState !== "active" ||
        requestInFlight
      ) {
        return;
      }

      requestInFlight = true;
      try {
        const result = await getRunnerJobs();
        if (disposed || !mountedRef.current) return;

        setJobs({
          offers: Array.isArray(result.offers) ? result.offers : [],
          active: Array.isArray(result.active) ? result.active : [],
        });
      } catch (cause) {
        if (disposed || !mountedRef.current) return;
        const message =
          cause instanceof Error
            ? cause.message
            : "Runner errands could not be refreshed.";

        if (isSessionError(message)) {
          goToSignedOut();
        }
        // Transient polling errors are intentionally non-blocking. The next
        // poll or the user's manual refresh can recover without a modal loop.
      } finally {
        requestInFlight = false;
      }
    };

    const timer = setInterval(() => {
      void refreshRunnerJobs();
    }, 20000);

    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") void refreshRunnerJobs();
      },
    );

    return () => {
      disposed = true;
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [shouldPollRunnerJobs, goToSignedOut]);

  /* ------------------------------------------------------------------ */
  /* LOCATION                                                            */
  /* ------------------------------------------------------------------ */

  const updateCurrentLocationName = useCallback(async (coordinates: Coordinates) => {
    const now = Date.now();
    if (
      reverseGeocodeInFlightRef.current ||
      now - lastReverseGeocodeAtRef.current < 60000
    ) {
      return;
    }

    lastReverseGeocodeAtRef.current = now;
    reverseGeocodeInFlightRef.current = true;

    try {
      const results = await Location.reverseGeocodeAsync(coordinates);
      const address = results[0];
      const locality = [
        address?.district,
        address?.subregion,
        address?.city,
        address?.name,
      ].find((value) => typeof value === "string" && value.trim().length > 0);

      if (locality && mountedRef.current) {
        setCurrentLocationName(locality.trim());
      }
    } catch {
      // Keep the saved service area as a fallback if reverse geocoding fails.
    } finally {
      reverseGeocodeInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    return subscribeToRunnerLocation((fix) => {
      if (!mountedRef.current) return;
      setLocation(fix);

      // Use the first fix already emitted by SaMi Location as the initial
      // camera target; do not start another location watcher.
      initialLocationAttemptedRef.current = true;
      if (!initialMapCenterSetRef.current) {
        initialMapCenterSetRef.current = true;
        setCameraFollowing(true);
        setMapRecenterRequestId((current) => current + 1);
      }

      if (dashboardFocusedRef.current) {
        void updateCurrentLocationName({
          latitude: fix.latitude,
          longitude: fix.longitude,
        });
      }
    });
  }, [updateCurrentLocationName]);

  /*
   * Seed the map with one current fix on Home entry when foreground location
   * permission is already granted. This does not prompt unexpectedly and does
   * not start a second tracking subscription. The existing SaMi Location
   * service remains the only provider of map location updates.
   */
  useEffect(() => {
    if (
      !isDashboardFocused ||
      !appIsActive ||
      location ||
      initialLocationAttemptedRef.current
    ) {
      return;
    }

    initialLocationAttemptedRef.current = true;
    let cancelled = false;

    const seedInitialLocation = async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        initialLocationAttemptedRef.current = false;
        return;
      }

      const fix = await requestRunnerCurrentLocation();
      if (cancelled || !mountedRef.current) return;

      setLocation(fix);
      if (!initialMapCenterSetRef.current) {
        initialMapCenterSetRef.current = true;
        setCameraFollowing(true);
        setMapRecenterRequestId((current) => current + 1);
      }
      void updateCurrentLocationName({
        latitude: fix.latitude,
        longitude: fix.longitude,
      });
    };

    void seedInitialLocation().catch(() => {
      // Keep the default camera if location is unavailable. A later Home
      // focus can retry after the user grants permission or enables GPS.
      initialLocationAttemptedRef.current = false;
    });

    return () => {
      cancelled = true;
      if (!initialMapCenterSetRef.current) {
        initialLocationAttemptedRef.current = false;
      }
    };
  }, [
    isDashboardFocused,
    appIsActive,
    location,
    updateCurrentLocationName,
  ]);

  const requestCurrentLocation = useCallback(async () => {
    const fix = await requestRunnerCurrentLocation();

    const coords: Coordinates = {
      latitude: fix.latitude,
      longitude: fix.longitude,
    };

    if (mountedRef.current) {
      setLocation(fix);
      if (!initialMapCenterSetRef.current) {
        initialMapCenterSetRef.current = true;
        setCameraFollowing(true);
      }
      void updateCurrentLocationName(coords);
    }

    return {
      coords,
      position: fix,
    };
  }, [updateCurrentLocationName]);

  const locateMe = useCallback(async () => {
    if (locationBusy || signingOut) return;

    setLocationBusy(true);
    setError("");

    try {
      await requestCurrentLocation();
      setCameraFollowing(true);
      setMapRecenterRequestId((current) => current + 1);
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Your location could not be detected.",
        );
      }
    } finally {
      if (mountedRef.current) {
        setLocationBusy(false);
      }
    }
  }, [locationBusy, signingOut, requestCurrentLocation]);

  /* ------------------------------------------------------------------ */
  /* AVAILABILITY                                                        */
  /* ------------------------------------------------------------------ */

  const toggleAvailability = useCallback(async () => {
    if (
      !runner ||
      availabilityBusy ||
      !authorized ||
      signingOut
    ) {
      return;
    }

    if (
      activeJob &&
      activeJob.status !== "completion_submitted"
    ) {
      setError(
        "Complete your active errand before changing availability.",
      );
      return;
    }

    setAvailabilityBusy(true);
    setError("");

    try {
      let locationForAvailability: Parameters<typeof setRunnerAvailability>[1] = undefined;

      if (!isOnline) {
        const backgroundPermission = await Location.getBackgroundPermissionsAsync();
        if (!backgroundPermission.granted) {
          const continueToSettings = await new Promise<boolean>((resolve) => {
            Alert.alert(
              "Allow background location",
              "While you are online or completing an accepted errand, SaMi Runner needs to keep sharing your location when you switch apps or lock your phone. Android may open Settings so you can choose Allow all the time. Tracking stops when you go offline or finish the errand.",
              [
                { text: "Not now", style: "cancel", onPress: () => resolve(false) },
                { text: "Continue", onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) },
            );
          });
          if (!continueToSettings) return;
        }

        await requestRunnerLocationPermissions();
        const result = await requestCurrentLocation();
        locationForAvailability = {
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.position.horizontalAccuracyMeters,
          heading: result.position.bearing,
          speed: result.position.speedMetersPerSecond,
        };
      }

      // The server writes online status and the initial presence location
      // in one transaction. Do not call the trip-only location endpoint first.
      const result = await setRunnerAvailability(
        !isOnline,
        locationForAvailability,
      );

      if (!mountedRef.current) return;

      setRunner((current) =>
        current
          ? {
              ...current,
              availability: result.availability,
            }
          : current,
      );

      setCameraFollowing(!isOnline);
      if (isOnline) {
        await stopRunnerLocationTracking();
      } else {
        setMapRecenterRequestId((current) => current + 1);
        try {
          await startRunnerLocationTracking();
        } catch (trackingCause) {
          // Do not leave a Runner marked online without a functioning live
          // location stream. Best-effort server rollback, then surface error.
          const rollback = await setRunnerAvailability(false).catch(() => null);
          if (rollback?.availability) {
            setRunner((current) => current
              ? { ...current, availability: rollback.availability }
              : current);
          }
          throw trackingCause;
        }
      }
      if (!isOnline) {
        await loadDashboard(true);
      }
    } catch (cause) {
      if (!mountedRef.current) return;

      const message =
        cause instanceof Error
          ? cause.message
          : "Availability could not be updated.";

      if (isSessionError(message)) {
        goToSignedOut();
        return;
      }

      setError(message);
    } finally {
      if (mountedRef.current) {
        setAvailabilityBusy(false);
      }
    }
  }, [
    runner,
    availabilityBusy,
    authorized,
    signingOut,
    activeJob,
    isOnline,
    requestCurrentLocation,
    loadDashboard,
    goToSignedOut,
  ]);

  /* ------------------------------------------------------------------ */
  /* ERRAND ACTIONS                                                      */
  /* ------------------------------------------------------------------ */

  const acceptJob = useCallback(
    async (job: RunnerJob) => {
      if (
        !authorized ||
        !isOnline ||
        jobBusyId ||
        signingOut
      ) {
        return;
      }

      setJobBusyId(job.id);
      setError("");

      try {
        await acceptRunnerJob(job.id);

        if (!mountedRef.current) return;

        await loadDashboard(true);
      } catch (cause) {
        if (!mountedRef.current) return;

        const message =
          cause instanceof Error
            ? cause.message
            : "This errand could not be accepted.";

        if (isSessionError(message)) {
          goToSignedOut();
          return;
        }

        setError(message);
      } finally {
        if (mountedRef.current) {
          setJobBusyId("");
        }
      }
    },
    [
      authorized,
      isOnline,
      jobBusyId,
      signingOut,
      loadDashboard,
      goToSignedOut,
    ],
  );

  const advanceJob = useCallback(
    async (job: RunnerJob) => {
      if (jobBusyId || signingOut) return;

      const action =
        job.status === "accepted"
          ? "start"
          : job.status === "in_progress"
            ? "submit_completion"
            : null;

      if (!action) return;

      setJobBusyId(job.id);
      setError("");

      try {
        await updateRunnerJobStatus(job.id, action);

        if (!mountedRef.current) return;

        await loadDashboard(true);
      } catch (cause) {
        if (!mountedRef.current) return;

        const message =
          cause instanceof Error
            ? cause.message
            : "The errand status could not be updated.";

        if (isSessionError(message)) {
          goToSignedOut();
          return;
        }

        setError(message);
      } finally {
        if (mountedRef.current) {
          setJobBusyId("");
        }
      }
    },
    [
      jobBusyId,
      signingOut,
      loadDashboard,
      goToSignedOut,
    ],
  );

  /* ------------------------------------------------------------------ */
  /* SIGN OUT                                                            */
  /* ------------------------------------------------------------------ */

  const signOut = useCallback(() => {
    if (signingOut || logoutInFlightRef.current) return;

    Alert.alert(
      "Sign out",
      "Are you sure you want to sign out of SaMi Runner?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            if (logoutInFlightRef.current) return;

            logoutInFlightRef.current = true;
            setSigningOut(true);

            try {
              await stopRunnerLocationTracking().catch(() => undefined);
              await clearRunnerSession();
            } finally {
              if (mountedRef.current) {
                router.dismissAll();

                router.replace({
                  pathname: "/",
                  params: { signedOut: "1" },
                });
              }
            }
          },
        },
      ],
    );
  }, [signingOut]);

  /* ------------------------------------------------------------------ */
  /* DERIVED DASHBOARD STATE                                             */
  /* ------------------------------------------------------------------ */

  const dashboardState = !runner
    ? loading
      ? "loading"
      : "error"
    : restricted
      ? "restricted"
      : !authorized
        ? "unverified"
        : activeJob?.status === "completion_submitted"
          ? "completion"
          : activeJob
            ? "active"
            : jobs.offers.length > 0
              ? "offers"
              : isOnline
                ? "searching"
                : "offline";

  const greetingName =
    runner?.fullName?.trim().split(/\s+/)[0] || "Runner";

  const locationAccuracyLabel =
    location?.horizontalAccuracyMeters != null
      ? `±${Math.round(location.horizontalAccuracyMeters)} m`
      : "Waiting for GPS";

  const locationQualityLabel = location?.enhanced
    ? "Map matched"
    : location
      ? "GPS location"
      : "Locating";

  const canAcceptOffers =
    authorized && isOnline && !jobBusyId && !signingOut;

  const openDashboardSection = useCallback((section: RunnerDashboardSection) => {
    router.push({
      pathname: "/(app)/runner-section",
      params: { section },
    } as never);
  }, []);

  return {
    isDashboardFocused, colors, mode, insets, appIsActive, runner, jobs,
    loading, refreshing, availabilityBusy, jobBusyId, locationBusy, signingOut,
    workspaceExpanded, setWorkspaceExpanded, error, setError, mapError, setMapError,
    mapReady, setMapReady, cameraFollowing, setCameraFollowing,
    mapRecenterRequestId, setMapRecenterRequestId, location, currentLocationName,
    navigationMode, setNavigationMode, routeState, setRouteState,
    voiceInstruction, setVoiceInstruction, voiceGuidanceMuted, setVoiceGuidanceMuted,
    activeJob, activeJobIsTrackable, approved, restricted, isOnline, authorized,
    navigationActive, displayCoordinates, onlineLabel, canChangeAvailability,
    mapStyleURL, activeRouteTarget, activeJobNeedsRoute, routeCoordinatesMissing,
    routeProfile, routeInstruction, routeSecondaryInstruction, nextManeuverDistance,
    routeRemainingDistance, routeRemainingTime, routePanelStatusText, mapScreenActive,
    shouldTrackRunnerLocation, canAcceptOffers, dashboardState, greetingName,
    locationAccuracyLabel, locationQualityLabel,
    goToSignedOut, goToProfile, goToApplicationStatus, loadDashboard,
    updateCurrentLocationName, requestCurrentLocation, locateMe,
    toggleAvailability, acceptJob, advanceJob, signOut, openDashboardSection,
  };
}
