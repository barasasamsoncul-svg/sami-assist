import { useMemo, useState } from "react";
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
  return (
    <Text style={styles.metricValue} numberOfLines={1}>
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
  const [earningsExpanded, setEarningsExpanded] = useState(false);
  const [earningsVisible, setEarningsVisible] = useState(true);

  const expandedHeight = Math.min(
    Math.max(Math.round(windowHeight * 0.49), 360),
    410,
  );
  const sheetBottom = Math.max(bottomInset, 10) + 7;
  const sheetHeight = expanded ? expandedHeight : 110;

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

  const statusText = statusLabel === "PENDING"
    ? "Pending"
    : statusLabel === "RESTRICTED"
      ? "Restricted"
      : isOnline
        ? "Online"
        : "Offline";

  const visibleLocation = locationLabel?.trim() || "Finding location";

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Three independent header cards: availability, earnings, location. */}
      <View
        style={[
          styles.headerRow,
          {
            top: topInset + 7,
            paddingHorizontal: 12,
          },
        ]}
      >
        <View
          accessibilityLabel={`Availability status: ${statusText}`}
          style={[styles.headerCard, styles.statusCard]}
        >
          {availabilityBusy ? (
            <ActivityIndicator size="small" color={COLORS.blue} />
          ) : (
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isOnline ? COLORS.blue : COLORS.quiet },
              ]}
            />
          )}
          <Text style={styles.headerCardText} numberOfLines={1}>
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
            <Ionicons name="bar-chart" size={17} color={COLORS.white} />
            <View style={styles.earningsHeaderCopy}>
              <Text style={styles.headerEyebrow}>EARNINGS</Text>
              <Text style={styles.headerCardText} numberOfLines={1}>
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
              color={COLORS.white}
            />
          </Pressable>
        </View>

        {isOnline && authorized ? (
          <View
            accessibilityLabel={`Current location: ${visibleLocation}`}
            style={[styles.headerCard, styles.locationCard]}
          >
            <Ionicons name="location" size={17} color={COLORS.white} />
            <Text style={styles.headerCardText} numberOfLines={1}>
              {visibleLocation}
            </Text>
          </View>
        ) : null}
      </View>

      {earningsExpanded ? (
        <View
          style={[
            styles.earningsPanel,
            { top: topInset + (hasActiveRoute ? 230 : 67) },
          ]}
        >
          <View style={styles.earningsPanelHeader}>
            <Text style={styles.earningsPanelTitle}>Earnings overview</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={earningsVisible ? "Hide earnings values" : "Show earnings values"}
              hitSlop={8}
              onPress={() => setEarningsVisible((current) => !current)}
            >
              <Ionicons
                name={earningsVisible ? "eye-outline" : "eye-off-outline"}
                size={19}
                color={COLORS.white}
              />
            </Pressable>
          </View>

          <View style={styles.metricTopRow}>
            <View style={styles.metricCell}>
              <Ionicons name="wallet-outline" size={18} color="#9CBDF0" />
              <MetricValue visible={earningsVisible} value={null} />
              <Text style={styles.metricLabel}>Today</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricCell}>
              <Ionicons name="calendar-outline" size={18} color="#9CBDF0" />
              <MetricValue visible={earningsVisible} value={null} />
              <Text style={styles.metricLabel}>This week</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricCell}>
              <Ionicons name="card-outline" size={18} color="#9CBDF0" />
              <MetricValue visible={earningsVisible} value={null} />
              <Text style={styles.metricLabel}>Balance</Text>
            </View>
          </View>

          <View style={styles.metricBottomRow}>
            <View style={styles.metricBottomCell}>
              <Ionicons name="bicycle-outline" size={19} color="#9CBDF0" />
              <View>
                <MetricValue visible={earningsVisible} value={null} />
                <Text style={styles.metricLabel}>Trips</Text>
              </View>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricBottomCell}>
              <Ionicons name="time-outline" size={19} color="#9CBDF0" />
              <View>
                <MetricValue visible={earningsVisible} value={null} />
                <Text style={styles.metricLabel}>Last trip</Text>
              </View>
            </View>
          </View>
          <Text style={styles.metricsFootnote}>
            Earnings and trip totals will appear when the Runner metrics service is connected.
          </Text>
        </View>
      ) : null}

      {(error || mapError) ? (
        <View style={[styles.errorBanner, { top: topInset + 67 }]}>
          <Ionicons name="alert-circle-outline" size={17} color={COLORS.error} />
          <Text style={styles.errorBannerText} numberOfLines={2}>
            {error || mapError}
          </Text>
        </View>
      ) : null}

      {/* Persistent bottom sheet: offers stay first in both states. */}
      <View
        style={[
          styles.bottomSheet,
          {
            bottom: sheetBottom,
            height: sheetHeight,
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
          <View style={styles.sheetHandle} />
          <Ionicons
            name={expanded ? "chevron-down" : "chevron-up"}
            size={16}
            color={COLORS.muted}
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
            <Ionicons name="gift-outline" size={27} color={COLORS.white} />
          </View>
          <View style={styles.offerCopy}>
            <View style={styles.offerTitleRow}>
              <Text style={styles.offerTitle}>Offers & Rewards</Text>
              {offersCount > 0 ? (
                <View style={styles.offerCountBadge}>
                  <Text style={styles.offerCountText}>{offersCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.offerSubtitle} numberOfLines={1}>
              SaMi offers, rewards and opportunities
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={COLORS.white} />
        </Pressable>

        {expanded ? (
          <>
            <View style={styles.quickCardGrid}>
              <QuickCard
                icon="star"
                iconColor={COLORS.gold}
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
                <ActivityIndicator size="small" color={COLORS.navy} />
              ) : (
                <Text style={styles.goButtonText}>GO</Text>
              )}
            </Pressable>
          </>
        ) : null}
      </View>
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
      <Ionicons name={icon} size={22} color={iconColor} />
      {value ? <Text style={styles.quickCardValue}>{value}</Text> : null}
      <Text style={styles.quickCardLabel}>{label}</Text>
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
    alignItems: "stretch",
    gap: 7,
  },
  headerCard: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(0, 5, 35, 0.96)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 9,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.23,
    shadowRadius: 8,
    elevation: 9,
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
    color: COLORS.text,
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
  earningsPanel: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 29,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#547EBB",
    backgroundColor: "rgba(0, 5, 35, 0.98)",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    elevation: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
  },
  earningsPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  earningsPanelTitle: {
    color: COLORS.text,
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
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  metricLabel: {
    color: COLORS.muted,
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
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "#31537F",
    backgroundColor: "rgba(0, 5, 35, 0.985)",
    paddingHorizontal: 15,
    paddingBottom: 10,
    gap: 10,
    elevation: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
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
    minHeight: 64,
    borderWidth: 1,
    borderColor: "#315CA0",
    borderRadius: 18,
    backgroundColor: "#0A1D40",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  offerIconWrap: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#112C56",
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
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  offerSubtitle: {
    color: COLORS.muted,
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
    minHeight: 65,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.panelRaised,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    gap: 2,
  },
  quickCardValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  quickCardLabel: {
    color: COLORS.muted,
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
