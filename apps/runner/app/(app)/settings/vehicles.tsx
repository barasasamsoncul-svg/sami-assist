import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
} from "@/theme";

import type { RunnerVehicleType } from "@/api";

import {
  getRunnerVehicles,
  reactivateRunnerVehicle,
  submitRunnerVehicleChange,
} from "@/vehicle-api";

type VehicleManagementData =
  Awaited<ReturnType<typeof getRunnerVehicles>>;

type SavedVehicle =
  VehicleManagementData["savedVehicles"][number];

type VehicleRequirement =
  VehicleManagementData["replacementRequirements"][number];

type ReplacementRequest =
  VehicleManagementData["replacementRequests"][number];

type PickedDocument = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

const VEHICLE_TYPES: {
  value: RunnerVehicleType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: "bike",
    label: "Bike",
    icon: "bicycle-outline",
  },
  {
    value: "motorbike",
    label: "Motorbike",
    icon: "bicycle-outline",
  },
  {
    value: "vehicle",
    label: "Vehicle",
    icon: "car-outline",
  },
];

function getErrorMessage(
  cause: unknown,
  fallback: string,
): string {
  return cause instanceof Error &&
    cause.message.trim().length > 0
    ? cause.message
    : fallback;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Approved";

    case "pending_review":
      return "Under review";

    case "changes_required":
      return "Changes required";

    case "rejected":
      return "Rejected";

    case "inactive":
      return "Inactive";

    case "cancelled":
      return "Cancelled";

    default:
      return status
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) =>
          character.toUpperCase(),
        );
  }
}

function getVehicleName(vehicle: {
  vehicleLabel?: string;
  vehicleType: string;
}): string {
  if (vehicle.vehicleLabel) {
    return vehicle.vehicleLabel;
  }

  switch (vehicle.vehicleType) {
    case "bike":
      return "Bike";

    case "motorbike":
      return "Motorbike";

    case "vehicle":
      return "Vehicle";

    default:
      return vehicle.vehicleType;
  }
}

export default function RunnerVehiclesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useRunnerTheme();

  const [data, setData] =
    useState<VehicleManagementData | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [pageError, setPageError] =
    useState<string | null>(null);

  const [notice, setNotice] =
    useState<string | null>(null);

  const [vehicleType, setVehicleType] =
    useState<RunnerVehicleType>("motorbike");

  const [vehicleModel, setVehicleModel] =
    useState("");

  const [vehicleRegistration, setVehicleRegistration] =
    useState("");

  const [pickedDocuments, setPickedDocuments] =
    useState<Record<string, PickedDocument>>({});

  const [formError, setFormError] =
    useState<string | null>(null);

  const [formSuccess, setFormSuccess] =
    useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [reactivatingVehicleId, setReactivatingVehicleId] =
    useState<string | null>(null);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(app)" as never);
  }, []);

  const loadVehicles = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await getRunnerVehicles();

        setData(result);
        setPageError(null);
      } catch (cause) {
        setPageError(
          getErrorMessage(
            cause,
            "Your vehicle information could not be loaded.",
          ),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void loadVehicles();
    }, [loadVehicles]),
  );

  const refresh = useCallback(() => {
    void loadVehicles(true);
  }, [loadVehicles]);

  const activeVehicle = data?.activeVehicle ?? null;

  const savedVehicles = data?.savedVehicles ?? [];

  const inactiveVehicles = useMemo(
    () =>
      savedVehicles.filter(
        (vehicle) =>
          !vehicle.isActive &&
          vehicle.status === "inactive",
      ),
    [savedVehicles],
  );

  const requirements = useMemo(
    () =>
      (data?.replacementRequirements ?? [])
        .filter(
          (requirement) =>
            requirement.vehicleType === vehicleType,
        )
        .sort(
          (first, second) =>
            first.displayOrder - second.displayOrder,
        ),
    [data, vehicleType],
  );

  const requiredRequirements = useMemo(
    () => requirements.filter((item) => item.required),
    [requirements],
  );

  const pendingReplacement =
    data?.pendingReplacement ?? null;

  const replacementRequests =
    data?.replacementRequests ?? [];

  const hasActiveErrand =
    data?.replacementEligibility.hasActiveErrand ?? false;

  const hasOpenReplacement =
    data?.replacementEligibility.hasOpenReplacement ??
    Boolean(pendingReplacement);

  const canSubmitReplacement =
    data?.replacementEligibility.canSubmit ?? false;

  const canConfigureSelectedVehicle =
    vehicleType === "bike" ||
    requiredRequirements.length > 0;

  const missingRequiredDocuments = useMemo(
    () =>
      requiredRequirements.filter(
        (requirement) =>
          !pickedDocuments[requirement.key],
      ),
    [pickedDocuments, requiredRequirements],
  );

  const statusTone = (status: string) => {
    if (status === "approved") {
      return {
        backgroundColor: colors.successSoft,
        color: colors.success,
      };
    }

    if (
      status === "rejected" ||
      status === "changes_required"
    ) {
      return {
        backgroundColor: colors.dangerSoft,
        color: colors.danger,
      };
    }

    if (status === "inactive") {
      return {
        backgroundColor: colors.surfaceSunken,
        color: colors.textMuted,
      };
    }

    return {
      backgroundColor: colors.infoSoft,
      color: colors.info,
    };
  };

  const handleVehicleTypeChange = (
    nextType: RunnerVehicleType,
  ) => {
    setVehicleType(nextType);
    setPickedDocuments({});
    setFormError(null);
    setFormSuccess(null);

    if (nextType === "bike") {
      setVehicleModel("");
      setVehicleRegistration("");
    }
  };

  const handlePickDocument = async (
    requirement: VehicleRequirement,
  ) => {
    setFormError(null);
    setFormSuccess(null);

    try {
      const result =
        await DocumentPicker.getDocumentAsync({
          type: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
          ],
          copyToCacheDirectory: true,
          multiple: false,
        });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];

      setPickedDocuments((current) => ({
        ...current,
        [requirement.key]: {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? null,
        },
      }));
    } catch (cause) {
      setFormError(
        getErrorMessage(
          cause,
          "The selected document could not be opened.",
        ),
      );
    }
  };

  const handleRemoveDocument = (
    requirementKey: string,
  ) => {
    setPickedDocuments((current) => {
      const next = { ...current };

      delete next[requirementKey];

      return next;
    });
  };

  const handleSubmitReplacement = async () => {
    setFormError(null);
    setFormSuccess(null);
    setNotice(null);

    if (!canSubmitReplacement) {
      setFormError(
        data?.replacementEligibility.blockReason ??
          "A replacement vehicle cannot be submitted right now.",
      );
      return;
    }

    if (
      vehicleType !== "bike" &&
      vehicleModel.trim().length < 2
    ) {
      setFormError(
        "Enter the make and model of your replacement vehicle.",
      );
      return;
    }

    if (
      vehicleType !== "bike" &&
      vehicleRegistration.trim().length === 0
    ) {
      setFormError(
        "Enter the registration number of your replacement vehicle.",
      );
      return;
    }

    if (
      vehicleType !== "bike" &&
      requiredRequirements.length === 0
    ) {
      setFormError(
        "The mandatory document checklist for this vehicle could not be verified. Please try again later.",
      );
      return;
    }

    if (missingRequiredDocuments.length > 0) {
      setFormError(
        "Upload every required document before submitting your replacement.",
      );
      return;
    }

    const documents = requirements.flatMap((requirement) => {
      const file = pickedDocuments[requirement.key];

      if (!file) {
        return [];
      }

      return [
        {
          requirementKey: requirement.key,
          file,
        },
      ];
    });

    setIsSubmitting(true);

    try {
      await submitRunnerVehicleChange({
        vehicleType,
        vehicleModel:
          vehicleType === "bike"
            ? ""
            : vehicleModel.trim(),
        vehicleRegistration:
          vehicleType === "bike"
            ? ""
            : vehicleRegistration.trim(),
        documents,
      });

      setVehicleModel("");
      setVehicleRegistration("");
      setPickedDocuments({});
      setFormSuccess(
        "Your replacement vehicle has been submitted for review. Your current approved vehicle remains active.",
      );

      await loadVehicles();
    } catch (cause) {
      setFormError(
        getErrorMessage(
          cause,
          "Your replacement vehicle could not be submitted.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReactivate = async (
    vehicleId: string,
  ) => {
    setReactivatingVehicleId(vehicleId);
    setPageError(null);
    setNotice(null);

    try {
      await reactivateRunnerVehicle(vehicleId);

      const updated = await getRunnerVehicles();

      setData(updated);
      setNotice(
        "Your vehicle has been reactivated successfully.",
      );
    } catch (cause) {
      setPageError(
        getErrorMessage(
          cause,
          "This vehicle could not be reactivated.",
        ),
      );
    } finally {
      setReactivatingVehicleId(null);
    }
  };

  const confirmReactivate = (
    vehicle: SavedVehicle,
  ) => {
    Alert.alert(
      "Reactivate vehicle?",
      `Make ${getVehicleName(vehicle).toLowerCase()} your active vehicle again? Your current vehicle will become inactive.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Reactivate",
          onPress: () => {
            void handleReactivate(vehicle.id);
          },
        },
      ],
    );
  };

  const renderStatus = (status: string) => {
    const tone = statusTone(status);

    return (
      <View
        style={[
          styles.statusPill,
          {
            backgroundColor: tone.backgroundColor,
          },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            { color: tone.color },
          ]}
        >
          {getStatusLabel(status)}
        </Text>
      </View>
    );
  };

  const renderVehicleDetails = (
    vehicle: SavedVehicle,
  ) => (
    <View style={styles.vehicleDetails}>
      <Text
        style={[
          styles.vehicleName,
          { color: colors.text },
        ]}
      >
        {getVehicleName(vehicle)}
      </Text>

      {vehicle.vehicleModel ? (
        <Text
          style={[
            styles.bodyText,
            { color: colors.textMuted },
          ]}
        >
          {vehicle.vehicleModel}
        </Text>
      ) : null}

      {vehicle.vehicleRegistration ? (
        <Text
          style={[
            styles.secondaryText,
            { color: colors.textSubtle },
          ]}
        >
          {vehicle.vehicleRegistration}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.paper },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + runnerSpacing.md,
            paddingBottom:
              insets.bottom + runnerSpacing.xxxl,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={goBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
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
                styles.headerTitle,
                { color: colors.text },
              ]}
            >
              Vehicles
            </Text>

            <Text
              style={[
                styles.headerSubtitle,
                { color: colors.textMuted },
              ]}
            >
              Manage the vehicle you use for SaMi errands.
            </Text>
          </View>
        </View>

        {pageError ? (
          <View
            style={[
              styles.messagePanel,
              {
                backgroundColor: colors.dangerSoft,
                borderColor: colors.danger,
              },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={19}
              color={colors.danger}
            />

            <Text
              style={[
                styles.messageText,
                { color: colors.danger },
              ]}
            >
              {pageError}
            </Text>
          </View>
        ) : null}

        {notice ? (
          <View
            style={[
              styles.messagePanel,
              {
                backgroundColor: colors.successSoft,
                borderColor: colors.success,
              },
            ]}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={19}
              color={colors.success}
            />

            <Text
              style={[
                styles.messageText,
                { color: colors.success },
              ]}
            >
              {notice}
            </Text>
          </View>
        ) : null}

        {loading && !data ? (
          <View style={styles.loadingState}>
            <ActivityIndicator
              size="large"
              color={colors.blue}
            />

            <Text
              style={[
                styles.bodyText,
                { color: colors.textMuted },
              ]}
            >
              Loading your vehicles...
            </Text>
          </View>
        ) : null}

        {!loading && !data && !pageError ? (
          <View
            style={[
              styles.emptyPanel,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name="car-outline"
              size={30}
              color={colors.iconMuted}
            />

            <Text
              style={[
                styles.panelTitle,
                { color: colors.text },
              ]}
            >
              Vehicle information unavailable
            </Text>

            <Text
              style={[
                styles.bodyText,
                { color: colors.textMuted },
              ]}
            >
              Pull down to try loading your vehicle information again.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => void loadVehicles()}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.brand,
                  opacity: pressed ? 0.86 : 1,
                },
              ]}
            >
              <Text style={styles.primaryButtonText}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        {data ? (
          <>
            {/* Current vehicle */}
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textSubtle },
                ]}
              >
                CURRENT VEHICLE
              </Text>

              {activeVehicle ? (
                <View
                  style={[
                    styles.vehiclePanel,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.vehiclePanelTop}>
                    <View
                      style={[
                        styles.vehicleIcon,
                        {
                          backgroundColor: colors.blueSoft,
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          activeVehicle.vehicleType === "vehicle"
                            ? "car-outline"
                            : "bicycle-outline"
                        }
                        size={25}
                        color={colors.blue}
                      />
                    </View>

                    {renderStatus("approved")}
                  </View>

                  {renderVehicleDetails(activeVehicle)}

                  <View
                    style={[
                      styles.vehicleMeta,
                      { borderTopColor: colors.divider },
                    ]}
                  >
                    <Text
                      style={[
                        styles.secondaryText,
                        { color: colors.textSubtle },
                      ]}
                    >
                      Active since{" "}
                      {formatDate(activeVehicle.approvedAt)}
                    </Text>

                    <View style={styles.activeIndicator}>
                      <View
                        style={[
                          styles.activeDot,
                          {
                            backgroundColor: colors.success,
                          },
                        ]}
                      />

                      <Text
                        style={[
                          styles.secondaryText,
                          { color: colors.success },
                        ]}
                      >
                        In use
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    styles.emptyPanel,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="car-outline"
                    size={26}
                    color={colors.iconMuted}
                  />

                  <Text
                    style={[
                      styles.panelTitle,
                      { color: colors.text },
                    ]}
                  >
                    No active vehicle
                  </Text>

                  <Text
                    style={[
                      styles.bodyText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Your active vehicle information is not currently available.
                  </Text>
                </View>
              )}
            </View>

            {/* Saved vehicles */}
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textSubtle },
                ]}
              >
                SAVED VEHICLES
              </Text>

              {inactiveVehicles.length > 0 ? (
                <View
                  style={[
                    styles.listPanel,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {inactiveVehicles.map(
                    (vehicle, index) => {
                      const isReactivating =
                        reactivatingVehicleId === vehicle.id;

                      const canReactivate =
                        vehicle.canReactivate &&
                        !hasActiveErrand &&
                        !hasOpenReplacement;

                      return (
                        <View key={vehicle.id}>
                          <View style={styles.savedVehicleRow}>
                            <View
                              style={[
                                styles.vehicleIcon,
                                {
                                  backgroundColor:
                                    colors.surfaceSunken,
                                },
                              ]}
                            >
                              <Ionicons
                                name={
                                  vehicle.vehicleType === "vehicle"
                                    ? "car-outline"
                                    : "bicycle-outline"
                                }
                                size={23}
                                color={colors.icon}
                              />
                            </View>

                            <View style={styles.savedVehicleInfo}>
                              {renderVehicleDetails(vehicle)}
                              {renderStatus(vehicle.status)}
                            </View>
                          </View>

                          <View style={styles.savedVehicleActions}>
                            <Text
                              style={[
                                styles.secondaryText,
                                { color: colors.textSubtle },
                              ]}
                            >
                              Added {formatDate(vehicle.createdAt)}
                            </Text>

                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Reactivate ${getVehicleName(vehicle)}`}
                              disabled={
                                !canReactivate ||
                                isReactivating ||
                                reactivatingVehicleId !== null
                              }
                              onPress={() =>
                                confirmReactivate(vehicle)
                              }
                              style={({ pressed }) => [
                                styles.secondaryButton,
                                {
                                  borderColor: colors.borderStrong,
                                  backgroundColor: pressed
                                    ? colors.pressed
                                    : colors.surface,
                                  opacity: canReactivate ? 1 : 0.45,
                                },
                              ]}
                            >
                              {isReactivating ? (
                                <ActivityIndicator
                                  size="small"
                                  color={colors.blue}
                                />
                              ) : (
                                <Ionicons
                                  name="refresh-outline"
                                  size={16}
                                  color={colors.blue}
                                />
                              )}

                              <Text
                                style={[
                                  styles.secondaryButtonText,
                                  { color: colors.blue },
                                ]}
                              >
                                Reactivate
                              </Text>
                            </Pressable>
                          </View>

                          {index <
                          inactiveVehicles.length - 1 ? (
                            <View
                              style={[
                                styles.separator,
                                {
                                  backgroundColor: colors.divider,
                                },
                              ]}
                            />
                          ) : null}
                        </View>
                      );
                    },
                  )}
                </View>
              ) : (
                <Text
                  style={[
                    styles.bodyText,
                    { color: colors.textMuted },
                  ]}
                >
                  You do not have any inactive saved vehicles.
                </Text>
              )}

              {hasActiveErrand || hasOpenReplacement ? (
                <Text
                  style={[
                    styles.helperText,
                    { color: colors.textSubtle },
                  ]}
                >
                  Vehicle reactivation is unavailable while an errand is active or a replacement request is awaiting review.
                </Text>
              ) : null}
            </View>

            {/* Pending replacement */}
            {pendingReplacement ? (
              <View style={styles.section}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.textSubtle },
                  ]}
                >
                  REPLACEMENT REQUEST
                </Text>

                <View
                  style={[
                    styles.vehiclePanel,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.panelHeadingRow}>
                    <Text
                      style={[
                        styles.panelTitle,
                        { color: colors.text },
                      ]}
                    >
                      {getVehicleName(pendingReplacement)} replacement
                    </Text>

                    {renderStatus(pendingReplacement.status)}
                  </View>

                  {pendingReplacement.vehicleModel ? (
                    <Text
                      style={[
                        styles.bodyText,
                        { color: colors.textMuted },
                      ]}
                    >
                      {pendingReplacement.vehicleModel}
                    </Text>
                  ) : null}

                  {pendingReplacement.vehicleRegistration ? (
                    <Text
                      style={[
                        styles.secondaryText,
                        { color: colors.textSubtle },
                      ]}
                    >
                      {pendingReplacement.vehicleRegistration}
                    </Text>
                  ) : null}

                  <Text
                    style={[
                      styles.secondaryText,
                      { color: colors.textSubtle },
                    ]}
                  >
                    Submitted{" "}
                    {formatDate(pendingReplacement.createdAt)}
                  </Text>

                  {pendingReplacement.reviewReason ? (
                    <View
                      style={[
                        styles.reviewReason,
                        {
                          backgroundColor: colors.warningSoft,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.bodyText,
                          { color: colors.warning },
                        ]}
                      >
                        {pendingReplacement.reviewReason}
                      </Text>
                    </View>
                  ) : null}

                  <Text
                    style={[
                      styles.helperText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Your current approved vehicle remains active until the replacement is approved.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Replacement form */}
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textSubtle },
                ]}
              >
                REPLACE VEHICLE
              </Text>

              {!canSubmitReplacement ? (
                <View
                  style={[
                    styles.messagePanel,
                    {
                      backgroundColor: colors.surfaceSunken,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={colors.iconMuted}
                  />

                  <Text
                    style={[
                      styles.messageText,
                      { color: colors.textMuted },
                    ]}
                  >
                    {data.replacementEligibility.blockReason ??
                      "A replacement vehicle cannot be submitted right now."}
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.formPanel,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.panelTitle,
                      { color: colors.text },
                    ]}
                  >
                    Vehicle details
                  </Text>

                  <Text
                    style={[
                      styles.bodyText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Select the replacement vehicle you want Operations to review.
                  </Text>

                  {/* Vehicle type */}
                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: colors.text },
                      ]}
                    >
                      Vehicle type
                    </Text>

                    <View style={styles.vehicleTypeOptions}>
                      {VEHICLE_TYPES.map((item) => {
                        const selected =
                          vehicleType === item.value;

                        return (
                          <Pressable
                            key={item.value}
                            accessibilityRole="button"
                            accessibilityState={{
                              selected,
                            }}
                            onPress={() =>
                              handleVehicleTypeChange(item.value)
                            }
                            style={({ pressed }) => [
                              styles.vehicleTypeOption,
                              {
                                backgroundColor: selected
                                  ? colors.surfaceSelected
                                  : colors.surface,
                                borderColor: selected
                                  ? colors.blue
                                  : colors.border,
                                opacity: pressed ? 0.82 : 1,
                              },
                            ]}
                          >
                            <Ionicons
                              name={item.icon}
                              size={20}
                              color={
                                selected
                                  ? colors.blue
                                  : colors.iconMuted
                              }
                            />

                            <Text
                              style={[
                                styles.vehicleTypeLabel,
                                {
                                  color: selected
                                    ? colors.blue
                                    : colors.text,
                                },
                              ]}
                            >
                              {item.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Vehicle model */}
                  {vehicleType !== "bike" ? (
                    <>
                      <View style={styles.fieldGroup}>
                        <Text
                          style={[
                            styles.fieldLabel,
                            { color: colors.text },
                          ]}
                        >
                          Make and model
                        </Text>

                        <TextInput
                          value={vehicleModel}
                          onChangeText={setVehicleModel}
                          placeholder="e.g. Honda Ace 125"
                          placeholderTextColor={colors.textDisabled}
                          autoCapitalize="words"
                          maxLength={120}
                          style={[
                            styles.textInput,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              color: colors.text,
                            },
                          ]}
                        />
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text
                          style={[
                            styles.fieldLabel,
                            { color: colors.text },
                          ]}
                        >
                          Registration number
                        </Text>

                        <TextInput
                          value={vehicleRegistration}
                          onChangeText={setVehicleRegistration}
                          placeholder="e.g. KMFQ 314F"
                          placeholderTextColor={colors.textDisabled}
                          autoCapitalize="characters"
                          maxLength={16}
                          style={[
                            styles.textInput,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              color: colors.text,
                            },
                          ]}
                        />
                      </View>
                    </>
                  ) : null}

                  {/* Documents */}
                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: colors.text },
                      ]}
                    >
                      Vehicle documents
                    </Text>

                    <Text
                      style={[
                        styles.bodyText,
                        { color: colors.textMuted },
                      ]}
                    >
                      Upload the vehicle-specific documents shown below. Your universal onboarding identity documents are not requested again.
                    </Text>

                    {requirements.length > 0 ? (
                      <View style={styles.documentList}>
                        {requirements.map((requirement) => {
                          const picked =
                            pickedDocuments[requirement.key];

                          return (
                            <View
                              key={requirement.key}
                              style={[
                                styles.documentCard,
                                {
                                  backgroundColor:
                                    colors.surfaceSunken,
                                  borderColor: colors.border,
                                },
                              ]}
                            >
                              <View style={styles.documentHeading}>
                                <View style={styles.documentTitleArea}>
                                  <Text
                                    style={[
                                      styles.documentTitle,
                                      { color: colors.text },
                                    ]}
                                  >
                                    {requirement.title}
                                  </Text>

                                  <Text
                                    style={[
                                      styles.secondaryText,
                                      { color: colors.textSubtle },
                                    ]}
                                  >
                                    {requirement.required
                                      ? "Required"
                                      : "Optional"}
                                  </Text>
                                </View>

                                <Ionicons
                                  name={
                                    picked
                                      ? "checkmark-circle"
                                      : "document-outline"
                                  }
                                  size={21}
                                  color={
                                    picked
                                      ? colors.success
                                      : colors.iconMuted
                                  }
                                />
                              </View>

                              {requirement.instructions ? (
                                <Text
                                  style={[
                                    styles.bodyText,
                                    { color: colors.textMuted },
                                  ]}
                                >
                                  {requirement.instructions}
                                </Text>
                              ) : null}

                              {picked ? (
                                <View style={styles.selectedFileRow}>
                                  <Ionicons
                                    name="document-text-outline"
                                    size={17}
                                    color={colors.success}
                                  />

                                  <Text
                                    numberOfLines={1}
                                    style={[
                                      styles.selectedFileName,
                                      { color: colors.text },
                                    ]}
                                  >
                                    {picked.name}
                                  </Text>

                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${picked.name}`}
                                    onPress={() =>
                                      handleRemoveDocument(
                                        requirement.key,
                                      )
                                    }
                                    hitSlop={8}
                                  >
                                    <Ionicons
                                      name="close-circle"
                                      size={20}
                                      color={colors.danger}
                                    />
                                  </Pressable>
                                </View>
                              ) : (
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() =>
                                    void handlePickDocument(
                                      requirement,
                                    )
                                  }
                                  style={({ pressed }) => [
                                    styles.uploadButton,
                                    {
                                      borderColor: colors.borderStrong,
                                      backgroundColor: pressed
                                        ? colors.pressed
                                        : colors.surface,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name="cloud-upload-outline"
                                    size={18}
                                    color={colors.blue}
                                  />

                                  <Text
                                    style={[
                                      styles.uploadButtonText,
                                      { color: colors.blue },
                                    ]}
                                  >
                                    Select document
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    ) : vehicleType === "bike" ? (
                      <View
                        style={[
                          styles.helperPanel,
                          {
                            backgroundColor: colors.surfaceSunken,
                          },
                        ]}
                      >
                        <Ionicons
                          name="information-circle-outline"
                          size={19}
                          color={colors.iconMuted}
                        />

                        <Text
                          style={[
                            styles.bodyText,
                            { color: colors.textMuted },
                          ]}
                        >
                          No additional vehicle-specific documents are configured for a bicycle replacement.
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.helperPanel,
                          {
                            backgroundColor: colors.warningSoft,
                          },
                        ]}
                      >
                        <Ionicons
                          name="alert-circle-outline"
                          size={19}
                          color={colors.warning}
                        />

                        <Text
                          style={[
                            styles.bodyText,
                            { color: colors.warning },
                          ]}
                        >
                          The required document checklist for this vehicle type is unavailable. You cannot submit until it can be verified.
                        </Text>
                      </View>
                    )}
                  </View>

                  {formError ? (
                    <View
                      style={[
                        styles.messagePanel,
                        {
                          backgroundColor: colors.dangerSoft,
                          borderColor: colors.danger,
                        },
                      ]}
                    >
                      <Ionicons
                        name="alert-circle-outline"
                        size={18}
                        color={colors.danger}
                      />

                      <Text
                        style={[
                          styles.messageText,
                          { color: colors.danger },
                        ]}
                      >
                        {formError}
                      </Text>
                    </View>
                  ) : null}

                  {formSuccess ? (
                    <View
                      style={[
                        styles.messagePanel,
                        {
                          backgroundColor: colors.successSoft,
                          borderColor: colors.success,
                        },
                      ]}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={18}
                        color={colors.success}
                      />

                      <Text
                        style={[
                          styles.messageText,
                          { color: colors.success },
                        ]}
                      >
                        {formSuccess}
                      </Text>
                    </View>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    disabled={
                      isSubmitting ||
                      !canConfigureSelectedVehicle ||
                      missingRequiredDocuments.length > 0
                    }
                    onPress={() =>
                      void handleSubmitReplacement()
                    }
                    style={({ pressed }) => [
                      styles.primaryButton,
                      {
                        backgroundColor: colors.brand,
                        opacity:
                          isSubmitting ||
                          !canConfigureSelectedVehicle ||
                          missingRequiredDocuments.length > 0
                            ? 0.48
                            : pressed
                              ? 0.86
                              : 1,
                      },
                    ]}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                      />
                    ) : (
                      <Ionicons
                        name="send-outline"
                        size={18}
                        color="#FFFFFF"
                      />
                    )}

                    <Text style={styles.primaryButtonText}>
                      {isSubmitting
                        ? "Submitting..."
                        : "Submit for review"}
                    </Text>
                  </Pressable>

                  <Text
                    style={[
                      styles.helperText,
                      { color: colors.textSubtle },
                    ]}
                  >
                    Your current approved vehicle stays active while Operations reviews your replacement.
                  </Text>
                </View>
              )}
            </View>

            {/* Replacement history */}
            {replacementRequests.length > 0 ? (
              <View style={styles.section}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.textSubtle },
                  ]}
                >
                  REQUEST HISTORY
                </Text>

                <View
                  style={[
                    styles.listPanel,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {replacementRequests.map(
                    (
                      request: ReplacementRequest,
                      index: number,
                    ) => (
                      <View key={request.id}>
                        <View style={styles.historyRow}>
                          <View style={styles.historyInfo}>
                            <Text
                              style={[
                                styles.historyTitle,
                                { color: colors.text },
                              ]}
                            >
                              {getVehicleName(request)}
                            </Text>

                            {request.vehicleModel ? (
                              <Text
                                style={[
                                  styles.secondaryText,
                                  { color: colors.textMuted },
                                ]}
                              >
                                {request.vehicleModel}
                              </Text>
                            ) : null}

                            {request.vehicleRegistration ? (
                              <Text
                                style={[
                                  styles.secondaryText,
                                  { color: colors.textMuted },
                                ]}
                              >
                                {request.vehicleRegistration}
                              </Text>
                            ) : null}

                            <Text
                              style={[
                                styles.secondaryText,
                                { color: colors.textSubtle },
                              ]}
                            >
                              {formatDate(request.createdAt)}
                            </Text>

                            {request.reviewReason ? (
                              <Text
                                style={[
                                  styles.bodyText,
                                  { color: colors.textMuted },
                                ]}
                              >
                                {request.reviewReason}
                              </Text>
                            ) : null}
                          </View>

                          {renderStatus(request.status)}
                        </View>

                        {index <
                        replacementRequests.length - 1 ? (
                          <View
                            style={[
                              styles.separator,
                              {
                                backgroundColor: colors.divider,
                              },
                            ]}
                          />
                        ) : null}
                      </View>
                    ),
                  )}
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  content: {
    paddingHorizontal: runnerSpacing.lg,
    gap: runnerSpacing.xl,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
    marginBottom: runnerSpacing.xs,
  },

  headerText: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  backButton: {
    width: runnerTouchTargets.minimum,
    height: runnerTouchTargets.minimum,
    borderRadius: runnerRadii.md,
    backgroundColor: "#00061D",
    alignItems: "center",
    justifyContent: "center",
  },

  backButtonPressed: {
    opacity: 0.82,
  },

  headerTitle: {
    fontSize: runnerTypography.heading,
    fontWeight: runnerTypography.fontWeight.bold,
    lineHeight: 32,
  },

  headerSubtitle: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 21,
  },

  section: {
    gap: runnerSpacing.sm,
  },

  sectionTitle: {
    fontSize: runnerTypography.eyebrow,
    fontWeight: runnerTypography.fontWeight.bold,
    letterSpacing: 0.9,
  },

  vehiclePanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: runnerRadii.lg,
    padding: runnerSpacing.lg,
    gap: runnerSpacing.md,
  },

  vehiclePanelTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  vehicleIcon: {
    width: 46,
    height: 46,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
  },

  vehicleDetails: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  vehicleName: {
    fontSize: runnerTypography.subtitle,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  bodyText: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 22,
  },

  secondaryText: {
    fontSize: runnerTypography.caption,
    lineHeight: 19,
  },

  statusPill: {
    alignSelf: "flex-start",
    borderRadius: runnerRadii.pill,
    paddingHorizontal: runnerSpacing.sm,
    paddingVertical: runnerSpacing.xxs,
  },

  statusText: {
    fontSize: runnerTypography.caption,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  vehicleMeta: {
    paddingTop: runnerSpacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: runnerSpacing.sm,
  },

  activeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.xs,
  },

  activeDot: {
    width: 7,
    height: 7,
    borderRadius: runnerRadii.pill,
  },

  listPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: runnerRadii.lg,
    paddingHorizontal: runnerSpacing.md,
  },

  savedVehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
    paddingVertical: runnerSpacing.md,
  },

  savedVehicleInfo: {
    flex: 1,
    gap: runnerSpacing.sm,
  },

  savedVehicleActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: runnerSpacing.sm,
    paddingBottom: runnerSpacing.md,
  },

  secondaryButton: {
    minHeight: runnerTouchTargets.minimum,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.xs,
    paddingHorizontal: runnerSpacing.md,
    borderWidth: 1,
    borderRadius: runnerRadii.md,
  },

  secondaryButtonText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  separator: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },

  panelHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: runnerSpacing.sm,
  },

  panelTitle: {
    fontSize: runnerTypography.subtitle,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  reviewReason: {
    borderRadius: runnerRadii.md,
    padding: runnerSpacing.md,
  },

  formPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: runnerRadii.lg,
    padding: runnerSpacing.lg,
    gap: runnerSpacing.lg,
  },

  fieldGroup: {
    gap: runnerSpacing.sm,
  },

  fieldLabel: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  vehicleTypeOptions: {
    flexDirection: "row",
    gap: runnerSpacing.sm,
  },

  vehicleTypeOption: {
    flex: 1,
    minHeight: runnerTouchTargets.comfortable,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.xs,
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    paddingHorizontal: runnerSpacing.xs,
  },

  vehicleTypeLabel: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  textInput: {
    minHeight: runnerTouchTargets.comfortable,
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    paddingHorizontal: runnerSpacing.md,
    paddingVertical: runnerSpacing.sm,
    fontSize: runnerTypography.body,
  },

  documentList: {
    gap: runnerSpacing.sm,
  },

  documentCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: runnerRadii.md,
    padding: runnerSpacing.md,
    gap: runnerSpacing.sm,
  },

  documentHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: runnerSpacing.sm,
  },

  documentTitleArea: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  documentTitle: {
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  selectedFileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.sm,
  },

  selectedFileName: {
    flex: 1,
    fontSize: runnerTypography.bodySmall,
  },

  uploadButton: {
    minHeight: runnerTouchTargets.minimum,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.xs,
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    paddingHorizontal: runnerSpacing.md,
  },

  uploadButtonText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  helperPanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: runnerSpacing.sm,
    borderRadius: runnerRadii.md,
    padding: runnerSpacing.md,
  },

  helperText: {
    fontSize: runnerTypography.caption,
    lineHeight: 20,
  },

  primaryButton: {
    minHeight: runnerTouchTargets.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.sm,
    borderRadius: runnerRadii.md,
    paddingHorizontal: runnerSpacing.lg,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  messagePanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: runnerSpacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: runnerRadii.md,
    padding: runnerSpacing.md,
  },

  messageText: {
    flex: 1,
    fontSize: runnerTypography.bodySmall,
    lineHeight: 22,
  },

  emptyPanel: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: runnerRadii.lg,
    padding: runnerSpacing.xl,
    gap: runnerSpacing.md,
  },

  loadingState: {
    alignItems: "center",
    paddingVertical: runnerSpacing.section,
    gap: runnerSpacing.md,
  },

  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: runnerSpacing.md,
    paddingVertical: runnerSpacing.md,
  },

  historyInfo: {
    flex: 1,
    gap: runnerSpacing.xs,
  },

  historyTitle: {
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.semibold,
  },
});