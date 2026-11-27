import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
} from "@/theme";

import type { RunnerVehicleType } from "@/api";

type VehicleOption = {
  value: RunnerVehicleType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const VEHICLE_OPTIONS: VehicleOption[] = [
  {
    value: "bike",
    title: "Bike",
    description: "Bicycle",
    icon: "bicycle-outline",
  },
  {
    value: "motorbike",
    title: "Motorbike",
    description: "Motorcycle",
    icon: "bicycle-outline",
  },
  {
    value: "vehicle",
    title: "Vehicle",
    description: "Car or other motor vehicle",
    icon: "car-outline",
  },
];

function compactRegistration(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isValidRegistration(
  value: string,
  vehicleType: RunnerVehicleType,
): boolean {
  const registration = compactRegistration(value);

  if (vehicleType === "motorbike") {
    return /^KM[A-HJ-NP-Z]{2}[0-9]{3}[A-HJ-NP-Z]$/.test(
      registration,
    );
  }

  if (vehicleType === "vehicle") {
    return /^K[A-HJ-NP-Z]{2}[0-9]{3}[A-HJ-NP-Z]$/.test(
      registration,
    );
  }

  return true;
}

export default function AddRunnerVehicleScreen() {
  const insets = useSafeAreaInsets();
  const { colors, showOverlay } = useRunnerTheme();

  const [vehicleType, setVehicleType] =
    useState<RunnerVehicleType | null>(null);

  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleRegistration, setVehicleRegistration] =
    useState("");

  const [focusedField, setFocusedField] =
    useState<"model" | "registration" | null>(null);

  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(app)/settings/vehicles" as never);
  }, []);

  const handleSelectVehicle = useCallback(
    (nextType: RunnerVehicleType) => {
      setVehicleType(nextType);

      if (nextType === "bike") {
        setVehicleModel("");
        setVehicleRegistration("");
      }
    },
    [],
  );

  const handleContinue = useCallback(() => {
    if (!vehicleType) {
      showOverlay({
        type: "warning",
        title: "Choose a vehicle",
        message: "Select the type of vehicle you want to add.",
      });

      return;
    }

    if (vehicleType !== "bike") {
      if (vehicleModel.trim().length < 2) {
        showOverlay({
          type: "warning",
          title: "Vehicle details required",
          message: "Enter the make and model of your vehicle.",
        });

        return;
      }

      if (!vehicleRegistration.trim()) {
        showOverlay({
          type: "warning",
          title: "Registration required",
          message: "Enter the vehicle registration number.",
        });

        return;
      }

      if (
        !isValidRegistration(
          vehicleRegistration,
          vehicleType,
        )
      ) {
        showOverlay({
          type: "warning",
          title: "Check the registration number",
          message:
            vehicleType === "motorbike"
              ? "Enter a valid Kenyan motorcycle registration, for example KMFQ 314F."
              : "Enter a valid Kenyan vehicle registration, for example KEA 123A.",
        });

        return;
      }
    }

    router.push({
      pathname: "/(app)/settings/vehicle-documents",
      params: {
        vehicleType,
        vehicleModel:
          vehicleType === "bike"
            ? ""
            : vehicleModel.trim(),
        vehicleRegistration:
          vehicleType === "bike"
            ? ""
            : vehicleRegistration.trim().toUpperCase(),
      },
    } as never);
  }, [
    vehicleType,
    vehicleModel,
    vehicleRegistration,
    showOverlay,
  ]);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.paper },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + runnerSpacing.md,
              paddingBottom:
                insets.bottom + runnerSpacing.xxxl,
            },
          ]}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={handleGoBack}
              style={({ pressed }) => [
                styles.backButton,
                { opacity: pressed ? 0.76 : 1 },
              ]}
            >
              <Ionicons
                name="arrow-back"
                size={21}
                color="#FFFFFF"
              />
            </Pressable>

            <View style={styles.headerText}>
              <Text
                style={[
                  styles.title,
                  { color: colors.text },
                ]}
              >
                Add vehicle
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  { color: colors.textMuted },
                ]}
              >
                Enter the details of your vehicle.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.text },
              ]}
            >
              Vehicle type
            </Text>

            <View style={styles.vehicleOptions}>
              {VEHICLE_OPTIONS.map((option) => {
                const selected =
                  vehicleType === option.value;

                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() =>
                      handleSelectVehicle(option.value)
                    }
                    style={({ pressed }) => [
                      styles.vehicleOption,
                      {
                        backgroundColor: selected
                          ? colors.surfaceSelected
                          : colors.surface,
                        borderColor: selected
                          ? colors.focus
                          : colors.border,
                        opacity: pressed ? 0.84 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.optionIcon,
                        {
                          backgroundColor: selected
                            ? colors.blueSoft
                            : colors.surfaceSunken,
                        },
                      ]}
                    >
                      <Ionicons
                        name={option.icon}
                        size={24}
                        color={
                          selected
                            ? colors.blue
                            : colors.iconMuted
                        }
                      />
                    </View>

                    <View style={styles.optionText}>
                      <Text
                        style={[
                          styles.optionTitle,
                          { color: colors.text },
                        ]}
                      >
                        {option.title}
                      </Text>

                      <Text
                        style={[
                          styles.optionDescription,
                          { color: colors.textMuted },
                        ]}
                      >
                        {option.description}
                      </Text>
                    </View>

                    <Ionicons
                      name={
                        selected
                          ? "radio-button-on"
                          : "radio-button-off"
                      }
                      size={21}
                      color={
                        selected
                          ? colors.blue
                          : colors.iconMuted
                      }
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {vehicleType && vehicleType !== "bike" ? (
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.text },
                ]}
              >
                Vehicle details
              </Text>

              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  Make and model
                </Text>

                <TextInput
                  value={vehicleModel}
                  onChangeText={setVehicleModel}
                  placeholder={
                    vehicleType === "motorbike"
                      ? "e.g. TVS HLX 125"
                      : "e.g. Toyota Fielder"
                  }
                  placeholderTextColor={colors.textDisabled}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  onFocus={() => setFocusedField("model")}
                  onBlur={() => setFocusedField(null)}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surface,
                      color: colors.text,
                      borderColor:
                        focusedField === "model"
                          ? colors.focus
                          : colors.border,
                    },
                  ]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  Registration number
                </Text>

                <TextInput
                  value={vehicleRegistration}
                  onChangeText={(value) =>
                    setVehicleRegistration(value.toUpperCase())
                  }
                  placeholder={
                    vehicleType === "motorbike"
                      ? "e.g. KMFQ 314F"
                      : "e.g. KEA 123A"
                  }
                  placeholderTextColor={colors.textDisabled}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  onFocus={() =>
                    setFocusedField("registration")
                  }
                  onBlur={() => setFocusedField(null)}
                  style={[
                    styles.input,
                    styles.registrationInput,
                    {
                      backgroundColor: colors.surface,
                      color: colors.text,
                      borderColor:
                        focusedField === "registration"
                          ? colors.focus
                          : colors.border,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {vehicleType === "bike" ? (
            <View
              style={[
                styles.informationPanel,
                {
                  backgroundColor: colors.infoSoft,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={19}
                color={colors.info}
              />

              <Text
                style={[
                  styles.informationText,
                  { color: colors.text },
                ]}
              >
                A bicycle does not require a model or registration number here.
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={handleContinue}
            style={({ pressed }) => [
              styles.continueButton,
              {
                backgroundColor: colors.brand,
                opacity: pressed ? 0.86 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.continueButtonText,
                { color: colors.onBrand },
              ]}
            >
              Continue
            </Text>

            <Ionicons
              name="arrow-forward"
              size={20}
              color={colors.onBrand}
            />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  keyboardContainer: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: runnerSpacing.lg,
    gap: runnerSpacing.xl,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
  },

  backButton: {
    width: runnerTouchTargets.minimum,
    height: runnerTouchTargets.minimum,
    borderRadius: runnerRadii.md,
    backgroundColor: "#00061D",
    alignItems: "center",
    justifyContent: "center",
  },

  headerText: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  title: {
    fontSize: runnerTypography.title,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  subtitle: {
    fontSize: runnerTypography.bodySmall,
    lineHeight:
      runnerTypography.bodySmall *
      runnerTypography.lineHeight.normal,
  },

  section: {
    gap: runnerSpacing.md,
  },

  sectionTitle: {
    fontSize: runnerTypography.subtitle,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  vehicleOptions: {
    gap: runnerSpacing.sm,
  },

  vehicleOption: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: runnerRadii.lg,
    padding: runnerSpacing.md,
    gap: runnerSpacing.md,
  },

  optionIcon: {
    width: 46,
    height: 46,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
  },

  optionText: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  optionTitle: {
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  optionDescription: {
    fontSize: runnerTypography.bodySmall,
  },

  fieldGroup: {
    gap: runnerSpacing.xs,
  },

  fieldLabel: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  input: {
    minHeight: runnerTouchTargets.primary,
    borderWidth: 1.3,
    borderRadius: runnerRadii.md,
    paddingHorizontal: runnerSpacing.md,
    fontSize: runnerTypography.body,
  },

  registrationInput: {
    letterSpacing: 1,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  informationPanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    padding: runnerSpacing.md,
    gap: runnerSpacing.sm,
  },

  informationText: {
    flex: 1,
    fontSize: runnerTypography.bodySmall,
    lineHeight:
      runnerTypography.bodySmall *
      runnerTypography.lineHeight.normal,
  },

  continueButton: {
    minHeight: runnerTouchTargets.primary,
    borderRadius: runnerRadii.lg,
    paddingHorizontal: runnerSpacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.sm,
    marginTop: runnerSpacing.sm,
  },

  continueButtonText: {
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.bold,
  },
});