import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  acceptRunnerJob,
  clearRunnerSession,
  getRunnerJobs,
  getRunnerMe,
  type RunnerJob,
} from "@/api";

const COLORS = {
  navy: "#000535",
  panel: "#06132C",
  raised: "#0A1C3A",
  border: "#294A78",
  blue: "#3485F5",
  blueSoft: "#16345B",
  text: "#F6F8FC",
  muted: "#AAB9CF",
  quiet: "#71839F",
  gold: "#E9B64E",
  red: "#E2767D",
  white: "#FFFFFF",
};

type Section = "offers" | "rating" | "acceptance" | "menu" | "help";

const TITLES: Record<Section, string> = {
  offers: "Offers & Rewards",
  rating: "Your rating",
  acceptance: "Acceptance rate",
  menu: "Runner menu",
  help: "Help & support",
};

function formatMoney(amount: number | null, currency: string) {
  if (amount === null || !Number.isFinite(amount)) return "Payout unavailable";
  return `${currency} ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function RunnerDashboardSectionScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const insets = useSafeAreaInsets();
  const rawSection = String(params.section ?? "offers");
  const section: Section = (["offers", "rating", "acceptance", "menu", "help"] as string[])
    .includes(rawSection)
    ? (rawSection as Section)
    : "offers";

  const [offers, setOffers] = useState<RunnerJob[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(section === "offers");
  const [refreshing, setRefreshing] = useState(false);
  const [busyJobId, setBusyJobId] = useState("");
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const pageTitle = TITLES[section];

  const loadOffers = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [me, jobs] = await Promise.all([getRunnerMe(), getRunnerJobs()]);
      setIsOnline(me.runner.availability.isOnline);
      setOffers(Array.isArray(jobs.offers) ? jobs.offers : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Offers could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (section === "offers") void loadOffers();
  }, [section, loadOffers]);

  const handleAccept = useCallback(async (job: RunnerJob) => {
    if (!isOnline) {
      Alert.alert("You're offline", "Go online from your dashboard before accepting an errand.");
      return;
    }
    if (busyJobId) return;

    setBusyJobId(job.id);
    setError("");
    try {
      await acceptRunnerJob(job.id);
      Alert.alert("Errand accepted", `${job.publicCode} has been added to your active errands.`, [
        { text: "Continue", onPress: () => router.back() },
      ]);
      await loadOffers(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This errand could not be accepted.");
    } finally {
      setBusyJobId("");
    }
  }, [busyJobId, isOnline, loadOffers]);

  const handleSignOut = useCallback(() => {
    if (signingOut) return;
    Alert.alert("Sign out", "Are you sure you want to sign out of SaMi Runner?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            await clearRunnerSession();
          } finally {
            router.dismissAll();
            router.replace({ pathname: "/", params: { signedOut: "1" } });
          }
        },
      },
    ]);
  }, [signingOut]);

  const emptyCopy = useMemo(() => {
    if (section === "rating") {
      return "Customer rating data is not currently exposed by the Runner API. This page is ready for the rating history when that service is connected.";
    }
    if (section === "acceptance") {
      return "Offer acceptance statistics are not currently exposed by the Runner API. This page is ready for the live acceptance rate and its history when that service is connected.";
    }
    if (section === "help") {
      return "Support details have not yet been connected to the Runner app. This space is reserved for SaMi support channels and help topics.";
    }
    return "Choose an option below.";
  }, [section]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back to dashboard"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={21} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{pageTitle}</Text>
        {section === "offers" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh offers"
            disabled={refreshing}
            onPress={() => void loadOffers(true)}
            style={styles.backButton}
          >
            {refreshing ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <Ionicons name="refresh" size={19} color={COLORS.text} />
            )}
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {section === "offers" ? (
          <>
            <View style={styles.introCard}>
              <View style={styles.introIcon}>
                <Ionicons name="gift-outline" size={25} color={COLORS.text} />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.introTitle}>SaMi offers and opportunities</Text>
                <Text style={styles.introCopy}>
                  View eligible errand offers. New promotions and rewards will appear here when available.
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Available errands</Text>
              <Text style={styles.sectionCount}>{offers.length}</Text>
            </View>

            {loading ? (
              <View style={styles.loadingCard}>
                <ActivityIndicator color={COLORS.blue} size="large" />
                <Text style={styles.mutedCopy}>Loading eligible errands…</Text>
              </View>
            ) : offers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="briefcase-outline" size={28} color={COLORS.muted} />
                <Text style={styles.cardTitle}>No available errands</Text>
                <Text style={styles.mutedCopy}>
                  {isOnline
                    ? "There are no eligible errand offers for your account right now."
                    : "Go online from your dashboard to become available for eligible errands."}
                </Text>
              </View>
            ) : (
              offers.map((job) => (
                <View key={job.id} style={styles.jobCard}>
                  <View style={styles.jobHeader}>
                    <View style={styles.flexOne}>
                      <Text style={styles.jobCode}>{job.publicCode}</Text>
                      <Text style={styles.jobTitle}>{job.title}</Text>
                    </View>
                    <Text style={styles.payout}>
                      {formatMoney(job.runnerPayoutAmount, job.currency)}
                    </Text>
                  </View>
                  <Text style={styles.jobDescription} numberOfLines={3}>
                    {job.description}
                  </Text>
                  <View style={styles.routeBlock}>
                    <View style={styles.routeLine}>
                      <Ionicons name="radio-button-on" size={15} color={COLORS.blue} />
                      <View style={styles.flexOne}>
                        <Text style={styles.routeLabel}>PICKUP</Text>
                        <Text style={styles.routeValue}>{job.pickupLabel}</Text>
                      </View>
                    </View>
                    <View style={styles.routeLine}>
                      <Ionicons name="location" size={15} color={COLORS.blue} />
                      <View style={styles.flexOne}>
                        <Text style={styles.routeLabel}>DELIVERY</Text>
                        <Text style={styles.routeValue}>{job.destinationLabel}</Text>
                      </View>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(busyJobId)}
                    onPress={() => void handleAccept(job)}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { opacity: busyJobId ? 0.55 : pressed ? 0.82 : 1 },
                    ]}
                  >
                    {busyJobId === job.id ? (
                      <ActivityIndicator color={COLORS.white} size="small" />
                    ) : (
                      <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.white} />
                    )}
                    <Text style={styles.primaryButtonText}>Accept errand</Text>
                  </Pressable>
                </View>
              ))
            )}
          </>
        ) : section === "menu" ? (
          <>
            <View style={styles.introCard}>
              <View style={styles.introIcon}>
                <Ionicons name="grid-outline" size={24} color={COLORS.text} />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.introTitle}>Your Runner account</Text>
                <Text style={styles.introCopy}>Account and app actions.</Text>
              </View>
            </View>
            <Pressable
              style={styles.menuRow}
              onPress={() => router.push("/(app)/profile-setup" as never)}
            >
              <Ionicons name="person-circle-outline" size={22} color={COLORS.blue} />
              <Text style={styles.menuRowText}>Runner profile</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </Pressable>
            <Pressable style={styles.menuRow} onPress={() => router.push({ pathname: "/(app)/runner-section" as never, params: { section: "help" } } as never)}>
              <Ionicons name="headset-outline" size={22} color={COLORS.blue} />
              <Text style={styles.menuRowText}>Help & support</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </Pressable>
            <Pressable style={[styles.menuRow, styles.signOutRow]} onPress={handleSignOut} disabled={signingOut}>
              {signingOut ? (
                <ActivityIndicator color={COLORS.red} size="small" />
              ) : (
                <Ionicons name="log-out-outline" size={22} color={COLORS.red} />
              )}
              <Text style={[styles.menuRowText, { color: COLORS.red }]}>Sign out</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.red} />
            </Pressable>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons
              name={section === "rating" ? "star-outline" : section === "acceptance" ? "trending-up-outline" : "headset-outline"}
              size={30}
              color={COLORS.blue}
            />
            <Text style={styles.cardTitle}>{pageTitle}</Text>
            <Text style={styles.mutedCopy}>{emptyCopy}</Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color={COLORS.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.navy },
  header: {
    minHeight: 58,
    paddingHorizontal: 15,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#18345C",
    backgroundColor: COLORS.navy,
  },
  backButton: {
    width: 39,
    height: 39,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, color: COLORS.text, fontSize: 18, fontWeight: "900" },
  headerSpacer: { width: 39 },
  content: { paddingHorizontal: 16, paddingTop: 17, gap: 13 },
  introCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.panel,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  introIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: COLORS.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  flexOne: { flex: 1 },
  introTitle: { color: COLORS.text, fontSize: 14, fontWeight: "900" },
  introCopy: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 5 },
  sectionHeading: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  sectionCount: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  loadingCard: { minHeight: 130, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, backgroundColor: COLORS.panel, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyCard: { minHeight: 190, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, backgroundColor: COLORS.panel, alignItems: "center", justifyContent: "center", padding: 20, gap: 9 },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: "900", textAlign: "center" },
  mutedCopy: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  jobCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, backgroundColor: COLORS.panel, padding: 14, gap: 11 },
  jobHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  jobCode: { color: COLORS.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  jobTitle: { color: COLORS.text, fontSize: 15, fontWeight: "900", marginTop: 3 },
  payout: { color: COLORS.text, fontSize: 11, fontWeight: "900", textAlign: "right" },
  jobDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  routeBlock: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, backgroundColor: "#071832", padding: 10, gap: 9 },
  routeLine: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  routeLabel: { color: COLORS.quiet, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  routeValue: { color: COLORS.text, fontSize: 11, fontWeight: "700", marginTop: 2 },
  primaryButton: { minHeight: 46, borderRadius: 13, backgroundColor: COLORS.blue, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryButtonText: { color: COLORS.white, fontSize: 12, fontWeight: "900" },
  menuRow: { minHeight: 57, borderWidth: 1, borderColor: COLORS.border, borderRadius: 15, backgroundColor: COLORS.panel, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  menuRowText: { color: COLORS.text, fontSize: 13, fontWeight: "800", flex: 1 },
  signOutRow: { borderColor: "#754253", marginTop: 12 },
  errorCard: { borderWidth: 1, borderColor: "#754253", borderRadius: 13, backgroundColor: "#321A22", padding: 11, flexDirection: "row", gap: 8, alignItems: "center" },
  errorText: { color: COLORS.red, fontSize: 11, flex: 1 },
});
