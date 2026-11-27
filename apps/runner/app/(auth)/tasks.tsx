import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ScrollViewInstance,
  TextInputInstance,
} from "react-native";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  apiRequest,
  getRunnerCategories,
  getRunnerOnboarding,
} from "@/api";
import {
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
} from "@/theme";

const WORDMARK = require("../../assets/sami-wordmark.png");

/**
 * Protected Runner API requests can fail because the saved session is
 * missing, expired or revoked. Return through the root launch route so
 * the launch animation plays before the user sees Login.
 */
function isRunnerSessionExpired(cause: unknown): boolean {
  const message = cause instanceof Error
    ? cause.message
    : String(cause ?? "");

  return /HTTP 401|session has expired|sign in again|sign in to continue|no valid runner session|unauthorized/i.test(
    message,
  );
}

function returnToLaunchForLogin(): void {
  router.dismissAll();
  router.replace({
    pathname: "/",
    params: { signedOut: "1" },
  });
}

type ServiceKey = "pickup_deliver" | "shop_deliver";
type VehicleType = "bike" | "motorbike" | "vehicle";

type TaskInputKey =
  | "serviceArea"
  | "vehicleModel"
  | "vehicleRegistration";

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

function normalizeVehicleModel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Remove spaces and punctuation from a registration number.
 * Keep only letters and digits.
 */
function compactRegistration(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

/**
 * Format Kenyan registration numbers according to the
 * transport type selected by the Runner.
 *
 * Ordinary vehicle: KDA 123A
 * Motorcycle:       KMAB 123A
 */
function formatKenyanRegistration(
  value: string,
  vehicleType: VehicleType,
): string {
  const compact = compactRegistration(value);

  const splitAt = vehicleType === "motorbike" ? 4 : 3;

  if (compact.length <= splitAt) {
    return compact;
  }

  return `${compact.slice(0, splitAt)} ${compact.slice(splitAt)}`;
}

/**
 * Validate the registration number for the selected vehicle.
 *
 * Ordinary civilian vehicle:
 * K + two letters + three digits + final letter.
 *
 * Motorcycle:
 * KM prefix followed by two letters and three digits.
 */
function isValidKenyanRegistration(
  value: string,
  vehicleType: VehicleType,
): boolean {
  const compact = compactRegistration(value);

  if (vehicleType === "motorbike") {
    return /^KM[A-HJ-NP-Z]{2}[0-9]{3}[A-HJ-NP-Z]$/.test(compact);
  }

  if (vehicleType === "vehicle") {
    return /^K[A-HJ-NP-Z]{2}[0-9]{3}[A-HJ-NP-Z]$/.test(
      compact,
    );
  }

  return false;
}

function registrationExample(vehicleType: VehicleType): string {
  return vehicleType === "motorbike"
    ? "KMAB 123A"
    : "KEA 123A";
}

function registrationErrorMessage(
  vehicleType: VehicleType,
): string {
  return vehicleType === "motorbike"
    ? "Enter a valid Kenyan motorcycle registration number, for example KMAB 123A."
    : "Enter a valid Kenyan vehicle registration number, for example KEA 123A.";
}

export default function RunnerTaskSelectionScreen() {
  const {
  colors,
  showOverlay,
} = useRunnerTheme();

const supportingText = colors.textMuted;
const brandColor = colors.brandNavy;
const buttonBlue = colors.blueAction;
const buttonText = colors.onBlue;

  const params = useLocalSearchParams<{ edit?: string | string[] }>();
  const editParam = Array.isArray(params.edit) ? params.edit[0] : params.edit;
  const isEditMode = editParam?.toLowerCase() === "true";

  const [selectedChoiceId, setSelectedChoiceId] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");

  const [accountState, setAccountState] = useState<{
    onboardingStatus: string;
    accountStatus: string;
    nextStep: string;
  } | null>(null);

  // Loading is kept internally to prevent edits before the server
  // has restored the saved setup. No loading or refresh status is shown.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [serviceAreaFocused, setServiceAreaFocused] = useState(false);
  const [vehicleModelFocused, setVehicleModelFocused] = useState(false);
  const [registrationFocused, setRegistrationFocused] = useState(false);

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const scrollRef = useRef<ScrollViewInstance>(null);
  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const activeInputRef = useRef<TaskInputKey | null>(null);

  const fieldOffsetsRef = useRef<Record<TaskInputKey, number>>({
    serviceArea: 0,
    vehicleModel: 0,
    vehicleRegistration: 0,
  });

 const vehicleModelInputRef = useRef<TextInputInstance>(null);
const registrationInputRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* =========================================================
     KEYBOARD VISIBILITY AND INPUT POSITIONING

     The active input is moved into the visible part of the
     ScrollView whenever the keyboard opens.

     The fixed Continue bar is hidden while typing so it
     cannot cover the lower input fields.
  ========================================================= */

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios"
        ? "keyboardWillShow"
        : "keyboardDidShow";

    const hideEvent =
      Platform.OS === "ios"
        ? "keyboardWillHide"
        : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(
      showEvent,
      () => {
        setKeyboardVisible(true);

        requestAnimationFrame(() => {
          const activeField = activeInputRef.current;

          if (!activeField) return;

          const fieldOffset =
            fieldOffsetsRef.current[activeField];

          scrollRef.current?.scrollTo({
            y: Math.max(0, fieldOffset - 75),
            animated: true,
          });
        });
      },
    );

    const hideSubscription = Keyboard.addListener(
      hideEvent,
      () => {
        setKeyboardVisible(false);
        activeInputRef.current = null;
      },
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  function rememberFieldPosition(
    field: TaskInputKey,
    y: number,
  ) {
    fieldOffsetsRef.current[field] = y;
  }

  function revealInput(field: TaskInputKey) {
    activeInputRef.current = field;

    requestAnimationFrame(() => {
      const fieldOffset = fieldOffsetsRef.current[field];

      scrollRef.current?.scrollTo({
        y: Math.max(0, fieldOffset - 75),
        animated: true,
      });
    });
  }

  /* =========================================================
     ANDROID BACK

     When Tasks is opened from Documents for editing, Android
     Back returns to Documents. During initial onboarding, the
     existing authenticated navigation behaviour is preserved.
  ========================================================= */

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (isEditMode) {
            router.replace("/(auth)/documents");
            return true;
          }

          BackHandler.exitApp();
          return true;
        },
      );

      return () => subscription.remove();
    }, [isEditMode]),
  );

  /* =========================================================
     LOAD SAVED RUNNER SETUP
  ========================================================= */

  const loadSetup = useCallback(async () => {
    if (loadInFlightRef.current) return;

    loadInFlightRef.current = true;

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
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
      // is still the correct destination. Documents is the
      // expected destination during edit mode, so remain here.
      if (onboarding.nextStep === "documents" && !isEditMode) {
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

      setVehicleRegistration(
        savedVehicle && requiresVehicleRegistration(savedVehicle)
          ? formatKenyanRegistration(
              runner.vehicleRegistration ?? "",
              savedVehicle,
            )
          : "",
      );

      setAccountState({
        onboardingStatus: onboarding.onboardingStatus,
        accountStatus: runner.accountStatus,
        nextStep: onboarding.nextStep,
      });

      hasLoadedOnceRef.current = true;
    } catch (cause) {
      if (!mountedRef.current) return;

      if (isRunnerSessionExpired(cause)) {
        returnToLaunchForLogin();
        return;
      }

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
      }
    }
  }, [isEditMode, showOverlay]);

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
    /HTTP 401|session has expired|sign in again|sign in to continue|no valid runner session|unauthorized/i.test(
      loadError,
    );

  const selectedChoice = EARNING_CHOICES.find(
    (choice) => choice.id === selectedChoiceId,
  );

  const registrationRequired = Boolean(
    selectedChoice &&
      requiresVehicleRegistration(selectedChoice.vehicleType),
  );

  const isExpectedStep = isEditMode
    ? nextStep === "documents"
    : nextStep === "tasks";

  const canEdit =
    Boolean(accountState) &&
    isExpectedStep &&
    !loading &&
    !loadError &&
    !saving &&
    !isApproved &&
    !isRestricted &&
    !sessionExpired &&
    (isEditMode || !isPendingReview);

  function chooseEarningOption(choice: EarningChoice) {
    if (!canEdit || saving) return;

    const previousChoice = EARNING_CHOICES.find(
      (item) => item.id === selectedChoiceId,
    );

    setSelectedChoiceId(choice.id);

    if (!requiresVehicleRegistration(choice.vehicleType)) {
      setVehicleModel("");
      setVehicleRegistration("");
      return;
    }

    // A different vehicle type may represent a different physical
    // vehicle. Do not carry its model or registration into the new choice.
    if (
      previousChoice &&
      previousChoice.vehicleType !== choice.vehicleType
    ) {
      setVehicleModel("");
      setVehicleRegistration("");
      return;
    }

    setVehicleRegistration((current) =>
      formatKenyanRegistration(current, choice.vehicleType),
    );
  }

  function openHelp() {
    showOverlay({
      type: "info",
      title: "SaMi Runner help",
      message:
        "Choose one earning option. Each option combines the service you will provide with the vehicle you will use. All options require you to be at least 18 years old. Enter your main service area. Motorbike and Vehicle applicants must also enter the vehicle make, model and Kenyan registration number. Your document checklist comes next. You can change your service or vehicle from the Documents screen while your application is still awaiting approval.",
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
      formatKenyanRegistration(
        vehicleRegistration,
        selectedChoice.vehicleType,
      );

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
      !isValidKenyanRegistration(
        normalizedRegistration,
        selectedChoice.vehicleType,
      )
    ) {
      showOverlay({
        type: "warning",
        title: "Invalid Kenyan registration number",
        message: registrationErrorMessage(
          selectedChoice.vehicleType,
        ),
        primaryAction: {
          label: "Correct registration",
        },
      });

      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);

    try {
      // Save the selected service, service area and transport profile
      // through one server transaction. This avoids a partial save where
      // the service is changed but the corresponding vehicle update fails.
      const setupResult = await apiRequest<{
        ok: boolean;
        message?: string;
        reviewRestarted?: boolean;
        onboardingStatus?: string;
        runner?: {
          serviceArea: string;
          vehicleType: VehicleType | null;
          vehicleModel: string | null;
          vehicleRegistration: string | null;
          selectedCategories: string[];
        };
        requirements: unknown[];
      }>("/api/runner/me/onboarding/setup", {
        method: "PUT",
        body: {
          categoryKey: selectedChoice.serviceKey,
          serviceArea: normalizedArea,
          vehicleType: selectedChoice.vehicleType,
          vehicleModel: registrationRequired
            ? normalizedVehicleModel
            : "",
          vehicleRegistration: registrationRequired
            ? normalizedRegistration
            : "",
        },
      });

      if (
        !setupResult?.ok ||
        !setupResult.runner ||
        !Array.isArray(setupResult.runner.selectedCategories) ||
        setupResult.runner.selectedCategories.length !== 1 ||
        setupResult.runner.selectedCategories[0] !==
          selectedChoice.serviceKey ||
        setupResult.runner.vehicleType !== selectedChoice.vehicleType ||
        !Array.isArray(setupResult.requirements) ||
        setupResult.requirements.length === 0
      ) {
        throw new Error(
          setupResult?.message ||
            "SaMi could not confirm your complete service and vehicle setup. Please try again.",
        );
      }

      if (!mountedRef.current) return;

      // The server committed the service and vehicle as one transaction.
      // Documents now loads the authoritative, recalculated checklist.
      router.replace("/(auth)/documents");
    } catch (cause) {
      if (!mountedRef.current) return;

      if (isRunnerSessionExpired(cause)) {
        returnToLaunchForLogin();
        return;
      }

      showOverlay({
        type: "error",
        title: isEditMode
          ? "Could not save your changes"
          : "Could not save your setup",
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
      returnToLaunchForLogin();
      return;
    }

    if (isApproved) {
      router.replace("/(app)");
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

    if (isEditMode) {
      void continueToDocuments();
      return;
    }

    if (isPendingReview) {
      router.replace("/(auth)/documents");
      return;
    }

    void continueToDocuments();
  }

  function cancelEdit() {
    Keyboard.dismiss();
    router.replace("/(auth)/documents");
  }

  const bottomButtonLabel = sessionExpired
    ? "Sign in again"
    : isApproved
      ? "Open Runner dashboard"
      : isEditMode
        ? "Save changes"
        : isPendingReview
          ? "Back to document checklist"
          : isRestricted
            ? "Account restricted"
            : "Continue";

  const bottomButtonDisabled =
    saving ||
    loading ||
    (!sessionExpired && Boolean(loadError)) ||
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


      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.container}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[
              styles.scrollContent,
              keyboardVisible && styles.scrollContentWithKeyboard,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
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
                {isEditMode
                  ? "Change your service or vehicle"
                  : "Choose how you want to earn"}
              </Text>
            </View>

            {/* Background loading remains invisible to the Runner. */}
            {loadError ? (
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
                {isEditMode ? (
                  <View
                    style={[
                      styles.editNotice,
                      {
                        backgroundColor: colors.blueSoft,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={19}
                      color={colors.blueAction}
                    />
                    <Text
                      style={[
                        styles.editNoticeText,
                        { color: colors.text },
                      ]}
                    >
                      {isPendingReview
                        ? "Your application is under review. Changing your service or vehicle will update your document requirements and restart the review process."
                        : "Changing your service or vehicle may change the documents you need to provide. Your checklist will be updated after you save."}
                    </Text>
                  </View>
                ) : null}

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
                <View
                  style={styles.fieldGroup}
                  onLayout={(event) =>
                    rememberFieldPosition(
                      "serviceArea",
                      event.nativeEvent.layout.y,
                    )
                  }
                >
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
                    onFocus={() => {
                      setServiceAreaFocused(true);
                      revealInput("serviceArea");
                    }}
                    onBlur={() => {
                      setServiceAreaFocused(false);

                      if (activeInputRef.current === "serviceArea") {
                        activeInputRef.current = null;
                      }
                    }}
                    onSubmitEditing={() => {
                      if (registrationRequired) {
                        vehicleModelInputRef.current?.focus();
                      } else {
                        Keyboard.dismiss();
                      }
                    }}
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
                  <View
                    style={styles.fieldGroup}
                    onLayout={(event) =>
                      rememberFieldPosition(
                        "vehicleModel",
                        event.nativeEvent.layout.y,
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: colors.text },
                      ]}
                    >
                      Vehicle make and model
                    </Text>

                    <TextInput
                      ref={vehicleModelInputRef}
                      value={vehicleModel}
                      onChangeText={setVehicleModel}
                      onFocus={() => {
                        setVehicleModelFocused(true);
                        revealInput("vehicleModel");
                      }}
                      onBlur={() => {
                        setVehicleModelFocused(false);

                        if (activeInputRef.current === "vehicleModel") {
                          activeInputRef.current = null;
                        }
                      }}
                      onSubmitEditing={() =>
                        registrationInputRef.current?.focus()
                      }
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

                {/* Kenyan registration number: motorbike and vehicle only */}
                {registrationRequired && selectedChoice ? (
                  <View
                    style={styles.fieldGroup}
                    onLayout={(event) =>
                      rememberFieldPosition(
                        "vehicleRegistration",
                        event.nativeEvent.layout.y,
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: colors.text },
                      ]}
                    >
                      Vehicle registration number
                    </Text>

                    <TextInput
                      ref={registrationInputRef}
                      value={vehicleRegistration}
                      onChangeText={(value) =>
                        setVehicleRegistration(
                          formatKenyanRegistration(
                            value,
                            selectedChoice.vehicleType,
                          ),
                        )
                      }
                      onFocus={() => {
                        setRegistrationFocused(true);
                        revealInput("vehicleRegistration");
                      }}
                      onBlur={() => {
                        setRegistrationFocused(false);

                        if (
                          activeInputRef.current ===
                          "vehicleRegistration"
                        ) {
                          activeInputRef.current = null;
                        }
                      }}
                      onSubmitEditing={() => Keyboard.dismiss()}
                      placeholder={`e.g. ${registrationExample(
                        selectedChoice.vehicleType,
                      )}`}
                      placeholderTextColor={colors.textMuted}
                      editable={canEdit}
                      maxLength={9}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      keyboardType="default"
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

                    <Text
                      style={[
                        styles.fieldHint,
                        { color: supportingText },
                      ]}
                    >
                      {selectedChoice.vehicleType === "motorbike"
                        ? "Enter the seven-character Kenyan motorcycle plate beginning with KM."
                        : "Enter your Kenyan civilian vehicle plate in the three-letter, three-digit, final-letter format."}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {/* The fixed action bar stays out of the keyboard area. */}
          {!keyboardVisible && (!loadError || sessionExpired) ? (
            <View
              style={[
                styles.bottomBar,
                {
                  backgroundColor: colors.paper,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={isEditMode ? styles.bottomActions : undefined}>
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
                    isEditMode && styles.editSaveButton,
                    { backgroundColor: buttonBlue },
                    bottomButtonDisabled && styles.disabled,
                    pressed && !bottomButtonDisabled && styles.pressed,
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator color={buttonText} />
                  ) : (
                    <>
                     <Text
  style={[
    styles.continueButtonText,
    { color: buttonText },
  ]}
>
  {bottomButtonLabel}
</Text>

                      <Ionicons
                        name={
                          isEditMode
                            ? "checkmark"
                            : "arrow-forward"
                        }
                        size={19}
                        color={buttonText}
                      />
                    </>
                  )}
                </Pressable>

                {isEditMode ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel and return to Documents"
                    disabled={saving}
                    onPress={cancelEdit}
                    style={({ pressed }) => [
                      styles.cancelButton,
                      { borderColor: colors.border },
                      pressed && styles.cancelPressed,
                      saving && styles.disabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.cancelText,
                        { color: colors.text },
                      ]}
                    >
                      Cancel
                    </Text>
                  </Pressable>
                ) : null}
              </View>
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

  keyboard: {
    flex: 1,
  },

  container: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: runnerSpacing.lg,
    paddingTop: runnerSpacing.md,
    paddingBottom: runnerSpacing.xl,
  },

  scrollContentWithKeyboard: {
    paddingBottom: runnerSpacing.xxxl,
  },

  header: {
    minHeight: runnerTouchTargets.minimum,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: runnerSpacing.xl,
    gap: runnerSpacing.md,
  },

  wordmark: {
    width: 112,
    height: 36,
  },

  helpButton: {
    minHeight: runnerTouchTargets.minimum,
    paddingHorizontal: runnerSpacing.md,
    borderWidth: 1,
    borderRadius: runnerRadii.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.xs,
  },

  helpText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "700",
  },

  intro: {
    marginBottom: runnerSpacing.lg,
  },

  editNotice: {
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    paddingHorizontal: runnerSpacing.md,
    paddingVertical: runnerSpacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: runnerSpacing.sm,
    marginBottom: runnerSpacing.lg,
  },

  editNoticeText: {
    flex: 1,
    fontSize: runnerTypography.bodySmall,
    lineHeight: 22,
    fontWeight: "600",
  },

  title: {
    fontSize: runnerTypography.heading,
    lineHeight: 36,
    letterSpacing: -0.5,
    fontWeight: "800",
  },

  choiceList: {
    gap: runnerSpacing.md,
  },

  choiceCard: {
    minHeight: 140,
    borderRadius: runnerRadii.lg,
    paddingVertical: runnerSpacing.md,
    paddingHorizontal: runnerSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: runnerSpacing.md,
  },

  choiceCopy: {
    flex: 1,
    gap: runnerSpacing.xs,
  },

  categoryBadge: {
    fontSize: runnerTypography.caption,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  choiceTitle: {
    fontSize: runnerTypography.body,
    lineHeight: 23,
    fontWeight: "800",
  },

  choiceMetadata: {
    fontSize: runnerTypography.caption,
    lineHeight: 20,
    fontWeight: "500",
  },

  vehicleIconWrap: {
    width: 66,
    height: 66,
    borderRadius: runnerRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  fieldGroup: {
    marginTop: runnerSpacing.lg,
    gap: runnerSpacing.sm,
  },

  fieldLabel: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "800",
  },

  fieldHint: {
    fontSize: runnerTypography.caption,
    lineHeight: 20,
    fontWeight: "500",
  },

  textInput: {
    minHeight: runnerTouchTargets.comfortable,
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    paddingHorizontal: runnerSpacing.md,
    fontSize: runnerTypography.body,
  },

  loadError: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.md,
    paddingHorizontal: runnerSpacing.lg,
  },

  loadErrorText: {
    textAlign: "center",
    fontSize: runnerTypography.bodySmall,
    lineHeight: 23,
  },

  retryButton: {
    minHeight: runnerTouchTargets.minimum,
    justifyContent: "center",
    paddingHorizontal: runnerSpacing.md,
    paddingVertical: runnerSpacing.sm,
  },

  retryText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "800",
  },

  bottomBar: {
    paddingHorizontal: runnerSpacing.lg,
    paddingTop: runnerSpacing.md,
    paddingBottom: runnerSpacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  bottomActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
  },

  editSaveButton: {
    flex: 1,
  },

  cancelButton: {
    minHeight: runnerTouchTargets.primary,
    minWidth: 90,
    paddingHorizontal: runnerSpacing.lg,
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "800",
  },

  cancelPressed: {
    opacity: 0.7,
  },

  continueButton: {
    minHeight: runnerTouchTargets.primary,
    borderRadius: runnerRadii.md,
    paddingHorizontal: runnerSpacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.sm,
  },

  continueButtonText: {
    fontSize: runnerTypography.body,
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