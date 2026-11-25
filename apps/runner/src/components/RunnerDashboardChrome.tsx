import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors, showOverlay, isDark } = useRunnerTheme();

  const [earningsExpanded, setEarningsExpanded] = useState(false);
  const [earningsVisible, setEarningsVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sliderWidth, setSliderWidth] = useState(0);

  /*
   * One progress value controls the entire sheet transition.
   *
   * 0 = compact dashboard overlay.
   * 1 = fully expanded Runner Hub.
   *
   * The sheet top, compact controls, and Runner Hub all derive
   * their movement and opacity from this same value.
   */
  const sheetProgress = useRef(
    new Animated.Value(expanded ? 1 : 0),
  ).current;

  const sheetProgressCurrent = useRef(expanded ? 1 : 0);
  const dragStartProgress = useRef(expanded ? 1 : 0);

  /*
   * Separate horizontal movement is used only for the online-to-offline
   * availability slider. It does not control the sheet.
   */
  const offlineSlide = useRef(new Animated.Value(0)).current;
  const offlineRequestPending = useRef(false);

  const safeBottom = Math.max(bottomInset, insets.bottom, 0);
  const safeTop = Math.max(topInset, insets.top, 0);

  const compactSheetHeight = 126 + safeBottom;

  /*
   * The upper part contains Runner Hub and Performance.
   * Quick Access occupies the remaining area and has its own ScrollView.
   */
  const upperRegionHeight = Math.min(
    Math.max(380, windowHeight * 0.68),
    Math.max(240, windowHeight - 150),
  );

  const sheetTravel = Math.max(1, windowHeight - compactSheetHeight);

  const sheetTop = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetTravel, 0],
    extrapolate: "clamp",
  });

  const sheetCornerRadius = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
    extrapolate: "clamp",
  });

  /*
   * Compact controls fade out as the sheet approaches the middle.
   * Runner Hub fades in over the same progress range.
   */
  const compactOpacity = sheetProgress.interpolate({
    inputRange: [0, 0.22, 0.48, 0.62, 1],
    outputRange: [1, 1, 0.28, 0, 0],
    extrapolate: "clamp",
  });

  const hubOpacity = sheetProgress.interpolate({
    inputRange: [0, 0.22, 0.48, 0.72, 1],
    outputRange: [0, 0, 0.78, 1, 1],
    extrapolate: "clamp",
  });

  const navy = colors.brandNavy || "#000535";
  const panelBackground = colors.surface;
  const actionBlue = colors.blueAction || "#1558B0";
  const offlineRed = isDark ? "#C94A4A" : "#B42318";
  const white = "#FFFFFF";

  const outlineColor = isDark
    ? "rgba(192,203,217,0.28)"
    : "rgba(70,86,107,0.25)";

  const availabilityDisabled =
    !authorized ||
    !canChangeAvailability ||
    availabilityBusy ||
    activeErrand;

  const sliderMax = Math.max(0, sliderWidth - 42);

  /*
   * Keep a current reference to the animation value so the pan responder
   * can continue from the exact position where the finger currently is.
   */
  useEffect(() => {
    const listenerId = sheetProgress.addListener(({ value }) => {
      sheetProgressCurrent.current = value;
    });

    return () => {
      sheetProgress.removeListener(listenerId);
    };
  }, [sheetProgress]);

  /*
   * The parent prop remains the source of truth for whether the sheet
   * is expanded or collapsed.
   */
  useEffect(() => {
    Animated.spring(sheetProgress, {
      toValue: expanded ? 1 : 0,
      stiffness: 260,
      damping: 30,
      mass: 0.85,
      overshootClamping: true,
      useNativeDriver: false,
    }).start();
  }, [expanded, sheetProgress]);

  /*
   * Vertical sheet gesture.
   *
   * The same responder works in both states:
   * - Compact state: swipe upwards from the bottom overlay.
   * - Expanded state: swipe downwards from the Runner Hub/Performance area.
   *
   * Quick Access is rendered as a separate sibling with its own ScrollView,
   * so its scrolling does not move or collapse the sheet.
   */
  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 6 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15,

        onPanResponderGrant: () => {
          sheetProgress.stopAnimation((value) => {
            dragStartProgress.current = value;
            sheetProgressCurrent.current = value;
          });
        },

        onPanResponderMove: (_event, gesture) => {
          const nextProgress = Math.max(
            0,
            Math.min(
              1,
              dragStartProgress.current - gesture.dy / sheetTravel,
            ),
          );

          sheetProgressCurrent.current = nextProgress;
          sheetProgress.setValue(nextProgress);
        },

        onPanResponderRelease: (_event, gesture) => {
          let shouldExpand = sheetProgressCurrent.current >= 0.5;

          if (gesture.vy <= -0.55) {
            shouldExpand = true;
          } else if (gesture.vy >= 0.55) {
            shouldExpand = false;
          }

          if (shouldExpand === expanded) {
            Animated.spring(sheetProgress, {
              toValue: expanded ? 1 : 0,
              stiffness: 260,
              damping: 30,
              mass: 0.85,
              overshootClamping: true,
              useNativeDriver: false,
            }).start();
          } else {
            onExpandedChange(shouldExpand);
          }
        },

        onPanResponderTerminate: () => {
          Animated.spring(sheetProgress, {
            toValue: expanded ? 1 : 0,
            stiffness: 260,
            damping: 30,
            mass: 0.85,
            overshootClamping: true,
            useNativeDriver: false,
          }).start();
        },

        onPanResponderTerminationRequest: () => false,
      }),
    [expanded, onExpandedChange, sheetProgress, sheetTravel],
  );

  /*
   * Horizontal availability gesture.
   *
   * Offline -> Online: tap the blue button.
   * Online -> Offline: slide the red thumb to the right.
   *
   * A left swipe never changes availability.
   */
  const offlineSliderPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (_event, gesture) =>
          isOnline &&
          !availabilityDisabled &&
          gesture.dx > 6 &&
          gesture.dx > Math.abs(gesture.dy) * 1.15,

        onPanResponderGrant: () => {
          offlineSlide.stopAnimation();
        },

        onPanResponderMove: (_event, gesture) => {
          const nextX = Math.max(
            0,
            Math.min(sliderMax, gesture.dx),
          );

          offlineSlide.setValue(nextX);
        },

        onPanResponderRelease: (_event, gesture) => {
          const finalX = Math.max(
            0,
            Math.min(sliderMax, gesture.dx),
          );

          const completed =
            sliderMax > 0 &&
            (finalX >= sliderMax * 0.72 ||
              (gesture.vx > 0.8 && finalX >= sliderMax * 0.5));

          if (completed) {
            offlineRequestPending.current = true;

            Animated.spring(offlineSlide, {
              toValue: sliderMax,
              stiffness: 260,
              damping: 24,
              mass: 0.8,
              useNativeDriver: true,
            }).start();

            onToggleAvailability();
          } else {
            Animated.spring(offlineSlide, {
              toValue: 0,
              stiffness: 280,
              damping: 24,
              useNativeDriver: true,
            }).start();
          }
        },

        onPanResponderTerminate: () => {
          Animated.spring(offlineSlide, {
            toValue: 0,
            stiffness: 280,
            damping: 24,
            useNativeDriver: true,
          }).start();
        },

        onPanResponderTerminationRequest: () => false,
      }),
    [
      availabilityDisabled,
      isOnline,
      offlineSlide,
      onToggleAvailability,
      sliderMax,
    ],
  );

  /*
   * Reset the horizontal thumb after a successful state change.
   * If the request fails and the runner remains online, reset it once
   * the availability request is no longer busy.
   */
  useEffect(() => {
    if (!isOnline) {
      offlineRequestPending.current = false;
      offlineSlide.stopAnimation();
      offlineSlide.setValue(0);
      return;
    }

    if (offlineRequestPending.current && !availabilityBusy) {
      offlineRequestPending.current = false;

      Animated.spring(offlineSlide, {
        toValue: 0,
        stiffness: 280,
        damping: 24,
        useNativeDriver: true,
      }).start();
    }
  }, [availabilityBusy, isOnline, offlineSlide]);

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

    const handleInviteFriends = async () => {
    try {
      await Share.share({
        message:
          "Join me on SaMi Runner. Invite your friends and earn up to KSh 2,000 with SaMi!",
      });
    } catch {
      showOverlay({
        type: "error",
        title: "Unable to share invitation",
        message: "Please try again.",
        dismissOnBackdrop: true,
      });
    }
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {/*
       * Keep the status bar present throughout the transition.
       * Its appearance follows the selected app theme.
       */}
      <StatusBar
        hidden={false}
        barStyle={isDark ? "light-content" : "dark-content"}
      />

      {/*
       * Dashboard header.
       * The expanded sheet is rendered above this entire layer.
       */}
      <View
        style={[
          styles.headerRow,
          {
            top: topInset + 7,
            paddingHorizontal: 16,
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
          <Ionicons name="menu" size={24} color={white} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            earningsVisible
              ? "Show today's earnings details"
              : "Open earnings details"
          }
          accessibilityState={{ expanded: earningsExpanded }}
          onPress={() => setEarningsExpanded((current) => !current)}
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
                <Text style={styles.earningsOverlayEyebrow}>TODAY</Text>
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
                onPress={() => setEarningsVisible((current) => !current)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.eyeButton,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.10)"
                      : "rgba(255,255,255,0.14)",
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={earningsVisible ? "eye-off-outline" : "eye-outline"}
                  size={21}
                  color={white}
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

      {!activeErrand ? (
        <Animated.View
          style={[
            styles.sheetSurface,
            {
              top: sheetTop,
              backgroundColor: panelBackground,
              borderTopColor: outlineColor,
              borderTopWidth: expanded ? 0 : 1,
              borderTopLeftRadius: sheetCornerRadius,
              borderTopRightRadius: sheetCornerRadius,
              zIndex: 100,
              elevation: 40,
            },
          ]}
        >
          {/*
           * One sheet gesture surface.
           *
           * It covers the full sheet, but Quick Access is a separate
           * sibling rendered above it. That keeps Quick Access scrolling
           * independent from sheet expansion and collapse.
           */}
          <Animated.View
            {...sheetPanResponder.panHandlers}
            style={styles.sheetGestureSurface}
          >
            {/*
             * Compact controls remain at the bottom of the sheet.
             * Both controls fade out together using compactOpacity.
             */}
            <Animated.View
              pointerEvents={expanded ? "none" : "auto"}
              style={[
                styles.compactContent,
                {
                  bottom: safeBottom + 8,
                  opacity: compactOpacity,
                },
              ]}
            >
              {/*
               * Offline state:
               * Tap the blue Go online control.
               */}
              {!isOnline ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Go online"
                  accessibilityHint="Tap to make yourself available for errands."
                  disabled={availabilityDisabled}
                  onPress={onToggleAvailability}
                  style={({ pressed }) => [
                    styles.goOnlineButton,
                    {
                      backgroundColor: actionBlue,
                      opacity: availabilityDisabled
                        ? 0.55
                        : pressed
                          ? 0.84
                          : 1,
                    },
                  ]}
                >
                  {availabilityBusy ? (
                    <ActivityIndicator size="small" color={white} />
                  ) : (
                    <>
                      <Ionicons
                        name="power"
                        size={17}
                        color={white}
                      />
                      <Text style={styles.availabilityButtonText}>
                        Go online
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : (
                /*
                 * Online state:
                 * The red thumb must be slid to the right to go offline.
                 */
                <View
                  {...offlineSliderPanResponder.panHandlers}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel="Go offline"
                  accessibilityHint="Slide the control to the right to go offline."
                  onLayout={(event) => {
                    setSliderWidth(event.nativeEvent.layout.width);
                  }}
                  style={[
                    styles.offlineSliderTrack,
                    {
                      backgroundColor: offlineRed,
                      opacity: availabilityDisabled ? 0.55 : 1,
                    },
                  ]}
                >
                  <Text style={styles.offlineSliderLabel}>Go offline</Text>

                  <Animated.View
                    style={[
                      styles.offlineSliderThumb,
                      {
                        transform: [{ translateX: offlineSlide }],
                      },
                    ]}
                  >
                    {availabilityBusy ? (
                      <ActivityIndicator size="small" color={offlineRed} />
                    ) : (
                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color={offlineRed}
                      />
                    )}
                  </Animated.View>
                </View>
              )}

              {/*
               * One combined Offers & Rewards card.
               * It is deliberately plain, transparent, and outlined.
               */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Offers and Rewards"
                onPress={() => openSection("offers")}
                style={({ pressed }) => [
                  styles.offerRewardCard,
                  {
                    borderColor: outlineColor,
                    opacity: pressed ? 0.76 : 1,
                  },
                ]}
              >
                <View style={styles.offerIconWrap}>
                  <Ionicons
                    name="gift-outline"
                    size={21}
                    color={colors.blue}
                  />
                </View>

                <View style={styles.offerCopy}>
                  <Text
                    style={[
                      styles.offerTitle,
                      { color: colors.text },
                    ]}
                  >
                    Offers & Rewards
                  </Text>

                  <Text
                    style={[
                      styles.offerSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    Explore offers and runner rewards
                  </Text>
                </View>

                {offersCount > 0 ? (
                  <View
                    style={[
                      styles.offerCountBadge,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.10)"
                          : "rgba(21,88,176,0.09)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.offerCountText,
                        { color: colors.blue },
                      ]}
                    >
                      {offersCount}
                    </Text>
                  </View>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                  />
                )}
              </Pressable>
            </Animated.View>

            {/*
             * Runner Hub upper content.
             * No repeated SaMi Runner branding or duplicate online badge.
             */}
            <Animated.View
              pointerEvents={expanded ? "auto" : "none"}
              style={[
                styles.hubUpperContent,
                {
                  height: upperRegionHeight,
                  paddingTop: safeTop + 10,
                  opacity: hubOpacity,
                },
              ]}
            >
              <View style={styles.hubTitleBlock}>
                <Text
                  style={[
                    styles.hubTitle,
                    { color: colors.text },
                  ]}
                >
                  Runner Hub
                </Text>

                <Text
                  style={[
                    styles.hubSubtitle,
                    { color: colors.textMuted },
                  ]}
                >
                  Your performance and account tools.
                </Text>
              </View>

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

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open performance and tier progress"
                onPress={() => openSection("performance")}
                style={({ pressed }) => [
                  styles.tierCard,
                  {
                    borderColor: outlineColor,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <View style={styles.tierCardTop}>
                  <View style={styles.tierIconWrap}>
                    <Ionicons
                      name="trophy-outline"
                      size={22}
                      color={isDark ? "#E8C574" : "#9A6A16"}
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
                    name="chevron-forward"
                    size={19}
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

                <View style={styles.tierStepsRow}>
                  <Text
                    style={[
                      styles.tierStep,
                      { color: colors.text },
                    ]}
                  >
                    Silver
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={12}
                    color={colors.textMuted}
                  />

                  <Text
                    style={[
                      styles.tierStep,
                      { color: colors.textMuted },
                    ]}
                  >
                    Gold
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={12}
                    color={colors.textMuted}
                  />

                  <Text
                    style={[
                      styles.tierStep,
                      { color: colors.textMuted },
                    ]}
                  >
                    Platinum
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={12}
                    color={colors.textMuted}
                  />

                  <Text
                    style={[
                      styles.tierStep,
                      { color: colors.textMuted },
                    ]}
                  >
                    Diamond
                  </Text>
                </View>
              </Pressable>

              {/*
               * Keep the existing Rating, Acceptance, and Cancellation
               * values and meanings.
               */}
              <View style={styles.performanceMetricRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openSection("performance")}
                  style={({ pressed }) => [
                    styles.performanceMetric,
                    {
                      borderColor: outlineColor,
                      opacity: pressed ? 0.78 : 1,
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
                  style={({ pressed }) => [
                    styles.performanceMetric,
                    {
                      borderColor: outlineColor,
                      opacity: pressed ? 0.78 : 1,
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
                  style={({ pressed }) => [
                    styles.performanceMetric,
                    {
                      borderColor: outlineColor,
                      opacity: pressed ? 0.78 : 1,
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
          </Animated.View>

          {/*
           * Quick Access is outside the sheet PanResponder.
           * Its own ScrollView handles its vertical movement independently.
           */}
          <Animated.View
            pointerEvents={expanded ? "auto" : "none"}
            style={[
              styles.quickAccessRegion,
              {
                top: upperRegionHeight,
                backgroundColor: panelBackground,
                opacity: hubOpacity,
              },
            ]}
          >
            <View style={styles.quickAccessHeader}>
              <Text
                style={[
                  styles.quickAccessTitle,
                  { color: colors.text },
                ]}
              >
                Quick Access
              </Text>
            </View>

            <ScrollView
              style={styles.quickAccessScroll}
              contentContainerStyle={[
                styles.quickAccessContent,
                { paddingBottom: safeBottom + 14 },
              ]}
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
                subtitle="Get help from SaMi"
                outlineColor={outlineColor}
                textColor={colors.text}
                mutedColor={colors.textMuted}
                iconColor={colors.blue}
                onPress={() => openSection("help")}
              />

           <HubAccessRow
  icon="options-outline"
  title="Runner Preferences"
  subtitle="Your runner preferences"
  outlineColor={outlineColor}
  textColor={colors.text}
  mutedColor={colors.textMuted}
  iconColor={colors.blue}
  onPress={() => openSection("menu")}
/>

<View style={styles.invitePromoCard}>
  <View style={styles.inviteIconWrap}>
    <Ionicons name="people-outline" size={22} color="#000535" />
  </View>

  <Text style={styles.inviteEyebrow}>INVITE & EARN</Text>

  <Text style={styles.inviteTitle}>
    Earn up to KSh 2,000
  </Text>

  <Text style={styles.inviteSubtitle}>
    Invite friends to run with SaMi.
  </Text>

  <Pressable
    accessibilityRole="button"
    onPress={handleInviteFriends}
    style={({ pressed }) => [
      styles.inviteAction,
      { opacity: pressed ? 0.8 : 1 },
    ]}
  >
    <Text style={styles.inviteActionText}>
      Invite friends to run
    </Text>
    <Ionicons name="arrow-forward" size={16} color="#000535" />
  </Pressable>
</View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
      ) : null}

      {/*
       * Existing menu drawer and its destinations are preserved.
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
                paddingTop: topInset + 22,
                paddingBottom: safeBottom + 18,
                borderColor: outlineColor,
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerBrand}>SaMi Runner</Text>
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
                <Ionicons name="close" size={22} color={white} />
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

/* -------------------------------------------------------------------------- */
/* Quick Access row                                                           */
/* -------------------------------------------------------------------------- */

function HubAccessRow({
  icon,
  title,
  subtitle,
  outlineColor,
  textColor,
  mutedColor,
  iconColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  outlineColor: string;
  textColor: string;
  mutedColor: string;
  iconColor: string;
  onPress: () => void;
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
          opacity: pressed ? 0.76 : 1,
        },
      ]}
    >
      <View style={styles.hubAccessIcon}>
        <Ionicons name={icon} size={21} color={iconColor} />
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
        size={17}
        color={mutedColor}
      />
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer item                                                                */
/* -------------------------------------------------------------------------- */

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
      <Ionicons name={icon} size={21} color="#FFFFFF" />

      <Text style={styles.drawerItemText}>{label}</Text>

      <Ionicons
        name="chevron-forward"
        size={17}
        color="rgba(255,255,255,0.72)"
      />
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },

  /* Dashboard header */

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

  headerRightSpacer: {
    width: 44,
    height: 44,
  },

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

  /* Full-screen sheet */

  sheetSurface: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    borderTopWidth: 1,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },

  sheetGestureSurface: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },

  /* Compact availability and Offers & Rewards */

  compactContent: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 8,
  },

  goOnlineButton: {
    width: 120,
    height: 42,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },

  availabilityButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.1,
  },

  offlineSliderTrack: {
    width: 120,
    height: 42,
    borderRadius: 24,
    justifyContent: "center",
    paddingHorizontal: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },

  offlineSliderLabel: {
    position: "absolute",
    left: 38,
    right: 4,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  offlineSliderThumb: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  offerRewardCard: {
    width: "100%",
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "transparent",
  },

  offerIconWrap: {
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
  },

  offerCopy: {
    flex: 1,
    gap: 3,
  },

  offerTitle: {
    fontSize: 12,
    fontWeight: "900",
  },

  offerSubtitle: {
    fontSize: 9,
    fontWeight: "600",
  },

  offerCountBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  offerCountText: {
    fontSize: 11,
    fontWeight: "900",
  },

  /* Runner Hub upper area */

  hubUpperContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 9,
  },

  hubTitleBlock: {
    gap: 3,
  },

  hubTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
    letterSpacing: -0.45,
  },

  hubSubtitle: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
  },

  hubSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 1,
  },

  hubSectionEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.25,
  },

  /* Tier card */

  tierCard: {
    borderWidth: 1,
    borderRadius: 17,
    padding: 12,
    gap: 9,
    backgroundColor: "transparent",
  },

  tierCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  tierIconWrap: {
    width: 39,
    height: 39,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,197,116,0.13)",
  },

  tierCardCopy: {
    flex: 1,
    gap: 3,
  },

  tierEyebrow: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },

  tierTitle: {
    fontSize: 13,
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
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  tierProgressTrack: {
    height: 6,
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

  tierStep: {
    fontSize: 8,
    fontWeight: "800",
  },

  /* Performance metrics */

  performanceMetricRow: {
    flexDirection: "row",
    gap: 8,
  },

  performanceMetric: {
    flex: 1,
    minHeight: 73,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 7,
    gap: 3,
  },

  performanceMetricValue: {
    fontSize: 16,
    fontWeight: "900",
  },

  performanceMetricLabel: {
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },

  /* Quick Access: independent lower section */

  quickAccessRegion: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
    elevation: 3,
    overflow: "hidden",
  },

  quickAccessHeader: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 7,
  },

  quickAccessTitle: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.1,
  },

  quickAccessScroll: {
    flex: 1,
  },

   quickAccessContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 3,
    gap: 14,
  },

  quickAccessList: {
    gap: 8,
  },

  hubAccessRow: {
    minHeight: 61,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "transparent",
  },

  hubAccessIcon: {
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
  },

  hubAccessCopy: {
    flex: 1,
    gap: 3,
  },

  hubAccessTitle: {
    fontSize: 11,
    fontWeight: "900",
  },

  hubAccessSubtitle: {
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "600",
  },

    invitePromoCard: {
    width: "100%",
    minHeight: 158,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 19,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#000535",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  inviteIconWrap: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: "#E8C574",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },

  inviteEyebrow: {
    color: "#E8C574",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  inviteTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    textAlign: "center",
  },

  inviteSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "600",
    textAlign: "center",
  },

  inviteAction: {
    minHeight: 34,
    marginTop: 5,
    paddingHorizontal: 13,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  inviteActionText: {
    color: "#000535",
    fontSize: 10,
    fontWeight: "900",
  },

  /* Drawer */

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