import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
  type RunnerThemeColors,
  type RunnerThemeMode,
} from "@/theme";

import {
  acceptRunnerJob,
  clearRunnerSession,
  getRunnerJobs,
  getRunnerMe,
  type RunnerJob,
} from "@/api";

type Section =
  | "offers"
  | "rating"
  | "acceptance"
  | "menu"
  | "help"
  | "performance"
  | "earnings"
  | "settings"
  | "privacy";

function isRunnerSessionError(message: string): boolean {
  return /\b401\b|session has expired|sign in to continue/i.test(message);
}

function returnToRunnerSignIn(): void {
  router.dismissAll();
  router.replace({ pathname: "/", params: { signedOut: "1" } });
}

const TITLES: Record<Section, string> = {
  offers: "Offers & Rewards",
  rating: "Your rating",
  acceptance: "Acceptance rate",
  performance: "Performance",
  earnings: "Earnings",
  settings: "Settings",
  privacy: "Privacy",
  menu: "Runner menu",
  help: "Help & support",
};

function formatMoney(amount: number | null, currency: string): string {
  if (amount === null || !Number.isFinite(amount)) {
    return "Payout unavailable";
  }

  return `${currency} ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function RunnerDashboardSectionScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const insets = useSafeAreaInsets();

  const {
    colors,
    mode,
    setMode,
    showOverlay,
  } = useRunnerTheme();

  const rawSection = String(params.section ?? "offers");

  const section: Section = (
    [
      "offers",
      "rating",
      "acceptance",
      "menu",
      "help",
      "performance",
      "earnings",
      "settings",
      "privacy",
    ] as string[]
  ).includes(rawSection)
    ? (rawSection as Section)
    : "offers";

  const [offers, setOffers] = useState<RunnerJob[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(section === "offers");
  const [refreshing, setRefreshing] = useState(false);
  const [busyJobId, setBusyJobId] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const pageTitle = TITLES[section];

  const loadOffers = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [me, jobs] = await Promise.all([
          getRunnerMe(),
          getRunnerJobs(),
        ]);

        setIsOnline(me.runner.availability.isOnline);
        setOffers(Array.isArray(jobs.offers) ? jobs.offers : []);
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "Offers could not be loaded.";

        if (isRunnerSessionError(message)) {
          returnToRunnerSignIn();
          return;
        }

        showOverlay({
          type: "error",
          title: "Offers unavailable",
          message,
          primaryAction: {
            label: "Try again",
            onClick: () => {
              void loadOffers(true);
            },
          },
          secondaryAction: {
            label: "Close",
          },
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showOverlay],
  );

  useEffect(() => {
    if (section === "offers") {
      void loadOffers();
    }
  }, [section, loadOffers]);

  const handleAccept = useCallback(
    async (job: RunnerJob) => {
      if (!isOnline) {
        showOverlay({
          type: "warning",
          title: "You're offline",
          message:
            "Go online from your dashboard before accepting an errand.",
          primaryAction: {
            label: "Understood",
          },
        });
        return;
      }

      if (busyJobId) {
        return;
      }

      setBusyJobId(job.id);

      try {
        await acceptRunnerJob(job.id);

        showOverlay({
          type: "success",
          title: "Errand accepted",
          message: `${job.publicCode} has been added to your active errands.`,
          primaryAction: {
            label: "Continue",
            onClick: () => router.back(),
          },
        });

        void loadOffers(true);
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "This errand could not be accepted.";

        if (isRunnerSessionError(message)) {
          returnToRunnerSignIn();
          return;
        }

        showOverlay({
          type: "error",
          title: "Could not accept errand",
          message,
          primaryAction: {
            label: "Close",
          },
        });
      } finally {
        setBusyJobId("");
      }
    },
    [busyJobId, isOnline, loadOffers, showOverlay],
  );

  const handleSignOut = useCallback(() => {
    if (signingOut) {
      return;
    }

    showOverlay({
      type: "confirmation",
      title: "Sign out?",
      message: "Are you sure you want to sign out of SaMi Runner?",
      primaryAction: {
        label: "Sign out",
        tone: "danger",
        onClick: () => {
          setSigningOut(true);

          void clearRunnerSession()
            .catch(() => undefined)
            .finally(() => {
              setSigningOut(false);
              router.dismissAll();
              router.replace({
                pathname: "/",
                params: { signedOut: "1" },
              });
            });
        },
      },
      secondaryAction: {
        label: "Cancel",
      },
    });
  }, [showOverlay, signingOut]);

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
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + runnerSpacing.xs,
            backgroundColor: colors.surface,
            borderBottomColor: colors.divider,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back to dashboard"
          onPress={() => router.back()}
          style={[
            styles.headerButton,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
            },
          ]}
        >
          <Ionicons name="arrow-back" size={21} color={colors.icon} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {pageTitle}
        </Text>

        {section === "offers" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh offers"
            disabled={refreshing}
            onPress={() => void loadOffers(true)}
            style={[
              styles.headerButton,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                opacity: refreshing ? 0.6 : 1,
              },
            ]}
          >
            {refreshing ? (
              <ActivityIndicator color={colors.icon} size="small" />
            ) : (
              <Ionicons name="refresh" size={19} color={colors.icon} />
            )}
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + runnerSpacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {section === "offers" ? (
          <>
            <View
              style={[
                styles.introCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.introIcon,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="gift-outline"
                  size={25}
                  color={colors.blue}
                />
              </View>

              <View style={styles.flexOne}>
                <Text style={[styles.introTitle, { color: colors.text }]}>
                  SaMi offers and opportunities
                </Text>

                <Text
                  style={[
                    styles.introCopy,
                    { color: colors.textMuted },
                  ]}
                >
                  View eligible errand offers. New promotions and rewards
                  will appear here when available.
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.text }]}>
                Available errands
              </Text>

              <Text
                style={[
                  styles.sectionCount,
                  { color: colors.textMuted },
                ]}
              >
                {offers.length}
              </Text>
            </View>

            {loading ? (
              <View
                style={[
                  styles.loadingCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <ActivityIndicator color={colors.blue} size="large" />
                <Text style={[styles.bodyText, { color: colors.textMuted }]}>
                  Loading eligible errands…
                </Text>
              </View>
            ) : offers.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="briefcase-outline"
                  size={30}
                  color={colors.iconMuted}
                />

                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  No available errands
                </Text>

                <Text
                  style={[
                    styles.bodyText,
                    { color: colors.textMuted, textAlign: "center" },
                  ]}
                >
                  {isOnline
                    ? "There are no eligible errand offers for your account right now."
                    : "Go online from your dashboard to become available for eligible errands."}
                </Text>
              </View>
            ) : (
              offers.map((job) => (
                <View
                  key={job.id}
                  style={[
                    styles.jobCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.jobHeader}>
                    <View style={styles.flexOne}>
                      <Text
                        style={[
                          styles.jobCode,
                          { color: colors.textSubtle },
                        ]}
                      >
                        {job.publicCode}
                      </Text>

                      <Text
                        style={[styles.jobTitle, { color: colors.text }]}
                      >
                        {job.title}
                      </Text>
                    </View>

                    <Text
                      style={[styles.payout, { color: colors.success }]}
                    >
                      {formatMoney(
                        job.runnerPayoutAmount,
                        job.currency,
                      )}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.jobDescription,
                      { color: colors.textMuted },
                    ]}
                    numberOfLines={3}
                  >
                    {job.description}
                  </Text>

                  <View
                    style={[
                      styles.routeBlock,
                      {
                        backgroundColor: colors.surfaceSunken,
                        borderColor: colors.divider,
                      },
                    ]}
                  >
                    <View style={styles.routeLine}>
                      <Ionicons
                        name="radio-button-on"
                        size={17}
                        color={colors.blue}
                      />

                      <View style={styles.flexOne}>
                        <Text
                          style={[
                            styles.routeLabel,
                            { color: colors.textSubtle },
                          ]}
                        >
                          PICKUP
                        </Text>

                        <Text
                          style={[
                            styles.routeValue,
                            { color: colors.text },
                          ]}
                        >
                          {job.pickupLabel}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.routeSeparator,
                        { backgroundColor: colors.divider },
                      ]}
                    />

                    <View style={styles.routeLine}>
                      <Ionicons
                        name="location"
                        size={17}
                        color={colors.blue}
                      />

                      <View style={styles.flexOne}>
                        <Text
                          style={[
                            styles.routeLabel,
                            { color: colors.textSubtle },
                          ]}
                        >
                          DELIVERY
                        </Text>

                        <Text
                          style={[
                            styles.routeValue,
                            { color: colors.text },
                          ]}
                        >
                          {job.destinationLabel}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(busyJobId)}
                    onPress={() => void handleAccept(job)}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      {
                        backgroundColor: colors.blueAction,
                        opacity: busyJobId
                          ? 0.55
                          : pressed
                            ? 0.82
                            : 1,
                      },
                    ]}
                  >
                    {busyJobId === job.id ? (
                      <ActivityIndicator
                        color={colors.onBlue}
                        size="small"
                      />
                    ) : (
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={20}
                        color={colors.onBlue}
                      />
                    )}

                    <Text
                      style={[
                        styles.primaryButtonText,
                        { color: colors.onBlue },
                      ]}
                    >
                      Accept errand
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </>
        ) : section === "performance" ? (
          <PerformanceOverview colors={colors} />
        ) : section === "earnings" ? (
          <EarningsOverview colors={colors} />
        ) : section === "settings" ? (
          <SettingsOverview
            colors={colors}
            mode={mode}
            setMode={setMode}
          />
        ) : section === "privacy" ? (
          <PrivacyOverview colors={colors} />
        ) : section === "menu" ? (
          <>
            <View
              style={[
                styles.introCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.introIcon,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="grid-outline"
                  size={24}
                  color={colors.blue}
                />
              </View>

              <View style={styles.flexOne}>
                <Text style={[styles.introTitle, { color: colors.text }]}>
                  Your Runner account
                </Text>

                <Text
                  style={[
                    styles.introCopy,
                    { color: colors.textMuted },
                  ]}
                >
                  Account and app actions.
                </Text>
              </View>
            </View>

            <MenuRow
              colors={colors}
              icon="person-circle-outline"
              label="Runner profile"
              onPress={() => router.push("/(app)/profile-setup" as never)}
            />

            <MenuRow
              colors={colors}
              icon="headset-outline"
              label="Help & support"
              onPress={() =>
                router.push({
                  pathname: "/(app)/runner-section" as never,
                  params: { section: "help" },
                } as never)
              }
            />

            <MenuRow
              colors={colors}
              icon="settings-outline"
              label="Settings"
              onPress={() =>
                router.push({
                  pathname: "/(app)/runner-section" as never,
                  params: { section: "settings" },
                } as never)
              }
            />

            <MenuRow
              colors={colors}
              icon="shield-checkmark-outline"
              label="Privacy"
              onPress={() =>
                router.push({
                  pathname: "/(app)/runner-section" as never,
                  params: { section: "privacy" },
                } as never)
              }
            />

            <MenuRow
              colors={colors}
              icon="log-out-outline"
              label={signingOut ? "Signing out…" : "Sign out"}
              danger
              disabled={signingOut}
              onPress={handleSignOut}
            />
          </>
        ) : (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name={
                section === "rating"
                  ? "star-outline"
                  : section === "acceptance"
                    ? "trending-up-outline"
                    : "headset-outline"
              }
              size={32}
              color={colors.blue}
            />

            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {pageTitle}
            </Text>

            <Text
              style={[
                styles.bodyText,
                { color: colors.textMuted, textAlign: "center" },
              ]}
            >
              {emptyCopy}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MenuRow({
  colors,
  icon,
  label,
  onPress,
  danger = false,
  disabled = false,
}: {
  colors: RunnerThemeColors;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const iconColor = danger ? colors.red : colors.blue;
  const textColor = danger ? colors.red : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        {
          borderBottomColor: colors.divider,
          opacity: disabled ? 0.55 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={23} color={iconColor} />

      <Text style={[styles.menuRowText, { color: textColor }]}>
        {label}
      </Text>

      <Ionicons
        name="chevron-forward"
        size={19}
        color={danger ? colors.red : colors.iconMuted}
      />
    </Pressable>
  );
}

function PerformanceOverview({
  colors,
}: {
  colors: RunnerThemeColors;
}) {
  const metrics = [
    {
      icon: "star-outline" as const,
      label: "Customer rating",
      value: "— / 5",
      color: colors.amber,
    },
    {
      icon: "trending-up-outline" as const,
      label: "Acceptance rate",
      value: "—%",
      color: colors.blue,
    },
    {
      icon: "close-circle-outline" as const,
      label: "Cancellation rate",
      value: "—%",
      color: colors.red,
    },
  ];

  return (
    <View style={styles.overviewStack}>
      <View
        style={[
          styles.overviewCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.overviewHeadingRow}>
          <View
            style={[
              styles.overviewIcon,
              { backgroundColor: colors.warningSoft },
            ]}
          >
            <Ionicons
              name="trophy-outline"
              size={24}
              color={colors.warning}
            />
          </View>

          <View style={styles.flexOne}>
            <Text
              style={[
                styles.eyebrow,
                { color: colors.textMuted },
              ]}
            >
              SAMI PERFORMANCE TIERS
            </Text>

            <Text style={[styles.overviewTitle, { color: colors.text }]}>
              Silver tier
            </Text>
          </View>
        </View>

        <View style={styles.pointsRow}>
          <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
            Points progress
          </Text>

          <Text style={[styles.pointsValue, { color: colors.text }]}>
            200 / 1,000 PTS
          </Text>
        </View>

        <View
          style={[
            styles.progressTrack,
            { backgroundColor: colors.surfaceSunken },
          ]}
        >
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.amber },
            ]}
          />
        </View>

        <View style={styles.pointsRow}>
          <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
            800 points to Gold
          </Text>

          <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
            20% complete
          </Text>
        </View>

        <View
          style={[
            styles.tierLabels,
            { borderTopColor: colors.divider },
          ]}
        >
          {(["Silver", "Gold", "Platinum", "Diamond"] as const).map(
            (tier) => (
              <Text
                key={tier}
                style={[
                  styles.tierLabel,
                  { color: colors.textMuted },
                ]}
              >
                {tier}
              </Text>
            ),
          )}
        </View>

        <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
          This tier layout is ready for live points and progression from the
          SaMi performance service.
        </Text>
      </View>

      <View style={styles.subsection}>
        <Text style={[styles.subsectionTitle, { color: colors.text }]}>
          Performance overview
        </Text>

        <View
          style={[
            styles.metricList,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {metrics.map((metric, index) => (
            <View key={metric.label}>
              {index > 0 ? (
                <View
                  style={[
                    styles.separator,
                    { backgroundColor: colors.divider },
                  ]}
                />
              ) : null}

              <View style={styles.metricRow}>
                <Ionicons
                  name={metric.icon}
                  size={22}
                  color={metric.color}
                />

                <Text
                  style={[
                    styles.metricLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  {metric.label}
                </Text>

                <Text
                  style={[
                    styles.metricValue,
                    { color: colors.text },
                  ]}
                >
                  {metric.value}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <InformationRow
        colors={colors}
        icon="information-circle-outline"
        message="Live customer ratings, acceptance rate, cancellations and tier points are not currently returned by the Runner API. These values are intentionally shown as unavailable rather than estimated."
      />
    </View>
  );
}

function EarningsOverview({
  colors,
}: {
  colors: RunnerThemeColors;
}) {
  return (
    <View style={styles.overviewStack}>
      <View
        style={[
          styles.overviewCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.overviewIcon,
            { backgroundColor: colors.blueSoft },
          ]}
        >
          <Ionicons
            name="wallet-outline"
            size={24}
            color={colors.blue}
          />
        </View>

        <Text
          style={[
            styles.eyebrow,
            { color: colors.textMuted },
          ]}
        >
          EARNINGS OVERVIEW
        </Text>

        <Text style={[styles.earningsValue, { color: colors.text }]}>
          —
        </Text>

        <Text style={[styles.bodyText, { color: colors.textMuted }]}>
          Your earnings total and payout history will appear here when the
          Runner earnings service is connected.
        </Text>
      </View>

      <InformationRow
        colors={colors}
        icon="information-circle-outline"
        message="No earnings amount or payout history is currently provided by the Runner API. No estimated totals are displayed."
      />
    </View>
  );
}

function SettingsOverview({
  colors,
  mode,
  setMode,
}: {
  colors: RunnerThemeColors;
  mode: RunnerThemeMode;
  setMode: (mode: RunnerThemeMode) => Promise<void>;
}) {
  return (
    <View style={styles.overviewStack}>
      <View
        style={[
          styles.overviewCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.subsectionTitle, { color: colors.text }]}>
          Appearance
        </Text>

        <Text style={[styles.bodyText, { color: colors.textMuted }]}>
          Choose how SaMi Runner looks. Your preference is saved on this
          device.
        </Text>

        <View style={styles.appearanceOptions}>
          {(["light", "dark"] as const).map((choice) => {
            const selected = mode === choice;

            return (
              <Pressable
                key={choice}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => void setMode(choice)}
                style={({ pressed }) => [
                  styles.appearanceOption,
                  {
                    backgroundColor: selected
                      ? colors.blueSoft
                      : colors.surfaceRaised,
                    borderColor: selected
                      ? colors.blue
                      : colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={
                    choice === "light"
                      ? "sunny-outline"
                      : "moon-outline"
                  }
                  size={19}
                  color={selected ? colors.blue : colors.iconMuted}
                />

                <Text
                  style={[
                    styles.appearanceLabel,
                    {
                      color: selected ? colors.blue : colors.text,
                    },
                  ]}
                >
                  {choice === "light" ? "Light" : "Dark"}
                </Text>

                {selected ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={colors.blue}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={() => router.push("/(app)/profile-setup" as never)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.profileLink,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <Ionicons
          name="person-circle-outline"
          size={23}
          color={colors.blue}
        />

        <View style={styles.flexOne}>
          <Text style={[styles.profileLinkTitle, { color: colors.text }]}>
            Runner profile
          </Text>

          <Text
            style={[
              styles.secondaryText,
              { color: colors.textMuted },
            ]}
          >
            Personal details and documents
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={19}
          color={colors.iconMuted}
        />
      </Pressable>
    </View>
  );
}

function PrivacyOverview({
  colors,
}: {
  colors: RunnerThemeColors;
}) {
  return (
    <View style={styles.overviewStack}>
      <View
        style={[
          styles.overviewCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.overviewIcon,
            { backgroundColor: colors.blueSoft },
          ]}
        >
          <Ionicons
            name="location-outline"
            size={24}
            color={colors.blue}
          />
        </View>

        <Text style={[styles.overviewTitle, { color: colors.text }]}>
          Location sharing
        </Text>

        <Text style={[styles.bodyText, { color: colors.textMuted }]}>
          SaMi Runner uses your location while you are online or completing
          an accepted errand. This supports dispatch and live errand progress
          for customers.
        </Text>

        <View
          style={[
            styles.separator,
            { backgroundColor: colors.divider },
          ]}
        />

        <View style={styles.privacyStatus}>
          <Ionicons
            name="checkmark-circle-outline"
            size={19}
            color={colors.success}
          />

          <Text
            style={[
              styles.privacyStatusText,
              { color: colors.success },
            ]}
          >
            Tracking stops when you go offline or finish your errand.
          </Text>
        </View>
      </View>

      <InformationRow
        colors={colors}
        icon="shield-checkmark-outline"
        message="You can review and change location permissions in your Android app settings. SaMi Runner's availability controls determine when work-related location tracking is active."
        positive
      />
    </View>
  );
}

function InformationRow({
  colors,
  icon,
  message,
  positive = false,
}: {
  colors: RunnerThemeColors;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  message: string;
  positive?: boolean;
}) {
  return (
    <View
      style={[
        styles.informationRow,
        {
          borderBottomColor: colors.divider,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={21}
        color={positive ? colors.success : colors.blue}
      />

      <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  header: {
    minHeight: 60,
    paddingHorizontal: runnerSpacing.md,
    paddingBottom: runnerSpacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  headerButton: {
    width: runnerTouchTargets.minimum,
    height: runnerTouchTargets.minimum,
    borderRadius: runnerRadii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    flex: 1,
    fontSize: runnerTypography.subtitle,
    fontWeight: "800",
  },

  headerSpacer: {
    width: runnerTouchTargets.minimum,
  },

  content: {
    paddingHorizontal: runnerSpacing.md,
    paddingTop: runnerSpacing.lg,
    gap: runnerSpacing.lg,
  },

  introCard: {
    borderWidth: 1,
    borderRadius: runnerRadii.lg,
    padding: runnerSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
  },

  introIcon: {
    width: 50,
    height: 50,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
  },

  flexOne: {
    flex: 1,
  },

  introTitle: {
    fontSize: runnerTypography.body,
    fontWeight: "800",
  },

  introCopy: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 22,
    marginTop: runnerSpacing.xxs,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: runnerSpacing.xs,
  },

  sectionHeading: {
    fontSize: runnerTypography.subtitle,
    fontWeight: "800",
  },

  sectionCount: {
    fontSize: runnerTypography.body,
    fontWeight: "700",
  },

  loadingCard: {
    minHeight: 160,
    borderWidth: 1,
    borderRadius: runnerRadii.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.md,
    padding: runnerSpacing.lg,
  },

  emptyCard: {
    minHeight: 210,
    borderWidth: 1,
    borderRadius: runnerRadii.lg,
    alignItems: "center",
    justifyContent: "center",
    padding: runnerSpacing.xl,
    gap: runnerSpacing.md,
  },

  cardTitle: {
    fontSize: runnerTypography.subtitle,
    fontWeight: "800",
    textAlign: "center",
  },

  bodyText: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 23,
  },

  jobCard: {
    borderWidth: 1,
    borderRadius: runnerRadii.lg,
    padding: runnerSpacing.md,
    gap: runnerSpacing.md,
  },

  jobHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: runnerSpacing.md,
  },

  jobCode: {
    fontSize: runnerTypography.caption,
    fontWeight: "700",
    letterSpacing: 0.4,
  },

  jobTitle: {
    fontSize: runnerTypography.body,
    fontWeight: "800",
    lineHeight: 23,
    marginTop: runnerSpacing.xxs,
  },

  payout: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "800",
    textAlign: "right",
  },

  jobDescription: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 22,
  },

  routeBlock: {
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    padding: runnerSpacing.md,
    gap: runnerSpacing.sm,
  },

  routeLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: runnerSpacing.sm,
  },

  routeSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: runnerSpacing.xl,
  },

  routeLabel: {
    fontSize: runnerTypography.caption,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  routeValue: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: runnerSpacing.xxs,
  },

  primaryButton: {
    minHeight: runnerTouchTargets.primary,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: runnerSpacing.sm,
    paddingHorizontal: runnerSpacing.lg,
  },

  primaryButtonText: {
    fontSize: runnerTypography.body,
    fontWeight: "800",
  },

  menuRow: {
    minHeight: runnerTouchTargets.comfortable,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: runnerSpacing.md,
    paddingHorizontal: runnerSpacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
  },

  menuRowText: {
    flex: 1,
    fontSize: runnerTypography.body,
    fontWeight: "700",
  },

  overviewStack: {
    gap: runnerSpacing.lg,
  },

  overviewCard: {
    borderWidth: 1,
    borderRadius: runnerRadii.lg,
    padding: runnerSpacing.lg,
    gap: runnerSpacing.md,
  },

  overviewHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
  },

  overviewIcon: {
    width: 50,
    height: 50,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
  },

  eyebrow: {
    fontSize: runnerTypography.caption,
    fontWeight: "800",
    letterSpacing: 0.7,
  },

  overviewTitle: {
    fontSize: runnerTypography.title,
    fontWeight: "800",
  },

  pointsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: runnerSpacing.sm,
  },

  secondaryText: {
    flex: 1,
    fontSize: runnerTypography.bodySmall,
    lineHeight: 22,
  },

  pointsValue: {
    fontSize: runnerTypography.body,
    fontWeight: "800",
  },

  progressTrack: {
    height: 10,
    borderRadius: runnerRadii.pill,
    overflow: "hidden",
  },

  progressFill: {
    width: "20%",
    height: "100%",
    borderRadius: runnerRadii.pill,
  },

  tierLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: runnerSpacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: runnerSpacing.md,
  },

  tierLabel: {
    fontSize: runnerTypography.caption,
    fontWeight: "700",
  },

  subsection: {
    gap: runnerSpacing.sm,
  },

  subsectionTitle: {
    fontSize: runnerTypography.subtitle,
    fontWeight: "800",
  },

  metricList: {
    borderWidth: 1,
    borderRadius: runnerRadii.lg,
    paddingHorizontal: runnerSpacing.md,
  },

  metricRow: {
    minHeight: runnerTouchTargets.comfortable,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
    paddingVertical: runnerSpacing.sm,
  },

  metricLabel: {
    flex: 1,
    fontSize: runnerTypography.body,
    fontWeight: "600",
  },

  metricValue: {
    fontSize: runnerTypography.body,
    fontWeight: "800",
  },

  separator: {
    height: StyleSheet.hairlineWidth,
  },

  informationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: runnerSpacing.sm,
    paddingVertical: runnerSpacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  earningsValue: {
    fontSize: runnerTypography.display,
    fontWeight: "800",
  },

  appearanceOptions: {
    flexDirection: "row",
    gap: runnerSpacing.md,
    marginTop: runnerSpacing.xs,
  },

  appearanceOption: {
    flex: 1,
    minHeight: runnerTouchTargets.comfortable,
    borderRadius: runnerRadii.md,
    borderWidth: 1,
    paddingHorizontal: runnerSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.xs,
  },

  appearanceLabel: {
    fontSize: runnerTypography.body,
    fontWeight: "700",
    textTransform: "capitalize",
  },

  profileLink: {
    minHeight: runnerTouchTargets.comfortable,
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    padding: runnerSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
  },

  profileLinkTitle: {
    fontSize: runnerTypography.body,
    fontWeight: "800",
    marginBottom: runnerSpacing.xxs,
  },

  privacyStatus: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: runnerSpacing.sm,
  },

  privacyStatusText: {
    flex: 1,
    fontSize: runnerTypography.bodySmall,
    lineHeight: 22,
    fontWeight: "700",
  },
});