
import { useEffect, useState } from "react";

import {
  ActivityIndicator,
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

  async function loadTransportDetails() {
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
  }

  useEffect(() => {
    void loadTransportDetails();
  }, []);

  function chooseVehicle(value: VehicleType) {
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

      router.replace("/(auth)/documents");
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

  const showRegistrationField =
    vehicleType !== "" &&
    requiresVehicleRegistration(vehicleType);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[
        styles.safeArea,
        { backgroundColor: colors.paper },
      ]}
    >
      <StatusBar
        barStyle={
          colors.paper === "#080F1D"
            ? "light-content"
            : "dark-content"
        }
        backgroundColor={colors.paper}
      />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={
          Platform.OS === "ios" ? "padding" : "height"
        }
        keyboardVerticalOffset={
          Platform.OS === "ios" ? 8 : 0
        }
      >
        <View style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back to task selection"
                disabled={saving}
                onPress={() => router.replace("/(auth)/tasks")}
                style={[
                  styles.backButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={21}
                  color={colors.text}
                />
              </Pressable>

              <View style={styles.brand}>
                <Text
                  style={[
                    styles.brandName,
                    { color: colors.navy },
                  ]}
                >
                  SaMi{" "}
                  <Text style={{ color: colors.blue }}>
                    Runner
                  </Text>
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

              <Text
                style={[
                  styles.progressText,
                  { color: colors.textMuted },
                ]}
              >
                STEP 2 OF 3 · TRANSPORT DETAILS
              </Text>
            </View>

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

              <Text
                style={[
                  styles.eyebrow,
                  { color: colors.blue },
                ]}
              >
                YOUR SERVICE AREA AND TRANSPORT
              </Text>

              <Text
                style={[
                  styles.title,
                  { color: colors.text },
                ]}
              >
                Where and how will you work?
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  { color: colors.textMuted },
                ]}
              >
                Tell us your main operating area and
                the transport you intend to use for
                customer errands.
              </Text>
            </View>

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
                size={21}
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
                  Your saved task choices will determine
                  some of your document requirements.
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingState}>
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
                  onPress={() => void loadTransportDetails()}
                  style={styles.retryButton}
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
                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      styles.label,
                      { color: colors.text },
                    ]}
                  >
                    Main service area
                    <Text style={{ color: colors.red }}>
                      {" "}*
                    </Text>
                  </Text>

                  <View
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="location-outline"
                      size={20}
                      color={colors.textMuted}
                    />

                    <TextInput
                      value={serviceArea}
                      onChangeText={(value) => {
                        setServiceArea(value);
                        setError("");
                      }}
                      placeholder="e.g. Kilimani, Nairobi"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="words"
                      autoCorrect={false}
                      maxLength={120}
                      returnKeyType="done"
                      style={[
                        styles.input,
                        { color: colors.text },
                      ]}
                      accessibilityLabel="Main service area"
                    />
                  </View>

                  <Text
                    style={[
                      styles.fieldHint,
                      { color: colors.textMuted },
                    ]}
                  >
                    Enter your town, estate or neighbourhood.
                    This is where you expect to handle most
                    of your errands.
                  </Text>
                </View>

                <View style={styles.vehicleSection}>
                  <View style={styles.sectionHeading}>
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: colors.text },
                      ]}
                    >
                      What transport will you use?
                      <Text style={{ color: colors.red }}>
                        {" "}*
                      </Text>
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
                      const selected =
                        vehicleType === vehicle.value;

                      return (
                        <Pressable
                          key={vehicle.value}
                          accessibilityRole="radio"
                          accessibilityState={{
                            checked: selected,
                          }}
                          onPress={() =>
                            chooseVehicle(vehicle.value)
                          }
                          style={[
                            styles.vehicleCard,
                            {
                              backgroundColor: selected
                                ? colors.blueSoft
                                : colors.surface,
                              borderColor: selected
                                ? colors.blue
                                : colors.border,
                            },
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
                                selected
                                  ? "#FFFFFF"
                                  : colors.blue
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
                              },
                            ]}
                          >
                            {selected ? (
                              <View
                                style={[
                                  styles.radioInner,
                                  { backgroundColor: colors.blue },
                                ]}
                              />
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {showRegistrationField ? (
                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        styles.label,
                        { color: colors.text },
                      ]}
                    >
                      Vehicle registration number
                      <Text style={{ color: colors.red }}>
                        {" "}*
                      </Text>
                    </Text>

                    <View
                      style={[
                        styles.inputContainer,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="car-outline"
                        size={20}
                        color={colors.textMuted}
                      />

                      <TextInput
                        value={vehicleRegistration}
                        onChangeText={(value) => {
                          setVehicleRegistration(
                            value.toUpperCase(),
                          );
                          setError("");
                        }}
                        placeholder="e.g. KDA 123A"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={30}
                        returnKeyType="done"
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
                      Enter the registration number of the
                      vehicle you intend to use. Supporting
                      vehicle documents will be requested
                      separately.
                    </Text>
                  </View>
                ) : null}

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
                    Your transport choice affects which
                    verification documents SaMi requests.
                    For example, motorised vehicles require
                    relevant vehicle evidence. Document
                    uploads will be handled on the next
                    page.
                  </Text>
                </View>
              </>
            )}

            {error ? (
              <View
                accessibilityRole="alert"
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
                  style={[
                    styles.errorText,
                    { color: colors.red },
                  ]}
                >
                  {error}
                </Text>
              </View>
            ) : null}
          </ScrollView>

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
                You can review these details before submitting
                your application.
              </Text>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  keyboardContainer: {
    flex: 1,
  },

  container: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 23,
  },

  header: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
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
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 2,
  },

  headerSpacer: {
    width: 42,
  },

  progressSection: {
    gap: 9,
  },

  progressTrack: {
    height: 5,
    borderRadius: 5,
    overflow: "hidden",
  },

  progressFill: {
    width: "66.66%",
    height: "100%",
    borderRadius: 5,
  },

  progressText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  intro: {
    gap: 10,
  },

  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  title: {
    fontSize: 27,
    lineHeight: 35,
    fontWeight: "900",
    letterSpacing: -0.7,
  },

  subtitle: {
    fontSize: 13,
    lineHeight: 21,
  },

  categorySummary: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  categorySummaryCopy: {
    flex: 1,
    gap: 4,
  },

  categorySummaryTitle: {
    fontSize: 12,
    fontWeight: "900",
  },

  categorySummarySubtitle: {
    fontSize: 10,
    lineHeight: 15,
  },

  fieldGroup: {
    gap: 9,
  },

  label: {
    fontSize: 12,
    fontWeight: "800",
  },

  inputContainer: {
    minHeight: 57,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 11,
  },

  input: {
    flex: 1,
    minHeight: 55,
    paddingVertical: 10,
    fontSize: 14,
  },

  fieldHint: {
    fontSize: 10,
    lineHeight: 16,
  },

  vehicleSection: {
    gap: 13,
  },

  sectionHeading: {
    gap: 5,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
  },

  sectionSubtitle: {
    fontSize: 11,
  },

  vehicleList: {
    gap: 10,
  },

  vehicleCard: {
    minHeight: 78,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  vehicleIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  vehicleCopy: {
    flex: 1,
    gap: 4,
  },

  vehicleTitle: {
    fontSize: 12,
    fontWeight: "900",
  },

  vehicleDescription: {
    fontSize: 10,
    lineHeight: 15,
  },

  radioOuter: {
    width: 21,
    height: 21,
    borderWidth: 1.5,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },

  infoBox: {
    padding: 13,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  infoText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 17,
  },

  loadingState: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  loadingText: {
    fontSize: 11,
  },

  loadError: {
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  loadErrorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },

  retryButton: {
    padding: 5,
  },

  retryText: {
    fontSize: 11,
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
    fontSize: 11,
    lineHeight: 17,
  },

  bottomBar: {
    paddingHorizontal: 22,
    paddingTop: 13,
    paddingBottom: 10,
    borderTopWidth: 1,
    gap: 9,
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  bottomHint: {
    fontSize: 9,
    lineHeight: 14,
    textAlign: "center",
  },

  disabled: {
    opacity: 0.5,
  },

  pressed: {
    opacity: 0.82,
  },
});
