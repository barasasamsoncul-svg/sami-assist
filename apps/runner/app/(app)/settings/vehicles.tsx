import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
} from "@/theme";

import { getRunnerVehicles } from "@/vehicle-api";

type VehicleManagementData =
  Awaited<ReturnType<typeof getRunnerVehicles>>;

function getErrorMessage(
  cause: unknown,
  fallback: string,
): string {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : fallback;
}

function getVehicleName(vehicle: {
  vehicleLabel?: string;
  vehicleType: string;
}): string {
  if (vehicle.vehicleLabel?.trim()) {
    return vehicle.vehicleLabel;
  }

  switch (vehicle.vehicleType) {
    case "bike":
    case "bicycle":
      return "Bike";
    case "motorbike":
    case "motorcycle":
      return "Motorbike";
    case "vehicle":
    case "car":
      return "Vehicle";
    default:
      return vehicle.vehicleType;
  }
}

export default function RunnerVehiclesScreen() {
  const insets = useSafeAreaInsets();
  const { colors, showOverlay } = useRunnerTheme();

  const [data, setData] =
    useState<VehicleManagementData | null>(null);

  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      setLoading(true);

      getRunnerVehicles()
        .then((result) => {
          if (isActive) {
            setData(result);
          }
        })
        .catch((cause: unknown) => {
          if (!isActive) {
            return;
          }

          setData(null);

          showOverlay({
            type: "error",
            title: "Vehicles unavailable",
            message: getErrorMessage(
              cause,
              "Your vehicle information could not be loaded.",
            ),
            primaryAction: {
              label: "Try again",
              onClick: () => {
                setReloadKey((current) => current + 1);
              },
            },
          });
        })
        .finally(() => {
          if (isActive) {
            setLoading(false);
          }
        });

      return () => {
        isActive = false;
      };
    }, [reloadKey, showOverlay]),
  );

  const activeVehicle = data?.activeVehicle ?? null;

  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(app)" as never);
  }, []);

  const handleAddVehicle = useCallback(() => {
    if (!data) {
      return;
    }

    if (!data.replacementEligibility.canSubmit) {
      showOverlay({
        type: "warning",
        title: "You can't add a vehicle yet",
        message:
          data.replacementEligibility.blockReason?.trim() ||
          "A vehicle replacement cannot be submitted right now. Please check again later.",
      });

      return;
    }

    router.push("/(app)/settings/add-vehicle" as never);
  }, [data, showOverlay]);

  const vehicleTitle = activeVehicle
    ? getVehicleName(activeVehicle)
    : "No active vehicle";

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.paper },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + runnerSpacing.md,
              paddingBottom: runnerSpacing.xl,
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
                Vehicles
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  { color: colors.textMuted },
                ]}
              >
                Your active vehicle for SaMi errands.
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
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
                Loading vehicle details
              </Text>
            </View>
          ) : data ? (
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionLabel,
                  { color: colors.textSubtle },
                ]}
              >
                CURRENT VEHICLE
              </Text>

              <View
                style={[
                  styles.vehicleCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.vehicleCardHeader}>
                  <View
                    style={[
                      styles.vehicleIcon,
                      { backgroundColor: colors.blueSoft },
                    ]}
                  >
                    <Ionicons
                      name={
                        activeVehicle?.vehicleType === "vehicle" ||
                        activeVehicle?.vehicleType === "car"
                          ? "car-outline"
                          : "bicycle-outline"
                      }
                      size={28}
                      color={colors.blue}
                    />
                  </View>

                  {activeVehicle ? (
                    <View
                      style={[
                        styles.activePill,
                        {
                          backgroundColor: colors.successSoft,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.activeDot,
                          { backgroundColor: colors.success },
                        ]}
                      />

                      <Text
                        style={[
                          styles.activeText,
                          { color: colors.success },
                        ]}
                      >
                        ACTIVE
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text
                  style={[
                    styles.vehicleName,
                    { color: colors.text },
                  ]}
                >
                  {vehicleTitle}
                </Text>

                {activeVehicle?.vehicleModel ? (
                  <Text
                    style={[
                      styles.vehicleDetail,
                      { color: colors.textMuted },
                    ]}
                  >
                    {activeVehicle.vehicleModel}
                  </Text>
                ) : null}

                {activeVehicle?.vehicleRegistration ? (
                  <View
                    style={[
                      styles.registrationPlate,
                      {
                        backgroundColor: colors.surfaceSunken,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.registrationText,
                        { color: colors.text },
                      ]}
                    >
                      {activeVehicle.vehicleRegistration}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.retryContainer}>
              <Ionicons
                name="car-outline"
                size={34}
                color={colors.iconMuted}
              />

              <Text
                style={[
                  styles.retryTitle,
                  { color: colors.text },
                ]}
              >
                Vehicle details unavailable
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setReloadKey((current) => current + 1)
                }
                style={({ pressed }) => [
                  styles.retryButton,
                  {
                    backgroundColor: colors.brand,
                    opacity: pressed ? 0.84 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.retryButtonText,
                    { color: colors.onBrand },
                  ]}
                >
                  Try again
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.paper,
              borderTopColor: colors.divider,
              paddingBottom: insets.bottom + runnerSpacing.md,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add new vehicle"
            accessibilityState={{
              disabled: loading || !data,
            }}
            disabled={loading || !data}
            onPress={handleAddVehicle}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: colors.brand,
                opacity:
                  loading || !data
                    ? 0.48
                    : pressed
                      ? 0.86
                      : 1,
              },
            ]}
          >
            <Ionicons
              name="add"
              size={23}
              color={colors.onBrand}
            />

            <Text
              style={[
                styles.addButtonText,
                { color: colors.onBrand },
              ]}
            >
              Add new vehicle
            </Text>

            <Ionicons
              name="arrow-forward"
              size={20}
              color={colors.onBrand}
            />
          </Pressable>
        </View>
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

  scroll: {
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
    lineHeight: 29,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  subtitle: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 22,
  },

  section: {
    gap: runnerSpacing.md,
    marginTop: runnerSpacing.md,
  },

  sectionLabel: {
    fontSize: runnerTypography.caption,
    lineHeight: 19,
    fontWeight: runnerTypography.fontWeight.bold,
    letterSpacing: 1,
  },

  vehicleCard: {
    borderWidth: 1,
    borderRadius: runnerRadii.xl,
    padding: runnerSpacing.lg,
    gap: runnerSpacing.sm,
  },

  vehicleCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  vehicleIcon: {
    width: 56,
    height: 56,
    borderRadius: runnerRadii.lg,
    alignItems: "center",
    justifyContent: "center",
  },

  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.xxs,
    borderRadius: runnerRadii.pill,
    paddingHorizontal: runnerSpacing.md,
    paddingVertical: runnerSpacing.xs,
  },

  activeDot: {
    width: 8,
    height: 8,
    borderRadius: runnerRadii.pill,
  },

  activeText: {
    fontSize: runnerTypography.caption,
    lineHeight: 18,
    fontWeight: runnerTypography.fontWeight.bold,
    letterSpacing: 0.7,
  },

  vehicleName: {
    fontSize: runnerTypography.subtitle,
    lineHeight: 27,
    fontWeight: runnerTypography.fontWeight.bold,
    marginTop: runnerSpacing.sm,
  },

  vehicleDetail: {
    fontSize: runnerTypography.body,
    lineHeight: 24,
  },

  registrationPlate: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: runnerRadii.sm,
    paddingHorizontal: runnerSpacing.md,
    paddingVertical: runnerSpacing.xs,
    marginTop: runnerSpacing.xs,
  },

  registrationText: {
    fontSize: runnerTypography.body,
    lineHeight: 22,
    fontWeight: runnerTypography.fontWeight.bold,
    letterSpacing: 1.2,
  },

  loadingContainer: {
    flex: 1,
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.md,
  },

  loadingText: {
    fontSize: runnerTypography.body,
    lineHeight: 23,
  },

  retryContainer: {
    flex: 1,
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.lg,
  },

  retryTitle: {
    fontSize: runnerTypography.body,
    lineHeight: 24,
    fontWeight: runnerTypography.fontWeight.semibold,
    textAlign: "center",
  },

  retryButton: {
    minHeight: runnerTouchTargets.minimum,
    minWidth: 140,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: runnerSpacing.lg,
  },

  retryButtonText: {
    fontSize: runnerTypography.body,
    lineHeight: 22,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  footer: {
    paddingHorizontal: runnerSpacing.lg,
    paddingTop: runnerSpacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  addButton: {
    minHeight: runnerTouchTargets.primary,
    borderRadius: runnerRadii.lg,
    paddingHorizontal: runnerSpacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.sm,
  },

  addButtonText: {
    flex: 1,
    fontSize: runnerTypography.body,
    lineHeight: 23,
    fontWeight: runnerTypography.fontWeight.bold,
  },
});