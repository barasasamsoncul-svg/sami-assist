/*
|--------------------------------------------------------------------------
| 1. IMPORTS
|--------------------------------------------------------------------------
*/

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { runnerMotion, useRunnerTheme } from "@/theme";

/*
|--------------------------------------------------------------------------
| 2. TYPES
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| 3. DESIGN CONSTANTS
|--------------------------------------------------------------------------
*/

const DASHBOARD_EARNINGS_PLACEHOLDER = "KSh 2,500";

const SLIDER_WIDTH = 152;
const SLIDER_HEIGHT = 44;
const SLIDER_THUMB_SIZE = 34;
const SLIDER_INSET = 5;

const SLIDER_MAX_DISTANCE =
  SLIDER_WIDTH - SLIDER_THUMB_SIZE - SLIDER_INSET * 2;

const AVAILABILITY_RED = "#B42318";

const PERFORMANCE_TIERS = [
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
] as const;

/*
|--------------------------------------------------------------------------
| 4. MAIN DASHBOARD COMPONENT
|--------------------------------------------------------------------------
*/

export function SaMiRunnerDashboardChrome({
  topInset,
  bottomInset,
  isOnline,
  statusLabel: _statusLabel,
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
  /*
  |--------------------------------------------------------------------------
  | 5. THEME
  |--------------------------------------------------------------------------
  */

  const { colors, showOverlay, isDark } = useRunnerTheme();

  const insets = useSafeAreaInsets();

  const { height: windowHeight } = useWindowDimensions();

  const safeTop = Math.max(topInset, insets.top, 0);
  const safeBottom = Math.max(bottomInset, insets.bottom, 0);

  const navy = colors.brandNavy || "#000535";

  // One understated outline system for every card.
  const outlineColor = isDark
    ? "rgba(192,203,217,0.30)"
    : "rgba(70,86,107,0.30)";

  const tierGold = isDark ? "#E8C574" : "#9A6A16";

  /*
  |--------------------------------------------------------------------------
  | 6. LOCAL STATE
  |--------------------------------------------------------------------------
  */

  const [earningsExpanded, setEarningsExpanded] = useState(false);
  const [earningsVisible, setEarningsVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | 7. SHEET GEOMETRY
  |--------------------------------------------------------------------------
  |
  | The sheet is a full-height view positioned below the visible area.
  | An animated translation reveals it as the user swipes upwards.
  |
  */

  const compactSheetHeight =
    safeTop +
    6 +
    22 +
    6 +
    SLIDER_HEIGHT +
    8 +
    48 +
    safeBottom +
    10;

  const sheetTravel = Math.max(
    1,
    windowHeight - compactSheetHeight,
  );

  const sheetProgress = useRef(
    new Animated.Value(expanded ? 1 : 0),
  ).current;

  const sheetStartProgress = useRef(
    expanded ? 1 : 0,
  );

  const sheetTranslateY = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetTravel, 0],
    extrapolate: "clamp",
  });

  /*
  |--------------------------------------------------------------------------
  | 8. AVAILABILITY TRANSITION
  |--------------------------------------------------------------------------
  |
  | The availability slider fades away when the sheet approaches
  | the middle of its journey.
  |
  */

  const availabilityOpacity = sheetProgress.interpolate({
    inputRange: [0, 0.46, 0.72, 1],
    outputRange: [1, 1, 0.12, 0],
    extrapolate: "clamp",
  });

  const compactOffersOpacity = availabilityOpacity;

  /*
  |--------------------------------------------------------------------------
  | 9. RUNNER HUB CROSSFADE
  |--------------------------------------------------------------------------
  |
  | Runner Hub replaces the compact availability area.
  |
  */

  const hubHeaderOpacity = sheetProgress.interpolate({
    inputRange: [0, 0.43, 0.72, 1],
    outputRange: [0, 0.12, 0.86, 1],
    extrapolate: "clamp",
  });

  const hubContentOpacity = sheetProgress.interpolate({
    inputRange: [0, 0.56, 0.84, 1],
    outputRange: [0, 0.12, 0.88, 1],
    extrapolate: "clamp",
  });

  const hubContentTranslate = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [9, 0],
    extrapolate: "clamp",
  });

  const quickAccessOpacity = sheetProgress.interpolate({
    inputRange: [0, 0.65, 0.9, 1],
    outputRange: [0, 0, 0.85, 1],
    extrapolate: "clamp",
  });

  /*
  |--------------------------------------------------------------------------
  | 10. KEEP THE SHEET SYNCHRONISED WITH THE DASHBOARD
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    Animated.spring(sheetProgress, {
      toValue: expanded ? 1 : 0,
      ...runnerMotion.spring,
      useNativeDriver: true,
    }).start();
  }, [expanded, sheetProgress]);

  /*
  |--------------------------------------------------------------------------
  | 11. VERTICAL SHEET GESTURE
  |--------------------------------------------------------------------------
  |
  | Swipe upwards:
  |   Expand the sheet to the full-screen Runner Hub.
  |
  | Swipe downwards:
  |   Collapse the sheet to the normal dashboard.
  |
  | This responder covers the sheet's upper content only.
  | Quick Access has a separate ScrollView below it.
  |
  */

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 6 &&
          Math.abs(gesture.dy) >
            Math.abs(gesture.dx) * 1.2,

        onPanResponderGrant: () => {
          sheetProgress.stopAnimation((value) => {
            sheetStartProgress.current = value;
          });
        },

        onPanResponderMove: (_event, gesture) => {
          const nextProgress = Math.max(
            0,
            Math.min(
              1,
              sheetStartProgress.current -
                gesture.dy / sheetTravel,
            ),
          );

          sheetProgress.setValue(nextProgress);
        },

        onPanResponderRelease: (_event, gesture) => {
          const projectedProgress = Math.max(
            0,
            Math.min(
              1,
              sheetStartProgress.current -
                gesture.dy / sheetTravel,
            ),
          );

          let nextExpanded = projectedProgress >= 0.5;

          if (gesture.vy < -0.55) {
            nextExpanded = true;
          } else if (gesture.vy > 0.55) {
            nextExpanded = false;
          }

          onExpandedChange(nextExpanded);

          Animated.spring(sheetProgress, {
            toValue: nextExpanded ? 1 : 0,
            ...runnerMotion.spring,
            useNativeDriver: true,
          }).start();
        },

        onPanResponderTerminate: () => {
          Animated.spring(sheetProgress, {
            toValue: expanded ? 1 : 0,
            ...runnerMotion.spring,
            useNativeDriver: true,
          }).start();
        },

        onPanResponderTerminationRequest: () => false,
      }),
    [
      expanded,
      onExpandedChange,
      sheetProgress,
      sheetTravel,
    ],
  );

  /*
  |--------------------------------------------------------------------------
  | 12. AVAILABILITY PERMISSION
  |--------------------------------------------------------------------------
  */

  const availabilityDisabled =
    !authorized ||
    !canChangeAvailability ||
    availabilityBusy ||
    activeErrand;

  /*
  |--------------------------------------------------------------------------
  | 13. ERROR HANDLING
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const message = error || mapError;

    if (!message) return;

    showOverlay({
      type: "error",
      title: error
        ? "Runner dashboard issue"
        : "Map issue",
      message,
      dismissOnBackdrop: true,
    });
  }, [error, mapError, showOverlay]);

  /*
  |--------------------------------------------------------------------------
  | 14. NAVIGATION
  |--------------------------------------------------------------------------
  */

  const openSection = (section: RunnerDashboardSection) => {
    setMenuOpen(false);
    onOpenSection(section);
  };

  const openOffersAndRewards = () => {
    openSection("offers");
  };

  /*
  |--------------------------------------------------------------------------
  | 15. MAIN RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        hidden={false}
      />

      {/*
      |--------------------------------------------------------------------------
      | 16. NORMAL DASHBOARD TOP BAR
      |--------------------------------------------------------------------------
      */}

      <View
        style={[
          styles.headerRow,
          {
            top: topInset + 7,
            paddingHorizontal: 16,
            zIndex: 50,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open dashboard menu"
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [
            styles.hamburgerButton,
            {
              backgroundColor: navy,
              opacity: pressed ? 0.78 : 1,
            },
          ]}
        >
          <Ionicons
            name="menu"
            size={24}
            color="#FFFFFF"
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            earningsVisible
              ? "Show today's earnings details"
              : "Open earnings details"
          }
          accessibilityState={{
            expanded: earningsExpanded,
          }}
          onPress={() =>
            setEarningsExpanded((current) => !current)
          }
          style={({ pressed }) => [
            styles.earningsPill,
            {
              backgroundColor: navy,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          {earningsVisible ? (
            <>
              <Text style={styles.earningsPillAmount}>
                {DASHBOARD_EARNINGS_PLACEHOLDER}
              </Text>

              <Text style={styles.earningsPillToday}>
                Today
              </Text>
            </>
          ) : null}
        </Pressable>

        <View style={styles.headerRightSpacer} />
      </View>

      {/*
      |--------------------------------------------------------------------------
      | 17. EARNINGS DETAILS
      |--------------------------------------------------------------------------
      */}

      {earningsExpanded ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close earnings overlay"
            onPress={() => setEarningsExpanded(false)}
            style={styles.earningsDismiss}
          />

          <View
            style={[
              styles.earningsOverlay,
              {
                top: topInset + 68,
                backgroundColor: navy,
                borderColor: outlineColor,
              },
            ]}
          >
            <View style={styles.earningsOverlayHeader}>
              <View>
                <Text style={styles.earningsOverlayEyebrow}>
                  TODAY
                </Text>

                <Text style={styles.earningsOverlayValue}>
                  {DASHBOARD_EARNINGS_PLACEHOLDER}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  earningsVisible
                    ? "Hide earnings on dashboard"
                    : "Show earnings on dashboard"
                }
                onPress={() =>
                  setEarningsVisible((current) => !current)
                }
                hitSlop={10}
                style={({ pressed }) => [
                  styles.eyeButton,
                  {
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={
                    earningsVisible
                      ? "eye-off-outline"
                      : "eye-outline"
                  }
                  size={21}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>

            <Text style={styles.earningsOverlayHint}>
              {earningsVisible
                ? "Tap the eye to hide the amount on the dashboard."
                : "Your dashboard amount is hidden. Your earnings details remain visible here."}
            </Text>
          </View>
        </>
      ) : null}

      {/*
      |--------------------------------------------------------------------------
      | 18. BOTTOM DASHBOARD OVERLAY / FULL-SCREEN HUB
      |--------------------------------------------------------------------------
      |
      | One continuous sheet.
      | The original dashboard map remains underneath.
      |
      */}

      {!activeErrand ? (
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              height: windowHeight,
              backgroundColor: colors.surface,
              borderColor: outlineColor,
              zIndex: 90,
              elevation: 30,
              transform: [
                {
                  translateY: sheetTranslateY,
                },
              ],
            },
          ]}
        >
          {/*
          |--------------------------------------------------------------------------
          | 19. UPPER DRAG AREA
          |--------------------------------------------------------------------------
          |
          | Everything in this section controls sheet movement.
          | Quick Access is deliberately outside this responder.
          |
          */}

          <View
            {...sheetPanResponder.panHandlers}
            style={[
              styles.sheetDragArea,
              {
                paddingTop: safeTop + 6,
              },
            ]}
          >
            {/* Sheet handle */}

            <View style={styles.sheetHandleArea}>
              <View
                style={[
                  styles.sheetHandle,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.62)"
                      : colors.borderStrong,
                  },
                ]}
              />
            </View>

            {/*
            |--------------------------------------------------------------------------
            | 20. AVAILABILITY / RUNNER HUB TRANSITION SLOT
            |--------------------------------------------------------------------------
            */}

            <View style={styles.transitionSlot}>
              {/* Compact availability slider */}

              <Animated.View
                pointerEvents={expanded ? "none" : "auto"}
                style={[
                  styles.availabilityLayer,
                  {
                    opacity: availabilityOpacity,
                  },
                ]}
              >
                <AvailabilitySlider
                  isOnline={isOnline}
                  disabled={availabilityDisabled}
                  busy={availabilityBusy}
                  onToggle={onToggleAvailability}
                />
              </Animated.View>

              {/* Runner Hub title */}

              <Animated.View
                pointerEvents={expanded ? "auto" : "none"}
                style={[
                  styles.hubTitleLayer,
                  {
                    opacity: hubHeaderOpacity,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.hubTitle,
                    {
                      color: colors.text,
                    },
                  ]}
                >
                  Runner Hub
                </Text>
              </Animated.View>
            </View>

            {/*
            |--------------------------------------------------------------------------
            | 21. COMPACT OFFERS & REWARDS / EXPANDED PERFORMANCE
            |--------------------------------------------------------------------------
            |
            | The Offers & Rewards card occupies the same transition
            | region that reveals the Performance content.
            |
            | This avoids leaving an empty card-sized gap in the hub.
            |--------------------------------------------------------------------------
            */}

            <View style={styles.transitionContentRegion}>
              {/* Compact Offers & Rewards shortcut */}

              <Animated.View
                pointerEvents={expanded ? "none" : "auto"}
                style={[
                  styles.compactOffersLayer,
                  {
                    opacity: compactOffersOpacity,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    offersCount > 0
                      ? `Offers and Rewards. ${offersCount} eligible errands`
                      : "Offers and Rewards"
                  }
                  onPress={openOffersAndRewards}
                  style={({ pressed }) => [
                    styles.offersRewardsCard,
                    {
                      borderColor: outlineColor,
                      opacity: pressed ? 0.65 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="gift-outline"
                    size={20}
                    color={colors.blue}
                  />

                  <Text
                    style={[
                      styles.offersRewardsTitle,
                      {
                        color: colors.text,
                      },
                    ]}
                  >
                    Offers & Rewards
                  </Text>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              </Animated.View>

              {/* Expanded performance content */}

              <Animated.View
                pointerEvents={expanded ? "auto" : "none"}
                style={[
                  styles.hubPerformanceContent,
                  {
                    opacity: hubContentOpacity,
                    transform: [
                      {
                        translateY: hubContentTranslate,
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.hubWelcome}>
                  <Text
                    style={[
                      styles.hubWelcomeTitle,
                      { color: colors.text },
                    ]}
                  >
                    Everything in one place.
                  </Text>

                  <Text
                    style={[
                      styles.hubWelcomeSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    Your performance and account at a glance.
                  </Text>
                </View>

                {/*
                |--------------------------------------------------------------------------
                | 22. PERFORMANCE HEADING
                |--------------------------------------------------------------------------
                */}

                <View style={styles.hubSectionHeader}>
                  <Text
                    style={[
                      styles.hubSectionEyebrow,
                      { color: colors.textMuted },
                    ]}
                  >
                    PERFORMANCE
                  </Text>
                </View>

                {/*
                |--------------------------------------------------------------------------
                | 23. PERFORMANCE TIERS CARD
                |--------------------------------------------------------------------------
                |
                | Original Silver tier and progression values are retained.
                | Arrows visually connect the next performance levels.
                |--------------------------------------------------------------------------
                */}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open performance and tier progress"
                  onPress={() => openSection("performance")}
                  style={({ pressed }) => [
                    styles.tierCard,
                    {
                      borderColor: outlineColor,
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <View style={styles.tierCardTop}>
                    <View
                      style={[
                        styles.tierIconWrap,
                        {
                          backgroundColor: isDark
                            ? "rgba(232,197,116,0.13)"
                            : "rgba(154,106,22,0.09)",
                        },
                      ]}
                    >
                      <Ionicons
                        name="trophy-outline"
                        size={23}
                        color={tierGold}
                      />
                    </View>

                    <View style={styles.tierCardCopy}>
                      <Text
                        style={[
                          styles.tierEyebrow,
                          { color: colors.textMuted },
                        ]}
                      >
                        PERFORMANCE TIERS
                      </Text>

                      <Text
                        style={[
                          styles.tierTitle,
                          { color: colors.text },
                        ]}
                      >
                        Silver tier
                      </Text>
                    </View>

                    <Ionicons
                      name="arrow-forward-circle-outline"
                      size={22}
                      color={colors.textMuted}
                    />
                  </View>

                  <View style={styles.tierPointsRow}>
                    <Text
                      style={[
                        styles.tierPointsLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Tier progress
                    </Text>

                    <Text
                      style={[
                        styles.tierPointsValue,
                        { color: colors.text },
                      ]}
                    >
                      200 / 1,000 PTS
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.tierProgressTrack,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.13)"
                          : "#D8E0EA",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.tierProgressFill,
                        {
                          backgroundColor: tierGold,
                          width: "20%",
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.tierProgressFooter}>
                    <Text
                      style={[
                        styles.tierProgressCaption,
                        { color: colors.textMuted },
                      ]}
                    >
                      800 points to Gold
                    </Text>

                    <Text
                      style={[
                        styles.tierProgressCaption,
                        { color: colors.textMuted },
                      ]}
                    >
                      20% complete
                    </Text>
                  </View>

                  {/* Tier progression path */}

                  <View style={styles.tierStepsRow}>
                    {PERFORMANCE_TIERS.map((tier, index) => (
                      <View
                        key={tier}
                        style={styles.tierStepItem}
                      >
                        <Text
                          style={[
                            styles.tierStep,
                            {
                              color: index === 0
                                ? colors.text
                                : colors.textMuted,
                            },
                          ]}
                        >
                          {tier}
                        </Text>

                        {index < PERFORMANCE_TIERS.length - 1 ? (
                          <Ionicons
                            name="arrow-forward"
                            size={12}
                            color={colors.textMuted}
                          />
                        ) : null}
                      </View>
                    ))}
                  </View>
                </Pressable>

                {/*
                |--------------------------------------------------------------------------
                | 24. PERFORMANCE METRICS
                |--------------------------------------------------------------------------
                |
                | Rating, Acceptance and Cancellation remain unchanged.
                |--------------------------------------------------------------------------
                */}

                <View style={styles.performanceMetricRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openSection("performance")}
                    style={[
                      styles.performanceMetric,
                      { borderColor: outlineColor },
                    ]}
                  >
                    <Ionicons
                      name="star"
                      size={17}
                      color={tierGold}
                    />

                    <Text
                      style={[
                        styles.performanceMetricValue,
                        { color: colors.text },
                      ]}
                    >
                      —
                    </Text>

                    <Text
                      style={[
                        styles.performanceMetricLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Rating
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openSection("performance")}
                    style={[
                      styles.performanceMetric,
                      { borderColor: outlineColor },
                    ]}
                  >
                    <Ionicons
                      name="trending-up-outline"
                      size={17}
                      color={colors.blue}
                    />

                    <Text
                      style={[
                        styles.performanceMetricValue,
                        { color: colors.text },
                      ]}
                    >
                      —%
                    </Text>

                    <Text
                      style={[
                        styles.performanceMetricLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Acceptance
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openSection("performance")}
                    style={[
                      styles.performanceMetric,
                      { borderColor: outlineColor },
                    ]}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={17}
                      color={colors.red}
                    />

                    <Text
                      style={[
                        styles.performanceMetricValue,
                        { color: colors.text },
                      ]}
                    >
                      —%
                    </Text>

                    <Text
                      style={[
                        styles.performanceMetricLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Cancellation
                    </Text>
                  </Pressable>
                </View>
              </Animated.View>
            </View>
          </View>

          {/*
          |--------------------------------------------------------------------------
          | 25. QUICK ACCESS
          |--------------------------------------------------------------------------
          |
          | Its own ScrollView.
          | Scrolling the list does not move the entire dashboard sheet.
          |--------------------------------------------------------------------------
          */}

          <Animated.View
            pointerEvents={expanded ? "auto" : "none"}
            style={[
              styles.quickAccessSection,
              {
                opacity: quickAccessOpacity,
                paddingBottom: safeBottom + 10,
              },
            ]}
          >
            <View style={styles.hubSectionHeader}>
              <Text
                style={[
                  styles.hubSectionEyebrow,
                  { color: colors.textMuted },
                ]}
              >
                QUICK ACCESS
              </Text>
            </View>

            <ScrollView
              style={styles.quickAccessScroll}
              contentContainerStyle={styles.quickAccessContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <HubAccessRow
                icon="wallet-outline"
                title="Earnings"
                subtitle="Payouts and history"
                outlineColor={outlineColor}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("earnings")}
              />

              <HubAccessRow
                icon="settings-outline"
                title="Settings"
                subtitle="App preferences"
                outlineColor={outlineColor}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("settings")}
              />

              <HubAccessRow
                icon="shield-checkmark-outline"
                title="Privacy"
                subtitle="Location and privacy"
                outlineColor={outlineColor}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("privacy")}
              />

              <HubAccessRow
                icon="person-circle-outline"
                title="Runner profile"
                subtitle="Profile and documents"
                outlineColor={outlineColor}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("menu")}
              />

              <HubAccessRow
                icon="headset-outline"
                title="Help & support"
                subtitle="Get help and assistance"
                outlineColor={outlineColor}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("help")}
              />

              <HubAccessRow
                icon="grid-outline"
                title="Account menu"
                subtitle="Account actions"
                outlineColor={outlineColor}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("menu")}
              />
            </ScrollView>
          </Animated.View>
        </Animated.View>
      ) : null}

      {/*
      |--------------------------------------------------------------------------
      | 26. DASHBOARD MENU DRAWER
      |--------------------------------------------------------------------------
      */}

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent={false}
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.drawerRoot}>
          <Pressable
            style={styles.drawerBackdrop}
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Close menu"
          />

          <View
            style={[
              styles.drawerPanel,
              {
                backgroundColor: navy,
                paddingTop: safeTop + 22,
                paddingBottom: safeBottom + 18,
                borderColor: outlineColor,
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerBrand}>
                  SaMi Runner
                </Text>

                <Text style={styles.drawerSubtitle}>
                  Consider it done.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                onPress={() => setMenuOpen(false)}
                style={styles.drawerClose}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>

            <View style={styles.drawerDivider} />

            <DrawerItem
              icon="speedometer-outline"
              label="Performance"
              onPress={() => openSection("performance")}
            />

            <DrawerItem
              icon="wallet-outline"
              label="Earnings"
              onPress={() => openSection("earnings")}
            />

            <DrawerItem
              icon="settings-outline"
              label="Settings"
              onPress={() => openSection("settings")}
            />

            <DrawerItem
              icon="shield-checkmark-outline"
              label="Privacy"
              onPress={() => openSection("privacy")}
            />

            <DrawerItem
              icon="grid-outline"
              label="Runner profile & account"
              onPress={() => openSection("menu")}
            />

            <DrawerItem
              icon="headset-outline"
              label="Help & support"
              onPress={() => openSection("help")}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| 27. AVAILABILITY SLIDER
|--------------------------------------------------------------------------
|
| Online:
|   Red track, Go offline.
|   Thumb begins on the left.
|   Slide RIGHT to go offline.
|
| Offline:
|   Blue track, Go online.
|   Thumb begins on the right.
|   Slide LEFT to go online.
|
| No tap action is provided.
|--------------------------------------------------------------------------
*/

function AvailabilitySlider({
  isOnline,
  disabled,
  busy,
  onToggle,
}: {
  isOnline: boolean;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const thumbTranslateX = useRef(
    new Animated.Value(0),
  ).current;

  const thumbStartLeft = isOnline
    ? SLIDER_INSET
    : SLIDER_WIDTH - SLIDER_THUMB_SIZE - SLIDER_INSET;

  const label = isOnline ? "Go offline" : "Go online";

  const trackColor = isOnline
    ? AVAILABILITY_RED
    : "#1558B0";

  /*
  |--------------------------------------------------------------------------
  | SLIDER RESET
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!busy) {
      Animated.spring(thumbTranslateX, {
        toValue: 0,
        damping: 19,
        stiffness: 240,
        useNativeDriver: true,
      }).start();
    }
  }, [isOnline, busy, thumbTranslateX]);

  /*
  |--------------------------------------------------------------------------
  | HORIZONTAL DRAG
  |--------------------------------------------------------------------------
  */

  const sliderPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (_event, gesture) =>
          !disabled &&
          Math.abs(gesture.dx) > 5 &&
          Math.abs(gesture.dx) >
            Math.abs(gesture.dy) * 1.1,

        onPanResponderGrant: () => {
          thumbTranslateX.stopAnimation();
        },

        onPanResponderMove: (_event, gesture) => {
          const position = isOnline
            ? Math.max(
                0,
                Math.min(SLIDER_MAX_DISTANCE, gesture.dx),
              )
            : Math.max(
                -SLIDER_MAX_DISTANCE,
                Math.min(0, gesture.dx),
              );

          thumbTranslateX.setValue(position);
        },

        onPanResponderRelease: (_event, gesture) => {
          const completed = isOnline
            ? (
                gesture.dx >= SLIDER_MAX_DISTANCE * 0.5 ||
                gesture.vx > 0.7
              )
            : (
                gesture.dx <= -SLIDER_MAX_DISTANCE * 0.5 ||
                gesture.vx < -0.7
              );

          if (completed && !disabled) {
            Animated.spring(thumbTranslateX, {
              toValue: isOnline
                ? SLIDER_MAX_DISTANCE
                : -SLIDER_MAX_DISTANCE,
              damping: 18,
              stiffness: 230,
              useNativeDriver: true,
            }).start();

            onToggle();
          } else {
            Animated.spring(thumbTranslateX, {
              toValue: 0,
              damping: 19,
              stiffness: 240,
              useNativeDriver: true,
            }).start();
          }
        },

        onPanResponderTerminate: () => {
          Animated.spring(thumbTranslateX, {
            toValue: 0,
            damping: 19,
            stiffness: 240,
            useNativeDriver: true,
          }).start();
        },

        onPanResponderTerminationRequest: () => false,
      }),
    [
      disabled,
      isOnline,
      onToggle,
      thumbTranslateX,
    ],
  );

  return (
    <Animated.View
      {...sliderPanResponder.panHandlers}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={
        isOnline
          ? "Slide right to go offline."
          : "Slide left to go online."
      }
      accessibilityState={{
        checked: isOnline,
        disabled,
      }}
      style={[
        styles.availabilityTrack,
        {
          width: SLIDER_WIDTH,
          height: SLIDER_HEIGHT,
          backgroundColor: trackColor,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <Text
        pointerEvents="none"
        style={styles.availabilityText}
      >
        {label}
      </Text>

      <Animated.View
        style={[
          styles.availabilityThumb,
          {
            left: thumbStartLeft,
            width: SLIDER_THUMB_SIZE,
            height: SLIDER_THUMB_SIZE,
            transform: [
              {
                translateX: thumbTranslateX,
              },
            ],
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator
            size="small"
            color="#000535"
          />
        ) : (
          <Ionicons
            name={
              isOnline
                ? "chevron-forward"
                : "chevron-back"
            }
            size={21}
            color="#000535"
          />
        )}
      </Animated.View>
    </Animated.View>
  );
}

/*
|--------------------------------------------------------------------------
| 28. QUICK ACCESS LIST ROW
|--------------------------------------------------------------------------
*/

function HubAccessRow({
  icon,
  title,
  subtitle,
  onPress,
  outlineColor,
  textColor,
  mutedColor,
  iconColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  outlineColor: string;
  textColor: string;
  mutedColor: string;
  iconColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hubAccessRow,
        {
          borderColor: outlineColor,
          opacity: pressed ? 0.68 : 1,
        },
      ]}
    >
      <View style={styles.hubAccessIcon}>
        <Ionicons
          name={icon}
          size={21}
          color={iconColor}
        />
      </View>

      <View style={styles.hubAccessCopy}>
        <Text
          style={[
            styles.hubAccessTitle,
            { color: textColor },
          ]}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.hubAccessSubtitle,
            { color: mutedColor },
          ]}
        >
          {subtitle}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={mutedColor}
      />
    </Pressable>
  );
}

/*
|--------------------------------------------------------------------------
| 29. MENU DRAWER ITEM
|--------------------------------------------------------------------------
*/

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
      style={({ pressed }) => [
        styles.drawerItem,
        {
          backgroundColor: pressed
            ? "rgba(255,255,255,0.16)"
            : "transparent",
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={21}
        color="#FFFFFF"
      />

      <Text style={styles.drawerItemText}>
        {label}
      </Text>

      <Ionicons
        name="chevron-forward"
        size={17}
        color="rgba(255,255,255,0.72)"
      />
    </Pressable>
  );
}

/*
|--------------------------------------------------------------------------
| 30. STYLES
|--------------------------------------------------------------------------
*/

const styles = StyleSheet.create({

  /*
  |--------------------------------------------------------------------------
  | TOP DASHBOARD OVERLAY
  |--------------------------------------------------------------------------
  */

  headerRow: {
    position: "absolute",
    left: 0,
    right: 0,
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

  headerRightSpacer: {
    width: 44,
    height: 44,
  },

  /*
  |--------------------------------------------------------------------------
  | EARNINGS
  |--------------------------------------------------------------------------
  */

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

  earningsPillAmount: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  earningsPillToday: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
  },

earningsDismiss: {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 40,
  backgroundColor: "rgba(0,0,0,0.08)",
},
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

  earningsOverlayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  earningsOverlayEyebrow: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  earningsOverlayValue: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
  },

  eyeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  earningsOverlayHint: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    lineHeight: 16,
  },

  /*
  |--------------------------------------------------------------------------
  | MAIN BOTTOM SHEET
  |--------------------------------------------------------------------------
  */

  bottomSheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },

  sheetDragArea: {
    flexShrink: 0,
    paddingHorizontal: 18,
  },

  sheetHandleArea: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  sheetHandle: {
    width: 39,
    height: 4,
    borderRadius: 4,
  },

  /*
  |--------------------------------------------------------------------------
  | AVAILABILITY / HUB HEADER
  |--------------------------------------------------------------------------
  */

  transitionSlot: {
    height: 50,
    marginTop: 4,
    position: "relative",
    justifyContent: "center",
  },

  availabilityLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    alignItems: "flex-start",
    justifyContent: "center",
    height: 50,
  },

  availabilityTrack: {
    borderRadius: 999,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  availabilityText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.1,
  },

  availabilityThumb: {
    position: "absolute",
    top: SLIDER_INSET,
    borderRadius: SLIDER_THUMB_SIZE / 2,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },

  hubTitleLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 50,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  hubTitle: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "900",
    letterSpacing: -0.45,
  },

  /*
  |--------------------------------------------------------------------------
  | COMPACT OFFERS & REWARDS
  |--------------------------------------------------------------------------
  */

  transitionContentRegion: {
    position: "relative",
    marginTop: 8,
  },

  compactOffersLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },

  offersRewardsCard: {
    width: "100%",
    height: 48,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "transparent",
  },

  offersRewardsTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
  },

  /*
  |--------------------------------------------------------------------------
  | RUNNER HUB PERFORMANCE CONTENT
  |--------------------------------------------------------------------------
  */

  hubPerformanceContent: {
    gap: 12,
    paddingBottom: 12,
  },

  hubWelcome: {
    gap: 3,
    paddingBottom: 2,
  },

  hubWelcomeTitle: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },

  hubWelcomeSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
  },

  hubSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },

  hubSectionEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.25,
  },

  /*
  |--------------------------------------------------------------------------
  | PERFORMANCE TIER CARD
  |--------------------------------------------------------------------------
  */

  tierCard: {
    borderWidth: 1,
    borderRadius: 19,
    padding: 14,
    gap: 12,
    backgroundColor: "transparent",
  },

  tierCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  tierIconWrap: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  tierCardCopy: {
    flex: 1,
    gap: 4,
  },

  tierEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  tierTitle: {
    fontSize: 15,
    fontWeight: "900",
  },

  tierPointsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  tierPointsLabel: {
    fontSize: 10,
    fontWeight: "700",
  },

  tierPointsValue: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  tierProgressTrack: {
    height: 7,
    borderRadius: 5,
    overflow: "hidden",
  },

  tierProgressFill: {
    height: "100%",
    borderRadius: 5,
  },

  tierProgressFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },

  tierProgressCaption: {
    fontSize: 9,
    fontWeight: "700",
  },

  tierStepsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 3,
  },

  tierStepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },

  tierStep: {
    fontSize: 9,
    fontWeight: "800",
  },

  /*
  |--------------------------------------------------------------------------
  | RATING / ACCEPTANCE / CANCELLATION
  |--------------------------------------------------------------------------
  */

  performanceMetricRow: {
    flexDirection: "row",
    gap: 8,
  },

  performanceMetric: {
    flex: 1,
    minHeight: 83,
    borderRadius: 15,
    borderWidth: 1,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 9,
    gap: 4,
  },

  performanceMetricValue: {
    fontSize: 17,
    fontWeight: "900",
  },

  performanceMetricLabel: {
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },

  /*
  |--------------------------------------------------------------------------
  | QUICK ACCESS SECTION
  |--------------------------------------------------------------------------
  */

  quickAccessSection: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 10,
  },

  quickAccessScroll: {
    flex: 1,
    minHeight: 0,
  },

  quickAccessContent: {
    gap: 9,
    paddingBottom: 10,
  },

  hubAccessRow: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "transparent",
  },

  hubAccessIcon: {
    width: 29,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },

  hubAccessCopy: {
    flex: 1,
    gap: 3,
  },

  hubAccessTitle: {
    fontSize: 12,
    fontWeight: "900",
  },

  hubAccessSubtitle: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
  },

  /*
  |--------------------------------------------------------------------------
  | MENU DRAWER
  |--------------------------------------------------------------------------
  */

  drawerRoot: {
    flex: 1,
    flexDirection: "row",
  },

  drawerBackdrop: {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundColor: "rgba(0,0,0,0.58)",
},
  drawerPanel: {
    width: "82%",
    maxWidth: 340,
    minHeight: "100%",
    borderRightWidth: 1,
    paddingHorizontal: 17,
    gap: 8,
    elevation: 24,
  },

  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  drawerBrand: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.4,
  },

  drawerSubtitle: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 11,
    marginTop: 3,
  },

  drawerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  drawerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.23)",
    marginBottom: 8,
  },

  drawerItem: {
    minHeight: 52,
    borderRadius: 13,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  drawerItemText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});