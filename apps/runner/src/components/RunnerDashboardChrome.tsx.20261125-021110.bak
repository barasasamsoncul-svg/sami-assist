import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  const { colors, showOverlay } = useRunnerTheme();
  const [earningsExpanded, setEarningsExpanded] = useState(false);
  const [earningsVisible, setEarningsVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const safeBottom = Math.max(bottomInset, insets.bottom, 0);
  const expandedHeight = Math.min(Math.max(Math.round(windowHeight * 0.55), 390), 540);
  const sheetHeight = (expanded ? expandedHeight : 214) + safeBottom;
  const navy = colors.brandNavy || "#000535";
  const actionBlue = colors.blueAction || "#1558B0";
  const white = "#FFFFFF";
  const glass = "rgba(255,255,255,0.105)";
  const glassBorder = "rgba(255,255,255,0.23)";

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
      <StatusBar barStyle="light-content" />

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

      {/* Persistent deep-navy bottom sheet. The availability button stays fixed above its content. */}
      {!activeErrand ? (
        <View
          style={[
            styles.bottomSheet,
            {
              height: sheetHeight,
              paddingBottom: safeBottom + 12,
              backgroundColor: navy,
              borderTopColor: glassBorder,
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Collapse dashboard panel" : "Expand dashboard panel"}
            accessibilityState={{ expanded }}
            onPress={() => animateSheet(!expanded)}
            style={styles.sheetHandleArea}
          >
            <View style={[styles.sheetHandle, { backgroundColor: "rgba(255,255,255,0.62)" }]} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={availabilityLabel}
            accessibilityHint="Changes your SaMi Runner availability."
            disabled={availabilityDisabled}
            onPress={onToggleAvailability}
            style={({ pressed }) => [
              styles.availabilityButton,
              { backgroundColor: actionBlue, opacity: availabilityDisabled ? 0.55 : pressed ? 0.82 : 1 },
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

          <ScrollView
            style={styles.sheetScrollArea}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Offers and Rewards"
              onPress={() => openSection("offers")}
              style={({ pressed }) => [styles.glassCard, { backgroundColor: glass, borderColor: glassBorder, opacity: pressed ? 0.78 : 1 }]}
            >
              <View style={styles.offerIconWrap}>
                <Ionicons name="gift-outline" size={25} color={white} />
              </View>
              <View style={styles.offerCopy}>
                <Text style={styles.glassCardTitle}>Offers & Rewards</Text>
                <Text style={styles.glassCardSubtitle}>SaMi offers, rewards and opportunities</Text>
              </View>
              {offersCount > 0 ? (
                <View style={[styles.offerCountBadge, { backgroundColor: actionBlue }]}>
                  <Text style={styles.offerCountText}>{offersCount}</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={20} color={white} />
              )}
            </Pressable>

            {expanded ? (
              <>
                <Text style={styles.sectionEyebrow}>PERFORMANCE</Text>
                <View style={styles.quickCardGrid}>
                  <QuickCard icon="star-outline" label="Rating" value="—" onPress={() => openSection("rating")} glass={glass} border={glassBorder} />
                  <QuickCard icon="trending-up-outline" label="Acceptance" value="—" onPress={() => openSection("acceptance")} glass={glass} border={glassBorder} />
                </View>
                <Text style={styles.sectionEyebrow}>QUICK ACCESS</Text>
                <View style={styles.quickCardGrid}>
                  <QuickCard icon="grid-outline" label="Runner menu" onPress={() => openSection("menu")} glass={glass} border={glassBorder} />
                  <QuickCard icon="help-circle-outline" label="Help & support" onPress={() => openSection("help")} glass={glass} border={glassBorder} />
                </View>
              </>
            ) : null}
          </ScrollView>
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
            <DrawerItem icon="gift-outline" label="Offers & Rewards" onPress={() => openSection("offers")} />
            <DrawerItem icon="star-outline" label="Rating" onPress={() => openSection("rating")} />
            <DrawerItem icon="trending-up-outline" label="Acceptance" onPress={() => openSection("acceptance")} />
            <DrawerItem icon="grid-outline" label="Runner menu & profile" onPress={() => openSection("menu")} />
            <DrawerItem icon="help-circle-outline" label="Help & support" onPress={() => openSection("help")} />
          </View>
        </View>
      </Modal>
    </View>
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
  sheetHandleArea: { height: 19, alignItems: "center", justifyContent: "center" },
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
});