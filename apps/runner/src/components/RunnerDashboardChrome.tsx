
/*
|--------------------------------------------------------------------------
| 1. IMPORTS
|--------------------------------------------------------------------------
*/

import { useEffect, useMemo, useRef, useState } from "react";

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
| 2. DASHBOARD SECTION TYPES
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

const AVAILABILITY_WIDTH = 188;
const AVAILABILITY_HEIGHT = 46;

const AVAILABILITY_THUMB_SIZE = 36;
const AVAILABILITY_THUMB_INSET = 5;

const AVAILABILITY_MAX_DRAG =
  AVAILABILITY_WIDTH -
  AVAILABILITY_THUMB_SIZE -
  AVAILABILITY_THUMB_INSET * 2;

const OFFLINE_BLUE = "#1558B0";
const ONLINE_RED = "#B42318";

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
  | 5. WINDOW AND SAFE AREA
  |--------------------------------------------------------------------------
  */

  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const safeTop = Math.max(topInset, insets.top, 0);
  const safeBottom = Math.max(bottomInset, insets.bottom, 0);

  /*
  |--------------------------------------------------------------------------
  | 6. THEME
  |--------------------------------------------------------------------------
  */

  const { colors, showOverlay, isDark } = useRunnerTheme();

  const navy = colors.brandNavy || "#000535";

  // Consistent faint grey outline across the dashboard cards.
  const outlineColor = isDark
    ? "rgba(192,203,217,0.30)"
    : "rgba(70,86,107,0.30)";

  const gold = isDark ? "#E8C574" : "#9A6A16";

  /*
  |--------------------------------------------------------------------------
  | 7. LOCAL INTERFACE STATE
  |--------------------------------------------------------------------------
  */

  const [earningsExpanded, setEarningsExpanded] = useState(false);
  const [earningsVisible, setEarningsVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | 8. COMPACT SHEET GEOMETRY
  |--------------------------------------------------------------------------
  |
  | The compact sheet contains exactly:
  |
  | Availability slider
  | Offers & Rewards
  |
  | No additional handle, extra cards or footer.
  |
  */

  const compactSheetHeight =
    12 +
    AVAILABILITY_HEIGHT +
    10 +
    50 +
    safeBottom +
    12;

  const sheetTravel = Math.max(
    1,
    windowHeight - compactSheetHeight,
  );

  /*
  |--------------------------------------------------------------------------
  | 9. SINGLE SHARED ANIMATION VALUE
  |--------------------------------------------------------------------------
  |
  | Every dashboard transition is derived from this value.
  |
  | 0 = Normal dashboard
  | 1 = Full-screen Runner Hub
  |
  | There are no independent delayed animations for Offers,
  | Availability or the Runner Hub.
  |
  */

  const sheetProgress = useRef(
    new Animated.Value(expanded ? 1 : 0),
  ).current;

  const sheetStartProgress = useRef(
    expanded ? 1 : 0,
  );

  /*
  |--------------------------------------------------------------------------
  | 10. SHEET MOVEMENT
  |--------------------------------------------------------------------------
  */

  const sheetTranslateY = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetTravel, 0],
    extrapolate: "clamp",
  });

  /*
  |--------------------------------------------------------------------------
  | 11. COMPACT DASHBOARD FADE
  |--------------------------------------------------------------------------
  |
  | Availability and the single Offers & Rewards card use
  | precisely the same opacity.
  |
  | The fade starts as the sheet approaches the middle.
  |--------------------------------------------------------------------------
  */

  const compactOpacity = sheetProgress.interpolate({
    inputRange: [
      0,
      0.45,
      0.72,
      1,
    ],
    outputRange: [
      1,
      1,
      0,
      0,
    ],
    extrapolate: "clamp",
  });

  /*
  |--------------------------------------------------------------------------
  | 12. COMPACT CONTENT MOVEMENT
  |--------------------------------------------------------------------------
  |
  | The compact controls remain together as the sheet moves.
  | Their position transitions to the top safe area.
  |--------------------------------------------------------------------------
  */

  const compactContentTranslateY = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [12, safeTop + 12],
    extrapolate: "clamp",
  });

  /*
  |--------------------------------------------------------------------------
  | 13. RUNNER HUB FADE
  |--------------------------------------------------------------------------
  |
  | Runner Hub begins appearing as the compact controls fade.
  | Reversing the gesture reverses the same animation.
  |--------------------------------------------------------------------------
  */

  const hubOpacity = sheetProgress.interpolate({
    inputRange: [
      0,
      0.46,
      0.72,
      1,
    ],
    outputRange: [
      0,
      0,
      0.88,
      1,
    ],
    extrapolate: "clamp",
  });

  /*
  |--------------------------------------------------------------------------
  | 14. CONTROLLED ANIMATION SYNC
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
  | 15. VERTICAL SWIPE / PAGE TRANSITION
  |--------------------------------------------------------------------------
  |
  | The sheet follows the finger.
  |
  | Swipe UP:
  |   Opens Runner Hub.
  |
  | Swipe DOWN:
  |   Returns to normal dashboard.
  |
  | This gesture is attached to the upper dashboard area,
  | NOT to the independent Quick Access list.
  |--------------------------------------------------------------------------
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
          let nextExpanded = expanded;

          if (
            !expanded &&
            (
              gesture.dy < -55 ||
              gesture.vy < -0.48
            )
          ) {
            nextExpanded = true;
          }

          if (
            expanded &&
            (
              gesture.dy > 55 ||
              gesture.vy > 0.48
            )
          ) {
            nextExpanded = false;
          }

          if (nextExpanded !== expanded) {
            onExpandedChange(nextExpanded);
          } else {
            // An incomplete swipe returns to its original state.
            Animated.spring(sheetProgress, {
              toValue: expanded ? 1 : 0,
              ...runnerMotion.spring,
              useNativeDriver: true,
            }).start();
          }
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
  | 16. AVAILABILITY RULES
  |--------------------------------------------------------------------------
  */

  const availabilityDisabled =
    !authorized ||
    !canChangeAvailability ||
    availabilityBusy ||
    activeErrand;

  /*
  |--------------------------------------------------------------------------
  | 17. ERROR HANDLING
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
  | 18. NAVIGATION
  |--------------------------------------------------------------------------
  */

  const openSection = (section: RunnerDashboardSection) => {
    setMenuOpen(false);
    onOpenSection(section);
  };

  /*
  |--------------------------------------------------------------------------
  | 19. NORMAL DASHBOARD AND FULL-SCREEN PAGE
  |--------------------------------------------------------------------------
  */

  return (
    <View
      pointerEvents="box-none"
      style={styles.root}
    >
      {/*
      |--------------------------------------------------------------------------
      | 20. STATUS BAR
      |--------------------------------------------------------------------------
      |
      | The system status bar remains visible throughout.
      | Its visibility is NOT linked to the sheet animation.
      |--------------------------------------------------------------------------
      */}

      <StatusBar
        hidden={false}
        barStyle={isDark ? "light-content" : "dark-content"}
      />

      {/*
      |--------------------------------------------------------------------------
      | 21. NORMAL DASHBOARD TOP CONTROLS
      |--------------------------------------------------------------------------
      |
      | These remain on the map dashboard.
      | The expanded Runner Hub will cover them completely.
      |--------------------------------------------------------------------------
      */}

      <View
        style={[
          styles.headerRow,
          {
            top: safeTop + 7,
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
      | 22. EARNINGS DETAILS
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
                top: safeTop + 68,
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
                    backgroundColor: "rgba(255,255,255,0.10)",
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
      | 23. CONTINUOUS BOTTOM SHEET
      |--------------------------------------------------------------------------
      |
      | This is the actual full-screen page layer.
      |
      | Collapsed:
      |   Only its bottom portion is visible.
      |
      | Expanded:
      |   It covers the map, hamburger and earnings overlay.
      |
      | There is no extra page margin, side gap or grab handle.
      |--------------------------------------------------------------------------
      */}

      {!activeErrand ? (
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              height: windowHeight,
              backgroundColor: colors.surface,

              borderTopLeftRadius: expanded ? 0 : 25,
              borderTopRightRadius: expanded ? 0 : 25,
              borderTopWidth: expanded ? 0 : 1,
              borderColor: outlineColor,

              zIndex: 100,
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
          | 24. COMPACT DASHBOARD CONTENT
          |--------------------------------------------------------------------------
          |
          | Only two controls:
          |
          | 1. Availability
          | 2. Offers & Rewards
          |
          | They fade out together during expansion.
          |--------------------------------------------------------------------------
          */}

          <Animated.View
            {...sheetPanResponder.panHandlers}
            pointerEvents={expanded ? "none" : "auto"}
            style={[
              styles.compactLayer,
              {
                height: compactSheetHeight,
                paddingBottom: safeBottom + 12,
                opacity: compactOpacity,
                transform: [
                  {
                    translateY: compactContentTranslateY,
                  },
                ],
              },
            ]}
          >
            {/*
            |--------------------------------------------------------------------------
            | 25. CENTRED AVAILABILITY
            |--------------------------------------------------------------------------
            */}

            <View style={styles.availabilityContainer}>
              <AvailabilityControl
                isOnline={isOnline}
                disabled={availabilityDisabled}
                busy={availabilityBusy}
                onToggle={onToggleAvailability}
              />
            </View>

            {/*
            |--------------------------------------------------------------------------
            | 26. ONE OFFERS & REWARDS CARD
            |--------------------------------------------------------------------------
            */}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                offersCount > 0
                  ? `Offers and Rewards, ${offersCount} eligible errands`
                  : "Offers and Rewards"
              }
              onPress={() => openSection("offers")}
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
                size={21}
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

              {offersCount > 0 ? (
                <Text
                  style={[
                    styles.offersRewardsCount,
                    { color: colors.textMuted },
                  ]}
                >
                  {offersCount}
                </Text>
              ) : null}

              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          </Animated.View>

          {/*
          |--------------------------------------------------------------------------
          | 27. FULL-SCREEN RUNNER HUB
          |--------------------------------------------------------------------------
          |
          | One uninterrupted page.
          | No SaMi Runner heading.
          | No duplicate availability badge.
          | No View details link.
          |--------------------------------------------------------------------------
          */}

          <Animated.View
            pointerEvents={expanded ? "auto" : "none"}
            style={[
              styles.hubPage,
              {
                paddingTop: safeTop + 14,
                paddingBottom: safeBottom + 8,
                opacity: hubOpacity,
              },
            ]}
          >
            {/*
            |--------------------------------------------------------------------------
            | 28. RUNNER HUB PERFORMANCE AREA
            |--------------------------------------------------------------------------
            |
            | Vertical drag gestures in this area collapse the page.
            | Its contents are not independently scrolled.
            |--------------------------------------------------------------------------
            */}

            <View
              {...sheetPanResponder.panHandlers}
              style={styles.hubPerformanceArea}
            >
              {/* Hub page heading */}

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

              {/*
              |--------------------------------------------------------------------------
              | 29. PERFORMANCE HEADING
              |--------------------------------------------------------------------------
              */}

              <View style={styles.performanceHeading}>
                <Text
                  style={[
                    styles.sectionHeading,
                    {
                      color: colors.text,
                    },
                  ]}
                >
                  Performance
                </Text>
              </View>

              {/*
              |--------------------------------------------------------------------------
              | 30. PERFORMANCE TIERS CARD
              |--------------------------------------------------------------------------
              |
              | Existing Silver tier and progress remain unchanged.
              | Arrows show the path to the next levels.
              |--------------------------------------------------------------------------
              */}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open performance and tier progress"
                onPress={() => openSection("performance")}
                style={({ pressed }) => [
                  styles.tierCard,
                  {
                    backgroundColor: isDark
                      ? "#071329"
                      : "#F2F5FA",
                    borderColor: outlineColor,
                    opacity: pressed ? 0.86 : 1,
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
                      size={22}
                      color={gold}
                    />
                  </View>

                  <View style={styles.tierCardCopy}>
                    <Text
                      style={[
                        styles.tierEyebrow,
                        {
                          color: colors.textMuted,
                        },
                      ]}
                    >
                      PERFORMANCE TIERS
                    </Text>

                    <Text
                      style={[
                        styles.tierTitle,
                        {
                          color: colors.text,
                        },
                      ]}
                    >
                      Silver tier
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={19}
                    color={colors.textMuted}
                  />
                </View>

                <View style={styles.tierPointsRow}>
                  <Text
                    style={[
                      styles.tierPointsLabel,
                      {
                        color: colors.textMuted,
                      },
                    ]}
                  >
                    Tier progress
                  </Text>

                  <Text
                    style={[
                      styles.tierPointsValue,
                      {
                        color: colors.text,
                      },
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
                        backgroundColor: isDark
                          ? "#D6B568"
                          : "#A97826",
                        width: "20%",
                      },
                    ]}
                  />
                </View>

                <View style={styles.tierProgressFooter}>
                  <Text
                    style={[
                      styles.tierProgressCaption,
                      {
                        color: colors.textMuted,
                      },
                    ]}
                  >
                    800 points to Gold
                  </Text>

                  <Text
                    style={[
                      styles.tierProgressCaption,
                      {
                        color: colors.textMuted,
                      },
                    ]}
                  >
                    20% complete
                  </Text>
                </View>

                {/*
                |--------------------------------------------------------------------------
                | 31. TIER PROGRESSION ARROWS
                |--------------------------------------------------------------------------
                */}

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
                          size={11}
                          color={colors.textMuted}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              </Pressable>

              {/*
              |--------------------------------------------------------------------------
              | 32. PERFORMANCE METRICS
              |--------------------------------------------------------------------------
              |
              | Rating.
              | Acceptance.
              | Cancellation.
              |
              | Existing placeholders and navigation preserved.
              |--------------------------------------------------------------------------
              */}

              <View style={styles.performanceMetricRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openSection("performance")}
                  style={[
                    styles.performanceMetric,
                    {
                      backgroundColor: isDark
                        ? "#071329"
                        : "#F2F5FA",
                      borderColor: outlineColor,
                    },
                  ]}
                >
                  <Ionicons
                    name="star"
                    size={16}
                    color={isDark ? "#F2C66D" : "#A16A13"}
                  />

                  <Text
                    style={[
                      styles.performanceMetricValue,
                      {
                        color: colors.text,
                      },
                    ]}
                  >
                    —
                  </Text>

                  <Text
                    style={[
                      styles.performanceMetricLabel,
                      {
                        color: colors.textMuted,
                      },
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
                    {
                      backgroundColor: isDark
                        ? "#071329"
                        : "#F2F5FA",
                      borderColor: outlineColor,
                    },
                  ]}
                >
                  <Ionicons
                    name="trending-up-outline"
                    size={16}
                    color={colors.blue}
                  />

                  <Text
                    style={[
                      styles.performanceMetricValue,
                      {
                        color: colors.text,
                      },
                    ]}
                  >
                    —%
                  </Text>

                  <Text
                    style={[
                      styles.performanceMetricLabel,
                      {
                        color: colors.textMuted,
                      },
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
                    {
                      backgroundColor: isDark
                        ? "#071329"
                        : "#F2F5FA",
                      borderColor: outlineColor,
                    },
                  ]}
                >
                  <Ionicons
                    name="close-circle-outline"
                    size={16}
                    color={colors.red}
                  />

                  <Text
                    style={[
                      styles.performanceMetricValue,
                      {
                        color: colors.text,
                      },
                    ]}
                  >
                    —%
                  </Text>

                  <Text
                    style={[
                      styles.performanceMetricLabel,
                      {
                        color: colors.textMuted,
                      },
                    ]}
                  >
                    Cancellation
                  </Text>
                </Pressable>
              </View>
            </View>

            {/*
            |--------------------------------------------------------------------------
            | 33. QUICK ACCESS
            |--------------------------------------------------------------------------
            |
            | Separate scrolling area.
            |
            | No "Your tools and account".
            | No grid.
            | No tile backgrounds.
            | Consistent faint grey outlines.
            |--------------------------------------------------------------------------
            */}

            <View style={styles.quickAccessSection}>
              <Text
                style={[
                  styles.quickAccessHeading,
                  {
                    color: colors.text,
                  },
                ]}
              >
                Quick Access
              </Text>

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
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}

      {/*
      |--------------------------------------------------------------------------
      | 34. DASHBOARD MENU
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
| 35. AVAILABILITY CONTROL
|--------------------------------------------------------------------------
|
| OFFLINE:
|   Blue "Go online" button.
|   Tapping it invokes the existing availability callback.
|
| ONLINE:
|   Red "Go offline" slider.
|   Sliding its thumb to the RIGHT invokes the callback.
|
| There is no left-slide-to-go-online behaviour.
|--------------------------------------------------------------------------
*/

function AvailabilityControl({
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

  /*
  |--------------------------------------------------------------------------
  | 36. RESET SLIDER AFTER AVAILABILITY REQUEST
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (busy) return;

    Animated.spring(thumbTranslateX, {
      toValue: 0,
      damping: 19,
      stiffness: 240,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [isOnline, busy, thumbTranslateX]);

  /*
  |--------------------------------------------------------------------------
  | 37. HORIZONTAL RIGHT-SLIDE GESTURE
  |--------------------------------------------------------------------------
  |
  | This gesture is only used while ONLINE.
  |--------------------------------------------------------------------------
  */

  const sliderPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (_event, gesture) =>
          isOnline &&
          !disabled &&
          Math.abs(gesture.dx) > 5 &&
          Math.abs(gesture.dx) >
            Math.abs(gesture.dy) * 1.15,

        onPanResponderGrant: () => {
          thumbTranslateX.stopAnimation();
        },

        onPanResponderMove: (_event, gesture) => {
          const nextPosition = Math.max(
            0,
            Math.min(
              AVAILABILITY_MAX_DRAG,
              gesture.dx,
            ),
          );

          // Negative movement never changes availability.
          thumbTranslateX.setValue(nextPosition);
        },

        onPanResponderRelease: (_event, gesture) => {
          const completed =
            gesture.dx >= AVAILABILITY_MAX_DRAG * 0.45 ||
            gesture.vx > 0.7;

          if (completed && !disabled) {
            Animated.spring(thumbTranslateX, {
              toValue: AVAILABILITY_MAX_DRAG,
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
      isOnline,
      disabled,
      onToggle,
      thumbTranslateX,
    ],
  );

  /*
  |--------------------------------------------------------------------------
  | 38. OFFLINE: GO ONLINE IS A TAP
  |--------------------------------------------------------------------------
  */

  if (!isOnline) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go online"
        disabled={disabled}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.availabilityButton,
          {
            width: AVAILABILITY_WIDTH,
            height: AVAILABILITY_HEIGHT,
            backgroundColor: OFFLINE_BLUE,
            opacity: disabled
              ? 0.55
              : pressed
                ? 0.82
                : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator
            color="#FFFFFF"
            size="small"
          />
        ) : (
          <Text style={styles.availabilityText}>
            Go online
          </Text>
        )}
      </Pressable>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | 39. ONLINE: GO OFFLINE IS A RIGHT-SWIPE
  |--------------------------------------------------------------------------
  */

  return (
    <Animated.View
      {...sliderPanResponder.panHandlers}
      accessible
      accessibilityRole="switch"
      accessibilityLabel="Go offline"
      accessibilityHint="Slide right to go offline."
      accessibilityState={{
        checked: true,
        disabled,
      }}
      style={[
        styles.availabilitySlider,
        {
          width: AVAILABILITY_WIDTH,
          height: AVAILABILITY_HEIGHT,
          backgroundColor: ONLINE_RED,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <Text
        pointerEvents="none"
        style={styles.availabilityText}
      >
        {busy ? "Updating..." : "Go offline"}
      </Text>

      <Animated.View
        style={[
          styles.availabilityThumb,
          {
            width: AVAILABILITY_THUMB_SIZE,
            height: AVAILABILITY_THUMB_SIZE,
            left: AVAILABILITY_THUMB_INSET,
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
            name="chevron-forward"
            size={20}
            color="#000535"
          />
        )}
      </Animated.View>
    </Animated.View>
  );
}

/*
|--------------------------------------------------------------------------
| 40. QUICK ACCESS ROW
|--------------------------------------------------------------------------
|
| Plain text actions with consistent grey outlines.
| These rows do not use glassmorphism or grid tiles.
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
        styles.quickAccessRow,
        {
          borderColor: outlineColor,
          opacity: pressed ? 0.68 : 1,
        },
      ]}
    >
      <View style={styles.quickAccessIcon}>
        <Ionicons
          name={icon}
          size={21}
          color={iconColor}
        />
      </View>

      <View style={styles.quickAccessCopy}>
        <Text
          style={[
            styles.quickAccessTitle,
            { color: textColor },
          ]}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.quickAccessSubtitle,
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
| 41. DRAWER ITEM
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
| 42. COMPONENT STYLES
|--------------------------------------------------------------------------
*/

const styles = StyleSheet.create({

  /*
  |--------------------------------------------------------------------------
  | ROOT
  |--------------------------------------------------------------------------
  */

  root: {
    ...StyleSheet.absoluteFill,
  },

  /*
  |--------------------------------------------------------------------------
  | DASHBOARD TOP BAR
  |--------------------------------------------------------------------------
  */

  headerRow: {
    position: "absolute",
    left: 16,
    right: 16,
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
    left: 0,
    right: 0,
    bottom: 0,
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
  | FULL-SCREEN SHEET
  |--------------------------------------------------------------------------
  */

  bottomSheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },

  /*
  |--------------------------------------------------------------------------
  | COMPACT DASHBOARD
  |--------------------------------------------------------------------------
  */

  compactLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 0,
    gap: 10,
    alignItems: "stretch",
  },

  availabilityContainer: {
    width: "100%",
    height: AVAILABILITY_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },

  availabilityButton: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  availabilitySlider: {
    position: "relative",
    borderRadius: 999,
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
    top: AVAILABILITY_THUMB_INSET,
    borderRadius: AVAILABILITY_THUMB_SIZE / 2,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },

  /*
  |--------------------------------------------------------------------------
  | ONE OFFERS & REWARDS CARD
  |--------------------------------------------------------------------------
  */

  offersRewardsCard: {
    width: "100%",
    minHeight: 50,
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

  offersRewardsCount: {
    fontSize: 11,
    fontWeight: "800",
  },

  /*
  |--------------------------------------------------------------------------
  | FULL-SCREEN RUNNER HUB PAGE
  |--------------------------------------------------------------------------
  */

  hubPage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    flexDirection: "column",
  },

  hubPerformanceArea: {
    flexShrink: 0,
    gap: 12,
  },

  hubTitle: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: "900",
    letterSpacing: -0.45,
  },

  /*
  |--------------------------------------------------------------------------
  | PERFORMANCE HEADING
  |--------------------------------------------------------------------------
  */

  performanceHeading: {
    marginTop: 2,
    marginBottom: 1,
  },

  sectionHeading: {
    fontSize: 15,
    fontWeight: "900",
  },

  /*
  |--------------------------------------------------------------------------
  | PERFORMANCE TIERS
  |--------------------------------------------------------------------------
  */

  tierCard: {
    borderWidth: 1,
    borderRadius: 19,
    padding: 15,
    gap: 12,
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
  | PERFORMANCE METRICS
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
  | QUICK ACCESS
  |--------------------------------------------------------------------------
  */

  quickAccessSection: {
    flex: 1,
    minHeight: 0,
    paddingTop: 15,
    gap: 10,
  },

  quickAccessHeading: {
    fontSize: 15,
    fontWeight: "900",
  },

  quickAccessScroll: {
    flex: 1,
    minHeight: 0,
  },

  quickAccessContent: {
    gap: 9,
    paddingBottom: 8,
  },

  quickAccessRow: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "transparent",
  },

  quickAccessIcon: {
    width: 32,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  quickAccessCopy: {
    flex: 1,
    gap: 3,
  },

  quickAccessTitle: {
    fontSize: 12,
    fontWeight: "900",
  },

  quickAccessSubtitle: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
  },

  /*
  |--------------------------------------------------------------------------
  | DASHBOARD MENU
  |--------------------------------------------------------------------------
  */

  drawerRoot: {
    flex: 1,
    flexDirection: "row",
  },

  drawerBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
