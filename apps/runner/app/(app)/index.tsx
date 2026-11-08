import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

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

function money(value: number | null, currency = "KES") {
  if (value === null || !Number.isFinite(value)) return "To be confirmed";
  return currency + " " + value.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function RunnerDashboardScreen() {
  const { colors } = useRunnerTheme();
  const [runner, setRunner] = useState<RunnerMe | null>(null);
  const [jobs, setJobs] = useState<JobsState>({ offers: [], active: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [jobBusyId, setJobBusyId] = useState("");
  const [error, setError] = useState("");
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const activeJob = jobs.active.find((job) =>
    ["accepted", "in_progress"].includes(job.status),
  );
  const activeJobId = activeJob?.id || "";

  const loadDashboard = useCallback(async () => {
    setError("");
    try {
      const [meResult, jobsResult] = await Promise.all([
        getRunnerMe(),
        getRunnerJobs(),
      ]);
      setRunner(meResult.runner);
      setJobs(jobsResult);
      if (!meResult.runner.profileComplete) {
        router.replace("/(app)/profile-setup");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your Runner dashboard could not be loaded.",
      );
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadDashboard().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadDashboard]);

  useEffect(() => {
    let cancelled = false;

    async function startLocationSharing() {
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      if (!activeJobId) return;

      const permission = await Location.requestForegroundPermissionsAsync();
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

  async function refresh() {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }

  async function toggleAvailability() {
    if (!runner) return;
    setAvailabilityBusy(true);
    setError("");
    try {
      const result = await setRunnerAvailability(
        !runner.availability.isOnline,
      );
      setRunner({ ...runner, availability: result.availability });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Availability could not be updated.",
      );
    } finally {
      setAvailabilityBusy(false);
    }
  }

  async function accept(job: RunnerJob) {
    setJobBusyId(job.id);
    setError("");
    try {
      await acceptRunnerJob(job.id);
      await loadDashboard();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This errand could not be accepted.",
      );
    } finally {
      setJobBusyId("");
    }
  }

  async function advance(job: RunnerJob) {
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
      await loadDashboard();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The errand status could not be updated.",
      );
    } finally {
      setJobBusyId("");
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
          await clearRunnerSession();
          router.replace("/");
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.paper }]}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  const approved = runner?.verificationStatus === "approved";
  const isOnline = runner?.availability.isOnline === true;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.paper }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.blue}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.brand, { color: colors.navy }]}>
            SaMi <Text style={{ color: colors.blue }}>Runner</Text>
          </Text>
          <Text style={[styles.greeting, { color: colors.textMuted }]}>
            Your work, organised.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={signOut}
          style={[styles.iconButton, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="log-out-outline" size={19} color={colors.text} />
        </Pressable>
      </View>

      {runner ? (
        <View style={[styles.welcomeCard, { backgroundColor: colors.navy }]}>
          <Text style={styles.welcomeEyebrow}>RUNNER WORKSPACE</Text>
          <Text style={styles.welcomeName}>
            Hello, {runner.fullName || "Runner"}
          </Text>
          <Text style={styles.welcomeDescription}>
            Manage your availability and the errands assigned to you.
          </Text>
          <View style={styles.welcomeBottom}>
            <View style={styles.statusPill}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: approved ? "#58C98E" : "#F0B64D" },
                ]}
              />
              <Text style={styles.statusPillText}>
                {approved ? "VERIFIED" : "VERIFICATION PENDING"}
              </Text>
            </View>
            <Text style={styles.areaText}>
              {runner.serviceArea || "Service area not set"}
            </Text>
          </View>
        </View>
      ) : null}

      {error ? (
        <Text
          accessibilityRole="alert"
          style={[
            styles.error,
            { color: colors.red, backgroundColor: colors.dangerSoft },
          ]}
        >
          {error}
        </Text>
      ) : null}

      {!approved ? (
        <View style={[styles.noticeCard, { backgroundColor: colors.warningSoft }]}>
          <Ionicons name="time-outline" size={21} color={colors.warning} />
          <View style={styles.noticeContent}>
            <Text style={[styles.noticeTitle, { color: colors.text }]}>
              Verification required
            </Text>
            <Text style={[styles.noticeText, { color: colors.textMuted }]}>
              Your profile has been saved. Operations must review your Runner
              documents before you can go online or receive errands.
            </Text>
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.availabilityCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.availabilityText}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Your availability
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
              {isOnline
                ? "You are online and can receive errand offers."
                : "You are offline and will not receive new offers."}
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: isOnline, disabled: availabilityBusy }}
            disabled={availabilityBusy}
            onPress={toggleAvailability}
            style={[
              styles.availabilityButton,
              { backgroundColor: isOnline ? colors.success : colors.blue },
              availabilityBusy && styles.disabled,
            ]}
          >
            {availabilityBusy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.availabilityButtonText}>
                {isOnline ? "GO OFFLINE" : "GO ONLINE"}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Active errand</Text>
        <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
          {jobs.active.length}
        </Text>
      </View>

      {jobs.active.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="briefcase-outline" size={27} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No active errand</Text>
          <Text style={[styles.emptyDescription, { color: colors.textMuted }]}>
            When you accept an errand, it will appear here.
          </Text>
        </View>
      ) : (
        jobs.active.map((job) => (
          <View
            key={job.id}
            style={[
              styles.jobCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.jobTop}>
              <Text style={[styles.jobCode, { color: colors.blue }]}>{job.publicCode}</Text>
              <Text style={[styles.jobStatus, { color: colors.success }]}>
                {job.status.replaceAll("_", " ")}
              </Text>
            </View>
            <Text style={[styles.jobTitle, { color: colors.text }]}>{job.title}</Text>
            <Text style={[styles.jobDescription, { color: colors.textMuted }]}>
              {job.description}
            </Text>
            <View style={styles.locationLine}>
              <Ionicons name="location-outline" size={15} color={colors.blue} />
              <Text style={[styles.locationText, { color: colors.text }]}>
                {job.pickupLabel}
              </Text>
            </View>
            <View style={styles.locationLine}>
              <Ionicons name="flag-outline" size={15} color={colors.success} />
              <Text style={[styles.locationText, { color: colors.text }]}>
                {job.destinationLabel}
              </Text>
            </View>
            <View style={styles.jobFooter}>
              <Text style={[styles.payout, { color: colors.text }]}>
                {money(job.runnerPayoutAmount, job.currency)}
              </Text>
              {job.status === "completion_submitted" ? (
                <Text style={[styles.pendingText, { color: colors.warning }]}>
                  Awaiting customer confirmation
                </Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={jobBusyId === job.id}
                  onPress={() => advance(job)}
                  style={[
                    styles.jobAction,
                    { backgroundColor: colors.blue },
                    jobBusyId === job.id && styles.disabled,
                  ]}
                >
                  {jobBusyId === job.id ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.jobActionText}>
                      {job.status === "accepted" ? "Start errand" : "Submit completion"}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        ))
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>New errand offers</Text>
        <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
          {jobs.offers.length}
        </Text>
      </View>

      {jobs.offers.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="notifications-outline" size={27} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No new offers</Text>
          <Text style={[styles.emptyDescription, { color: colors.textMuted }]}>
            Errand offers will appear here when they are sent to your account.
          </Text>
        </View>
      ) : (
        jobs.offers.map((job) => (
          <View
            key={job.id}
            style={[
              styles.jobCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.jobTop}>
              <Text style={[styles.jobCode, { color: colors.blue }]}>{job.publicCode}</Text>
              <Text style={[styles.offerBadge, { color: colors.success }]}>NEW OFFER</Text>
            </View>
            <Text style={[styles.jobTitle, { color: colors.text }]}>{job.title}</Text>
            <Text style={[styles.jobDescription, { color: colors.textMuted }]}>
              {job.description}
            </Text>
            <View style={styles.locationLine}>
              <Ionicons name="location-outline" size={15} color={colors.blue} />
              <Text style={[styles.locationText, { color: colors.text }]}>{job.pickupLabel}</Text>
            </View>
            <View style={styles.locationLine}>
              <Ionicons name="flag-outline" size={15} color={colors.success} />
              <Text style={[styles.locationText, { color: colors.text }]}>{job.destinationLabel}</Text>
            </View>
            <View style={styles.jobFooter}>
              <Text style={[styles.payout, { color: colors.text }]}>
                {money(job.runnerPayoutAmount, job.currency)}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={jobBusyId === job.id}
                onPress={() => accept(job)}
                style={[
                  styles.jobAction,
                  { backgroundColor: colors.blue },
                  jobBusyId === job.id && styles.disabled,
                ]}
              >
                {jobBusyId === job.id ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.jobActionText}>Accept errand</Text>
                )}
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(app)/profile-setup")}
        style={[
          styles.profileButton,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Ionicons name="person-circle-outline" size={19} color={colors.text} />
        <Text style={[styles.profileButtonText, { color: colors.text }]}>Runner profile</Text>
        <Ionicons name="chevron-forward" size={17} color={colors.muted} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { flex: 1 },
  content: { padding: 19, paddingTop: 20, paddingBottom: 40, gap: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { fontSize: 21, fontWeight: "900", fontStyle: "italic" },
  greeting: { marginTop: 3, fontSize: 11 },
  iconButton: { height: 40, width: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  welcomeCard: { padding: 18, borderRadius: 18, gap: 9 },
  welcomeEyebrow: { color: "#AFC7ED", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  welcomeName: { color: "#FFFFFF", fontSize: 23, fontWeight: "900" },
  welcomeDescription: { color: "#D1DCF1", fontSize: 11, lineHeight: 17 },
  welcomeBottom: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statusPill: { backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  areaText: { color: "#D1DCF1", fontSize: 9, textAlign: "right" },
  error: { borderRadius: 12, padding: 12, fontSize: 11, lineHeight: 17 },
  noticeCard: { padding: 14, borderRadius: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  noticeContent: { flex: 1, gap: 5 },
  noticeTitle: { fontSize: 12, fontWeight: "900" },
  noticeText: { fontSize: 10, lineHeight: 16 },
  availabilityCard: { padding: 15, borderRadius: 15, borderWidth: 1, gap: 13 },
  availabilityText: { gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: "900" },
  cardSubtitle: { fontSize: 10, lineHeight: 16 },
  availabilityButton: { minHeight: 43, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  availabilityButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "900" },
  sectionCount: { fontSize: 11, fontWeight: "800" },
  emptyCard: { borderWidth: 1, borderRadius: 15, minHeight: 132, alignItems: "center", justifyContent: "center", padding: 18, gap: 8 },
  emptyTitle: { fontSize: 13, fontWeight: "900" },
  emptyDescription: { fontSize: 10, lineHeight: 16, textAlign: "center", maxWidth: 250 },
  jobCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 10 },
  jobTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  jobCode: { fontSize: 9, fontWeight: "900" },
  jobStatus: { fontSize: 9, fontWeight: "900" },
  offerBadge: { fontSize: 8, fontWeight: "900" },
  jobTitle: { fontSize: 14, fontWeight: "900" },
  jobDescription: { fontSize: 10, lineHeight: 16 },
  locationLine: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  locationText: { flex: 1, fontSize: 10, lineHeight: 16 },
  jobFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#DCE5F2", paddingTop: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  payout: { fontSize: 12, fontWeight: "900" },
  jobAction: { minHeight: 38, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", minWidth: 110 },
  jobActionText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  pendingText: { fontSize: 9, fontWeight: "800", flexShrink: 1, textAlign: "right" },
  profileButton: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  profileButtonText: { flex: 1, fontSize: 11, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});