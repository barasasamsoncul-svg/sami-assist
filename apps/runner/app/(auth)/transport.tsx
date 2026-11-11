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

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getRunnerOnboarding,
  updateRunnerOnboarding,
} from "@/api";

import { useRunnerTheme } from "@/theme";

type VehicleType =
  | "motorcycle"
  | "bicycle"
  | "car"
  | "van"
  | "other";

type VehicleOption = {
  value: VehicleType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const VEHICLES: VehicleOption[] = [
  {
    value: "motorcycle",
    title: "Motorcycle",
    description: "Motorbike or scooter used for errands.",
    icon: "bicycle-outline",
  },
  {
    value: "bicycle",
    title: "Bicycle",
    description: "Pedal bicycle used for nearby errands.",
    icon: "bicycle-outline",
  },
  {
    value: "car",
    title: "Car",
    description: "Private car used to carry customers' items.",
    icon: "car-outline",
  },
  {
    value: "van",
    title: "Van",
    description: "Van or larger vehicle for suitable deliveries.",
    icon: "bus-outline",
  },
  {
    value: "other",
    title: "Other",
    description: "Another transport arrangement.",
    icon: "apps-outline",
  },
];

const VEHICLES_REQUIRING_REGISTRATION: VehicleType[] = [
  "motorcycle",
  "car",
  "van",
];

const BACK_SIZE = 44;

function requiresVehicleRegistration(
  value: VehicleType,
): boolean {
  return VEHICLES_REQUIRING_REGISTRATION.includes(value);
}

export default function RunnerTransportScreen() {
  const { colors } = useRunnerTheme();

  const [serviceArea, setServiceArea] = useState("");
  const [vehicleType, setVehicleType] =
    useState<VehicleType | "">("");
  const [vehicleRegistration, setVehicleRegistration] =
    useState("");

  const [selectedCategoryCount, setSelectedCategoryCount] =
    useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [areaFocused, setAreaFocused] = useState(false);
  const [regFocused, setRegFocused] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const regFieldAnim = useRef(new Animated.Value(0)).current;
  const regFieldShownRef = useRef(false);

  const loadTransportDetails = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setError("");

    try {
      const result = await getRunnerOnboarding();

      if (result.onboardingStatus === "approved") {
        router.replace("/(app)");
        return;
      }

      if (result.onboardingStatus === "pending_review") {
        router.replace({
          pathname: "/(app)/profile-setup",
          params: { mode: "status" },
        });
        return;
      }

      const selectedCategories =
        result.runner.selectedCategories || [];

      if (selectedCategories.length === 0) {
        router.replace("/(auth)/tasks");
        return;
      }

      setSelectedCategoryCount(selectedCategories.length);
      setServiceArea(result.runner.serviceArea || "");

      const savedVehicle = result.runner.vehicleType || "";

      if (
        VEHICLES.some(
          (vehicle) => vehicle.value === savedVehicle,
        )
      ) {
        setVehicleType(savedVehicle as VehicleType);
      } else {
        setVehicleType("");
      }

      setVehicleRegistration(
        result.runner.vehicleRegistration || "",
      );
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Your transport details could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransportDetails();
  }, [loadTransportDetails]);

  const showRegistrationField =
    vehicleType !== "" &&
    requiresVehicleRegistration(vehicleType);

  // Animate the registration field in the first time it appears.
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

  function chooseVehicle(value: VehicleType) {
    if (value === vehicleType) return;

    setVehicleType(value);
    setError("");

    if (!requiresVehicleRegistration(value)) {
      setVehicleRegistration("");
    }
  }

  async function saveTransportDetails() {
    const normalizedArea = serviceArea
      .trim()
      .replace(/\s+/g, " ");

    const normalizedRegistration = vehicleRegistration
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");

    if (selectedCategoryCount === 0) {
      setError(
        "Choose your task categories before entering your transport details.",
      );
      return;
    }

    if (normalizedArea.length < 2) {
      setError(
        "Enter the main area where you will provide services.",
      );
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
      setError(
        "Enter the registration number of your vehicle.",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateRunnerOnboarding({
        serviceArea: normalizedArea,
        vehicleType,
        vehicleRegistration: requiresVehicleRegistration(
          vehicleType,
        )
          ? normalizedRegistration
          : "",
      });

      // Keep Transport in the navigation history.
      router.push("/(auth)/documents");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your transport details could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const isDarkPaper = colors.paper === "#080F1D";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
    >
      <StatusBar
        barStyle={isDarkPaper ? "light-content" : "dark-content"}
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
                accessibilityLabel="Go back to task selection"
                disabled={saving}
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace("/(auth)/tasks");
                  }
                }}
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
                <Ionicons
                  name="chevron-back"
                  size={22}
                  color={colors.text}
                />
              </Pressable>

              <View style={styles.brand}>
                <Text style={[styles.brandName, { color: colors.navy }]}>
                  SaMi{" "}
                  <Text style={{ color: colors.blue }}>Runner</Text>
                </Text>

                <Text
                  style={[
                    styles.brandTagline,
                    { color: colors.textMuted },
                  ]}
                >
                  CONSIDER IT DONE
                </Text>
              </View>

              <View style={styles.headerSpacer} />
            </View>

            {/* Progress */}
            <View style={styles.progressSection}>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.blue },
                  ]}
                />
              </View>

              <View style={styles.progressMeta}>
                <Text
                  style={[
                    styles.progressText,
                    { color: colors.textMuted },
                  ]}
                >
                  STEP 2 OF 3 · TRANSPORT DETAILS
                </Text>

                <View style={styles.progressDots}>
                  <View
                    style={[
                      styles.stepDot,
                      { backgroundColor: colors.blue },
                    ]}
                  />
                  <View
                    style={[
                      styles.stepDotCurrent,
                      { backgroundColor: colors.blue },
                    ]}
                  />
                  <View
                    style={[
                      styles.stepDot,
                      { backgroundColor: colors.border },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* Intro */}
            <View style={styles.intro}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="navigate-outline"
                  size={27}
                  color={colors.blue}
                />
              </View>

              <Text style={[styles.eyebrow, { color: colors.blue }]}>
                YOUR SERVICE AREA AND TRANSPORT
              </Text>

              <Text style={[styles.title, { color: colors.text }]}>
                Where and how will you work?
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  { color: colors.textMuted },
                ]}
              >
                Tell us your main operating area and the transport you
                intend to use for customer errands.
              </Text>
            </View>

            {/* Category summary */}
            <View
              style={[
                styles.categorySummary,
                {
                  backgroundColor: colors.blueSoft,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={22}
                color={colors.blue}
              />

              <View style={styles.categorySummaryCopy}>
                <Text
                  style={[
                    styles.categorySummaryTitle,
                    { color: colors.text },
                  ]}
                >
                  {selectedCategoryCount} task types selected
                </Text>

                <Text
                  style={[
                    styles.categorySummarySubtitle,
                    { color: colors.textMuted },
                  ]}
                >
                  Your saved task choices will determine some of your
                  document requirements.
                </Text>
              </View>
            </View>

            {/* Body */}
            {loading ? (
              <View
                style={styles.loadingState}
                accessibilityRole="progressbar"
                accessibilityLabel="Loading your transport details"
              >
                <ActivityIndicator
                  size="large"
                  color={colors.blue}
                />
                <Text
                  style={[
                    styles.loadingText,
                    { color: colors.textMuted },
                  ]}
                >
                  Loading your details...
                </Text>
              </View>
            ) : loadError ? (
              <View
                style={[
                  styles.loadError,
                  { backgroundColor: colors.dangerSoft },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={colors.red}
                />
                <Text
                  style={[
                    styles.loadErrorText,
                    { color: colors.red },
                  ]}
                >
                  {loadError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading transport details"
                  hitSlop={10}
                  onPress={() => void loadTransportDetails()}
                  style={({ pressed }) => [
                    styles.retryButton,
                    { opacity: pressed ? 0.55 : 1 },
                  ]}
                >
                  <Text
                    style={[
                      styles.retryText,
                      { color: colors.blue },
                    ]}
                  >
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                {/* Service area */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    Main service area
                    <Text style={{ color: colors.red }}> *</Text>
                  </Text>

                  <View
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: colors.surface,
                        borderColor: areaFocused
                          ? colors.blue
                          : colors.border,
                      },
                      areaFocused &&
                        Platform.select({
                          ios: {
                            shadowColor: colors.blue,
                            shadowOpacity: 0.16,
                            shadowRadius: 6,
                            shadowOffset: { width: 0, height: 2 },
                          },
                          android: { elevation: 1 },
                          default: {},
                        }),
                    ]}
                  >
                    <Ionicons
                      name="location-outline"
                      size={20}
                      color={areaFocused ? colors.blue : colors.textMuted}
                    />

                    <TextInput
                      value={serviceArea}
                      onChangeText={(value) => {
                        setServiceArea(value);
                        setError("");
                      }}
                      onFocus={() => setAreaFocused(true)}
                      onBlur={() => setAreaFocused(false)}
                      editable={!saving}
                      placeholder="e.g. Kilimani, Nairobi"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="words"
                      autoCorrect={false}
                      maxLength={120}
                      returnKeyType="done"
                      selectionColor={colors.blue}
                      cursorColor={colors.blue}
                      style={[styles.input, { color: colors.text }]}
                      accessibilityLabel="Main service area"
                    />
                  </View>

                  <Text
                    style={[
                      styles.fieldHint,
                      { color: colors.textMuted },
                    ]}
                  >
                    Enter your town, estate or neighbourhood. This is
                    where you expect to handle most of your errands.
                  </Text>
                </View>

                {/* Vehicle selection */}
                <View style={styles.vehicleSection}>
                  <View style={styles.sectionHeading}>
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: colors.text },
                      ]}
                    >
                      What transport will you use?
                      <Text style={{ color: colors.red }}> *</Text>
                    </Text>

                    <Text
                      style={[
                        styles.sectionSubtitle,
                        { color: colors.textMuted },
                      ]}
                    >
                      Select one option.
                    </Text>
                  </View>

                  <View style={styles.vehicleList}>
                    {VEHICLES.map((vehicle) => {
                      const selected = vehicleType === vehicle.value;

                      return (
                        <Pressable
                          key={vehicle.value}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          accessibilityLabel={`${vehicle.title}. ${vehicle.description}`}
                          onPress={() => chooseVehicle(vehicle.value)}
                          style={({ pressed }) => [
                            styles.vehicleCard,
                            {
                              backgroundColor: selected
                                ? colors.blueSoft
                                : colors.surface,
                              borderColor: selected
                                ? colors.blue
                                : colors.border,
                              opacity: pressed ? 0.88 : 1,
                              transform: [
                                { scale: pressed ? 0.995 : 1 },
                              ],
                            },
                            selected &&
                              Platform.select({
                                ios: {
                                  shadowColor: colors.blue,
                                  shadowOpacity: 0.12,
                                  shadowRadius: 6,
                                  shadowOffset: {
                                    width: 0,
                                    height: 3,
                                  },
                                },
                                android: { elevation: 2 },
                                default: {},
                              }),
                          ]}
                        >
                          <View
                            style={[
                              styles.vehicleIcon,
                              {
                                backgroundColor: selected
                                  ? colors.blue
                                  : colors.paper,
                              },
                            ]}
                          >
                            <Ionicons
                              name={vehicle.icon}
                              size={23}
                              color={
                                selected ? "#FFFFFF" : colors.blue
                              }
                            />
                          </View>

                          <View style={styles.vehicleCopy}>
                            <Text
                              style={[
                                styles.vehicleTitle,
                                { color: colors.text },
                              ]}
                            >
                              {vehicle.title}
                            </Text>

                            <Text
                              style={[
                                styles.vehicleDescription,
                                { color: colors.textMuted },
                              ]}
                            >
                              {vehicle.description}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.radioOuter,
                              {
                                borderColor: selected
                                  ? colors.blue
                                  : colors.border,
                                backgroundColor: selected
                                  ? colors.blue
                                  : "transparent",
                              },
                            ]}
                          >
                            {selected ? (
                              <Ionicons
                                name="checkmark"
                                size={14}
                                color="#FFFFFF"
                              />
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Registration — animated in when required */}
                {showRegistrationField ? (
                  <Animated.View
                    style={{
                      opacity: regFieldAnim,
                      transform: [
                        {
                          translateY: regFieldAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-6, 0],
                          }),
                        },
                      ],
                    }}
                  >
                    <View style={styles.fieldGroup}>
                      <Text
                        style={[
                          styles.label,
                          { color: colors.text },
                        ]}
                      >
                        Vehicle registration number
                        <Text style={{ color: colors.red }}> *</Text>
                      </Text>

                      <View
                        style={[
                          styles.inputContainer,
                          {
                            backgroundColor: colors.surface,
                            borderColor: regFocused
                              ? colors.blue
                              : colors.border,
                          },
                          regFocused &&
                            Platform.select({
                              ios: {
                                shadowColor: colors.blue,
                                shadowOpacity: 0.16,
                                shadowRadius: 6,
                                shadowOffset: {
                                  width: 0,
                                  height: 2,
                                },
                              },
                              android: { elevation: 1 },
                              default: {},
                            }),
                        ]}
                      >
                        <Ionicons
                          name="car-outline"
                          size={20}
                          color={
                            regFocused ? colors.blue : colors.textMuted
                          }
                        />

                        <TextInput
                          value={vehicleRegistration}
                          onChangeText={(value) => {
                            setVehicleRegistration(value.toUpperCase());
                            setError("");
                          }}
                          onFocus={() => setRegFocused(true)}
                          onBlur={() => setRegFocused(false)}
                          editable={!saving}
                          placeholder="e.g. KDA 123A"
                          placeholderTextColor={colors.textMuted}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          maxLength={30}
                          returnKeyType="done"
                          selectionColor={colors.blue}
                          cursorColor={colors.blue}
                          style={[
                            styles.input,
                            { color: colors.text },
                          ]}
                          accessibilityLabel="Vehicle registration number"
                        />
                      </View>

                      <Text
                        style={[
                          styles.fieldHint,
                          { color: colors.textMuted },
                        ]}
                      >
                        Enter the registration number of the vehicle
                        you intend to use. Supporting vehicle documents
                        will be requested separately.
                      </Text>
                    </View>
                  </Animated.View>
                ) : null}

                {/* Info */}
                <View
                  style={[
                    styles.infoBox,
                    { backgroundColor: colors.blueSoft },
                  ]}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={19}
                    color={colors.blue}
                  />

                  <Text
                    style={[
                      styles.infoText,
                      { color: colors.text },
                    ]}
                  >
                    Your transport choice affects which verification
                    documents SaMi requests. For example, motorised
                    vehicles require relevant vehicle evidence.
                    Document uploads will be handled on the next page.
                  </Text>
                </View>
              </>
            )}

            {/* Validation error */}
            {error ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[
                  styles.errorContainer,
                  { backgroundColor: colors.dangerSoft },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={colors.red}
                />

                <Text
                  style={[styles.errorText, { color: colors.red }]}
                >
                  {error}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Bottom bar */}
          {!loading && !loadError ? (
            <View
              style={[
                styles.bottomBar,
                {
                  backgroundColor: colors.paper,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save and continue"
                accessibilityHint="Saves your transport details and opens the documents step"
                disabled={saving}
                onPress={() => void saveTransportDetails()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.blue },
                  saving && styles.disabled,
                  pressed && !saving && styles.pressed,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>
                      Save and continue
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={19}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </Pressable>

              <Text
                style={[
                  styles.bottomHint,
                  { color: colors.textMuted },
                ]}
              >
                You can review these details before submitting your
                application.
              </Text>
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