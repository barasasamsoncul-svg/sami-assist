import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getRunnerOnboarding,
  updateRunnerOnboarding,
} from "@/api";

import { useRunnerTheme } from "@/theme";

type VehicleType = "bike" | "motorbike" | "vehicle";

type VehicleOption = {
  value: VehicleType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type OnboardingAccessState = {
  onboardingStatus: string;
  accountStatus: string;
};

const VEHICLES: VehicleOption[] = [
  {
    value: "bike",
    title: "Bike",
    description: "A pedal-powered bicycle for nearby pickups and deliveries.",
    icon: "bicycle-outline",
  },
  {
    value: "motorbike",
    title: "Motorbike",
    description: "A motorcycle or scooter for faster, longer-distance errands.",
    icon: "bicycle-outline",
  },
  {
    value: "vehicle",
    title: "Vehicle",
    description: "A car, van or other motor vehicle for suitable deliveries.",
    icon: "car-outline",
  },
];

const VEHICLES_REQUIRING_REGISTRATION: VehicleType[] = [
  "motorbike",
  "vehicle",
];

/**
 * Translate previously saved transport values to the current three-option
 * model. This keeps existing Runner profiles readable during the transition.
 */
function normalizeSavedVehicle(value: unknown): VehicleType | "" {
  switch (value) {
    case "bike":
    case "bicycle":
      return "bike";
    case "motorbike":
    case "motorcycle":
      return "motorbike";
    case "vehicle":
    case "car":
    case "van":
    case "other":
      return "vehicle";
    default:
      return "";
  }
}

const BACK_SIZE = 44;

function requiresVehicleRegistration(value: VehicleType): boolean {
  return VEHICLES_REQUIRING_REGISTRATION.includes(value);
}

export default function RunnerTransportScreen() {
  const { colors, mode } = useRunnerTheme();
  const isDark = mode === "dark";
  const supportingText = isDark ? "#C1CCDA" : "#526176";
  const brandColor = isDark ? "#F5F7FB" : "#000535";
  const actionBlue = isDark ? "#8AB8F8" : "#1F5EAB";
  const buttonBlue = isDark ? "#1D5DAD" : "#174F9F";

  const [serviceArea, setServiceArea] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType | "">("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");

  const [selectedCategoryCount, setSelectedCategoryCount] = useState(0);
  const [accessState, setAccessState] = useState<OnboardingAccessState | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [areaFocused, setAreaFocused] = useState(false);
  const [regFocused, setRegFocused] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const regFieldAnim = useRef(new Animated.Value(0)).current;
  const regFieldShownRef = useRef(false);

  useEffect(() => {
    // Re-arm during setup so React Strict Mode's effect cycle does not leave
    // outstanding requests thinking the screen has permanently unmounted.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadTransportDetails = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setLoadError("");
    setError("");

    try {
      // GET /api/runner/me/onboarding returns the authenticated Runner's
      // saved categories, transport profile and verification/account state.
      const result = await getRunnerOnboarding();

      if (!result?.ok || !result.runner) {
        throw new Error("The server returned an invalid onboarding response. Please retry.");
      }

      if (!mountedRef.current) return;

      const selectedCategories = result.runner.selectedCategories ?? [];
      const savedVehicle = normalizeSavedVehicle(result.runner.vehicleType);

      setSelectedCategoryCount(selectedCategories.length);
      setServiceArea(result.runner.serviceArea ?? "");
      setVehicleType(savedVehicle);
      setVehicleRegistration(result.runner.vehicleRegistration ?? "");
      setAccessState({
        onboardingStatus: result.onboardingStatus,
        accountStatus: result.runner.accountStatus,
      });
      hasLoadedOnceRef.current = true;
    } catch (cause) {
      if (!mountedRef.current) return;
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Your transport details could not be loaded.",
      );
    } finally {
      loadInFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Refresh when the Runner returns from Tasks, Documents or Review.
  // No redirect occurs merely because a prerequisite is missing or the
  // application has moved to pending-review/approved.
  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void loadTransportDetails();
    }, [loadTransportDetails]),
  );

  const onboardingStatus = accessState?.onboardingStatus ?? "";
  const accountStatus = accessState?.accountStatus ?? "";
  const isApproved = onboardingStatus === "approved";
  const isPendingReview = onboardingStatus === "pending_review";
  const isRestricted = ["suspended", "closed"].includes(accountStatus);
  const sessionExpired = /session has expired|sign in again|no valid runner session/i.test(`${loadError} ${error}`);
  const hasCategories = selectedCategoryCount > 0;

  const canEditTransport = Boolean(
    accessState &&
      hasCategories &&
      !loading &&
      !refreshing &&
      !loadError &&
      !saving &&
      !isApproved &&
      !isPendingReview &&
      !isRestricted &&
      !sessionExpired,
  );

  const showRegistrationField =
    vehicleType !== "" && requiresVehicleRegistration(vehicleType);

  // Animate the registration field the first time it appears.
  useLayoutEffect(() => {
    if (showRegistrationField && !regFieldShownRef.current) {
      regFieldAnim.setValue(0);
      Animated.timing(regFieldAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    regFieldShownRef.current = showRegistrationField;
  }, [showRegistrationField, regFieldAnim]);

  // When a validation error appears, scroll it into view.
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [error]);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else if (sessionExpired) {
      router.replace("/(auth)/login");
    } else if (isApproved) {
      router.replace("/(app)");
    } else if (isPendingReview) {
      router.replace("/(app)/profile-setup?mode=status");
    } else {
      router.replace("/(auth)/tasks");
    }
  }

  function chooseVehicle(value: VehicleType) {
    if (!canEditTransport || value === vehicleType) return;

    setVehicleType(value);
    setError("");

    if (!requiresVehicleRegistration(value)) {
      setVehicleRegistration("");
    }
  }

  async function saveTransportDetails() {
    if (saveInFlightRef.current || !canEditTransport) return;

    const normalizedArea = serviceArea.trim().replace(/\s+/g, " ");
    const normalizedRegistration = vehicleRegistration
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");

    if (!hasCategories) {
      setError("Choose your task categories before entering your transport details.");
      return;
    }

    if (normalizedArea.length < 2 || normalizedArea.length > 120) {
      setError("Enter a service area between 2 and 120 characters.");
      return;
    }

    if (!vehicleType) {
      setError("Choose the transport type you will use.");
      return;
    }

    if (
      requiresVehicleRegistration(vehicleType) &&
      normalizedRegistration.length < 3
    ) {
      setError("Enter the registration number of your vehicle.");
      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);
    setError("");

    try {
      // The onboarding payload uses the same three transport values the UI
      // exposes for Bike, Motorbike and Vehicle.
      const apiVehicleType: VehicleType = vehicleType;

      const result = await updateRunnerOnboarding({
        serviceArea: normalizedArea,
        vehicleType: apiVehicleType,
        vehicleRegistration: requiresVehicleRegistration(vehicleType)
          ? normalizedRegistration
          : "",
      });

      if (!result?.ok || !Array.isArray(result.requirements)) {
        throw new Error(
          "The server did not confirm your transport details. Refresh this screen before continuing.",
        );
      }

      if (!mountedRef.current) return;

      // Continue only after the server confirms the profile update.
      // Keep this screen in history so Back returns here normally.
      router.push("/(auth)/documents");
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Your transport details could not be saved. Please try again.",
      );
    } finally {
      saveInFlightRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  const showFullLoading = loading && !accessState;
  const showFullError = Boolean(loadError && !accessState);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.paper}
      />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.container}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                disabled={saving}
                onPress={goBack}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={({ pressed }) => [
                  styles.backButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.6 : saving ? 0.5 : 1,
                  },
                ]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>

              <View style={styles.brand}>
                <Text style={[styles.brandName, { color: brandColor }]}>
                  SaMi <Text style={{ color: actionBlue }}>Runner</Text>
                </Text>
                <Text style={[styles.brandTagline, { color: supportingText }]}>
                  CONSIDER IT DONE
                </Text>
              </View>

              <View style={styles.headerSpacer} />
            </View>

            {/* Progress */}
            <View style={styles.progressSection}>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { backgroundColor: buttonBlue }]} />
              </View>

              <View style={styles.progressMeta}>
                <Text style={[styles.progressText, { color: supportingText }]}>
                  {isApproved
                    ? "APPROVED · TRANSPORT DETAILS"
                    : isPendingReview
                      ? "UNDER REVIEW · TRANSPORT DETAILS"
                      : "STEP 2 OF 3 · TRANSPORT DETAILS"}
                </Text>

                <View style={styles.progressDots}>
                  <View style={[styles.stepDot, { backgroundColor: buttonBlue }]} />
                  <View style={[styles.stepDotCurrent, { backgroundColor: buttonBlue }]} />
                  <View style={[styles.stepDot, { backgroundColor: colors.border }]} />
                </View>
              </View>
            </View>

            {/* Intro */}
            <View style={styles.intro}>
              <View style={[styles.iconWrap, { backgroundColor: colors.blueSoft }]}>
                <Ionicons name="navigate-outline" size={27} color={actionBlue} />
              </View>

              <Text style={[styles.eyebrow, { color: actionBlue }]}>
                YOUR SERVICE AREA AND TRANSPORT
              </Text>

              <Text style={[styles.title, { color: colors.text }]}>
                Where and how will you work?
              </Text>

              <Text style={[styles.subtitle, { color: supportingText }]}>
                Tell us your main operating area and the transport you intend to use for customer errands.
              </Text>
            </View>

            {sessionExpired && accessState ? (
              <View style={[styles.accountNotice, { backgroundColor: colors.dangerSoft }]}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.red} />
                <View style={styles.accountNoticeCopy}>
                  <Text style={[styles.accountNoticeTitle, { color: colors.text }]}>Runner session expired</Text>
                  <Text style={[styles.accountNoticeText, { color: supportingText }]}>
                    Your saved transport details remain on your account. Sign in again to make changes.
                  </Text>
                  <Pressable onPress={() => router.replace("/(auth)/login")} hitSlop={8}>
                    <Text style={[styles.accountNoticeAction, { color: actionBlue }]}>Sign in again</Text>
                  </Pressable>
                </View>
              </View>
            ) : isApproved ? (
              <View style={[styles.accountNotice, { backgroundColor: colors.successSoft }]}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
                <View style={styles.accountNoticeCopy}>
                  <Text style={[styles.accountNoticeTitle, { color: colors.text }]}>Runner account approved</Text>
                  <Text style={[styles.accountNoticeText, { color: supportingText }]}>
                    Your transport details are read-only after approval.
                  </Text>
                  <Pressable onPress={() => router.replace("/(app)")} hitSlop={8}>
                    <Text style={[styles.accountNoticeAction, { color: actionBlue }]}>Open Runner dashboard</Text>
                  </Pressable>
                </View>
              </View>
            ) : isPendingReview ? (
              <View style={[styles.accountNotice, { backgroundColor: colors.warningSoft }]}>
                <Ionicons name="time-outline" size={20} color={colors.warning} />
                <View style={styles.accountNoticeCopy}>
                  <Text style={[styles.accountNoticeTitle, { color: colors.text }]}>Application under review</Text>
                  <Text style={[styles.accountNoticeText, { color: supportingText }]}>
                    Your submitted transport details cannot be changed while SaMi Operations reviews your application.
                  </Text>
                  <Pressable onPress={() => router.push("/(app)/profile-setup?mode=status")} hitSlop={8}>
                    <Text style={[styles.accountNoticeAction, { color: actionBlue }]}>View application status</Text>
                  </Pressable>
                </View>
              </View>
            ) : isRestricted ? (
              <View style={[styles.accountNotice, { backgroundColor: colors.dangerSoft }]}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.red} />
                <View style={styles.accountNoticeCopy}>
                  <Text style={[styles.accountNoticeTitle, { color: colors.text }]}>Account access restricted</Text>
                  <Text style={[styles.accountNoticeText, { color: supportingText }]}>
                    Transport details cannot be changed for this Runner account. Contact SaMi Operations for assistance.
                  </Text>
                </View>
              </View>
            ) : !hasCategories && accessState ? (
              <View style={[styles.accountNotice, { backgroundColor: colors.blueSoft }]}>
                <Ionicons name="information-circle-outline" size={20} color={actionBlue} />
                <View style={styles.accountNoticeCopy}>
                  <Text style={[styles.accountNoticeTitle, { color: colors.text }]}>Choose task categories first</Text>
                  <Text style={[styles.accountNoticeText, { color: supportingText }]}>
                    Your transport setup depends on the services you offer. You can leave this screen and return later.
                  </Text>
                  <Pressable onPress={() => router.push("/(auth)/tasks")} hitSlop={8}>
                    <Text style={[styles.accountNoticeAction, { color: actionBlue }]}>Choose task categories</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Category summary */}
            <View style={[styles.categorySummary, { backgroundColor: colors.blueSoft, borderColor: colors.border }]}>
              <Ionicons name="checkmark-circle-outline" size={22} color={actionBlue} />
              <View style={styles.categorySummaryCopy}>
                <Text style={[styles.categorySummaryTitle, { color: colors.text }]}>
                  {selectedCategoryCount} task {selectedCategoryCount === 1 ? "type" : "types"} selected
                </Text>
                <Text style={[styles.categorySummarySubtitle, { color: supportingText }]}>
                  Your saved task choices determine some of your document requirements.
                </Text>
              </View>
            </View>

            {/* Initial loading and load failure */}
            {showFullLoading ? (
              <View style={styles.loadingState} accessibilityRole="progressbar" accessibilityLabel="Loading your transport details">
                <ActivityIndicator size="large" color={actionBlue} />
                <Text style={[styles.loadingText, { color: supportingText }]}>Loading your details...</Text>
              </View>
            ) : showFullError ? (
              <View style={[styles.loadError, { backgroundColor: colors.dangerSoft }]}>
                <Ionicons name="alert-circle-outline" size={20} color={colors.red} />
                <Text style={[styles.loadErrorText, { color: colors.red }]}>{loadError}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={sessionExpired ? "Sign in again" : "Retry loading transport details"} hitSlop={10} onPress={() => sessionExpired ? router.replace("/(auth)/login") : void loadTransportDetails()} style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.55 : 1 }]}>
                  <Text style={[styles.retryText, { color: actionBlue }]}>{sessionExpired ? "Sign in" : "Retry"}</Text>
                </Pressable>
              </View>
            ) : accessState ? (
              <>
                {loadError ? (
                  <View style={[styles.refreshWarning, { backgroundColor: colors.dangerSoft }]}>
                    <Ionicons name="alert-circle-outline" size={17} color={colors.red} />
                    <Text style={[styles.refreshWarningText, { color: colors.red }]}>
                      The latest server state could not be refreshed. Editing is paused until the connection is restored.
                    </Text>
                    <Pressable onPress={() => void loadTransportDetails()} hitSlop={8}>
                      <Text style={[styles.retryText, { color: actionBlue }]}>Retry</Text>
                    </Pressable>
                  </View>
                ) : null}

                {/* Service area */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    Main service area <Text style={{ color: colors.red }}>*</Text>
                  </Text>

                  <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: areaFocused ? actionBlue : colors.border }, areaFocused && Platform.select({ ios: { shadowColor: actionBlue, shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 1 }, default: {} })]}>
                    <Ionicons name="location-outline" size={20} color={areaFocused ? actionBlue : supportingText} />
                    <TextInput
                      value={serviceArea}
                      onChangeText={(value) => { setServiceArea(value); setError(""); }}
                      onFocus={() => setAreaFocused(true)}
                      onBlur={() => setAreaFocused(false)}
                      editable={canEditTransport}
                      placeholder="e.g. Kilimani, Nairobi"
                      placeholderTextColor={supportingText}
                      autoCapitalize="words"
                      autoCorrect={false}
                      maxLength={120}
                      returnKeyType="done"
                      selectionColor={actionBlue}
                      cursorColor={actionBlue}
                      style={[styles.input, { color: colors.text }]}
                      accessibilityLabel="Main service area"
                    />
                  </View>

                  <Text style={[styles.fieldHint, { color: supportingText }]}>
                    Enter your town, estate or neighbourhood. This is where you expect to handle most of your errands.
                  </Text>
                </View>

                {/* Vehicle selection */}
                <View style={styles.vehicleSection}>
                  <View style={styles.sectionHeading}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                      What transport will you use? <Text style={{ color: colors.red }}>*</Text>
                    </Text>
                    <Text style={[styles.sectionSubtitle, { color: supportingText }]}>Select one option.</Text>
                  </View>

                  <View style={styles.vehicleList}>
                    {VEHICLES.map((vehicle) => {
                      const selected = vehicleType === vehicle.value;
                      return (
                        <Pressable
                          key={vehicle.value}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected, disabled: !canEditTransport }}
                          accessibilityLabel={`${vehicle.title}. ${vehicle.description}`}
                          disabled={!canEditTransport}
                          onPress={() => chooseVehicle(vehicle.value)}
                          style={({ pressed }) => [
                            styles.vehicleCard,
                            {
                              backgroundColor: selected ? colors.blueSoft : colors.surface,
                              borderColor: selected ? actionBlue : colors.border,
                              opacity: !canEditTransport ? 0.72 : pressed ? 0.88 : 1,
                              transform: [{ scale: pressed ? 0.995 : 1 }],
                            },
                            selected && Platform.select({ ios: { shadowColor: actionBlue, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }, android: { elevation: 2 }, default: {} }),
                          ]}
                        >
                          <View style={[styles.vehicleIcon, { backgroundColor: selected ? buttonBlue : colors.paper }]}>
                            <Ionicons name={vehicle.icon} size={23} color={selected ? "#FFFFFF" : actionBlue} />
                          </View>

                          <View style={styles.vehicleCopy}>
                            <Text style={[styles.vehicleTitle, { color: colors.text }]}>{vehicle.title}</Text>
                            <Text style={[styles.vehicleDescription, { color: supportingText }]}>{vehicle.description}</Text>
                          </View>

                          <View style={[styles.radioOuter, { borderColor: selected ? actionBlue : colors.border, backgroundColor: selected ? buttonBlue : "transparent" }]}>
                            {selected ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Registration — animated in when required */}
                {showRegistrationField ? (
                  <Animated.View style={{ opacity: regFieldAnim, transform: [{ translateY: regFieldAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
                    <View style={styles.fieldGroup}>
                      <Text style={[styles.label, { color: colors.text }]}>
                        Vehicle registration number <Text style={{ color: colors.red }}>*</Text>
                      </Text>

                      <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: regFocused ? actionBlue : colors.border }, regFocused && Platform.select({ ios: { shadowColor: actionBlue, shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 1 }, default: {} })]}>
                        <Ionicons name="car-outline" size={20} color={regFocused ? actionBlue : supportingText} />
                        <TextInput
                          value={vehicleRegistration}
                          onChangeText={(value) => { setVehicleRegistration(value.toUpperCase()); setError(""); }}
                          onFocus={() => setRegFocused(true)}
                          onBlur={() => setRegFocused(false)}
                          editable={canEditTransport}
                          placeholder="e.g. KDA 123A"
                          placeholderTextColor={supportingText}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          maxLength={30}
                          returnKeyType="done"
                          selectionColor={actionBlue}
                          cursorColor={actionBlue}
                          style={[styles.input, { color: colors.text }]}
                          accessibilityLabel="Vehicle registration number"
                        />
                      </View>

                      <Text style={[styles.fieldHint, { color: supportingText }]}>
                        Enter the registration number of the vehicle you intend to use. Supporting vehicle documents will be requested separately.
                      </Text>
                    </View>
                  </Animated.View>
                ) : null}

                {/* Info */}
                <View style={[styles.infoBox, { backgroundColor: colors.blueSoft }]}>
                  <Ionicons name="information-circle-outline" size={19} color={actionBlue} />
                  <Text style={[styles.infoText, { color: colors.text }]}>
                    Your transport choice affects which verification documents SaMi requests. Motorbikes and vehicles require their relevant registration and ownership or authority evidence. Document uploads will be handled on the next page.
                  </Text>
                </View>
              </>
            ) : null}

            {/* Validation error */}
            {error ? (
              <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.errorContainer, { backgroundColor: colors.dangerSoft }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
                <Text style={[styles.errorText, { color: colors.red }]}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Bottom bar: explicit user actions only */}
          {accessState && !showFullLoading && !showFullError ? (
            <View style={[styles.bottomBar, { backgroundColor: colors.paper, borderTopColor: colors.border }]}>
              {sessionExpired ? (
                <Pressable accessibilityRole="button" onPress={() => router.replace("/(auth)/login")} style={({ pressed }) => [styles.primaryButton, { backgroundColor: buttonBlue }, pressed && styles.pressed]}>
                  <Text style={styles.primaryButtonText}>Sign in again</Text>
                  <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                </Pressable>
              ) : isApproved ? (
                <Pressable accessibilityRole="button" onPress={() => router.replace("/(app)")} style={({ pressed }) => [styles.primaryButton, { backgroundColor: buttonBlue }, pressed && styles.pressed]}>
                  <Text style={styles.primaryButtonText}>Open Runner dashboard</Text>
                  <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                </Pressable>
              ) : isPendingReview ? (
                <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/profile-setup?mode=status")} style={({ pressed }) => [styles.primaryButton, { backgroundColor: buttonBlue }, pressed && styles.pressed]}>
                  <Text style={styles.primaryButtonText}>View application status</Text>
                  <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                </Pressable>
              ) : isRestricted ? null : !hasCategories ? (
                <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/tasks")} style={({ pressed }) => [styles.primaryButton, { backgroundColor: buttonBlue }, pressed && styles.pressed]}>
                  <Text style={styles.primaryButtonText}>Choose task categories</Text>
                  <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save and continue"
                  accessibilityHint="Saves your transport details and opens the documents step"
                  accessibilityState={{ busy: saving, disabled: !canEditTransport }}
                  disabled={!canEditTransport}
                  onPress={() => void saveTransportDetails()}
                  style={({ pressed }) => [styles.primaryButton, { backgroundColor: buttonBlue }, !canEditTransport && styles.disabled, pressed && canEditTransport && styles.pressed]}
                >
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <>
                    <Text style={styles.primaryButtonText}>Save and continue</Text>
                    <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                  </>}
                </Pressable>
              )}

              {!isRestricted ? (
                <Text style={[styles.bottomHint, { color: supportingText }]}>
                  {sessionExpired
                    ? "Your saved application details remain on your account."
                    : isApproved
                      ? "Your transport details remain available for reference."
                      : isPendingReview
                        ? "Your application is being reviewed. You can leave and return later."
                        : !hasCategories
                          ? "Choose your task categories before saving transport details."
                          : "You can review these details before submitting your application."}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardContainer: { flex: 1 },
  container: { flex: 1 },

  accountNotice: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  accountNoticeCopy: { flex: 1, gap: 5 },
  accountNoticeTitle: { fontSize: 13, fontWeight: "900", lineHeight: 18 },
  accountNoticeText: { fontSize: 12, lineHeight: 18 },
  accountNoticeAction: { fontSize: 12, fontWeight: "900", paddingTop: 2 },
  refreshWarning: {
    borderRadius: 13,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  refreshWarningText: { flex: 1, fontSize: 11.5, lineHeight: 17 },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 22,
  },

  // Header ---------------------------------------------------------------
  header: {
    minHeight: BACK_SIZE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backButton: {
    width: BACK_SIZE,
    height: BACK_SIZE,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  brand: {
    alignItems: "center",
    gap: 3,
  },

  brandName: {
    fontSize: 19,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },

  brandTagline: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
  },

  headerSpacer: { width: BACK_SIZE },

  // Progress -------------------------------------------------------------
  progressSection: { gap: 10 },

  progressTrack: {
    height: 6,
    borderRadius: 6,
    overflow: "hidden",
  },

  progressFill: {
    width: "66.66%",
    height: "100%",
    borderRadius: 6,
  },

  progressMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  progressText: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  progressDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  stepDotCurrent: {
    width: 16,
    height: 6,
    borderRadius: 3,
  },

  // Intro ---------------------------------------------------------------
  intro: { gap: 10 },

  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.7,
  },

  subtitle: {
    fontSize: 13.5,
    lineHeight: 21,
  },

  // Category summary ----------------------------------------------------
  categorySummary: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  categorySummaryCopy: {
    flex: 1,
    gap: 4,
  },

  categorySummaryTitle: {
    fontSize: 13,
    fontWeight: "900",
  },

  categorySummarySubtitle: {
    fontSize: 11.5,
    lineHeight: 17,
  },

  // Fields --------------------------------------------------------------
  fieldGroup: { gap: 9 },

  label: {
    fontSize: 13,
    fontWeight: "800",
  },

  inputContainer: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 11,
  },

  input: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 10,
    fontSize: 15,
  },

  fieldHint: {
    fontSize: 11.5,
    lineHeight: 17,
  },

  // Vehicle list --------------------------------------------------------
  vehicleSection: { gap: 13 },

  sectionHeading: { gap: 5 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
  },

  sectionSubtitle: { fontSize: 12 },

  vehicleList: { gap: 10 },

  vehicleCard: {
    minHeight: 84,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  vehicleIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  vehicleCopy: {
    flex: 1,
    gap: 4,
  },

  vehicleTitle: {
    fontSize: 13.5,
    fontWeight: "900",
  },

  vehicleDescription: {
    fontSize: 11.5,
    lineHeight: 16,
  },

  radioOuter: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  // Info + states -------------------------------------------------------
  infoBox: {
    padding: 13,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  loadingState: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  loadingText: { fontSize: 12 },

  loadError: {
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  loadErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  retryButton: { padding: 6 },

  retryText: {
    fontSize: 12,
    fontWeight: "900",
  },

  errorContainer: {
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  // Bottom bar ----------------------------------------------------------
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 13,
    paddingBottom: 10,
    borderTopWidth: 1,
    gap: 9,
  },

  primaryButton: {
    minHeight: 58,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  bottomHint: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    maxWidth: 340,
    alignSelf: "center",
  },

  disabled: { opacity: 0.5 },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});