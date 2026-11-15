
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  BackHandler,
  Image,
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

import { router, Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  apiRequest,
  getRunnerCategories,
  getRunnerOnboarding,
  updateRunnerOnboarding,
} from "@/api";

import { useRunnerTheme } from "@/theme";

const WORDMARK = require("../../assets/sami-wordmark.png");

type ServiceKey = "pickup_deliver" | "shop_deliver";
type VehicleType = "bike" | "motorbike" | "vehicle";

type EarningChoice = {
  id: string;
  serviceKey: ServiceKey;
  vehicleType: VehicleType;
  categoryLabel: string;
  title: string;
  vehicleLabel: string;
  licenceLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const SERVICES: {
  key: ServiceKey;
  label: string;
}[] = [
  {
    key: "pickup_deliver",
    label: "Pick Up & Deliver",
  },
  {
    key: "shop_deliver",
    label: "Shop & Deliver",
  },
];

const VEHICLES: {
  key: VehicleType;
  label: string;
  licence: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: "bike",
    label: "Bicycle",
    licence: "No motor-vehicle licence",
    icon: "bicycle-outline",
  },
  {
    key: "motorbike",
    label: "Motorbike",
    licence: "Valid motorcycle licence",
    icon: "bicycle-outline",
  },
  {
    key: "vehicle",
    label: "Vehicle",
    licence: "Valid driving licence",
    icon: "car-outline",
  },
];

const EARNING_CHOICES: EarningChoice[] = SERVICES.flatMap((service) =>
  VEHICLES.map((vehicle) => ({
    id: `${service.key}:${vehicle.key}`,
    serviceKey: service.key,
    vehicleType: vehicle.key,
    categoryLabel: service.label,
    title: `${service.label} by ${vehicle.label}`,
    vehicleLabel: vehicle.label,
    licenceLabel: vehicle.licence,
    icon: vehicle.icon,
  })),
);

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

function requiresVehicleRegistration(value: VehicleType): boolean {
  return value === "motorbike" || value === "vehicle";
}

function normalizeServiceArea(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeRegistration(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeVehicleModel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export default function RunnerTaskSelectionScreen() {
  const {
    colors,
    mode,
    showOverlay,
  } = useRunnerTheme();

  const isDark = mode === "dark";

  const palette = colors as typeof colors & {
    brandNavy?: string;
    blueAction?: string;
  };

  const supportingText = isDark ? "#C1CCDA" : "#526176";

  const brandColor =
    palette.brandNavy ?? (isDark ? "#F5F7FB" : "#000535");

  const buttonBlue = isDark ? "#1D5DAD" : "#174F9F";

  const [selectedChoiceId, setSelectedChoiceId] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");

  const [accountState, setAccountState] = useState<{
    onboardingStatus: string;
    accountStatus: string;
    nextStep: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [serviceAreaFocused, setServiceAreaFocused] = useState(false);
  const [vehicleModelFocused, setVehicleModelFocused] = useState(false);
  const [registrationFocused, setRegistrationFocused] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* =========================================================
     ANDROID BACK

     Tasks is an authenticated onboarding destination.
     Android Back exits the app without clearing the session.
     Returning to the app restores the session and compliance
     destination through the root launch resolver.
  ========================================================= */

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          BackHandler.exitApp();
          return true;
        },
      );

      return () => subscription.remove();
    }, []),
  );

  /* =========================================================
     LOAD SAVED RUNNER SETUP
  ========================================================= */

  const loadSetup = useCallback(async () => {
    if (loadInFlightRef.current) return;

    loadInFlightRef.current = true;

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setLoadError("");

    try {
      const [catalogue, onboarding] = await Promise.all([
        getRunnerCategories(),
        getRunnerOnboarding(),
      ]);

      if (!catalogue?.ok || !Array.isArray(catalogue.categories)) {
        throw new Error(
          "The Runner service catalogue could not be loaded.",
        );
      }

      if (
        !onboarding?.ok ||
        !onboarding.runner ||
        !Array.isArray(onboarding.runner.selectedCategories)
      ) {
        throw new Error(
          "Your saved Runner setup could not be verified.",
        );
      }

      const activeKeys = new Set(
        catalogue.categories.map((item) => item.key),
      );

      const missingServices = SERVICES.filter(
        (service) => !activeKeys.has(service.key),
      );

      if (missingServices.length > 0) {
        throw new Error(
          "The SaMi Runner service catalogue is incomplete. Please contact SaMi Operations.",
        );
      }

      if (!mountedRef.current) return;

      // The backend resolver decides whether this screen
      // is still the correct destination.
      if (onboarding.nextStep === "documents") {
        router.replace("/(auth)/documents");
        return;
      }

      if (onboarding.nextStep === "dashboard") {
        router.replace("/(app)");
        return;
      }

      const runner = onboarding.runner;

      const savedServices = runner.selectedCategories.filter(
        (key: string) =>
          key === "pickup_deliver" || key === "shop_deliver",
      );

      const savedVehicle = normalizeSavedVehicle(runner.vehicleType);

      // Restore the previous service-and-vehicle combination.
      if (savedServices.length === 1 && savedVehicle) {
        setSelectedChoiceId(`${savedServices[0]}:${savedVehicle}`);
      } else {
        setSelectedChoiceId("");
      }

      setServiceArea(runner.serviceArea ?? "");
      setVehicleModel(runner.vehicleModel ?? "");
      setVehicleRegistration(runner.vehicleRegistration ?? "");

      setAccountState({
        onboardingStatus: onboarding.onboardingStatus,
        accountStatus: runner.accountStatus,
        nextStep: onboarding.nextStep,
      });

      hasLoadedOnceRef.current = true;
    } catch (cause) {
      if (!mountedRef.current) return;

      const message =
        cause instanceof Error
          ? cause.message
          : "Your Runner setup could not be loaded. Please try again.";

      setLoadError(message);

      showOverlay({
        type: "error",
        title: "Setup could not be loaded",
        message,
        primaryAction: {
          label: "Close",
        },
      });
    } finally {
      loadInFlightRef.current = false;

      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [showOverlay]);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void loadSetup();
    }, [loadSetup]),
  );

  /* =========================================================
     CURRENT ACCOUNT STATE
  ========================================================= */

  const onboardingStatus = accountState?.onboardingStatus ?? "";
  const accountStatus = accountState?.accountStatus ?? "";
  const nextStep = accountState?.nextStep ?? "";

  const isApproved =
    onboardingStatus === "approved" ||
    nextStep === "dashboard";

  const isPendingReview = onboardingStatus === "pending_review";

  const isRestricted =
    nextStep === "restricted" ||
    ["suspended", "closed"].includes(accountStatus);

  const sessionExpired =
    /session has expired|sign in again|no valid runner session/i.test(
      loadError,
    );

  const selectedChoice = EARNING_CHOICES.find(
    (choice) => choice.id === selectedChoiceId,
  );

  const registrationRequired = Boolean(
    selectedChoice &&
      requiresVehicleRegistration(selectedChoice.vehicleType),
  );

  const canEdit =
    Boolean(accountState) &&
    nextStep === "tasks" &&
    !loading &&
    !refreshing &&
    !loadError &&
    !saving &&
    !isApproved &&
    !isPendingReview &&
    !isRestricted &&
    !sessionExpired;

  function chooseEarningOption(choice: EarningChoice) {
    if (!canEdit || saving) return;

    setSelectedChoiceId(choice.id);

    if (!requiresVehicleRegistration(choice.vehicleType)) {
      setVehicleModel("");
      setVehicleRegistration("");
    }
  }

  function openHelp() {
    showOverlay({
      type: "info",
      title: "SaMi Runner help",
      message:
        "Choose one earning option. Each option combines the service you will provide with the vehicle you will use. All options require you to be at least 18 years old. Enter your main service area. Motorbike and Vehicle applicants must also enter the vehicle make, model and registration number. Your document checklist comes next.",
      primaryAction: {
        label: "Got it",
      },
    });
  }

  /* =========================================================
     SAVE TASK, TRANSPORT AND SERVICE AREA
  ========================================================= */

  async function continueToDocuments() {
    if (saveInFlightRef.current || !canEdit) return;

    if (!selectedChoice) {
      showOverlay({
        type: "warning",
        title: "Choose an earning option",
        message: "Select one of the six options before continuing.",
        primaryAction: {
          label: "Choose option",
        },
      });

      return;
    }

    const normalizedArea = normalizeServiceArea(serviceArea);

    const normalizedVehicleModel =
      normalizeVehicleModel(vehicleModel);

    const normalizedRegistration =
      normalizeRegistration(vehicleRegistration);

    if (normalizedArea.length < 2 || normalizedArea.length > 120) {
      showOverlay({
        type: "warning",
        title: "Service area required",
        message:
          "Enter your main operating area using between 2 and 120 characters.",
        primaryAction: {
          label: "Understood",
        },
      });

      return;
    }

    if (
      registrationRequired &&
      normalizedVehicleModel.length < 2
    ) {
      showOverlay({
        type: "warning",
        title: "Vehicle model required",
        message:
          "Enter the make and model of the motorbike or vehicle you selected.",
        primaryAction: {
          label: "Understood",
        },
      });

      return;
    }

    if (
      registrationRequired &&
      normalizedRegistration.length < 3
    ) {
      showOverlay({
        type: "warning",
        title: "Vehicle registration required",
        message:
          "Enter the registration number of the motorbike or vehicle you selected.",
        primaryAction: {
          label: "Understood",
        },
      });

      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);

    try {
      // Save exactly one service category for the chosen combination.
      const categoryResult = await apiRequest<{
        ok: boolean;
        message?: string;
        selectedCategories: string[];
      }>("/api/runner/me/categories", {
        method: "PUT",
        body: {
          categoryKeys: [selectedChoice.serviceKey],
        },
      });

      if (
        !categoryResult?.ok ||
        !Array.isArray(categoryResult.selectedCategories) ||
        categoryResult.selectedCategories.length !== 1 ||
        categoryResult.selectedCategories[0] !==
          selectedChoice.serviceKey
      ) {
        throw new Error(
          categoryResult?.message ||
            "SaMi could not confirm your selected service. Please try again.",
        );
      }

      // Save service area, vehicle model and registration.
      // The server returns the mandatory documents for this setup.
      const onboardingResult = await updateRunnerOnboarding({
        serviceArea: normalizedArea,
        vehicleType: selectedChoice.vehicleType,
        vehicleModel: registrationRequired
          ? normalizedVehicleModel
          : undefined,
        vehicleRegistration: registrationRequired
          ? normalizedRegistration
          : "",
      });

      if (
        !onboardingResult?.ok ||
        !Array.isArray(onboardingResult.requirements)
      ) {
        throw new Error(
          onboardingResult?.message ||
            "Your service and vehicle details were not confirmed. Please try again.",
        );
      }

      if (!mountedRef.current) return;

      // Tasks is complete. Replace it so Back cannot return
      // to an already completed onboarding step.
      router.replace("/(auth)/documents");
    } catch (cause) {
      if (!mountedRef.current) return;

      showOverlay({
        type: "error",
        title: "Could not save your setup",
        message:
          cause instanceof Error
            ? cause.message
            : "Your Runner setup could not be saved. Please try again.",
        primaryAction: {
          label: "Close",
        },
      });
    } finally {
      saveInFlightRef.current = false;

      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }

  function handleBottomAction() {
    if (sessionExpired) {
      router.replace("/(auth)/login");
      return;
    }

    if (isApproved) {
      router.replace("/(app)");
      return;
    }

    if (isPendingReview) {
      router.replace("/(auth)/documents");
      return;
    }

    if (isRestricted) {
      showOverlay({
        type: "warning",
        title: "Account access restricted",
        message:
          "Your Runner setup cannot be changed. Please contact SaMi Operations for assistance.",
        primaryAction: {
          label: "Close",
        },
      });

      return;
    }

    void continueToDocuments();
  }

  const bottomButtonLabel = sessionExpired
    ? "Sign in again"
    : isApproved
      ? "Open Runner dashboard"
      : isPendingReview
        ? "Back to document checklist"
        : isRestricted
          ? "Account restricted"
          : "Continue";

  const bottomButtonDisabled =
    saving ||
    loading ||
    refreshing ||
    (!sessionExpired &&
      !isApproved &&
      !isPendingReview &&
      !isRestricted &&
      !selectedChoice);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[
        styles.safeArea,
        { backgroundColor: colors.paper },
      ]}
    >
      <Stack.Screen
        options={{
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />

      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.paper}
      />

      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
              <Image
                source={WORDMARK}
                resizeMode="contain"
                style={styles.wordmark}
                accessibilityLabel="SaMi"
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Help with Runner setup"
                onPress={openHelp}
                style={({ pressed }) => [
                  styles.helpButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="help-circle-outline"
                  size={18}
                  color={colors.blueAction}
                />

                <Text
                  style={[
                    styles.helpText,
                    { color: colors.text },
                  ]}
                >
                  Help
                </Text>
              </Pressable>
            </View>

            {/* Heading */}
            <View style={styles.intro}>
              <Text
                style={[
                  styles.title,
                  { color: colors.text },
                ]}
              >
                Choose how you want to earn
              </Text>
            </View>

            {/* Loading */}
            {loading && !hasLoadedOnceRef.current ? (
              <View
                style={styles.loadingState}
                accessibilityRole="progressbar"
                accessibilityLabel="Loading your Runner setup"
              >
                <ActivityIndicator
                  size="large"
                  color={colors.blueAction}
                />

                <Text
                  style={[
                    styles.loadingText,
                    { color: supportingText },
                  ]}
                >
                  Loading options…
                </Text>
              </View>
            ) : loadError ? (
              <View style={styles.loadError}>
                <Text
                  style={[
                    styles.loadErrorText,
                    { color: supportingText },
                  ]}
                >
                  We could not load your Runner setup.
                </Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadSetup()}
                  style={({ pressed }) => [
                    styles.retryButton,
                    { opacity: pressed ? 0.65 : 1 },
                  ]}
                >
                  <Text
                    style={[
                      styles.retryText,
                      { color: colors.blueAction },
                    ]}
                  >
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                {/* Combined service and vehicle options */}
                <View style={styles.choiceList}>
                  {EARNING_CHOICES.map((choice) => {
                    const selected = selectedChoiceId === choice.id;

                    return (
                      <Pressable
                        key={choice.id}
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: selected,
                          disabled: !canEdit,
                        }}
                        accessibilityLabel={[
                          choice.title,
                          "Age 18 and above",
                          `Vehicle: ${choice.vehicleLabel}`,
                          `Licence: ${choice.licenceLabel}`,
                        ].join(". ")}
                        disabled={!canEdit}
                        onPress={() => chooseEarningOption(choice)}
                        style={({ pressed }) => [
                          styles.choiceCard,
                          {
                            backgroundColor: colors.surface,
                            borderColor: selected
                              ? brandColor
                              : colors.border,
                            borderWidth: selected ? 2.5 : 1,
                            opacity: pressed ? 0.88 : 1,
                          },
                        ]}
                      >
                        <View style={styles.choiceCopy}>
                          <Text
                            style={[
                              styles.categoryBadge,
                              { color: colors.blueAction },
                            ]}
                          >
                            {choice.categoryLabel.toUpperCase()}
                          </Text>

                          <Text
                            style={[
                              styles.choiceTitle,
                              { color: colors.text },
                            ]}
                          >
                            {choice.title}
                          </Text>

                          <Text
                            style={[
                              styles.choiceMetadata,
                              { color: supportingText },
                            ]}
                          >
                            Age: 18+  ·  Vehicle: {choice.vehicleLabel}
                          </Text>

                          <Text
                            style={[
                              styles.choiceMetadata,
                              { color: supportingText },
                            ]}
                          >
                            Licence: {choice.licenceLabel}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.vehicleIconWrap,
                            {
                              backgroundColor: colors.blueSoft,
                            },
                          ]}
                        >
                          <Ionicons
                            name={choice.icon}
                            size={34}
                            color={colors.blueAction}
                          />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Service area */}
                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: colors.text },
                    ]}
                  >
                    Service area
                  </Text>

                  <TextInput
                    value={serviceArea}
                    onChangeText={setServiceArea}
                    onFocus={() => setServiceAreaFocused(true)}
                    onBlur={() => setServiceAreaFocused(false)}
                    placeholder="e.g. Westlands, Nairobi"
                    placeholderTextColor={colors.textMuted}
                    editable={canEdit}
                    maxLength={120}
                    autoCapitalize="words"
                    returnKeyType={
                      registrationRequired ? "next" : "done"
                    }
                    selectionColor={colors.blueAction}
                    style={[
                      styles.textInput,
                      {
                        color: colors.text,
                        backgroundColor: colors.surface,
                        borderColor: serviceAreaFocused
                          ? colors.blueAction
                          : colors.border,
                      },
                    ]}
                  />
                </View>

                {/* Vehicle model: motorbike and vehicle only */}
                {registrationRequired ? (
                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: colors.text },
                      ]}
                    >
                      Vehicle make and model
                    </Text>

                    <TextInput
                      value={vehicleModel}
                      onChangeText={setVehicleModel}
                      onFocus={() => setVehicleModelFocused(true)}
                      onBlur={() => setVehicleModelFocused(false)}
                      placeholder="e.g. Honda CG 125 or Toyota Vitz"
                      placeholderTextColor={colors.textMuted}
                      editable={canEdit}
                      maxLength={120}
                      autoCapitalize="words"
                      autoCorrect={false}
                      returnKeyType="next"
                      selectionColor={colors.blueAction}
                      style={[
                        styles.textInput,
                        {
                          color: colors.text,
                          backgroundColor: colors.surface,
                          borderColor: vehicleModelFocused
                            ? colors.blueAction
                            : colors.border,
                        },
                      ]}
                    />
                  </View>
                ) : null}

                {/* Registration number: motorbike and vehicle only */}
                {registrationRequired ? (
                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: colors.text },
                      ]}
                    >
                      Vehicle registration number
                    </Text>

                    <TextInput
                      value={vehicleRegistration}
                      onChangeText={setVehicleRegistration}
                      onFocus={() => setRegistrationFocused(true)}
                      onBlur={() => setRegistrationFocused(false)}
                      placeholder="Enter registration number"
                      placeholderTextColor={colors.textMuted}
                      editable={canEdit}
                      maxLength={20}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="done"
                      selectionColor={colors.blueAction}
                      style={[
                        styles.textInput,
                        {
                          color: colors.text,
                          backgroundColor: colors.surface,
                          borderColor: registrationFocused
                            ? colors.blueAction
                            : colors.border,
                        },
                      ]}
                    />
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {/* Fixed bottom action */}
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
              accessibilityLabel={bottomButtonLabel}
              accessibilityState={{
                disabled: bottomButtonDisabled,
                busy: saving,
              }}
              disabled={bottomButtonDisabled}
              onPress={handleBottomAction}
              style={({ pressed }) => [
                styles.continueButton,
                { backgroundColor: buttonBlue },
                bottomButtonDisabled && styles.disabled,
                pressed && !bottomButtonDisabled && styles.pressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>
                    {bottomButtonLabel}
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={19}
                    color="#FFFFFF"
                  />
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  keyboard: {
    flex: 1,
  },

  container: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },

  header: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 25,
  },

  wordmark: {
    width: 112,
    height: 36,
  },

  helpButton: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  helpText: {
    fontSize: 13,
    fontWeight: "700",
  },

  intro: {
    marginBottom: 19,
  },

  title: {
    fontSize: 25,
    lineHeight: 32,
    letterSpacing: -0.7,
    fontWeight: "800",
  },

  choiceList: {
    gap: 12,
  },

  choiceCard: {
    minHeight: 132,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  choiceCopy: {
    flex: 1,
    gap: 5,
  },

  categoryBadge: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  choiceTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.25,
  },

  choiceMetadata: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
  },

  vehicleIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  fieldGroup: {
    marginTop: 20,
    gap: 8,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: "800",
  },

  textInput: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
  },

  loadingState: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  loadingText: {
    fontSize: 13,
    fontWeight: "600",
  },

  loadError: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
  },

  loadErrorText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 21,
  },

  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  retryText: {
    fontSize: 14,
    fontWeight: "800",
  },

  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  continueButton: {
    minHeight: 54,
    borderRadius: 13,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  disabled: {
    opacity: 0.5,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
