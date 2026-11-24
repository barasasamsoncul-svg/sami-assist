import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  UIManager,
  View,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRunnerTheme } from "@/theme";

export type RunnerDashboardSection =
  | "offers"
  | "rating"
  | "acceptance"
  | "menu"
  | "help"
  | "performance"
  | "earnings"
  | "settings"
  | "privacy";

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

const DASHBOARD_EARNINGS_PLACEHOLDER = "KSh 2,500";

export function SaMiRunnerDashboardChrome({
  topInset,
  bottomInset,
  isOnline,
  statusLabel,
  authorized,
  canChangeAvailability,
  availabilityBusy,
  locationLabel: _locationLabel,
  expanded,
  onExpandedChange,
  onToggleAvailability,
  onOpenSection,
  offersCount,
  activeErrand,
  hasActiveRoute: _hasActiveRoute,
  error,
  mapError,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors, showOverlay, isDark } = useRunnerTheme();
  const [earningsExpanded, setEarningsExpanded] = useState(false);
  const [earningsVisible, setEarningsVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const availabilityOpacity = useRef(new Animated.Value(expanded ? 0 : 1)).current;
  const hubHeaderOpacity = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  const safeBottom = Math.max(bottomInset, insets.bottom, 0);
  const compactSheetHeight = 97 + safeBottom;
  const sheetHeight = expanded ? windowHeight + insets.top : compactSheetHeight;
  const navy = colors.brandNavy || "#000535";
  const panelBackground = colors.surface;
  const actionBlue = colors.blueAction || "#1558B0";
  const offlineRed = "#B42318";
  const white = "#FFFFFF";
  const glass = isDark ? "rgba(255,255,255,0.105)" : "#F2F5FA";
  const glassBorder = isDark ? "rgba(255,255,255,0.20)" : colors.border;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(availabilityOpacity, {
        toValue: expanded ? 0 : 1,
        duration: 190,
        useNativeDriver: true,
      }),
      Animated.timing(hubHeaderOpacity, {
        toValue: expanded ? 1 : 0,
        duration: 230,
        delay: expanded ? 55 : 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [expanded, availabilityOpacity, hubHeaderOpacity]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const animateSheet = (nextExpanded: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onExpandedChange(nextExpanded);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 9 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy < -24) animateSheet(true);
          if (gesture.dy > 24) animateSheet(false);
        },
      }),
    [onExpandedChange],
  );

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

  const openSection = (section: RunnerDashboardSection) => {
    setMenuOpen(false);
    onOpenSection(section);
  };

  const availabilityLabel = isOnline ? "Go offline" : "Go online";
  const availabilityDisabled = !authorized || !canChangeAvailability || availabilityBusy || activeErrand;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Android status-bar background is configured in app.config/app.json; core RN 0.88 StatusBar only controls icon/text style here. */}
      <StatusBar barStyle="light-content" hidden={expanded} />

      {/* Top overlay: compact drawer control and one earnings pill. No location chip. */}
      <View style={[styles.headerRow, { top: topInset + 7, paddingHorizontal: 16 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open dashboard menu"
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.hamburgerButton, { backgroundColor: navy, opacity: pressed ? 0.78 : 1 }]}
        >
          <Ionicons name="menu" size={24} color={white} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={earningsVisible ? "Show today's earnings details" : "Open earnings details"}
          accessibilityState={{ expanded: earningsExpanded }}
          onPress={() => setEarningsExpanded((current) => !current)}
          style={({ pressed }) => [styles.earningsPill, { backgroundColor: navy, opacity: pressed ? 0.9 : 1 }]}
        >
          {earningsVisible ? (
            <>
              <Text style={styles.earningsPillAmount}>{DASHBOARD_EARNINGS_PLACEHOLDER}</Text>
              <Text style={styles.earningsPillToday}>Today</Text>
            </>
          ) : null}
        </Pressable>
        <View style={styles.headerRightSpacer} />
      </View>

      {earningsExpanded ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close earnings overlay"
            onPress={() => setEarningsExpanded(false)}
            style={styles.earningsDismiss}
          />
          <View style={[styles.earningsOverlay, { top: topInset + 68, backgroundColor: navy, borderColor: glassBorder }]}>
            <View style={styles.earningsOverlayHeader}>
              <View>
                <Text style={styles.earningsOverlayEyebrow}>TODAY</Text>
                <Text style={styles.earningsOverlayValue}>{DASHBOARD_EARNINGS_PLACEHOLDER}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={earningsVisible ? "Hide earnings on dashboard" : "Show earnings on dashboard"}
                onPress={() => setEarningsVisible((current) => !current)}
                hitSlop={10}
                style={({ pressed }) => [styles.eyeButton, { backgroundColor: glass, opacity: pressed ? 0.72 : 1 }]}
              >
                <Ionicons name={earningsVisible ? "eye-off-outline" : "eye-outline"} size={21} color={white} />
              </Pressable>
            </View>
            <Text style={styles.earningsOverlayHint}>
              {earningsVisible ? "Tap the eye to hide the amount on the dashboard." : "Your dashboard amount is hidden. Your earnings details remain visible here."}
            </Text>
          </View>
        </>
      ) : null}

      {/* Compact availability drawer. Expanding turns it into a full-screen Runner hub. */}
      {!activeErrand ? (
        <View
          style={[
            styles.bottomSheet,
            {
              top: expanded ? -insets.top : undefined,
              left: expanded ? 0 : -1,
              right: expanded ? 0 : -1,
              height: sheetHeight,
              paddingHorizontal: expanded ? 18 : 14,
              paddingTop: expanded ? insets.top + 5 : 4,
              paddingBottom: expanded ? safeBottom + 8 : safeBottom + 9,
              backgroundColor: panelBackground,
              borderTopColor: isDark ? "rgba(255,255,255,0.17)" : colors.border,
              borderTopLeftRadius: expanded ? 0 : 25,
              borderTopRightRadius: expanded ? 0 : 25,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderLeftWidth: 0,
              borderRightWidth: 0,
              borderBottomWidth: 0,
              zIndex: expanded ? 90 : 35,
              elevation: expanded ? 30 : 22,
              gap: expanded ? 12 : 7,
            },
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.sheetHandlePanArea}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Collapse Runner hub" : "Expand Runner hub"}
              accessibilityState={{ expanded }}
              onPress={() => animateSheet(!expanded)}
              style={[styles.sheetHandleArea, { height: expanded ? 30 : 22 }]}
            >
              <View
                style={[
                  styles.sheetHandle,
                  { backgroundColor: isDark ? "rgba(255,255,255,0.62)" : colors.borderStrong },
                ]}
              />
            </Pressable>
          </View>

          <View style={styles.sheetActionSlot}>
            <Animated.View
              pointerEvents={expanded ? "none" : "auto"}
              style={[styles.availabilityLayer, { opacity: availabilityOpacity }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={availabilityLabel}
                accessibilityHint="Changes your SaMi Runner availability."
                disabled={availabilityDisabled}
                onPress={onToggleAvailability}
                style={({ pressed }) => [
                  styles.availabilityButton,
                  {
                    backgroundColor: isOnline ? actionBlue : offlineRed,
                    opacity: availabilityDisabled ? 0.55 : pressed ? 0.84 : 1,
                  },
                ]}
              >
                {availabilityBusy ? (
                  <ActivityIndicator size="small" color={white} />
                ) : (
                  <>
                    <Ionicons name={isOnline ? "power" : "radio-outline"} size={19} color={white} />
                    <Text style={styles.availabilityButtonText}>{availabilityLabel}</Text>
                  </>
                )}
              </Pressable>
            </Animated.View>

            <Animated.View
              pointerEvents={expanded ? "auto" : "none"}
              style={[styles.expandedTitleLayer, { opacity: hubHeaderOpacity }]}
            >
              <View style={styles.expandedTitleCopy}>
                <Text style={[styles.expandedEyebrow, { color: colors.textMuted }]}>SAMI RUNNER</Text>
                <Text style={[styles.expandedTitle, { color: colors.text }]}>Your Runner hub</Text>
              </View>
              <View
                accessibilityLabel={isOnline ? "Runner is online" : "Runner is offline"}
                style={[
                  styles.expandedStatusPill,
                  {
                    backgroundColor: isOnline ? colors.successSoft : colors.dangerSoft,
                    borderColor: isOnline ? colors.success : colors.red,
                  },
                ]}
              >
                <View style={[styles.expandedStatusDot, { backgroundColor: isOnline ? colors.success : colors.red }]} />
                <Text style={[styles.expandedStatusText, { color: isOnline ? colors.success : colors.red }]}>
                  {isOnline ? "ONLINE" : "OFFLINE"}
                </Text>
              </View>
            </Animated.View>
          </View>

          {expanded ? (
            <ScrollView
              style={styles.hubScroll}
              contentContainerStyle={styles.hubContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.hubWelcome}>
                <Text style={[styles.hubWelcomeTitle, { color: colors.text }]}>Everything in one place.</Text>
                <Text style={[styles.hubWelcomeSubtitle, { color: colors.textMuted }]}>Your performance, earnings and account shortcuts.</Text>
              </View>

              <View style={styles.hubSectionHeader}>
                <Text style={[styles.hubSectionEyebrow, { color: colors.textMuted }]}>PERFORMANCE</Text>
                <Pressable onPress={() => openSection("performance")} accessibilityRole="button">
                  <Text style={[styles.hubSeeAll, { color: colors.blue }]}>View details</Text>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open performance and tier progress"
                onPress={() => openSection("performance")}
                style={({ pressed }) => [
                  styles.tierCard,
                  {
                    backgroundColor: isDark ? "#071329" : "#F2F5FA",
                    borderColor: colors.border,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <View style={styles.tierCardTop}>
                  <View style={styles.tierIconWrap}>
                    <Ionicons name="trophy-outline" size={22} color={isDark ? "#E8C574" : "#9A6A16"} />
                  </View>
                  <View style={styles.tierCardCopy}>
                    <Text style={[styles.tierEyebrow, { color: colors.textMuted }]}>SAMI PERFORMANCE TIERS</Text>
                    <Text style={[styles.tierTitle, { color: colors.text }]}>Silver tier</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
                </View>
                <View style={styles.tierPointsRow}>
                  <Text style={[styles.tierPointsLabel, { color: colors.textMuted }]}>Tier progress</Text>
                  <Text style={[styles.tierPointsValue, { color: colors.text }]}>200 / 1,000 PTS</Text>
                </View>
                <View style={[styles.tierProgressTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.13)" : "#D8E0EA" }]}>
                <View style={[styles.tierProgressFill, { backgroundColor: isDark ? "#D6B568" : "#A97826", width: "20%" }]} />
              </View>
              <View style={styles.tierProgressFooter}>
                <Text style={[styles.tierProgressCaption, { color: colors.textMuted }]}>800 points to Gold</Text>
                <Text style={[styles.tierProgressCaption, { color: colors.textMuted }]}>20% complete</Text>
              </View>
                <View style={styles.tierStepsRow}>
                  {(["Silver", "Gold", "Platinum", "Diamond"] as const).map((tier) => (
                    <Text key={tier} style={[styles.tierStep, { color: colors.textMuted }]}>{tier}</Text>
                  ))}
                </View>
              </Pressable>

              <View style={styles.performanceMetricRow}>
                <Pressable onPress={() => openSection("performance")} style={[styles.performanceMetric, { backgroundColor: isDark ? "#071329" : "#F2F5FA", borderColor: colors.border }]}>
                  <Ionicons name="star" size={16} color={isDark ? "#F2C66D" : "#A16A13"} />
                  <Text style={[styles.performanceMetricValue, { color: colors.text }]}>—</Text>
                  <Text style={[styles.performanceMetricLabel, { color: colors.textMuted }]}>Rating</Text>
                </Pressable>
                <Pressable onPress={() => openSection("performance")} style={[styles.performanceMetric, { backgroundColor: isDark ? "#071329" : "#F2F5FA", borderColor: colors.border }]}>
                  <Ionicons name="trending-up-outline" size={16} color={colors.blue} />
                  <Text style={[styles.performanceMetricValue, { color: colors.text }]}>—%</Text>
                  <Text style={[styles.performanceMetricLabel, { color: colors.textMuted }]}>Acceptance</Text>
                </Pressable>
                <Pressable onPress={() => openSection("performance")} style={[styles.performanceMetric, { backgroundColor: isDark ? "#071329" : "#F2F5FA", borderColor: colors.border }]}>
                  <Ionicons name="close-circle-outline" size={16} color={colors.red} />
                  <Text style={[styles.performanceMetricValue, { color: colors.text }]}>—%</Text>
                  <Text style={[styles.performanceMetricLabel, { color: colors.textMuted }]}>Cancellation</Text>
                </Pressable>
              </View>

              <View style={styles.hubSectionHeader}>
                <Text style={[styles.hubSectionEyebrow, { color: colors.textMuted }]}>QUICK ACCESS</Text>
                <Text style={[styles.hubSectionHint, { color: colors.textMuted }]}>Your tools and account</Text>
              </View>

              <View style={styles.hubAccessGrid}>
                <HubAccessCard icon="wallet-outline" title="Earnings" subtitle="Payouts and history" onPress={() => openSection("earnings")} colors={colors} isDark={isDark} />
                <HubAccessCard icon="settings-outline" title="Settings" subtitle="App preferences" onPress={() => openSection("settings")} colors={colors} isDark={isDark} />
                <HubAccessCard icon="shield-checkmark-outline" title="Privacy" subtitle="Location and privacy" onPress={() => openSection("privacy")} colors={colors} isDark={isDark} />
                <HubAccessCard icon="person-circle-outline" title="Runner profile" subtitle="Profile and documents" onPress={() => openSection("menu")} colors={colors} isDark={isDark} />
                <HubAccessCard icon="headset-outline" title="Help & support" subtitle="Get help from SaMi" onPress={() => openSection("help")} colors={colors} isDark={isDark} />
                <HubAccessCard icon="grid-outline" title="Account menu" subtitle="Account actions" onPress={() => openSection("menu")} colors={colors} isDark={isDark} />
              </View>
              <View style={styles.hubFooter}>
                <Text style={[styles.hubFooterBrand, { color: colors.text }]}>SaMi Runner</Text>
                <Text style={[styles.hubFooterCaption, { color: colors.textMuted }]}>Consider it done.</Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
      ) : null}
      {/* Compact left-side drawer, opened from the circular hamburger. */}
      <Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent={false} onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.drawerRoot}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
          <View style={[styles.drawerPanel, { backgroundColor: navy, paddingTop: topInset + 22, paddingBottom: safeBottom + 18, borderColor: glassBorder }]}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerBrand}>SaMi Runner</Text>
                <Text style={styles.drawerSubtitle}>Consider it done.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setMenuOpen(false)} style={styles.drawerClose}>
                <Ionicons name="close" size={22} color={white} />
              </Pressable>
            </View>
            <View style={styles.drawerDivider} />
            <DrawerItem icon="speedometer-outline" label="Performance" onPress={() => openSection("performance")} />
            <DrawerItem icon="wallet-outline" label="Earnings" onPress={() => openSection("earnings")} />
            <DrawerItem icon="settings-outline" label="Settings" onPress={() => openSection("settings")} />
            <DrawerItem icon="shield-checkmark-outline" label="Privacy" onPress={() => openSection("privacy")} />
            <DrawerItem icon="grid-outline" label="Runner profile & account" onPress={() => openSection("menu")} />
            <DrawerItem icon="headset-outline" label="Help & support" onPress={() => openSection("help")} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function HubAccessCard({
  icon,
  title,
  subtitle,
  onPress,
  colors,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  colors: { text: string; textMuted: string; border: string; blue: string; blueSoft: string };
  isDark: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hubAccessCard,
        {
          backgroundColor: isDark ? "#071329" : "#F2F5FA",
          borderColor: colors.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View style={[styles.hubAccessIcon, { backgroundColor: isDark ? "rgba(255,255,255,0.09)" : colors.blueSoft }]}>
        <Ionicons name={icon} size={21} color={colors.blue} />
      </View>
      <View style={styles.hubAccessCopy}>
        <Text style={[styles.hubAccessTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.hubAccessSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
    </Pressable>
  );
}

function DrawerItem({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.drawerItem, { backgroundColor: pressed ? "rgba(255,255,255,0.16)" : "transparent" }]}
    >
      <Ionicons name={icon} size={21} color="#FFFFFF" />
      <Text style={styles.drawerItemText}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color="rgba(255,255,255,0.72)" />
    </Pressable>
  );
}

function QuickCard({
  icon,
  label,
  value,
  onPress,
  glass,
  border,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  glass: string;
  border: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.quickCard, { backgroundColor: glass, borderColor: border, opacity: pressed ? 0.76 : 1 }]}
    >
      <Ionicons name={icon} size={23} color="#FFFFFF" />
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
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hamburgerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.19)",
    elevation: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.24,
    shadowRadius: 7,
  },
  headerRightSpacer: { width: 44, height: 44 },
  earningsPill: {
    position: "absolute",
    left: "50%",
    transform: [{ translateX: -78 }],
    width: 156,
    minHeight: 53,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    elevation: 9,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
  },
  earningsPillAmount: { color: "#FFFFFF", fontSize: 17, lineHeight: 21, fontWeight: "900", letterSpacing: -0.2 },
  earningsPillToday: { color: "rgba(255,255,255,0.86)", fontSize: 10, lineHeight: 13, fontWeight: "700" },
  earningsDismiss: { ...StyleSheet.absoluteFill, zIndex: 40, backgroundColor: "rgba(0,0,0,0.08)" },
  earningsOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 60,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 17,
    paddingVertical: 15,
    gap: 10,
    elevation: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
  },
  earningsOverlayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  earningsOverlayEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  earningsOverlayValue: { color: "#FFFFFF", fontSize: 24, lineHeight: 30, fontWeight: "900" },
  eyeButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  earningsOverlayHint: { color: "rgba(255,255,255,0.82)", fontSize: 11, lineHeight: 16 },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 35,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 10,
    elevation: 22,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },
  sheetHandlePanArea: { minHeight: 22, alignItems: "center", justifyContent: "center" },
  sheetHandleArea: { height: 22, alignItems: "center", justifyContent: "center", width: "100%" },
  sheetHandle: { width: 39, height: 4, borderRadius: 4 },
  availabilityButton: {
    minHeight: 55,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    elevation: 6,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 7,
  },
  availabilityButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", letterSpacing: 0.15 },
  sheetScrollArea: { flex: 1 },
  sheetScrollContent: { gap: 10, paddingBottom: 3 },
  glassCard: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    elevation: 3,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.13,
    shadowRadius: 5,
  },
  offerIconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  offerCopy: { flex: 1, gap: 4 },
  glassCardTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  glassCardSubtitle: { color: "rgba(255,255,255,0.78)", fontSize: 10, fontWeight: "600" },
  offerCountBadge: { minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  offerCountText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  sectionEyebrow: { color: "rgba(255,255,255,0.7)", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginTop: 3 },
  quickCardGrid: { flexDirection: "row", gap: 9 },
  quickCard: { flex: 1, minHeight: 83, borderWidth: 1, borderRadius: 17, alignItems: "center", justifyContent: "center", padding: 10, gap: 5 },
  quickCardValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  quickCardLabel: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", textAlign: "center" },
  drawerRoot: { flex: 1, flexDirection: "row" },
  drawerBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.58)" },
  drawerPanel: { width: "82%", maxWidth: 340, minHeight: "100%", borderRightWidth: 1, paddingHorizontal: 17, gap: 8, elevation: 24 },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  drawerBrand: { color: "#FFFFFF", fontSize: 21, fontWeight: "900", letterSpacing: -0.4 },
  drawerSubtitle: { color: "rgba(255,255,255,0.68)", fontSize: 11, marginTop: 3 },
  drawerClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  drawerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.23)", marginBottom: 8 },
  drawerItem: { minHeight: 52, borderRadius: 13, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 12 },
  drawerItemText: { flex: 1, color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  sheetActionSlot: { height: 56, justifyContent: "center", position: "relative" },
  availabilityLayer: { position: "absolute", left: 0, right: 0, top: 0 },
  expandedTitleLayer: { position: "absolute", left: 0, right: 0, top: 0, height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  expandedTitleCopy: { flex: 1, gap: 3 },
  expandedEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  expandedTitle: { fontSize: 21, lineHeight: 26, fontWeight: "900", letterSpacing: -0.45 },
  expandedStatusPill: { minHeight: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  expandedStatusDot: { width: 7, height: 7, borderRadius: 4 },
  expandedStatusText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  hubScroll: { flex: 1, marginTop: 3 },
  hubContent: { paddingTop: 11, paddingBottom: 10, gap: 14 },
  hubWelcome: { gap: 3, paddingBottom: 1 },
  hubWelcomeTitle: { fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  hubWelcomeSubtitle: { fontSize: 11, lineHeight: 16, fontWeight: "500" },
  hubSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 },
  hubSectionEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.25 },
  hubSeeAll: { fontSize: 11, fontWeight: "900" },
  hubSectionHint: { fontSize: 10, fontWeight: "600" },
  tierCard: { borderWidth: 1, borderRadius: 20, padding: 15, gap: 13 },
  tierCardTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  tierIconWrap: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(232,197,116,0.13)" },
  tierCardCopy: { flex: 1, gap: 4 },
  tierEyebrow: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  tierTitle: { fontSize: 13, fontWeight: "900" },
  tierPointsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  tierPointsLabel: { fontSize: 10, fontWeight: "700" },
  tierPointsValue: { fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  tierProgressTrack: { height: 7, borderRadius: 5, overflow: "hidden" },
  tierProgressFill: { height: "100%", borderRadius: 5 },
  tierProgressFooter: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  tierProgressCaption: { fontSize: 9, fontWeight: "700" },
  tierStepsRow: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  tierStep: { fontSize: 9, fontWeight: "800" },
  performanceMetricRow: { flexDirection: "row", gap: 8 },
  performanceMetric: { flex: 1, minHeight: 83, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, paddingVertical: 9, gap: 4 },
  performanceMetricValue: { fontSize: 17, fontWeight: "900" },
  performanceMetricLabel: { fontSize: 9, fontWeight: "800", textAlign: "center" },
  hubAccessGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  hubAccessCard: { flexGrow: 1, flexBasis: "46%", minWidth: "46%", minHeight: 72, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  hubAccessIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  hubAccessCopy: { flex: 1, gap: 3 },
  hubAccessTitle: { fontSize: 11, fontWeight: "900" },
  hubAccessSubtitle: { fontSize: 9, lineHeight: 13, fontWeight: "600" },
  hubFooter: { marginTop: 3, paddingTop: 12, paddingBottom: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(130,150,180,0.25)", alignItems: "center", gap: 3 },
  hubFooterBrand: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  hubFooterCaption: { fontSize: 9, fontWeight: "600" },
});