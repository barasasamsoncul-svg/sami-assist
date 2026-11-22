import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRunnerTheme } from "@/theme";

export type RunnerDashboardSection =
  | "offers"
  | "rating"
  | "acceptance"
  | "menu"
  | "help";

type Props = {
  topInset: number;
  bottomInset: number;
  isOnline: boolean;
  statusLabel: string;
  authorized: boolean;
  canChangeAvailability: boolean;
  availabilityBusy: boolean;
  locationLabel: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onToggleAvailability: () => void;
  onOpenSection: (section: RunnerDashboardSection) => void;
  offersCount: number;
  activeErrand: boolean;
  hasActiveRoute: boolean;
  error?: string;
  mapError?: string;
};

const COLORS = {
  navy: "#000535",
  panel: "#06132C",
  panelRaised: "#0A1C3A",
  panelSoft: "#0D2345",
  border: "#294A78",
  borderSoft: "#1B365C",
  blue: "#3485F5",
  blueSoft: "#16345B",
  text: "#F6F8FC",
  muted: "#AAB9CF",
  quiet: "#71839F",
  white: "#FFFFFF",
  gold: "#E9B64E",
  error: "#E2767D",
  errorSoft: "#321A22",
};

function MetricValue({
  visible,
  value,
}: {
  visible: boolean;
  value: string | null;
}) {
  const { colors } = useRunnerTheme();

  return (
    <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>
      {visible ? value ?? "—" : "••••"}
    </Text>
  );
}

export function SaMiRunnerDashboardChrome({
  topInset,
  bottomInset,
  isOnline,
  statusLabel,
  authorized,
  canChangeAvailability,
  availabilityBusy,
  locationLabel,
  expanded,
  onExpandedChange,
  onToggleAvailability,
  onOpenSection,
  offersCount,
  activeErrand,
  hasActiveRoute,
  error,
  mapError,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const { colors: themeColors, showOverlay } = useRunnerTheme();
  const [earningsExpanded, setEarningsExpanded] = useState(false);
  const [earningsVisible, setEarningsVisible] = useState(true);

  const safeBottom = Math.max(bottomInset, 0);
  const expandedHeight = Math.min(
    Math.max(Math.round(windowHeight * 0.46), 340),
    390,
  );
  const sheetBottom = 0;
  const sheetHeight = (expanded ? expandedHeight : 104) + safeBottom;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 9 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy < -24) onExpandedChange(true);
          if (gesture.dy > 24) onExpandedChange(false);
        },
      }),
    [onExpandedChange],
  );

  const statusText = activeErrand
    ? "On errand"
    : statusLabel === "PENDING"
    ? "Pending"
    : statusLabel === "RESTRICTED"
      ? "Restricted"
      : isOnline
        ? "Online"
        : "Offline";

  const visibleLocation = locationLabel?.trim() || "Finding location";

  useEffect(() => {
    const message = error || mapError;
    if (!message) return;

    showOverlay({
      type: "error",
      title: error ? "Runner dashboard issue" : "Map issue",
      message,
      dismissOnBackdrop: true,
    });
  }, [error, mapError, showOverlay]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* SaMi header controls sit directly over the map without card shells. */}
      <View
        style={[
          styles.headerRow,
          {
            top: topInset + 7,
            paddingHorizontal: 17,
          },
        ]}
      >
        <View
          accessibilityLabel={`Availability status: ${statusText}`}
          style={[styles.headerCard, styles.statusCard]}
        >
          {availabilityBusy ? (
            <ActivityIndicator size="small" color={themeColors.blue} />
          ) : (
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isOnline || activeErrand ? themeColors.blue : themeColors.muted },
              ]}
            />
          )}
          <Text style={[styles.headerCardText, { color: themeColors.text }]} numberOfLines={1}>
            {statusText}
          </Text>
        </View>

        <View style={[styles.headerCard, styles.earningsCard]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Expand or collapse earnings summary"
            accessibilityState={{ expanded: earningsExpanded }}
            onPress={() => setEarningsExpanded((current) => !current)}
            style={styles.earningsMain}
          >
            <Ionicons name="bar-chart" size={17} color={themeColors.text} />
            <View style={styles.earningsHeaderCopy}>
              <Text style={[styles.headerEyebrow, { color: themeColors.textMuted }]}>EARNINGS</Text>
              <Text style={[styles.headerCardText, { color: themeColors.text }]} numberOfLines={1}>
                {earningsVisible ? "KSh —" : "KSh ••••"}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={earningsVisible ? "Hide earnings" : "Show earnings"}
            hitSlop={8}
            onPress={() => setEarningsVisible((current) => !current)}
            style={styles.eyeButton}
          >
            <Ionicons
              name={earningsVisible ? "eye-outline" : "eye-off-outline"}
              size={18}
              color={themeColors.text}
            />
          </Pressable>
        </View>

        {(isOnline || activeErrand) && authorized ? (
          <View
            accessibilityLabel={`Current location: ${visibleLocation}`}
            style={[styles.headerCard, styles.locationCard]}
          >
            <Ionicons name="location" size={17} color={themeColors.text} />
            <Text style={[styles.headerCardText, { color: themeColors.text }]} numberOfLines={1}>
              {visibleLocation}
            </Text>
          </View>
        ) : null}
      </View>

      {earningsExpanded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close earnings details"
          onPress={() => setEarningsExpanded(false)}
          style={styles.overlayDismiss}
        />
      ) : null}

      {earningsExpanded ? (
        <View
          style={[
            styles.earningsPanel,
            {
              top: topInset + (hasActiveRoute ? 230 : 61),
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
            },
          ]}
        >
          <View style={styles.earningsPanelHeader}>
            <Text style={[styles.earningsPanelTitle, { color: themeColors.text }]}>Earnings overview</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={earningsVisible ? "Hide earnings values" : "Show earnings values"}
              hitSlop={8}
              onPress={() => setEarningsVisible((current) => !current)}
            >
              <Ionicons
                name={earningsVisible ? "eye-outline" : "eye-off-outline"}
                size={19}
                color={themeColors.text}
              />
            </Pressable>
          </View>

          <View style={styles.metricTopRow}>
            <View style={styles.metricCell}>
              <Ionicons name="wallet-outline" size={18} color={themeColors.blue} />
              <MetricValue visible={earningsVisible} value={null} />
              <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>Today</Text>
            </View>
            <View style={[styles.metricDivider, { backgroundColor: themeColors.border }]} />
            <View style={styles.metricCell}>
              <Ionicons name="calendar-outline" size={18} color={themeColors.blue} />
              <MetricValue visible={earningsVisible} value={null} />
              <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>This week</Text>
            </View>
            <View style={[styles.metricDivider, { backgroundColor: themeColors.border }]} />
            <View style={styles.metricCell}>
              <Ionicons name="card-outline" size={18} color={themeColors.blue} />
              <MetricValue visible={earningsVisible} value={null} />
              <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>Balance</Text>
            </View>
          </View>

          <View style={styles.metricBottomRow}>
            <View style={styles.metricBottomCell}>
              <Ionicons name="bicycle-outline" size={19} color={themeColors.blue} />
              <View>
                <MetricValue visible={earningsVisible} value={null} />
                <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>Trips</Text>
              </View>
            </View>
            <View style={[styles.metricDivider, { backgroundColor: themeColors.border }]} />
            <View style={styles.metricBottomCell}>
              <Ionicons name="time-outline" size={19} color={themeColors.blue} />
              <View>
                <MetricValue visible={earningsVisible} value={null} />
                <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>Last trip</Text>
              </View>
            </View>
          </View>
          <Text style={[styles.metricsFootnote, { color: themeColors.muted }]}>
            Earnings and trip totals will appear when the Runner metrics service is connected.
          </Text>
        </View>
      ) : null}

      {/* Persistent bottom sheet: offers stay first in both states. */}
      {!activeErrand ? (
      <View
        style={[
          styles.bottomSheet,
          {
            bottom: sheetBottom,
            height: sheetHeight,
            paddingBottom: safeBottom + 8,
            backgroundColor: themeColors.surface,
            borderTopColor: themeColors.border,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Collapse dashboard panel" : "Expand dashboard panel"}
          accessibilityState={{ expanded }}
          onPress={() => onExpandedChange(!expanded)}
          style={styles.sheetHandleArea}
        >
          <View style={[styles.sheetHandle, { backgroundColor: themeColors.borderStrong }]} />
          <Ionicons
            name={expanded ? "chevron-down" : "chevron-up"}
            size={16}
            color={themeColors.textMuted}
            style={styles.sheetChevron}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Offers and Rewards"
          onPress={() => onOpenSection("offers")}
          style={({ pressed }) => [
            styles.offerCard,
            { opacity: pressed ? 0.82 : 1 },
          ]}
        >
          <View style={styles.offerIconWrap}>
            <Ionicons name="gift-outline" size={25} color={themeColors.blue} />
          </View>
          <View style={styles.offerCopy}>
            <View style={styles.offerTitleRow}>
              <Text style={[styles.offerTitle, { color: themeColors.text }]}>Offers & Rewards</Text>
              {offersCount > 0 ? (
                <View style={styles.offerCountBadge}>
                  <Text style={styles.offerCountText}>{offersCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.offerSubtitle, { color: themeColors.textMuted }]} numberOfLines={1}>
              SaMi offers, rewards and opportunities
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={21} color={themeColors.textMuted} />
        </Pressable>

        {expanded ? (
          <>
            <View style={styles.quickCardGrid}>
              <QuickCard
                icon="star"
                iconColor={themeColors.amber}
                label="Rating"
                value="—"
                onPress={() => onOpenSection("rating")}
              />
              <QuickCard
                icon="trending-up"
                label="Acceptance"
                value="—"
                onPress={() => onOpenSection("acceptance")}
              />
              <QuickCard
                icon="grid"
                label="Menu"
                onPress={() => onOpenSection("menu")}
              />
              <QuickCard
                icon="headset-outline"
                label="Help"
                onPress={() => onOpenSection("help")}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isOnline ? "Go offline" : "Go online"}
              accessibilityHint={
                activeErrand
                  ? "Availability cannot be changed while an errand is active."
                  : "Changes your SaMi Runner availability."
              }
              disabled={!authorized || !canChangeAvailability || availabilityBusy}
              onPress={onToggleAvailability}
              style={({ pressed }) => [
                styles.goButton,
                {
                  opacity:
                    !authorized || !canChangeAvailability || availabilityBusy
                      ? 0.55
                      : pressed
                        ? 0.86
                        : 1,
                },
              ]}
            >
              {availabilityBusy ? (
                <ActivityIndicator size="small" color={themeColors.brandNavy} />
              ) : (
                <Text style={[styles.goButtonText, { color: themeColors.brandNavy }]}>GO</Text>
              )}
            </Pressable>
          </>
        ) : null}
      </View>
      ) : null}
    </View>
  );
}

function QuickCard({
  icon,
  iconColor = COLORS.blue,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  const { colors } = useRunnerTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickCard,
        { opacity: pressed ? 0.78 : 1 },
      ]}
    >
      <Ionicons name={icon} size={22} color={iconColor ?? colors.blue} />
      {value ? <Text style={[styles.quickCardValue, { color: colors.text }]}>{value}</Text> : null}
      <Text style={[styles.quickCardLabel, { color: colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerCard: {
    minHeight: 44,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  statusCard: {
    flexGrow: 0.85,
    flexBasis: 0,
  },
  earningsCard: {
    flexGrow: 1.25,
    flexBasis: 0,
    justifyContent: "flex-start",
  },
  locationCard: {
    flexGrow: 1.1,
    flexBasis: 0,
    justifyContent: "flex-start",
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  headerCardText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    flexShrink: 1,
  },
  headerEyebrow: {
    color: COLORS.muted,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.75,
  },
  earningsMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  earningsHeaderCopy: {
    flex: 1,
    gap: 1,
  },
  eyeButton: {
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  overlayDismiss: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    elevation: 22,
    backgroundColor: "transparent",
  },
  earningsPanel: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 41,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    elevation: 23,
  },
  earningsPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  earningsPanelTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  metricTopRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  metricCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minWidth: 0,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },
  metricValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  metricLabel: {
    color: "#D0D8E4",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  metricBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderSoft,
    paddingTop: 9,
  },
  metricBottomCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  metricsFootnote: {
    color: COLORS.quiet,
    fontSize: 9,
    textAlign: "center",
    lineHeight: 13,
  },
  errorBanner: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 28,
    borderWidth: 1,
    borderColor: "#754253",
    borderRadius: 13,
    backgroundColor: COLORS.errorSoft,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorBannerText: {
    color: COLORS.error,
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 35,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 17,
    paddingBottom: 8,
    gap: 9,
    elevation: 12,
  },
  sheetHandleArea: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 99,
    backgroundColor: "#A6B5CB",
  },
  sheetChevron: {
    position: "absolute",
    right: 7,
  },
  offerCard: {
    minHeight: 60,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 2,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  offerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  offerCopy: {
    flex: 1,
    gap: 3,
  },
  offerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  offerTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  offerSubtitle: {
    color: "#D0D8E4",
    fontSize: 10,
    fontWeight: "600",
  },
  offerCountBadge: {
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: COLORS.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  offerCountText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "900",
  },
  quickCardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickCard: {
    width: "48.5%",
    minHeight: 58,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 4,
  },
  quickCardValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  quickCardLabel: {
    color: "#D0D8E4",
    fontSize: 10,
    fontWeight: "700",
  },
  goButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderWidth: 4,
    borderColor: "#D8E4F4",
    marginTop: 1,
    marginBottom: 2,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 8,
  },
  goButtonText: {
    color: COLORS.navy,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
});
