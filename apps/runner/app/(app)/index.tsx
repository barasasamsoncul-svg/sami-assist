import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import MapView, { Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  acceptRunnerJob,
  clearRunnerSession,
  getRunnerJobs,
  getRunnerMe,
  publishRunnerLocation,
  setRunnerAvailability,
  updateRunnerJobStatus,
  type RunnerJob,
  type RunnerMe,
} from "@/api";
import { useRunnerTheme } from "@/theme";

type JobsState = {
  offers: RunnerJob[];
  active: RunnerJob[];
};

type LatLng = {
  latitude: number;
  longitude: number;
};

type DashboardState =
  | "loading"
  | "error"
  | "unverified"
  | "restricted"
  | "active"
  | "completion"
  | "offers"
  | "idle";

const DEFAULT_REGION: Region = {
  latitude: -1.2921,
  longitude: 36.8219,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

const ACTIVE_STATUSES = [
  "accepted",
  "in_progress",
  "completion_submitted",
];

const TRACKING_STATUSES = [
  "accepted",
  "in_progress",
];

function money(value: number | null, currency = "KES") {
  if (value === null || !Number.isFinite(value)) return "TBC";

  return (
    currency +
    " " +
    value.toLocaleString("en-KE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}

function activeStatusLabel(status: RunnerJob["status"]) {
  const labels: Record<string, string> = {
    accepted: "Accepted",
    in_progress: "In progress",
    completion_submitted: "Awaiting confirmation",
    completed: "Completed",
  };

  return (
    labels[status] ??
    String(status).replaceAll("_", " ").replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    )
  );
}

function isRestrictedAccount(status?: string) {
  return status === "suspended" || status === "closed";
}

function isSessionError(message: string) {
  return /HTTP 401|session has expired|no valid runner session|sign in again|unauthorized/i.test(
    message,
  );
}

export default function RunnerDashboardScreen() {
  const { colors } = useRunnerTheme();
  const insets = useSafeAreaInsets();

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
  const [error, setError] = useState("");

  const [userCoords, setUserCoords] = useState<LatLng | null>(null);

  const mapRef = useRef<MapView | null>(null);
  const locationSubscription =
    useRef<Location.LocationSubscription | null>(null);

  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const logoutInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const sheetY = useRef(new Animated.Value(1000)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.55)).current;
  const contentFade = useRef(new Animated.Value(1)).current;
  const contentY = useRef(new Animated.Value(0)).current;

  const activeJob = useMemo(
    () =>
      jobs.active.find((job) =>
        ACTIVE_STATUSES.includes(String(job.status)),
      ),
    [jobs.active],
  );

  const activeJobId = activeJob?.id ?? "";
  const activeJobIsTrackable =
    Boolean(activeJob) &&
    TRACKING_STATUSES.includes(String(activeJob?.status));

  const approved = runner?.verificationStatus === "approved";
  const isOnline = runner?.availability.isOnline === true;
  const restricted = isRestrictedAccount(runner?.accountStatus);

  const authorized =
    Boolean(runner) &&
    approved &&
    runner?.accountStatus === "active" &&
    runner?.profileComplete === true;

  const isDarkPaper = colors.paper === "#080F1D";

  const sheetState: DashboardState =
    loading && !runner
      ? "loading"
      : !runner
        ? "error"
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
                  : "idle";

  const onlineLabel = !authorized
    ? restricted
      ? "RESTRICTED"
      : "PENDING"
    : isOnline
      ? "ONLINE"
      : "OFFLINE";

  /* ---------------------------------------------------------------------- */
  /* NAVIGATION                                                             */
  /* ---------------------------------------------------------------------- */

  const goToSignedOut = useCallback(() => {
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

  /* ---------------------------------------------------------------------- */
  /* DASHBOARD DATA                                                         */
  /* ---------------------------------------------------------------------- */

  const loadDashboard = useCallback(async (refresh = false) => {
    if (loadInFlightRef.current || logoutInFlightRef.current) return;

    loadInFlightRef.current = true;

    if (refresh) {
      setRefreshing(true);
    } else if (!hasLoadedOnceRef.current) {
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
      hasLoadedOnceRef.current = true;

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
  }, [goToSignedOut]);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void loadDashboard();

      return () => {
        locationSubscription.current?.remove();
        locationSubscription.current = null;
      };
    }, [loadDashboard]),
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      locationSubscription.current?.remove();
      locationSubscription.current = null;
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* LOCATION                                                               */
  /* ---------------------------------------------------------------------- */

  const requestCurrentLocation = useCallback(async () => {
    const permission =
      await Location.requestForegroundPermissionsAsync();

    if (!permission.granted) {
      throw new Error(
        "Location permission is required to use your live Runner map.",
      );
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const coords: LatLng = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    if (mountedRef.current) {
      setUserCoords(coords);

      mapRef.current?.animateToRegion(
        {
          ...coords,
          latitudeDelta: DEFAULT_REGION.latitudeDelta,
          longitudeDelta: DEFAULT_REGION.longitudeDelta,
        },
        700,
      );
    }

    return {
      coords,
      position,
    };
  }, []);

  const locateMe = useCallback(async () => {
    if (locationBusy || signingOut) return;

    setLocationBusy(true);
    setError("");

    try {
      await requestCurrentLocation();
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
  }, [locationBusy, requestCurrentLocation, signingOut]);

  // Keep the Runner's location updated while online or completing an errand.
  useEffect(() => {
    let cancelled = false;

    async function startLocationSharing() {
      locationSubscription.current?.remove();
      locationSubscription.current = null;

      if (
        !authorized ||
        (!isOnline && !activeJobIsTrackable)
      ) {
        return;
      }

      try {
        const permission =
          await Location.requestForegroundPermissionsAsync();

        if (!permission.granted || cancelled) return;

        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 15000,
            distanceInterval: 25,
          },
          (position) => {
            const coords: LatLng = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };

            if (mountedRef.current) {
              setUserCoords(coords);
            }

            void publishRunnerLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              heading: position.coords.heading,
              speed: position.coords.speed,
            }).catch(() => undefined);
          },
        );

        if (cancelled) {
          subscription.remove();
          return;
        }

        locationSubscription.current = subscription;
      } catch {
        // The dashboard remains usable when location is unavailable.
      }
    }

    void startLocationSharing();

    return () => {
      cancelled = true;
      locationSubscription.current?.remove();
      locationSubscription.current = null;
    };
  }, [activeJobIsTrackable, authorized, isOnline, activeJobId]);

  /* ---------------------------------------------------------------------- */
  /* ANIMATIONS                                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    Animated.timing(sheetY, {
      toValue: 0,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    return () => {
      sheetY.stopAnimation();
    };
  }, [sheetY]);

  useEffect(() => {
    if (!isOnline || !authorized) {
      pulseScale.setValue(1);
      pulseOpacity.setValue(0.45);
      return;
    }

    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(pulseScale, {
          toValue: 2.4,
          duration: 2200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0,
          duration: 2200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      { resetBeforeIteration: true },
    );

    loop.start();

    return () => {
      loop.stop();
      pulseScale.setValue(1);
      pulseOpacity.setValue(0.45);
    };
  }, [isOnline, authorized, pulseScale, pulseOpacity]);

  useEffect(() => {
    contentFade.setValue(0);
    contentY.setValue(8);

    Animated.parallel([
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [sheetState, contentFade, contentY]);

  /* ---------------------------------------------------------------------- */
  /* ACTIONS                                                                */
  /* ---------------------------------------------------------------------- */

  async function refresh() {
    if (refreshing || signingOut) return;
    await loadDashboard(true);
  }

  async function toggleAvailability() {
    if (!runner || availabilityBusy || !authorized || signingOut) return;

    if (activeJob && activeJob.status !== "completion_submitted") {
      setError(
        "Complete your active errand before changing availability.",
      );
      return;
    }

    setAvailabilityBusy(true);
    setError("");

    try {
      if (!isOnline) {
        const { coords } = await requestCurrentLocation();

        await publishRunnerLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      }

      const result = await setRunnerAvailability(!isOnline);

      if (!mountedRef.current) return;

      setRunner((current) =>
        current
          ? {
              ...current,
              availability: result.availability,
            }
          : current,
      );
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
  }

  async function accept(job: RunnerJob) {
    if (!authorized || !isOnline || jobBusyId || signingOut) return;

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
  }

  async function advance(job: RunnerJob) {
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
  }

  function signOut() {
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

            locationSubscription.current?.remove();
            locationSubscription.current = null;

            try {
              await clearRunnerSession();
            } finally {
              if (mountedRef.current) {
                // Same completed navigation pattern used by the
                // Runner application-status screen.
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
  }

  /* ---------------------------------------------------------------------- */
  /* MAP AND DASHBOARD                                                      */
  /* ---------------------------------------------------------------------- */

  const initialRegion: Region = userCoords
    ? {
        ...userCoords,
        latitudeDelta: DEFAULT_REGION.latitudeDelta,
        longitudeDelta: DEFAULT_REGION.longitudeDelta,
      }
    : DEFAULT_REGION;

  const showMapDim = (!isOnline || !authorized) && Boolean(runner);

  const canChangeAvailability =
    authorized &&
    !availabilityBusy &&
    !signingOut &&
    (!activeJob || activeJob.status === "completion_submitted");

  const isDark = colors.paper === "#080F1D";

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      {/* MAP */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        moveOnMarkerPress={false}
        loadingEnabled
      >
        {userCoords ? (
          <Marker
            coordinate={userCoords}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges
          >
            <View style={styles.markerWrap}>
              {isOnline && authorized ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.pulseRing,
                    {
                      borderColor: colors.success,
                      opacity: pulseOpacity,
                      transform: [{ scale: pulseScale }],
                    },
                  ]}
                />
              ) : null}

              <View
                style={[
                  styles.centerDot,
                  {
                    backgroundColor:
                      isOnline && authorized
                        ? colors.success
                        : colors.textMuted,
                    borderColor: "#FFFFFF",
                  },
                ]}
              >
                <View style={styles.centerDotInner} />
              </View>
            </View>
          </Marker>
        ) : null}
      </MapView>

      {showMapDim ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.dimLayer]}
        />
      ) : null}

      {/* MAP STATUS */}
      {userCoords ? (
        <View pointerEvents="none" style={styles.centerLabelWrap}>
          <View
            style={[
              styles.centerLabel,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.centerLabelDot,
                {
                  backgroundColor:
                    authorized && isOnline
                      ? colors.success
                      : colors.textMuted,
                },
              ]}
            />
            <Text
              style={[
                styles.centerLabelText,
                { color: colors.text },
              ]}
            >
              {authorized && isOnline ? "You're live" : "You're offline"}
            </Text>
          </View>
        </View>
      ) : null}

      {/* TOP BAR */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 10,
            paddingHorizontal: 18,
          },
        ]}
      >
        <View style={styles.topBarLeft}>
          <View
            style={[
              styles.brandChip,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.brandCopy}>
              <Text style={[styles.brand, { color: colors.navy }]}>
                SaMi <Text style={{ color: colors.blue }}>Runner</Text>
              </Text>
              <Text style={[styles.brandMini, { color: colors.textMuted }]}>
                CONSIDER IT DONE
              </Text>
            </View>

            {runner ? (
              <View
                style={[
                  styles.statusChip,
                  {
                    backgroundColor: !authorized
                      ? restricted
                        ? colors.dangerSoft
                        : colors.warningSoft
                      : isOnline
                        ? colors.successSoft
                        : colors.blueSoft,
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusChipDot,
                    {
                      backgroundColor: !authorized
                        ? restricted
                          ? colors.red
                          : colors.warning
                        : isOnline
                          ? colors.success
                          : colors.blue,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.statusChipText,
                    {
                      color: !authorized
                        ? restricted
                          ? colors.red
                          : colors.warning
                        : isOnline
                          ? colors.success
                          : colors.blue,
                    },
                  ]}
                >
                  {onlineLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.topBarActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh dashboard"
            disabled={refreshing || signingOut}
            onPress={refresh}
            hitSlop={6}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity:
                  pressed || refreshing || signingOut ? 0.55 : 1,
              },
            ]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.blue} />
            ) : (
              <Ionicons
                name="refresh-outline"
                size={20}
                color={colors.text}
              />
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Runner profile"
            disabled={signingOut}
            onPress={goToProfile}
            hitSlop={6}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed || signingOut ? 0.55 : 1,
              },
            ]}
          >
            <Ionicons
              name="person-outline"
              size={20}
              color={colors.text}
            />
          </Pressable>
        </View>
      </View>

      {/* MAP CONTROLS */}
      <View
        style={[
          styles.mapControls,
          { top: insets.top + 76 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Find my current location"
          disabled={locationBusy || signingOut}
          onPress={() => void locateMe()}
          style={({ pressed }) => [
            styles.mapControl,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed || locationBusy ? 0.55 : 1,
            },
          ]}
        >
          {locationBusy ? (
            <ActivityIndicator color={colors.blue} size="small" />
          ) : (
            <Ionicons
              name="locate-outline"
              size={21}
              color={colors.blue}
            />
          )}
        </Pressable>
      </View>

      {/* BOTTOM SHEET */}
      <Animated.View
        style={[
          styles.sheetWrap,
          {
            transform: [{ translateY: sheetY }],
          },
        ]}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.paper,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <View
            style={[
              styles.handle,
              { backgroundColor: colors.border },
            ]}
          />

          <ScrollView
            contentContainerStyle={styles.sheetScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {error ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[
                  styles.errorCard,
                  { backgroundColor: colors.dangerSoft },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={colors.red}
                />
                <Text
                  style={[styles.errorText, { color: colors.red }]}
                >
                  {error}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss error"
                  onPress={() => setError("")}
                  hitSlop={8}
                >
                  <Ionicons
                    name="close"
                    size={18}
                    color={colors.red}
                  />
                </Pressable>
              </View>
            ) : null}

            <Animated.View
              style={{
                opacity: contentFade,
                transform: [{ translateY: contentY }],
                gap: 14,
              }}
            >
              {/* LOADING */}
              {sheetState === "loading" ? (
                <View style={styles.centerPad}>
                  <ActivityIndicator size="large" color={colors.blue} />
                  <Text
                    style={[
                      styles.centerText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Preparing your Runner workspace…
                  </Text>
                </View>
              ) : null}

              {/* ERROR */}
              {sheetState === "error" ? (
                <View style={styles.stateSection}>
                  <View
                    style={[
                      styles.sheetIconChip,
                      { backgroundColor: colors.dangerSoft },
                    ]}
                  >
                    <Ionicons
                      name="cloud-offline-outline"
                      size={21}
                      color={colors.red}
                    />
                  </View>

                  <Text
                    style={[styles.sheetTitle, { color: colors.text }]}
                  >
                    Dashboard unavailable
                  </Text>

                  <Text
                    style={[
                      styles.sheetSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    {error || "Your Runner workspace could not be loaded."}
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Try again"
                    onPress={refresh}
                    disabled={refreshing || signingOut}
                    style={({ pressed }) => [
                      styles.primaryAction,
                      { backgroundColor: colors.blue },
                      (refreshing || signingOut) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {refreshing ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Text style={styles.primaryActionText}>
                          Try again
                        </Text>
                        <Ionicons
                          name="refresh-outline"
                          size={18}
                          color="#FFFFFF"
                        />
                      </>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {/* RESTRICTED */}
              {sheetState === "restricted" ? (
                <View style={styles.stateSection}>
                  <View
                    style={[
                      styles.sheetIconChip,
                      { backgroundColor: colors.dangerSoft },
                    ]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={21}
                      color={colors.red}
                    />
                  </View>

                  <Text
                    style={[styles.sheetTitle, { color: colors.text }]}
                  >
                    Account access restricted
                  </Text>

                  <Text
                    style={[
                      styles.sheetSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    Your Runner account is currently unavailable.
                    Contact SaMi Operations for assistance.
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    onPress={goToApplicationStatus}
                    style={({ pressed }) => [
                      styles.primaryAction,
                      { backgroundColor: colors.blue },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.primaryActionText}>
                      View account status
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFFFFF"
                    />
                  </Pressable>
                </View>
              ) : null}

              {/* UNVERIFIED */}
              {sheetState === "unverified" ? (
                <View style={styles.stateSection}>
                  <View style={styles.sheetHeadingRow}>
                    <View
                      style={[
                        styles.sheetIconChip,
                        { backgroundColor: colors.warningSoft },
                      ]}
                    >
                      <Ionicons
                        name="time-outline"
                        size={21}
                        color={colors.warning}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.sheetEyebrow,
                          { color: colors.warning },
                        ]}
                      >
                        ACCOUNT VERIFICATION
                      </Text>
                      <Text
                        style={[
                          styles.sheetTitle,
                          { color: colors.text },
                        ]}
                      >
                        Your journey starts here
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.sheetSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    Your profile is saved. SaMi Operations is reviewing
                    your Runner application. You will be able to go online
                    and receive eligible errands after approval.
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    onPress={goToApplicationStatus}
                    style={({ pressed }) => [
                      styles.primaryAction,
                      { backgroundColor: colors.blue },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.primaryActionText}>
                      View application status
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFFFFF"
                    />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={refresh}
                    disabled={refreshing || signingOut}
                    style={({ pressed }) => [
                      styles.secondaryAction,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                      (refreshing || signingOut) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {refreshing ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.blue}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="refresh-outline"
                          size={17}
                          color={colors.blue}
                        />
                        <Text
                          style={[
                            styles.secondaryActionText,
                            { color: colors.blue },
                          ]}
                        >
                          Refresh verification
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {/* ACTIVE ERRAND */}
              {sheetState === "active" && activeJob ? (
                <View style={styles.section}>
                  <View style={styles.sheetHeadingRow}>
                    <View
                      style={[
                        styles.sheetIconChip,
                        { backgroundColor: colors.blueSoft },
                      ]}
                    >
                      <Ionicons
                        name="navigate"
                        size={20}
                        color={colors.blue}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.sheetEyebrow,
                          { color: colors.blue },
                        ]}
                      >
                        ACTIVE ERRAND · {activeJob.publicCode}
                      </Text>
                      <Text
                        style={[
                          styles.sheetTitle,
                          { color: colors.text },
                        ]}
                        numberOfLines={2}
                      >
                        {activeJob.title}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.jobStatusPill,
                        { backgroundColor: colors.blueSoft },
                      ]}
                    >
                      <Text
                        style={[
                          styles.jobStatusText,
                          { color: colors.blue },
                        ]}
                      >
                        {activeStatusLabel(activeJob.status)}
                      </Text>
                    </View>
                  </View>

                  {activeJob.description ? (
                    <Text
                      style={[
                        styles.sheetSubtitle,
                        { color: colors.textMuted },
                      ]}
                      numberOfLines={3}
                    >
                      {activeJob.description}
                    </Text>
                  ) : null}

                  <View
                    style={[
                      styles.routeBlock,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.routeRow}>
                      <View
                        style={[
                          styles.routeIconWrap,
                          { backgroundColor: colors.blueSoft },
                        ]}
                      >
                        <Ionicons
                          name="ellipse"
                          size={10}
                          color={colors.blue}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.routeLabel,
                            { color: colors.textMuted },
                          ]}
                        >
                          PICKUP
                        </Text>
                        <Text
                          style={[
                            styles.routeValue,
                            { color: colors.text },
                          ]}
                          numberOfLines={2}
                        >
                          {activeJob.pickupLabel}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.routeConnector,
                        { backgroundColor: colors.border },
                      ]}
                    />

                    <View style={styles.routeRow}>
                      <View
                        style={[
                          styles.routeIconWrap,
                          { backgroundColor: colors.successSoft },
                        ]}
                      >
                        <Ionicons
                          name="flag"
                          size={12}
                          color={colors.success}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.routeLabel,
                            { color: colors.textMuted },
                          ]}
                        >
                          DROP-OFF
                        </Text>
                        <Text
                          style={[
                            styles.routeValue,
                            { color: colors.text },
                          ]}
                          numberOfLines={2}
                        >
                          {activeJob.destinationLabel}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.payoutRow,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <View>
                      <Text
                        style={[
                          styles.payoutLabel,
                          { color: colors.textMuted },
                        ]}
                      >
                        YOUR PAYOUT
                      </Text>
                      <Text
                        style={[
                          styles.payoutValue,
                          { color: colors.text },
                        ]}
                      >
                        {money(
                          activeJob.runnerPayoutAmount,
                          activeJob.currency,
                        )}
                      </Text>
                    </View>

                    {activeJob.distanceKm !== null ? (
                      <View style={styles.distanceChip}>
                        <Ionicons
                          name="navigate-outline"
                          size={14}
                          color={colors.blue}
                        />
                        <Text
                          style={[
                            styles.distanceText,
                            { color: colors.textMuted },
                          ]}
                        >
                          {activeJob.distanceKm} km
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      activeJob.status === "accepted"
                        ? "Start errand"
                        : "Submit errand completion"
                    }
                    accessibilityState={{
                      busy: jobBusyId === activeJob.id,
                      disabled: jobBusyId !== "",
                    }}
                    disabled={
                      jobBusyId !== "" ||
                      !["accepted", "in_progress"].includes(
                        String(activeJob.status),
                      )
                    }
                    onPress={() => void advance(activeJob)}
                    style={({ pressed }) => [
                      styles.primaryAction,
                      { backgroundColor: colors.blue },
                      jobBusyId !== "" && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {jobBusyId === activeJob.id ? (
                      <ActivityIndicator
                        color="#FFFFFF"
                        size="small"
                      />
                    ) : (
                      <>
                        <Text style={styles.primaryActionText}>
                          {activeJob.status === "accepted"
                            ? "Start errand"
                            : "Submit completion"}
                        </Text>
                        <Ionicons
                          name="arrow-forward"
                          size={18}
                          color="#FFFFFF"
                        />
                      </>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {/* COMPLETION WAITING */}
              {sheetState === "completion" && activeJob ? (
                <View style={styles.stateSection}>
                  <View
                    style={[
                      styles.sheetIconChip,
                      { backgroundColor: colors.warningSoft },
                    ]}
                  >
                    <Ionicons
                      name="hourglass-outline"
                      size={21}
                      color={colors.warning}
                    />
                  </View>

                  <Text
                    style={[
                      styles.sheetTitle,
                      { color: colors.text },
                    ]}
                  >
                    Completion submitted
                  </Text>

                  <Text
                    style={[
                      styles.sheetSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    Your completion for {activeJob.publicCode} has been
                    submitted. You are waiting for customer confirmation.
                  </Text>

                  <View
                    style={[
                      styles.routeBlock,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.routeLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      ERRAND
                    </Text>
                    <Text
                      style={[
                        styles.routeValue,
                        { color: colors.text },
                      ]}
                    >
                      {activeJob.title}
                    </Text>

                    <View
                      style={[
                        styles.payoutRow,
                        { borderTopColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.payoutLabel,
                          { color: colors.textMuted },
                        ]}
                      >
                        Your payout
                      </Text>
                      <Text
                        style={[
                          styles.payoutValue,
                          { color: colors.text },
                        ]}
                      >
                        {money(
                          activeJob.runnerPayoutAmount,
                          activeJob.currency,
                        )}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={refresh}
                    disabled={refreshing}
                    style={({ pressed }) => [
                      styles.secondaryAction,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                      refreshing && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={17}
                      color={colors.blue}
                    />
                    <Text
                      style={[
                        styles.secondaryActionText,
                        { color: colors.blue },
                      ]}
                    >
                      Refresh confirmation status
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* NEW OFFERS */}
              {sheetState === "offers" ? (
                <View style={styles.section}>
                  <View style={styles.sheetHeadingRow}>
                    <View
                      style={[
                        styles.sheetIconChip,
                        { backgroundColor: colors.successSoft },
                      ]}
                    >
                      <Ionicons
                        name="notifications-outline"
                        size={20}
                        color={colors.success}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.sheetEyebrow,
                          { color: colors.success },
                        ]}
                      >
                        {jobs.offers.length === 1
                          ? "NEW OFFER"
                          : `${jobs.offers.length} NEW OFFERS`}
                      </Text>
                      <Text
                        style={[
                          styles.sheetTitle,
                          { color: colors.text },
                        ]}
                      >
                        Errands waiting for you
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.countBadge,
                        { backgroundColor: colors.successSoft },
                      ]}
                    >
                      <Text
                        style={[
                          styles.countBadgeText,
                          { color: colors.success },
                        ]}
                      >
                        {jobs.offers.length}
                      </Text>
                    </View>
                  </View>

                  {!isOnline ? (
                    <View
                      style={[
                        styles.inlineNotice,
                        { backgroundColor: colors.warningSoft },
                      ]}
                    >
                      <Ionicons
                        name="information-circle-outline"
                        size={18}
                        color={colors.warning}
                      />
                      <Text
                        style={[
                          styles.inlineNoticeText,
                          { color: colors.text },
                        ]}
                      >
                        Go online to accept available errands.
                      </Text>
                    </View>
                  ) : null}

                  {jobs.offers.map((offer) => (
                    <View
                      key={offer.id}
                      style={[
                        styles.offerCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={styles.offerTop}>
                        <Text
                          style={[
                            styles.offerCode,
                            { color: colors.blue },
                          ]}
                        >
                          {offer.publicCode}
                        </Text>
                        <Text
                          style={[
                            styles.offerPayout,
                            { color: colors.text },
                          ]}
                        >
                          {money(
                            offer.runnerPayoutAmount,
                            offer.currency,
                          )}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.offerTitle,
                          { color: colors.text },
                        ]}
                        numberOfLines={2}
                      >
                        {offer.title}
                      </Text>

                      <View style={styles.offerRoute}>
                        <Ionicons
                          name="location-outline"
                          size={15}
                          color={colors.blue}
                        />
                        <Text
                          style={[
                            styles.offerRouteText,
                            { color: colors.textMuted },
                          ]}
                          numberOfLines={2}
                        >
                          {offer.pickupLabel}
                        </Text>
                      </View>

                      <View style={styles.offerRoute}>
                        <Ionicons
                          name="flag-outline"
                          size={15}
                          color={colors.success}
                        />
                        <Text
                          style={[
                            styles.offerRouteText,
                            { color: colors.textMuted },
                          ]}
                          numberOfLines={2}
                        >
                          {offer.destinationLabel}
                        </Text>
                      </View>

                      {offer.distanceKm !== null ? (
                        <View style={styles.offerDistance}>
                          <Ionicons
                            name="navigate-outline"
                            size={13}
                            color={colors.textMuted}
                          />
                          <Text
                            style={[
                              styles.offerDistanceText,
                              { color: colors.textMuted },
                            ]}
                          >
                            {offer.distanceKm} km
                          </Text>
                        </View>
                      ) : null}

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Accept errand ${offer.publicCode}`}
                        accessibilityState={{
                          busy: jobBusyId === offer.id,
                          disabled:
                            !isOnline ||
                            jobBusyId !== "" ||
                            signingOut,
                        }}
                        disabled={
                          !isOnline ||
                          jobBusyId !== "" ||
                          signingOut
                        }
                        onPress={() => void accept(offer)}
                        style={({ pressed }) => [
                          styles.offerAcceptButton,
                          { backgroundColor: colors.blue },
                          (!isOnline || jobBusyId !== "") &&
                            styles.disabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        {jobBusyId === offer.id ? (
                          <ActivityIndicator
                            color="#FFFFFF"
                            size="small"
                          />
                        ) : (
                          <>
                            <Text style={styles.offerAcceptText}>
                              {isOnline
                                ? "Accept errand"
                                : "Go online to accept"}
                            </Text>
                            <Ionicons
                              name="arrow-forward"
                              size={17}
                              color="#FFFFFF"
                            />
                          </>
                        )}
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* IDLE / READY TO EARN */}
              {sheetState === "idle" ? (
                <View style={styles.section}>
                  <View style={styles.sheetHeadingRow}>
                    <View
                      style={[
                        styles.sheetIconChip,
                        {
                          backgroundColor: isOnline
                            ? colors.successSoft
                            : colors.blueSoft,
                        },
                      ]}
                    >
                      <Ionicons
                        name={isOnline ? "radio" : "radio-outline"}
                        size={20}
                        color={isOnline ? colors.success : colors.blue}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.sheetEyebrow,
                          {
                            color: isOnline
                              ? colors.success
                              : colors.blue,
                          },
                        ]}
                      >
                        {isOnline
                          ? "ONLINE · WAITING FOR OFFERS"
                          : "OFFLINE · NOT RECEIVING OFFERS"}
                      </Text>
                      <Text
                        style={[
                          styles.sheetTitle,
                          { color: colors.text },
                        ]}
                      >
                        {isOnline
                          ? "You're live on the map"
                          : "Ready to earn?"}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.sheetSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    {isOnline
                      ? "Stay online to receive eligible errand offers near your service area."
                      : "Go online when you're ready to receive errands near " +
                        (runner?.serviceArea || "your service area") +
                        "."}
                  </Text>

                  <View style={styles.statRow}>
                    <View
                      style={[
                        styles.statCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statIcon,
                          { backgroundColor: colors.blueSoft },
                        ]}
                      >
                        <Ionicons
                          name="briefcase-outline"
                          size={17}
                          color={colors.blue}
                        />
                      </View>
                      <Text
                        style={[
                          styles.statValue,
                          { color: colors.text },
                        ]}
                      >
                        {jobs.active.length}
                      </Text>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: colors.textMuted },
                        ]}
                      >
                        Active errands
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statIcon,
                          { backgroundColor: colors.successSoft },
                        ]}
                      >
                        <Ionicons
                          name="notifications-outline"
                          size={17}
                          color={colors.success}
                        />
                      </View>
                      <Text
                        style={[
                          styles.statValue,
                          { color: colors.text },
                        ]}
                      >
                        {jobs.offers.length}
                      </Text>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: colors.textMuted },
                        ]}
                      >
                        Available offers
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="switch"
                    accessibilityLabel={
                      isOnline ? "Go offline" : "Go online"
                    }
                    accessibilityState={{
                      checked: isOnline,
                      disabled: !canChangeAvailability,
                    }}
                    disabled={!canChangeAvailability}
                    onPress={() => void toggleAvailability()}
                    style={({ pressed }) => [
                      styles.availabilityToggle,
                      {
                        backgroundColor: isOnline
                          ? colors.surface
                          : colors.blue,
                        borderColor: isOnline
                          ? colors.border
                          : colors.blue,
                        borderWidth: isOnline ? 1 : 0,
                        opacity:
                          availabilityBusy || signingOut
                            ? 0.55
                            : pressed
                              ? 0.85
                              : 1,
                      },
                    ]}
                  >
                    {availabilityBusy ? (
                      <ActivityIndicator
                        size="small"
                        color={isOnline ? colors.blue : "#FFFFFF"}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name={isOnline ? "pause" : "play"}
                          size={18}
                          color={isOnline ? colors.blue : "#FFFFFF"}
                        />
                        <Text
                          style={[
                            styles.availabilityToggleText,
                            {
                              color: isOnline
                                ? colors.blue
                                : "#FFFFFF",
                            },
                          ]}
                        >
                          {isOnline ? "GO OFFLINE" : "GO ONLINE"}
                        </Text>
                      </>
                    )}
                  </Pressable>

                  {jobs.offers.length === 0 ? (
                    <View
                      style={[
                        styles.emptyState,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="compass-outline"
                        size={25}
                        color={colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.emptyTitle,
                          { color: colors.text },
                        ]}
                      >
                        {isOnline
                          ? "Waiting for your next errand"
                          : "Your next errand starts here"}
                      </Text>
                      <Text
                        style={[
                          styles.emptyText,
                          { color: colors.textMuted },
                        ]}
                      >
                        {isOnline
                          ? "New offers will appear here when they become available."
                          : "Your dashboard is ready. Go online when you want to start receiving offers."}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* PROFILE ACCESS */}
              {runner && authorized ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open profile and account details"
                  disabled={signingOut}
                  onPress={goToProfile}
                  style={({ pressed }) => [
                    styles.profileLink,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.profileLinkIcon,
                      { backgroundColor: colors.blueSoft },
                    ]}
                  >
                    <Ionicons
                      name="person-outline"
                      size={17}
                      color={colors.blue}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.profileLinkTitle,
                        { color: colors.text },
                      ]}
                    >
                      Your Runner profile
                    </Text>
                    <Text
                      style={[
                        styles.profileLinkSubtitle,
                        { color: colors.textMuted },
                      ]}
                    >
                      Account and application details
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              ) : null}

              {/* SIGN OUT */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out of SaMi Runner"
                disabled={signingOut || jobBusyId !== ""}
                onPress={signOut}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.signOutRow,
                  {
                    borderColor: colors.border,
                    opacity:
                      pressed || signingOut || jobBusyId !== ""
                        ? 0.55
                        : 1,
                  },
                ]}
              >
                {signingOut ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.textMuted}
                  />
                ) : (
                  <Ionicons
                    name="log-out-outline"
                    size={17}
                    color={colors.textMuted}
                  />
                )}
                <Text
                  style={[
                    styles.signOutText,
                    { color: colors.textMuted },
                  ]}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </Text>
              </Pressable>
            </Animated.View>
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#E9EEF5",
  },

  dimLayer: {
    backgroundColor: "rgba(0,5,53,0.24)",
  },

  markerWrap: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },

  pulseRing: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
  },

  centerDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },

  centerDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },

  centerLabelWrap: {
    position: "absolute",
    top: "34%",
    left: 0,
    right: 0,
    alignItems: "center",
    marginTop: 44,
  },

  centerLabel: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  centerLabelDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  centerLabelText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },

  topBarLeft: {
    flexShrink: 1,
    minWidth: 0,
  },

  brandChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  brandCopy: {
    gap: 2,
  },

  brand: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },

  brandMini: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.8,
  },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  statusChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  statusChipText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  topBarActions: {
    flexDirection: "row",
    gap: 8,
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  mapControls: {
    position: "absolute",
    right: 18,
    zIndex: 5,
  },

  mapControl: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },

  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 9,
    maxHeight: "79%",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -5 },
    elevation: 12,
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 11,
  },

  sheetScroll: {
    paddingHorizontal: 18,
    paddingTop: 5,
    paddingBottom: 12,
    gap: 14,
  },

  section: {
    gap: 13,
  },

  stateSection: {
    gap: 13,
    paddingTop: 5,
  },

  centerPad: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  centerText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },

  sheetHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  sheetIconChip: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  sheetEyebrow: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 3,
  },

  sheetTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },

  sheetSubtitle: {
    fontSize: 13,
    lineHeight: 20,
  },

  statRow: {
    flexDirection: "row",
    gap: 10,
  },

  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 6,
  },

  statIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  statValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },

  statLabel: {
    fontSize: 10.5,
    fontWeight: "700",
  },

  countBadge: {
    minWidth: 31,
    height: 31,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  countBadgeText: {
    fontSize: 13,
    fontWeight: "900",
  },

  availabilityToggle: {
    minHeight: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  availabilityToggleText: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  routeBlock: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 13,
    gap: 0,
  },

  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  routeIconWrap: {
    width: 29,
    height: 29,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  routeLabel: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 3,
  },

  routeValue: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },

  routeConnector: {
    width: 1,
    height: 17,
    marginLeft: 14,
    marginVertical: 2,
  },

  payoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  payoutLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },

  payoutValue: {
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 2,
  },

  distanceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  distanceText: {
    fontSize: 11,
    fontWeight: "700",
  },

  offerCard: {
    borderWidth: 1,
    borderRadius: 17,
    padding: 14,
    gap: 9,
  },

  offerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  offerCode: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  offerPayout: {
    fontSize: 16,
    fontWeight: "900",
  },

  offerTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },

  offerRoute: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },

  offerRouteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },

  offerDistance: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },

  offerDistanceText: {
    fontSize: 11,
    fontWeight: "700",
  },

  offerAcceptButton: {
    marginTop: 4,
    minHeight: 47,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  offerAcceptText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "900",
    letterSpacing: -0.1,
  },

  jobStatusPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    maxWidth: 115,
  },

  jobStatusText: {
    fontSize: 9.5,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyState: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    gap: 8,
  },

  emptyTitle: {
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },

  inlineNotice: {
    padding: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  inlineNoticeText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "700",
  },

  primaryAction: {
    minHeight: 54,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 16,
  },

  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  secondaryAction: {
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },

  secondaryActionText: {
    fontSize: 12.5,
    fontWeight: "900",
  },

  profileLink: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  profileLinkIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  profileLinkTitle: {
    fontSize: 12.5,
    fontWeight: "900",
  },

  profileLinkSubtitle: {
    fontSize: 10.5,
    marginTop: 3,
  },

  signOutRow: {
    minHeight: 46,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 11,
    marginTop: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  signOutText: {
    fontSize: 12,
    fontWeight: "800",
  },

  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 13,
    padding: 12,
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },

  disabled: {
    opacity: 0.45,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});