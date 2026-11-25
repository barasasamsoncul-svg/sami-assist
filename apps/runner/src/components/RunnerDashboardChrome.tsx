
/*
|--------------------------------------------------------------------------
| 1. IMPORTS
|--------------------------------------------------------------------------
*/

import {
  useCallback,
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

// @/theme resolves to apps/runner/src/theme.ts.
import { runnerMotion, useRunnerTheme } from "@/theme";

/*
|--------------------------------------------------------------------------
| 2. SECTION TYPES AND CONSTANTS
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

const DASHBOARD_EARNINGS_PLACEHOLDER = "KSh 2,500";

const AVAILABILITY_TRACK_WIDTH = 188;
const AVAILABILITY_TRACK_HEIGHT = 48;
const AVAILABILITY_THUMB_SIZE = 36;
const AVAILABILITY_THUMB_INSET = 6;

const AVAILABILITY_DRAG_DISTANCE =
  AVAILABILITY_TRACK_WIDTH -
  AVAILABILITY_THUMB_SIZE -
  AVAILABILITY_THUMB_INSET * 2;

const AVAILABILITY_RED = "#B42318";

const PERFORMANCE_TIERS = [
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
] as const;

/*
|--------------------------------------------------------------------------
| 3. MAIN DASHBOARD CHROME
|--------------------------------------------------------------------------
*/

export function SaMiRunnerDashboardChrome({
  topInset,
  bottomInset,
  isOnline,
  authorized,
  canChangeAvailability,
  availabilityBusy,
  expanded,
  onExpandedChange,
  onToggleAvailability,
  onOpenSection,
  offersCount,
  activeErrand,
  error,
  mapError,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const {
    colors,
    showOverlay,
    isDark,
  } = useRunnerTheme();

  /*
  |--------------------------------------------------------------------------
  | 4. THEME AND LAYOUT VALUES
  |--------------------------------------------------------------------------
  */

  const safeTop = Math.max(topInset, insets.top);
  const safeBottom = Math.max(bottomInset, insets.bottom, 0);

  const navy = colors.brandNavy || "#000535";
  const actionBlue = colors.blueAction || "#1558B0";
  const panelBackground = colors.surface;

  // Faint grey outline used consistently throughout the cards.
  const softOutline = isDark
    ? "rgba(192,203,217,0.28)"
    : "rgba(70,86,107,0.28)";

  const tierGold = isDark ? "#E8C574" : "#9A6A16";

  /*
  |--------------------------------------------------------------------------
  | 5. DASHBOARD STATE
  |--------------------------------------------------------------------------
  */

  const [earningsExpanded, setEarningsExpanded] = useState(false);
  const [earningsVisible, setEarningsVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const sheetTranslateY = useRef(
    new Animated.Value(0),
  ).current;

  const availabilitySlideX = useRef(
    new Animated.Value(0),
  ).current;

  const sheetDragStartY = useRef(0);

  const availabilityDisabled =
    !authorized ||
    !canChangeAvailability ||
    availabilityBusy ||
    activeErrand;

  /*
  |--------------------------------------------------------------------------
  | 6. SHEET DIMENSIONS
  |--------------------------------------------------------------------------
  */

  // Compact mode contains:
  // Safe-area spacing + handle + availability + offers/rewards + bottom inset.

  const compactSheetHeight =
    safeTop +
    6 +
    22 +
    56 +
    8 +
    50 +
    safeBottom +
    10;

  // The sheet travels from the bottom of the dashboard to the top.
  const sheetTravel = Math.max(
    1,
    windowHeight - compactSheetHeight + safeTop,
  );

  /*
  |--------------------------------------------------------------------------
  | 7. TRANSITION ANIMATIONS
  |--------------------------------------------------------------------------
  */

  // Availability begins fading as the sheet moves past the middle.
  const availabilityOpacity = sheetTranslateY.interpolate({
    inputRange: [
      0,
      sheetTravel * 0.55,
      sheetTravel,
    ],
    outputRange: [0, 0.35, 1],
    extrapolate: "clamp",
  });

  // Hub title appears as availability disappears.
  const hubHeaderOpacity = sheetTranslateY.interpolate({
    inputRange: [
      0,
      sheetTravel * 0.55,
      sheetTravel,
    ],
    outputRange: [1, 0.55, 0],
    extrapolate: "clamp",
  });

  // Performance content fades in during the transition.
  const hubContentOpacity = sheetTranslateY.interpolate({
    inputRange: [
      0,
      sheetTravel * 0.55,
      sheetTravel,
    ],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  const hubContentTranslateY = sheetTranslateY.interpolate({
    inputRange: [0, sheetTravel],
    outputRange: [0, 9],
    extrapolate: "clamp",
  });

  // Compact Offers and Rewards disappear as the hub expands.
  const compactLinksOpacity = availabilityOpacity;

  const compactLinksHeight = sheetTranslateY.interpolate({
    inputRange: [0, sheetTravel],
    outputRange: [0, 50],
    extrapolate: "clamp",
  });

  /*
  |--------------------------------------------------------------------------
  | 8. SHEET SNAP AND EXPANSION
  |--------------------------------------------------------------------------
  */

  const snapSheet = useCallback(
    (nextExpanded: boolean) => {
      if (nextExpanded !== expanded) {
        onExpandedChange(nextExpanded);
        return;
      }

      Animated.spring(sheetTranslateY, {
        toValue: expanded ? 0 : sheetTravel,
        ...runnerMotion.spring,
        useNativeDriver: true,
      }).start();
    },
    [
      expanded,
      onExpandedChange,
      sheetTranslateY,
      sheetTravel,
    ],
  );

  useEffect(() => {
    Animated.spring(sheetTranslateY, {
      toValue: expanded ? 0 : sheetTravel,
      ...runnerMotion.spring,
      useNativeDriver: true,
    }).start();
  }, [expanded, sheetTravel, sheetTranslateY]);

  /*
  |--------------------------------------------------------------------------
  | 9. VERTICAL SWIPE GESTURE
  |--------------------------------------------------------------------------
  |
  | Collapsed:
  | Swipe UP to expand the complete Runner hub.
  |
  | Expanded:
  | Swipe DOWN from the upper performance area to collapse.
  |
  | Quick Access has its own ScrollView and is deliberately excluded
  | from this gesture responder.
  |--------------------------------------------------------------------------
  */

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 7 &&
          Math.abs(gesture.dy) >
            Math.abs(gesture.dx) * 1.15,

        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value) => {
            sheetDragStartY.current = value;
          });
        },

        onPanResponderMove: (_event, gesture) => {
          const nextPosition =
            sheetDragStartY.current + gesture.dy;

          sheetTranslateY.setValue(
            Math.max(
              0,
              Math.min(sheetTravel, nextPosition),
            ),
          );
        },

        onPanResponderRelease: (_event, gesture) => {
          const swipeUp =
            gesture.dy < -42 ||
            gesture.vy < -0.55;

          const swipeDown =
            gesture.dy > 42 ||
            gesture.vy > 0.55;

          let nextExpanded = expanded;

          if (!expanded && swipeUp) {
            nextExpanded = true;
          }

          if (expanded && swipeDown) {
            nextExpanded = false;
          }

          snapSheet(nextExpanded);
        },

        onPanResponderTerminate: () => {
          snapSheet(expanded);
        },

        onPanResponderTerminationRequest: () => false,
      }),
    [
      expanded,
      sheetTravel,
      sheetTranslateY,
      snapSheet,
    ],
  );

  /*
  |--------------------------------------------------------------------------
  | 10. HORIZONTAL AVAILABILITY SLIDER
  |--------------------------------------------------------------------------
  |
  | ONLINE:
  | Red track, "Go offline".
  | Handle starts LEFT.
  | Swipe RIGHT to go offline.
  |
  | OFFLINE:
  | Blue track, "Go online".
  | Handle starts RIGHT.
  | Swipe LEFT to go online.
  |
  | There is deliberately no tap action.
  |--------------------------------------------------------------------------
  */

  const availabilityLabel = isOnline
    ? "Go offline"
    : "Go online";

  const availabilityPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (_event, gesture) =>
          !availabilityDisabled &&
          Math.abs(gesture.dx) > 5 &&
          Math.abs(gesture.dx) >
            Math.abs(gesture.dy) * 1.1,

        onPanResponderGrant: () => {
          availabilitySlideX.stopAnimation();
        },

        onPanResponderMove: (_event, gesture) => {
          const nextPosition = isOnline
            ? Math.max(
                0,
                Math.min(
                  AVAILABILITY_DRAG_DISTANCE,
                  gesture.dx,
                ),
              )
            : Math.max(
                -AVAILABILITY_DRAG_DISTANCE,
                Math.min(0, gesture.dx),
              );

          availabilitySlideX.setValue(nextPosition);
        },

        onPanResponderRelease: (_event, gesture) => {
          const completed = isOnline
            ? (
                gesture.dx >
                  AVAILABILITY_DRAG_DISTANCE * 0.42 ||
                gesture.vx > 0.7
              )
            : (
                gesture.dx <
                  -AVAILABILITY_DRAG_DISTANCE * 0.42 ||
                gesture.vx < -0.7
              );

          Animated.spring(availabilitySlideX, {
            toValue: 0,
            damping: 19,
            stiffness: 240,
            mass: 0.7,
            useNativeDriver: true,
          }).start();

          if (completed && !availabilityDisabled) {
            onToggleAvailability();
          }
        },

        onPanResponderTerminate: () => {
          Animated.spring(availabilitySlideX, {
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
      availabilityDisabled,
      availabilitySlideX,
      onToggleAvailability,
    ],
  );

  /*
  |--------------------------------------------------------------------------
  | 11. ERROR OVERLAYS
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
  | 12. NAVIGATION HELPERS
  |--------------------------------------------------------------------------
  */

  const openSection = (section: RunnerDashboardSection) => {
    setMenuOpen(false);
    onOpenSection(section);
  };

  const openOffersAndRewards = () => {
    // Both compact shortcuts use the existing combined page.
    openSection("offers");
  };

  /*
  |--------------------------------------------------------------------------
  | 13. MAIN RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <StatusBar
        barStyle="light-content"
        hidden={expanded}
      />

      {/*
      |--------------------------------------------------------------------------
      | 14. DASHBOARD TOP BAR
      |--------------------------------------------------------------------------
      */}

      <View
        style={[
          styles.headerRow,
          {
            top: safeTop + 7,
            paddingHorizontal: 16,
            zIndex: expanded ? 120 : 50,
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
      | 15. EARNINGS DETAILS OVERLAY
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
                borderColor: softOutline,
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
      | 16. ANIMATED BOTTOM SHEET
      |--------------------------------------------------------------------------
      |
      | One continuous sheet.
      | The map remains underneath it.
      | Translation uses the native animation driver.
      |--------------------------------------------------------------------------
      */}

      {!activeErrand ? (
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              top: -safeTop,
              height: windowHeight + safeTop,
              backgroundColor: panelBackground,
              borderTopColor: softOutline,
              zIndex: expanded ? 90 : 35,
              elevation: expanded ? 30 : 22,
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
          | 17. SHEET UPPER REGION
          |--------------------------------------------------------------------------
          |
          | Vertical dragging here controls the full sheet.
          | This includes the availability and performance areas.
          |--------------------------------------------------------------------------
          */}

          <View
            {...sheetPanResponder.panHandlers}
            style={[
              styles.sheetTopDragSurface,
              {
                paddingTop: safeTop + 6,
                paddingHorizontal: 18,
              },
            ]}
          >
            {/* Drag handle. No tap-to-expand action. */}
            <View
              accessible
              accessibilityLabel={
                expanded
                  ? "Swipe down to collapse the Runner hub"
                  : "Swipe up to expand the Runner hub"
              }
              style={styles.sheetHandlePanArea}
            >
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
            | 18. AVAILABILITY / HUB TITLE CROSSFADE
            |--------------------------------------------------------------------------
            */}

            <View style={styles.sheetActionSlot}>
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
                <Animated.View
                  {...availabilityPanResponder.panHandlers}
                  accessible
                  accessibilityRole="switch"
                  accessibilityLabel={availabilityLabel}
                  accessibilityHint={
                    "Slide right to go offline. Slide left to go online."
                  }
                  accessibilityState={{
                    checked: isOnline,
                    disabled: availabilityDisabled,
                  }}
                  style={[
                    styles.availabilityTrack,
                    {
                      width: AVAILABILITY_TRACK_WIDTH,
                      height: AVAILABILITY_TRACK_HEIGHT,
                      backgroundColor: isOnline
                        ? AVAILABILITY_RED
                        : actionBlue,
                      opacity: availabilityDisabled
                        ? 0.55
                        : 1,
                    },
                  ]}
                >
                  <Text style={styles.availabilityLabel}>
                    {availabilityLabel}
                  </Text>

                  <Animated.View
                    style={[
                      styles.availabilityThumb,
                      {
                        width: AVAILABILITY_THUMB_SIZE,
                        height: AVAILABILITY_THUMB_SIZE,
                        left: isOnline ? AVAILABILITY_THUMB_INSET : undefined,
                        right: isOnline ? undefined : AVAILABILITY_THUMB_INSET,
                        transform: [
                          {
                            translateX: availabilitySlideX,
                          },
                        ],
                      },
                    ]}
                  >
                    {availabilityBusy ? (
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
              </Animated.View>

              {/* Expanded hub title */}
              <Animated.View
                pointerEvents={expanded ? "auto" : "none"}
                style={[
                  styles.expandedTitleLayer,
                  {
                    opacity: hubHeaderOpacity,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.expandedTitle,
                    { color: colors.text },
                  ]}
                >
                  Your hub
                </Text>
              </Animated.View>
            </View>

            {/*
            |--------------------------------------------------------------------------
            | 19. COMPACT OFFERS AND REWARDS
            |--------------------------------------------------------------------------
            |
            | Plain content.
            | Transparent surfaces.
            | Faint grey borders.
            |--------------------------------------------------------------------------
            */}

            <Animated.View
              pointerEvents={expanded ? "none" : "auto"}
              style={[
                styles.compactLinksRow,
                {
                  height: compactLinksHeight,
                  opacity: compactLinksOpacity,
                  borderColor: softOutline,
                },
              ]}
            >
              <CompactActionCard
                icon="briefcase-outline"
                title="Offers"
                subtitle="Eligible errands"
                count={offersCount}
                outlineColor={softOutline}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={openOffersAndRewards}
              />

              <CompactActionCard
                icon="gift-outline"
                title="Rewards"
                subtitle="Promotions and milestones"
                outlineColor={softOutline}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={openOffersAndRewards}
              />
            </Animated.View>

            {/*
            |--------------------------------------------------------------------------
            | 20. RUNNER HUB PERFORMANCE AREA
            |--------------------------------------------------------------------------
            |
            | No repeated application branding.
            | No duplicate availability indicator.
            | No View details link.
            |--------------------------------------------------------------------------
            */}

            <Animated.View
              pointerEvents={expanded ? "auto" : "none"}
              style={[
                styles.hubPerformanceContent,
                {
                  opacity: hubContentOpacity,
                  transform: [
                    {
                      translateY: hubContentTranslateY,
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

              {/* Performance heading: no View details action */}
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
              | 21. PERFORMANCE TIERS CARD
              |--------------------------------------------------------------------------
              |
              | Retains existing progression values.
              | Adds a visual path between the next levels.
              |--------------------------------------------------------------------------
              */}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open performance and tier progress"
                onPress={() => openSection("performance")}
                style={({ pressed }) => [
                  styles.tierCard,
                  {
                    borderColor: softOutline,
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
                    size={23}
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

                {/* Progression path */}
                <View style={styles.tierStepsRow}>
                  {PERFORMANCE_TIERS.map((tier, index) => (
                    <View
                      key={tier}
                      style={styles.tierStageItem}
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
              | 22. PERFORMANCE METRICS
              |--------------------------------------------------------------------------
              |
              | Rating, Acceptance and Cancellation remain as they are.
              |--------------------------------------------------------------------------
              */}

              <View style={styles.performanceMetricRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openSection("performance")}
                  style={[
                    styles.performanceMetric,
                    { borderColor: softOutline },
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
                    { borderColor: softOutline },
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
                    { borderColor: softOutline },
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

          {/*
          |--------------------------------------------------------------------------
          | 23. QUICK ACCESS
          |--------------------------------------------------------------------------
          |
          | Independent vertical ScrollView.
          | Scrolling here does not collapse the full sheet.
          | All actions use plain outlined rows.
          |--------------------------------------------------------------------------
          */}

          <View
            pointerEvents={expanded ? "auto" : "none"}
            style={[
              styles.quickAccessSection,
              {
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
              style={styles.hubAccessScroll}
              contentContainerStyle={styles.hubAccessContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <HubAccessRow
                icon="wallet-outline"
                title="Earnings"
                subtitle="Payouts and history"
                outlineColor={softOutline}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("earnings")}
              />

              <HubAccessRow
                icon="settings-outline"
                title="Settings"
                subtitle="App preferences"
                outlineColor={softOutline}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("settings")}
              />

              <HubAccessRow
                icon="shield-checkmark-outline"
                title="Privacy"
                subtitle="Location and privacy"
                outlineColor={softOutline}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("privacy")}
              />

              <HubAccessRow
                icon="person-circle-outline"
                title="Runner profile"
                subtitle="Profile and documents"
                outlineColor={softOutline}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("menu")}
              />

              <HubAccessRow
                icon="headset-outline"
                title="Help & support"
                subtitle="Get help and assistance"
                outlineColor={softOutline}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("help")}
              />

              <HubAccessRow
                icon="grid-outline"
                title="Account menu"
                subtitle="Account actions"
                outlineColor={softOutline}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("menu")}
              />
            </ScrollView>
          </View>
        </Animated.View>
      ) : null}

      {/*
      |--------------------------------------------------------------------------
      | 24. DASHBOARD MENU
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
                borderColor: softOutline,
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
| 25. COMPACT OFFERS AND REWARDS CARD
|--------------------------------------------------------------------------
*/

function CompactActionCard({
  icon,
  title,
  subtitle,
  count,
  onPress,
  outlineColor,
  textColor,
  mutedColor,
  iconColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  count?: number;
  onPress: () => void;
  outlineColor: string;
  textColor: string;
  mutedColor: string;
  iconColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        count !== undefined
          ? `${title}, ${count} available`
          : title
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactActionCard,
        {
          borderColor: outlineColor,
          opacity: pressed ? 0.65 : 1,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={19}
        color={iconColor}
      />

      <View style={styles.compactActionCopy}>
        <Text
          style={[
            styles.compactActionTitle,
            { color: textColor },
          ]}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.compactActionSubtitle,
            { color: mutedColor },
          ]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>

      {count !== undefined ? (
        <Text
          style={[
            styles.compactActionCount,
            { color: textColor },
          ]}
        >
          {count}
        </Text>
      ) : (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={mutedColor}
        />
      )}
    </Pressable>
  );
}

/*
|--------------------------------------------------------------------------
| 26. QUICK ACCESS LIST ROW
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
          opacity: pressed ? 0.65 : 1,
        },
      ]}
    >
      <View style={styles.hubAccessIcon}>
        <Ionicons
          name={icon}
          size={22}
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
| 27. MENU DRAWER ROW
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
| 28. COMPONENT STYLES
|--------------------------------------------------------------------------
*/

const styles = StyleSheet.create({

  /* Dashboard top bar */

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

  /* Earnings */

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
    ...StyleSheet.absoluteFill,
    zIndex: 110,
    backgroundColor: "rgba(0,0,0,0.08)",
  },

  earningsOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 130,
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

  /* Main sheet */

  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "column",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    borderTopWidth: 1,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },

  sheetTopDragSurface: {
    flexShrink: 0,
  },

  sheetHandlePanArea: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  sheetHandle: {
    width: 39,
    height: 4,
    borderRadius: 4,
  },

  sheetActionSlot: {
    height: 56,
    justifyContent: "center",
    alignItems: "flex-start",
    position: "relative",
  },

  /* Availability */

  availabilityLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    alignItems: "flex-start",
  },

  availabilityTrack: {
    borderRadius: AVAILABILITY_TRACK_HEIGHT / 2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    position: "relative",
    overflow: "hidden",
  },

  availabilityLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.15,
    paddingHorizontal: 43,
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

  /* Expanded hub title */

  expandedTitleLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  expandedTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    letterSpacing: -0.45,
  },

  /* Compact Offers and Rewards */

  compactLinksRow: {
    flexDirection: "row",
    gap: 8,
    overflow: "hidden",
  },

  compactActionCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "transparent",
  },

  compactActionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },

  compactActionTitle: {
    fontSize: 11,
    fontWeight: "900",
  },

  compactActionSubtitle: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "600",
  },

  compactActionCount: {
    fontSize: 11,
    fontWeight: "900",
  },

  /* Performance content */

  hubPerformanceContent: {
    gap: 12,
    paddingTop: 12,
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

  /* Performance tier card */

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

  tierStageItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },

  tierStep: {
    fontSize: 9,
    fontWeight: "800",
  },

  /* Rating, acceptance and cancellation */

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

  /* Quick Access */

  quickAccessSection: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 18,
    paddingTop: 13,
    gap: 10,
  },

  hubAccessScroll: {
    flex: 1,
    minHeight: 0,
  },

  hubAccessContent: {
    gap: 9,
    paddingBottom: 10,
  },

  hubAccessRow: {
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

  hubAccessIcon: {
    width: 37,
    height: 37,
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

  /* Drawer */

  drawerRoot: {
    flex: 1,
    flexDirection: "row",
  },

  drawerBackdrop: {
    ...StyleSheet.absoluteFill,
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
