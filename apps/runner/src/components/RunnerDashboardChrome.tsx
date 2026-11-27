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
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  runnerMotion,
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
} from "@/theme";

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

const AVAILABILITY_WIDTH = 204;
const AVAILABILITY_HEIGHT = 54;
const OFFERS_REWARDS_HEIGHT = 58;

const AVAILABILITY_THUMB_SIZE = 42;
const AVAILABILITY_THUMB_INSET = 6;

const AVAILABILITY_MAX_DRAG =
  AVAILABILITY_WIDTH -
  AVAILABILITY_THUMB_SIZE -
  AVAILABILITY_THUMB_INSET * 2;

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

  const { colors, showOverlay } = useRunnerTheme();

  const navy = colors.brandNavy || "#000535";

  // All separators and accents follow the selected Runner theme.
  const outlineColor = colors.divider;
  const gold = colors.amber;

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
    OFFERS_REWARDS_HEIGHT +
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

  const previousExpanded = useRef(expanded);

  useEffect(() => {
    // The animated value already starts at the correct position. Skip a
    // redundant first-mount spring to prevent a brief first-touch flash.
    if (previousExpanded.current === expanded) {
      return;
    }

    previousExpanded.current = expanded;
    sheetProgress.stopAnimation();

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

  const handleInviteFriends = () => {
    void Share.share({
      title: "Join SaMi Runner",
      message:
        "Join me on SaMi Runner. Invite your friends to run with SaMi!",
    }).catch(() => {
      showOverlay({
        type: "error",
        title: "Unable to share invitation",
        message: "Please try again.",
        dismissOnBackdrop: true,
      });
    });
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
            <View style={styles.availabilityContainer}>
              <AvailabilityControl
                isOnline={isOnline}
                disabled={availabilityDisabled}
                busy={availabilityBusy}
                onToggle={onToggleAvailability}
              />
            </View>

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
                  borderBottomColor: outlineColor,
                  opacity: pressed ? 0.72 : 1,
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
            <View
              {...sheetPanResponder.panHandlers}
              style={styles.hubPerformanceArea}
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

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open performance and tier progress"
                onPress={() => openSection("performance")}
                style={({ pressed }) => [
                  styles.tierCard,
                  {
                    borderBottomColor: colors.divider,
                    opacity: pressed ? 0.76 : 1,
                  },
                ]}
              >
                <View style={styles.tierCardTop}>
                  <View
                    style={[
                      styles.tierIconWrap,
                      {
                        backgroundColor: "transparent",
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
                      backgroundColor: colors.divider,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.tierProgressFill,
                      {
                        backgroundColor: colors.amber,
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

              <View style={styles.performanceMetricRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openSection("performance")}
                  style={styles.performanceMetric}
                >
                  <Ionicons name="star" size={20} color={gold} />
                  <Text style={[styles.performanceMetricValue, { color: colors.text }]}>—</Text>
                  <Text style={[styles.performanceMetricLabel, { color: colors.textMuted }]}>Rating</Text>
                </Pressable>

                <View style={[styles.metricDivider, { backgroundColor: colors.divider }]} />

                <Pressable
                  accessibilityRole="button"
                  onPress={() => openSection("performance")}
                  style={styles.performanceMetric}
                >
                  <Ionicons name="trending-up-outline" size={20} color={colors.blue} />
                  <Text style={[styles.performanceMetricValue, { color: colors.text }]}>—%</Text>
                  <Text style={[styles.performanceMetricLabel, { color: colors.textMuted }]}>Acceptance</Text>
                </Pressable>

                <View style={[styles.metricDivider, { backgroundColor: colors.divider }]} />

                <Pressable
                  accessibilityRole="button"
                  onPress={() => openSection("performance")}
                  style={styles.performanceMetric}
                >
                  <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                  <Text style={[styles.performanceMetricValue, { color: colors.text }]}>—%</Text>
                  <Text style={[styles.performanceMetricLabel, { color: colors.textMuted }]}>Cancellation</Text>
                </Pressable>
              </View>
            </View>

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
                <View style={styles.quickAccessRows}>
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
                    icon="options-outline"
                    title="Runner Preferences"
                    subtitle="Your runner preferences"
                    outlineColor={outlineColor}
                    textColor={colors.text}
                    mutedColor={colors.textMuted}
                    iconColor={colors.blue}
                    onPress={() => openSection("menu")}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Invite friends to SaMi Runner and earn"
                  onPress={handleInviteFriends}
                  style={({ pressed }) => [
                    styles.inviteReferralCard,
                    {
                      borderBottomColor: colors.divider,
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <View style={styles.inviteReferralIcon}>
                    <Ionicons
                      name="people-outline"
                      size={24}
                      color={colors.blue}
                    />
                  </View>

                  <View style={styles.inviteReferralCopy}>
                    <Text style={[styles.inviteReferralEyebrow, { color: colors.textMuted }]}>
                      INVITE & EARN
                    </Text>

                    <Text style={[styles.inviteReferralTitle, { color: colors.text }]}>
                      Earn up to KSh 2,000
                    </Text>

                    <Text style={[styles.inviteReferralSubtitle, { color: colors.textMuted }]}>
                      Invite friends to run with SaMi.
                    </Text>
                  </View>

                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={colors.textMuted}
                  />
                </Pressable>
              </ScrollView>
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}

      <Modal
        visible={menuOpen}
        transparent
        animationType="none"
        statusBarTranslucent={false}
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.drawerRoot}>
          <Pressable
            style={[styles.drawerBackdrop, { backgroundColor: colors.overlay }]}
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
  const { colors, isDark } = useRunnerTheme();
  const offlineColor = colors.blueAction;
  const onlineColor = isDark ? "#A92F3A" : "#B42318";
  const thumbTranslateX = useRef(
    new Animated.Value(0),
  ).current;

  /*
  |--------------------------------------------------------------------------
  | 36. RESET SLIDER AFTER AVAILABILITY REQUEST
  |--------------------------------------------------------------------------
  */

  const previousAvailability = useRef({ isOnline, busy });

  useEffect(() => {
    const changed =
      previousAvailability.current.isOnline !== isOnline ||
      previousAvailability.current.busy !== busy;

    previousAvailability.current = { isOnline, busy };

    // The thumb starts at zero. Only reset it after a real availability
    // transition, not during the first render.
    if (!changed || busy) {
      return;
    }

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
            backgroundColor: offlineColor,
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
          backgroundColor: onlineColor,
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
            color={colors.brandNavy}
          />
        ) : (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.brandNavy}
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
| Plain text actions separated by thin theme-coloured lines.
| These rows do not use cards, tiles or filled containers.
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
  root: {
    ...StyleSheet.absoluteFill,
  },

  headerRow: {
    position: "absolute",
    left: runnerSpacing.md,
    right: runnerSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  hamburgerButton: {
    width: runnerTouchTargets.minimum,
    height: runnerTouchTargets.minimum,
    borderRadius: runnerRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.26)",
    elevation: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.24,
    shadowRadius: 7,
  },

  headerRightSpacer: {
    width: runnerTouchTargets.minimum,
    height: runnerTouchTargets.minimum,
  },

  earningsPill: {
    position: "absolute",
    left: "50%",
    transform: [{ translateX: -86 }],
    width: 172,
    minHeight: 58,
    borderRadius: runnerRadii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.26)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: runnerSpacing.md,
    paddingVertical: runnerSpacing.xs,
    elevation: 9,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
  },

  earningsPillAmount: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  earningsPillToday: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    lineHeight: 17,
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
    left: runnerSpacing.md,
    right: runnerSpacing.md,
    zIndex: 60,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: runnerRadii.xl,
    paddingHorizontal: runnerSpacing.lg,
    paddingVertical: runnerSpacing.lg,
    gap: runnerSpacing.sm,
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
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  earningsOverlayValue: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "900",
  },

  eyeButton: {
    width: runnerTouchTargets.minimum,
    height: runnerTouchTargets.minimum,
    borderRadius: runnerRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.26)",
  },

  earningsOverlayHint: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    lineHeight: 21,
  },

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

  compactLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: runnerSpacing.lg,
    paddingTop: 0,
    gap: runnerSpacing.sm,
    alignItems: "stretch",
  },

  availabilityContainer: {
    width: "100%",
    height: AVAILABILITY_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },

  availabilityButton: {
    borderRadius: runnerRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: runnerSpacing.lg,
  },

  availabilitySlider: {
    position: "relative",
    borderRadius: runnerRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  availabilityText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
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

  offersRewardsCard: {
    width: "100%",
    minHeight: 58,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: runnerSpacing.xs,
    paddingVertical: runnerSpacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
    backgroundColor: "transparent",
  },

  offersRewardsTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },

  offersRewardsCount: {
    fontSize: 14,
    fontWeight: "800",
  },

  hubPage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: runnerSpacing.lg,
    flexDirection: "column",
  },

  hubPerformanceArea: {
    flexShrink: 0,
    gap: runnerSpacing.md,
  },

  hubTitle: {
    fontSize: runnerTypography.heading,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.45,
  },

  performanceHeading: {
    marginTop: runnerSpacing.xxs,
    marginBottom: runnerSpacing.xxs,
  },

  sectionHeading: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "900",
  },

  tierCard: {
    paddingVertical: runnerSpacing.md,
    paddingHorizontal: runnerSpacing.xs,
    gap: runnerSpacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  tierCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
  },

  tierIconWrap: {
    width: 44,
    height: 44,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
  },

  tierCardCopy: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  tierEyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  tierTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "900",
  },

  tierPointsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: runnerSpacing.sm,
  },

  tierPointsLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },

  tierPointsValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  tierProgressTrack: {
    height: 7,
    borderRadius: runnerRadii.pill,
    overflow: "hidden",
  },

  tierProgressFill: {
    height: "100%",
    borderRadius: runnerRadii.pill,
  },

  tierProgressFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: runnerSpacing.sm,
  },

  tierProgressCaption: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },

  tierStepsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: runnerSpacing.xs,
  },

  tierStepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.xxs,
    flexShrink: 1,
  },

  tierStep: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },

  performanceMetricRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: runnerSpacing.sm,
  },

  performanceMetric: {
    flex: 1,
    minWidth: 0,
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: runnerSpacing.xs,
    paddingVertical: runnerSpacing.sm,
    gap: runnerSpacing.xs,
  },

  metricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: runnerSpacing.xs,
  },

  performanceMetricValue: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "900",
  },

  performanceMetricLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },

  quickAccessSection: {
    flex: 1,
    minHeight: 0,
    paddingTop: runnerSpacing.lg,
    gap: runnerSpacing.sm,
  },

  quickAccessHeading: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "900",
  },

  quickAccessScroll: {
    flex: 1,
    minHeight: 0,
  },

  quickAccessContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingBottom: runnerSpacing.lg,
  },

  quickAccessRows: {
    gap: 0,
  },

  quickAccessRow: {
    minHeight: 76,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: runnerSpacing.xs,
    paddingVertical: runnerSpacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
    backgroundColor: "transparent",
  },

  quickAccessIcon: {
    width: 36,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  quickAccessCopy: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  quickAccessTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },

  quickAccessSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },

  inviteReferralCard: {
    width: "100%",
    minHeight: 90,
    marginTop: runnerSpacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: runnerSpacing.xs,
    paddingVertical: runnerSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
    backgroundColor: "transparent",
  },

  inviteReferralIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  inviteReferralCopy: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  inviteReferralEyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  inviteReferralTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
  },

  inviteReferralSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },

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
  },

  drawerPanel: {
    width: "84%",
    maxWidth: 360,
    minHeight: "100%",
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: runnerSpacing.lg,
    gap: runnerSpacing.xs,
    elevation: 24,
  },

  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: runnerSpacing.sm,
  },

  drawerBrand: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "900",
    letterSpacing: -0.4,
  },

  drawerSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    lineHeight: 20,
    marginTop: runnerSpacing.xxs,
  },

  drawerClose: {
    width: runnerTouchTargets.minimum,
    height: runnerTouchTargets.minimum,
    borderRadius: runnerRadii.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  drawerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginBottom: runnerSpacing.sm,
  },

  drawerItem: {
    minHeight: 60,
    paddingHorizontal: runnerSpacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.2)",
  },

  drawerItemText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
});