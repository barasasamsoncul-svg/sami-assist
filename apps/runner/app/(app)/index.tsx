import { useCallback, useEffect, useRef, useState } from "react";
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
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import MapView, {
  Marker,
  type Region,
} from "react-native-maps";
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

const DEFAULT_REGION: Region = {
  latitude: -1.2921,
  longitude: 36.8219,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

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
  const label = String(status).replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function RunnerDashboardScreen() {
  const { colors } = useRunnerTheme();
  const insets = useSafeAreaInsets();

  const [runner, setRunner] = useState<RunnerMe | null>(null);
  const [jobs, setJobs] = useState<JobsState>({ offers: [], active: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [jobBusyId, setJobBusyId] = useState("");
  const [error, setError] = useState("");

  const [userCoords, setUserCoords] = useState<LatLng | null>(null);

  const mapRef = useRef<MapView | null>(null);
  const locationSubscription =
    useRef<Location.LocationSubscription | null>(null);
  const mountedRef = useRef(true);

  // Animations
  const sheetY = useRef(new Animated.Value(1000)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.55)).current;
  const contentFade = useRef(new Animated.Value(1)).current;
  const contentY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const activeJob = jobs.active.find((job) =>
    ["accepted", "in_progress"].includes(job.status),
  );
  const activeJobId = activeJob?.id || "";

  const approved = runner?.verificationStatus === "approved";
  const isOnline = runner?.availability.isOnline === true;

  // ─── Load ──────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setError("");
    try {
      const [meResult, jobsResult] = await Promise.all([
        getRunnerMe(),
        getRunnerJobs(),
      ]);

      if (!mountedRef.current) return;

      setRunner(meResult.runner);
      setJobs(jobsResult);

      if (!meResult.runner.profileComplete) {
        router.replace("/(app)/profile-setup");
      }
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Your Runner dashboard could not be loaded.",
      );
    }
  }, []);

  useEffect(() => {
    void loadDashboard().finally(() => {
      if (mountedRef.current) setLoading(false);
    });
  }, [loadDashboard]);

  // ─── Get user's current coordinates for the map ────────────────────
  useEffect(() => {
    let cancelled = false;

    async function getInitialCoords() {
      try {
        const permission =
          await Location.getForegroundPermissionsAsync();

        let granted = permission.granted;

        if (!granted) {
          const request =
            await Location.requestForegroundPermissionsAsync();
          granted = request.granted;
        }

        if (!granted || cancelled) return;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (cancelled) return;

        const coords: LatLng = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setUserCoords(coords);

        mapRef.current?.animateToRegion(
          {
            ...coords,
            latitudeDelta: DEFAULT_REGION.latitudeDelta,
            longitudeDelta: DEFAULT_REGION.longitudeDelta,
          },
          700,
        );
      } catch {
        // Silently fall back to default region
      }
    }

    void getInitialCoords();

    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Sheet slides up on mount ──────────────────────────────────────
  useEffect(() => {
    Animated.timing(sheetY, {
      toValue: 0,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sheetY]);

  // ─── Pulse ring only when online ───────────────────────────────────
  useEffect(() => {
    if (!isOnline) {
      pulseScale.setValue(1);
      pulseOpacity.setValue(0.55);
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
      pulseOpacity.setValue(0.55);
    };
  }, [isOnline, pulseScale, pulseOpacity]);

  // ─── Sheet state ───────────────────────────────────────────────────
  const sheetState:
    | "loading"
    | "unverified"
    | "error"
    | "active"
    | "offer"
    | "idle" =
    loading && !runner
      ? "loading"
      : !runner
        ? "error"
        : !approved
          ? "unverified"
          : activeJob
            ? "active"
            : jobs.offers.length > 0
              ? "offer"
              : "idle";

  // ─── Fade content when sheet state changes ─────────────────────────
  useEffect(() => {
    contentFade.setValue(0);
    contentY.setValue(6);
    Animated.parallel([
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentY, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [sheetState, contentFade, contentY]);

  // ─── Publish location while there's an active job ──────────────────
  useEffect(() => {
    let cancelled = false;

    async function startLocationSharing() {
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      if (!activeJobId) return;

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
    }

    void startLocationSharing();

    return () => {
      cancelled = true;
      locationSubscription.current?.remove();
      locationSubscription.current = null;
    };
  }, [activeJobId]);

  // ─── Handlers ──────────────────────────────────────────────────────
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadDashboard();
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }

  async function toggleAvailability() {
    if (!runner || availabilityBusy) return;

    setAvailabilityBusy(true);
    setError("");

    try {
      const result = await setRunnerAvailability(
        !runner.availability.isOnline,
      );
      if (!mountedRef.current) return;
      setRunner({ ...runner, availability: result.availability });
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Availability could not be updated.",
      );
    } finally {
      if (mountedRef.current) setAvailabilityBusy(false);
    }
  }

  async function accept(job: RunnerJob) {
    if (jobBusyId) return;
    setJobBusyId(job.id);
    setError("");

    try {
      await acceptRunnerJob(job.id);
      if (!mountedRef.current) return;
      await loadDashboard();
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "This errand could not be accepted.",
      );
    } finally {
      if (mountedRef.current) setJobBusyId("");
    }
  }

  async function advance(job: RunnerJob) {
    if (jobBusyId) return;

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
      await loadDashboard();
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The errand status could not be updated.",
      );
    } finally {
      if (mountedRef.current) setJobBusyId("");
    }
  }

  function signOut() {
    Alert.alert("Sign out", "Do you want to sign out of SaMi Runner?", [
      { text: "Stay", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          locationSubscription.current?.remove();
          await clearRunnerSession().catch(() => undefined);
          router.replace("/");
        },
      },
    ]);
  }

  const isDarkPaper = colors.paper === "#080F1D";

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle={isDarkPaper ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      {/* ── Real map ─────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          ...(userCoords ?? {
            latitude: DEFAULT_REGION.latitude,
            longitude: DEFAULT_REGION.longitude,
          }),
          latitudeDelta: DEFAULT_REGION.latitudeDelta,
          longitudeDelta: DEFAULT_REGION.longitudeDelta,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        moveOnMarkerPress={false}
      >
        {userCoords ? (
          <Marker
            coordinate={userCoords}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges
          >
            <View style={styles.markerWrap}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pulseRing,
                  {
                    borderColor: isOnline
                      ? colors.success
                      : colors.textMuted,
                    opacity: pulseOpacity,
                    transform: [{ scale: pulseScale }],
                  },
                ]}
              />
              <View
                style={[
                  styles.centerDot,
                  {
                    backgroundColor: isOnline
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

      {/* Dim map when offline or unverified */}
      {(!isOnline || !approved) && runner ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.dimLayer]}
        />
      ) : null}

      {/* Offline / online status label under the map center */}
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
            <Text
              style={[
                styles.centerLabelText,
                { color: colors.text },
              ]}
            >
              {isOnline ? "You're live" : "You're offline"}
            </Text>
          </View>
        </View>
      ) : null}

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 10, paddingHorizontal: 16 },
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
            <Text style={[styles.brand, { color: colors.navy }]}>
              SaMi <Text style={{ color: colors.blue }}>Runner</Text>
            </Text>

            {runner ? (
              <View
                style={[
                  styles.statusChip,
                  {
                    backgroundColor: !approved
                      ? colors.warningSoft
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
                      backgroundColor: !approved
                        ? colors.warning
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
                      color: !approved
                        ? colors.warning
                        : isOnline
                          ? colors.success
                          : colors.blue,
                    },
                  ]}
                >
                  {!approved
                    ? "PENDING"
                    : isOnline
                      ? "ONLINE"
                      : "OFFLINE"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.topBarActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh dashboard"
            disabled={refreshing}
            onPress={refresh}
            hitSlop={6}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.6 : refreshing ? 0.5 : 1,
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
            onPress={() => router.push("/(app)/profile-setup")}
            hitSlop={6}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons
              name="person-circle-outline"
              size={20}
              color={colors.text}
            />
          </Pressable>
        </View>
      </View>

      {/* ── Bottom sheet ─────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.sheetWrap,
          { transform: [{ translateY: sheetY }] },
        ]}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.paper,
              paddingBottom: insets.bottom + 14,
            },
          ]}
        >
          <View
            style={[styles.handle, { backgroundColor: colors.border }]}
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
              </View>
            ) : null}

            <Animated.View
              style={{
                opacity: contentFade,
                transform: [{ translateY: contentY }],
                gap: 12,
              }}
            >
              {/* Loading */}
              {sheetState === "loading" ? (
                <View style={styles.centerPad}>
                  <ActivityIndicator
                    size="large"
                    color={colors.blue}
                  />
                  <Text
                    style={[
                      styles.centerText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Loading your workspace…
                  </Text>
                </View>
              ) : null}

              {/* Error */}
              {sheetState === "error" ? (
                <View style={{ gap: 12 }}>
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
                    {error || "Your dashboard could not be loaded."}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Try again"
                    onPress={refresh}
                    disabled={refreshing}
                    style={({ pressed }) => [
                      styles.primaryAction,
                      { backgroundColor: colors.blue },
                      refreshing && styles.disabled,
                      pressed && !refreshing && styles.pressed,
                    ]}
                  >
                    {refreshing ? (
                      <ActivityIndicator
                        color="#FFFFFF"
                        size="small"
                      />
                    ) : (
                      <Text style={styles.primaryActionText}>
                        Try again
                      </Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {/* Unverified */}
              {sheetState === "unverified" ? (
                <View style={{ gap: 12 }}>
                  <View style={styles.sheetHeadingRow}>
                    <View
                      style={[
                        styles.sheetIconChip,
                        { backgroundColor: colors.warningSoft },
                      ]}
                    >
                      <Ionicons
                        name="time-outline"
                        size={20}
                        color={colors.warning}
                      />
                    </View>
                    <Text
                      style={[
                        styles.sheetTitle,
                        { color: colors.text, flex: 1 },
                      ]}
                    >
                      Verification in progress
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.sheetSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    Your profile is saved. SaMi Operations is
                    reviewing your Runner documents. You'll be able
                    to go online once you're approved.
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Refresh verification status"
                    onPress={refresh}
                    disabled={refreshing}
                    style={({ pressed }) => [
                      styles.secondaryAction,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                      refreshing && styles.disabled,
                      pressed && !refreshing && styles.pressed,
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
                          Refresh status
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {/* Active job */}
              {sheetState === "active" && activeJob ? (
                <View style={{ gap: 12 }}>
                  <View style={styles.sheetHeadingRow}>
                    <View
                      style={[
                        styles.sheetIconChip,
                        { backgroundColor: colors.blueSoft },
                      ]}
                    >
                      <Ionicons
                        name="navigate"
                        size={18}
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

                  <View style={styles.routeBlock}>
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
                          Pickup
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
                          Drop-off
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

                  {activeJob.status === "completion_submitted" ? (
                    <View
                      style={[
                        styles.pendingPill,
                        { backgroundColor: colors.warningSoft },
                      ]}
                    >
                      <Ionicons
                        name="hourglass-outline"
                        size={15}
                        color={colors.warning}
                      />
                      <Text
                        style={[
                          styles.pendingText,
                          { color: colors.warning },
                        ]}
                      >
                        Awaiting customer confirmation
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        activeJob.status === "accepted"
                          ? "Start errand"
                          : "Submit errand completion"
                      }
                      accessibilityState={{
                        busy: jobBusyId === activeJob.id,
                      }}
                      disabled={jobBusyId !== ""}
                      onPress={() => advance(activeJob)}
                      style={({ pressed }) => [
                        styles.primaryAction,
                        { backgroundColor: colors.blue },
                        jobBusyId !== "" && styles.disabled,
                        pressed &&
                          jobBusyId === "" &&
                          styles.pressed,
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
                  )}
                </View>
              ) : null}

              {/* Offers */}
              {sheetState === "offer" ? (
                <View style={{ gap: 12 }}>
                  <View style={styles.sheetHeadingRow}>
                    <View
                      style={[
                        styles.sheetIconChip,
                        { backgroundColor: colors.successSoft },
                      ]}
                    >
                      <Ionicons
                        name="notifications"
                        size={18}
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
                        {jobs.offers.length === 1
                          ? "An errand is waiting"
                          : "Errands near you"}
                      </Text>
                    </View>
                  </View>

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
                          size={14}
                          color={colors.blue}
                        />
                        <Text
                          style={[
                            styles.offerRouteText,
                            { color: colors.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {offer.pickupLabel}
                        </Text>
                      </View>
                      <View style={styles.offerRoute}>
                        <Ionicons
                          name="flag-outline"
                          size={14}
                          color={colors.success}
                        />
                        <Text
                          style={[
                            styles.offerRouteText,
                            { color: colors.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {offer.destinationLabel}
                        </Text>
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Accept errand ${offer.publicCode}`}
                        accessibilityState={{
                          busy: jobBusyId === offer.id,
                          disabled:
                            jobBusyId !== "" &&
                            jobBusyId !== offer.id,
                        }}
                        disabled={jobBusyId !== ""}
                        onPress={() => accept(offer)}
                        style={({ pressed }) => [
                          styles.offerAcceptButton,
                          { backgroundColor: colors.blue },
                          jobBusyId !== "" && styles.disabled,
                          pressed &&
                            jobBusyId === "" &&
                            styles.pressed,
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
                              Accept errand
                            </Text>
                            <Ionicons
                              name="arrow-forward"
                              size={16}
                              color="#FFFFFF"
                            />
                          </>
                        )}
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Idle */}
              {sheetState === "idle" ? (
                <View style={{ gap: 12 }}>
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
                        size={18}
                        color={
                          isOnline ? colors.success : colors.blue
                        }
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
                      ? "Stay online to receive errand offers near your service area. Offers appear instantly."
                      : "Go online to start receiving errands near " +
                        (runner?.serviceArea ||
                          "your service area") +
                        "."}
                  </Text>

                  <Pressable
                    accessibilityRole="switch"
                    accessibilityLabel={
                      isOnline ? "Go offline" : "Go online"
                    }
                    accessibilityState={{
                      checked: isOnline,
                      disabled: availabilityBusy,
                    }}
                    disabled={availabilityBusy}
                    onPress={toggleAvailability}
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
                        opacity: availabilityBusy
                          ? 0.55
                          : pressed
                            ? 0.85
                            : 1,
                        transform: [
                          {
                            scale:
                              pressed && !availabilityBusy
                                ? 0.985
                                : 1,
                          },
                        ],
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
                          color={
                            isOnline ? colors.blue : "#FFFFFF"
                          }
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
                </View>
              ) : null}

              {/* Sign out */}
              {(sheetState === "idle" ||
                sheetState === "unverified") && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign out of SaMi Runner"
                  onPress={signOut}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.signOutRow,
                    { opacity: pressed ? 0.55 : 1 },
                  ]}
                >
                  <Ionicons
                    name="log-out-outline"
                    size={16}
                    color={colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.signOutText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Sign out
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  dimLayer: {
    backgroundColor: "rgba(0,5,53,0.22)",
  },

  // ─── Marker ────────────────────────────────────────────────────────
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },

  centerLabelText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  // ─── Top bar ───────────────────────────────────────────────────────
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

  topBarLeft: { flexShrink: 1, minWidth: 0 },

  brandChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },

  brand: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.4,
  },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  statusChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  statusChipText: {
    fontSize: 9.5,
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
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // ─── Sheet ─────────────────────────────────────────────────────────
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },

  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    maxHeight: "78%",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 10,
  },

  sheetScroll: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 12,
  },

  // ─── Sheet content ─────────────────────────────────────────────────
  centerPad: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  centerText: {
    fontSize: 13,
    lineHeight: 20,
  },

  sheetHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  sheetIconChip: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  sheetEyebrow: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 2,
  },

  sheetTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    letterSpacing: -0.3,
  },

  sheetSubtitle: {
    fontSize: 13,
    lineHeight: 19,
  },

  // ─── Route block ───────────────────────────────────────────────────
  routeBlock: {
    gap: 0,
    paddingVertical: 4,
  },

  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  routeIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },

  routeLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginBottom: 1,
  },

  routeValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },

  routeConnector: {
    width: 1,
    height: 12,
    marginLeft: 13,
    marginVertical: 2,
  },

  // ─── Payout ────────────────────────────────────────────────────────
  payoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  payoutLabel: {
    fontSize: 12,
    fontWeight: "700",
  },

  payoutValue: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  // ─── Offer card ────────────────────────────────────────────────────
  offerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },

  offerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  offerCode: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  offerPayout: {
    fontSize: 15,
    fontWeight: "900",
  },

  offerTitle: {
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
  },

  offerRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  offerRouteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },

  offerAcceptButton: {
    marginTop: 4,
    minHeight: 44,
    borderRadius: 11,
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
    paddingVertical: 4,
    borderRadius: 12,
  },

  jobStatusText: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  // ─── Availability toggle ───────────────────────────────────────────
  availabilityToggle: {
    minHeight: 54,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  availabilityToggleText: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  // ─── Actions ───────────────────────────────────────────────────────
  primaryAction: {
    minHeight: 54,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  secondaryAction: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  secondaryActionText: {
    fontSize: 13,
    fontWeight: "900",
  },

  // ─── Pending pill ──────────────────────────────────────────────────
  pendingPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },

  pendingText: {
    fontSize: 12,
    fontWeight: "800",
  },

  // ─── Error card ────────────────────────────────────────────────────
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    padding: 12,
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  // ─── Sign out ──────────────────────────────────────────────────────
  signOutRow: {
    marginTop: 6,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  signOutText: {
    fontSize: 12,
    fontWeight: "700",
  },

  disabled: { opacity: 0.5 },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});