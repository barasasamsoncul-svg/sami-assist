import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import {
  clearRunnerSession,
  getRunnerOnboarding,
} from "@/api";
import type { RunnerOnboardingData } from "@/api";
import { useRunnerTheme } from "@/theme";

type ThemeColors = ReturnType<typeof useRunnerTheme>["colors"];

function getResumeRoute(data: RunnerOnboardingData) {
  const runner = data.runner;

  if (!runner.selectedCategories?.length) {
    return "/(auth)/tasks" as const;
  }

  const vehicleType = runner.vehicleType ?? "";
  const serviceArea = runner.serviceArea?.trim() ?? "";

  const requiresRegistration = [
    "motorcycle",
    "car",
    "van",
  ].includes(vehicleType);

  const transportComplete =
    serviceArea.length >= 2 &&
    Boolean(vehicleType) &&
    (!requiresRegistration ||
      Boolean(runner.vehicleRegistration?.trim()));

  if (!transportComplete) {
    return "/(auth)/transport" as const;
  }

  const requiredDocuments = data.requirements.filter(
    (item) => item.required,
  );

  if (requiredDocuments.length === 0) {
    return "/(auth)/documents" as const;
  }

  const missingDocument = requiredDocuments.some((requirement) => {
    const document = data.documents.find(
      (item) => item.requirementKey === requirement.key,
    );

    return (
      document?.reviewStatus !== "pending" &&
      document?.reviewStatus !== "approved"
    );
  });

  if (missingDocument) {
    return "/(auth)/documents" as const;
  }

  return "/(auth)/review" as const;
}

function StatusInfoRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
        {label}
      </Text>

      <Text style={[styles.infoValue, { color: colors.text }]}>
        {value}
      </Text>
    </View>
  );
}

export default function RunnerApplicationStatusScreen() {
  const router = useRouter();
  const { colors } = useRunnerTheme();

  const [data, setData] = useState<RunnerOnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadStatus = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const result = await getRunnerOnboarding();
      const runner = result.runner;

      if (
        runner.accountStatus === "active" &&
        runner.verificationStatus === "approved"
      ) {
        router.replace("/(app)");
        return;
      }

      if (
        runner.accountStatus === "suspended" ||
        runner.accountStatus === "closed"
      ) {
        setData(result);
        return;
      }

      if (
        result.onboardingStatus !== "pending_review" &&
        runner.verificationStatus !== "submitted"
      ) {
        router.replace(getResumeRoute(result));
        return;
      }

      setData(result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your application status could not be loaded.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
    }, [loadStatus]),
  );

  async function signOut() {
    if (signingOut || refreshing) {
      return;
    }

    setSigningOut(true);
    setError(null);

    try {
      // Remove the saved authentication session.
      await clearRunnerSession();

      // Remove the signed-in application history and open
      // Welcome in explicit signed-out mode.
      router.dismissAll();

      router.replace({
        pathname: "/",
        params: {
          signedOut: "1",
        },
      });
    } catch {
      setError("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  const restricted =
    data?.runner.accountStatus === "suspended" ||
    data?.runner.accountStatus === "closed";

  const submittedDocuments =
    data?.documents.filter(
      (item) =>
        item.reviewStatus === "pending" ||
        item.reviewStatus === "approved",
    ).length ?? 0;

  if (loading && !data) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.paper }]}
        edges={["top", "bottom"]}
      >
        <StatusBar
          backgroundColor={colors.paper}
          barStyle={
            colors.paper === "#080F1D"
              ? "light-content"
              : "dark-content"
          }
        />

        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.blue} />

          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Checking your application status…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.paper }]}
        edges={["top", "bottom"]}
      >
        <StatusBar
          backgroundColor={colors.paper}
          barStyle={
            colors.paper === "#080F1D"
              ? "light-content"
              : "dark-content"
          }
        />

        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.text }]}>
            Status unavailable
          </Text>

          <Text style={[styles.bodyText, { color: colors.textMuted }]}>
            {error || "Your application status could not be loaded."}
          </Text>

          <Pressable
            onPress={() => void loadStatus(true)}
            disabled={refreshing || signingOut}
            style={[
              styles.primaryButton,
              { backgroundColor: colors.blue },
            ]}
          >
            {refreshing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                Try again
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => void signOut()}
            disabled={signingOut || refreshing}
            style={styles.signOutButton}
          >
            {signingOut ? (
              <ActivityIndicator color={colors.blue} />
            ) : (
              <Text style={[styles.signOutText, { color: colors.blue }]}>
                Sign out
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
      edges={["top", "bottom"]}
    >
      <StatusBar
        backgroundColor={colors.paper}
        barStyle={
          colors.paper === "#080F1D"
            ? "light-content"
            : "dark-content"
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <Text style={[styles.brandName, { color: colors.navy }]}>
            SaMi <Text style={{ color: colors.blue }}>Runner</Text>
          </Text>

          <Text style={[styles.brandTagline, { color: colors.textMuted }]}>
            CONSIDER IT DONE
          </Text>
        </View>

        <View
          style={[
            styles.statusIcon,
            {
              backgroundColor: restricted
                ? colors.dangerSoft
                : colors.warningSoft,
            },
          ]}
        >
          <Text
            style={[
              styles.statusIconText,
              { color: restricted ? colors.red : colors.warning },
            ]}
          >
            {restricted ? "!" : "…"}
          </Text>
        </View>

        <Text style={[styles.eyebrow, { color: colors.blue }]}>
          RUNNER APPLICATION
        </Text>

        <Text style={[styles.title, { color: colors.text }]}>
          {restricted
            ? "Account restricted"
            : "Application under review"}
        </Text>

        <Text style={[styles.bodyText, { color: colors.textMuted }]}>
          {restricted
            ? "Your Runner account is currently not available. Contact SaMi Operations for assistance."
            : "Your application has been submitted successfully. SaMi Operations is reviewing your details and documents."}
        </Text>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: restricted
                ? colors.dangerSoft
                : colors.warningSoft,
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: restricted
                  ? colors.red
                  : colors.warning,
              },
            ]}
          />

          <Text
            style={[
              styles.statusBadgeText,
              { color: restricted ? colors.red : colors.warning },
            ]}
          >
            {restricted
              ? data.runner.accountStatus === "suspended"
                ? "SUSPENDED"
                : "CLOSED"
              : "PENDING OPERATIONS REVIEW"}
          </Text>
        </View>

        <View
          style={[
            styles.detailsCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Application details
          </Text>

          <StatusInfoRow
            label="Full name"
            value={data.runner.fullName || "Not available"}
            colors={colors}
          />

          <StatusInfoRow
            label="Email"
            value={data.runner.email || "Not available"}
            colors={colors}
          />

          <StatusInfoRow
            label="Service area"
            value={data.runner.serviceArea || "Not provided"}
            colors={colors}
          />

          <StatusInfoRow
            label="Documents submitted"
            value={String(submittedDocuments)}
            colors={colors}
          />

          <StatusInfoRow
            label="Tasks selected"
            value={String(data.runner.selectedCategories.length)}
            colors={colors}
          />
        </View>

        {!restricted ? (
          <View
            style={[
              styles.noticeCard,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <Text style={[styles.noticeTitle, { color: colors.text }]}>
              What happens next?
            </Text>

            <Text style={[styles.noticeText, { color: colors.textMuted }]}>
              Operations will review your application. Once approved, you
              will be able to access the Runner workspace and receive
              eligible errands.
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={[
              styles.errorCard,
              { backgroundColor: colors.dangerSoft },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.red }]}>
              {error}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void loadStatus(true)}
          disabled={refreshing || signingOut}
          style={[
            styles.primaryButton,
            { backgroundColor: colors.blue },
            (refreshing || signingOut) && styles.disabled,
          ]}
        >
          {refreshing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              Refresh application status
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => void signOut()}
          disabled={signingOut || refreshing}
          style={styles.signOutButton}
        >
          {signingOut ? (
            <ActivityIndicator color={colors.blue} />
          ) : (
            <Text style={[styles.signOutText, { color: colors.blue }]}>
              Sign out
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 23,
    paddingTop: 28,
    paddingBottom: 36,
    alignItems: "stretch",
    gap: 17,
  },
  brand: {
    alignItems: "center",
    gap: 4,
    marginBottom: 18,
  },
  brandName: {
    fontSize: 25,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.8,
  },
  brandTagline: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2.5,
  },
  statusIcon: {
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  statusIconText: {
    fontSize: 37,
    fontWeight: "900",
  },
  eyebrow: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 5,
  },
  title: {
    fontSize: 27,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
  },
  statusBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  detailsCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 15,
    marginTop: 5,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  infoLabel: {
    flex: 1,
    fontSize: 11,
  },
  infoValue: {
    flex: 1.5,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
  },
  noticeCard: {
    borderRadius: 14,
    padding: 15,
    gap: 7,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 19,
  },
  errorCard: {
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 5,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  signOutButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: {
    fontSize: 12,
    fontWeight: "800",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 15,
  },
  loadingText: {
    fontSize: 13,
  },
  disabled: {
    opacity: 0.6,
  },
});