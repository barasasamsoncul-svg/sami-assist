
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
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

import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import {
  getRunnerOnboarding,
  saveRunnerSession,
  submitRunnerOnboarding,
  updateRunnerOnboarding,
  uploadRunnerDocument,
  type RunnerDocumentRequirement,
  type RunnerOnboardingData,
  type RunnerUploadedDocument,
} from "@/api";

import { useRunnerTheme } from "@/theme";

const VEHICLE_TYPES = [
  { value: "motorcycle", label: "Motorcycle", icon: "bicycle-outline" },
  { value: "bicycle", label: "Bicycle", icon: "bicycle-outline" },
  { value: "car", label: "Car", icon: "car-outline" },
  { value: "van", label: "Van", icon: "bus-outline" },
  { value: "other", label: "Other", icon: "apps-outline" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  groceries: "Groceries",
  food_delivery: "Food delivery",
  pickup_delivery: "Pick-ups and deliveries",
  bill_payments: "Bill payments",
  laundry_cleaning: "Laundry and cleaning",
  documents_admin: "Documents and admin",
  clothing_retail: "Clothing and retail",
  home_services: "Home services",
  pharmacy_health: "Pharmacy and health",
  pet_care: "Pet care",
  queue_appointments: "Queues and appointments",
  personal_errand: "Personal errands",
  business_support: "Business support",
  shopping_gifts: "Shopping and gifts",
  shopping: "General shopping",
  other: "Other tasks",
};

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

type SelectedFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

function latestDocument(
  documents: RunnerUploadedDocument[],
  requirementKey: string,
) {
  return documents.find(
    (document) =>
      document.requirementKey === requirementKey,
  );
}

function isDocumentSatisfied(
  document: RunnerUploadedDocument | undefined,
) {
  return (
    document?.reviewStatus === "pending" ||
    document?.reviewStatus === "approved"
  );
}

export default function RunnerProfileSetupScreen() {
  const { colors } = useRunnerTheme();

  const params = useLocalSearchParams<{
    mode?: string;
  }>();

  const [data, setData] =
    useState<RunnerOnboardingData | null>(null);

  const [serviceArea, setServiceArea] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleRegistration, setVehicleRegistration] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingRequirement, setUploadingRequirement] =
    useState("");

  const [error, setError] = useState("");
  const [missingRequirements, setMissingRequirements] =
    useState<string[]>([]);

  const [transportSaved, setTransportSaved] =
    useState(false);

  const statusOnly = params.mode === "status";

  const isPendingReview =
    data?.onboardingStatus === "pending_review";

  const isApproved =
    data?.onboardingStatus === "approved";

  const isChangesRequired =
    data?.onboardingStatus === "changes_required";

  const categories = useMemo(
    () =>
      (data?.runner.selectedCategories || []).map(
        (key) => CATEGORY_LABELS[key] || key.replaceAll("_", " "),
      ),
    [data?.runner.selectedCategories],
  );

  const requiredCount = useMemo(
    () =>
      data?.requirements.filter(
        (requirement) => requirement.required,
      ).length || 0,
    [data?.requirements],
  );

  const completedRequiredCount = useMemo(() => {
    if (!data) return 0;

    return data.requirements.filter((requirement) => {
      if (!requirement.required) return false;

      return isDocumentSatisfied(
        latestDocument(
          data.documents,
          requirement.key,
        ),
      );
    }).length;
  }, [data]);

  const allRequiredDocumentsComplete =
    requiredCount > 0 &&
    completedRequiredCount === requiredCount;

  const loadOnboarding = useCallback(async () => {
    setError("");

    const result = await getRunnerOnboarding();

    if (result.onboardingStatus === "approved") {
      router.replace("/(app)");
      return;
    }

    setData(result);

    setServiceArea(result.runner.serviceArea || "");
    setVehicleType(result.runner.vehicleType || "");
    setVehicleRegistration(
      result.runner.vehicleRegistration || "",
    );

    setTransportSaved(
      Boolean(
        result.runner.serviceArea &&
        result.runner.vehicleType,
      ),
    );
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        await loadOnboarding();
      } catch (cause) {
        if (mounted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Your onboarding information could not be loaded.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [loadOnboarding]);

  async function refresh() {
    setLoading(true);

    try {
      await loadOnboarding();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your onboarding information could not be refreshed.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveTransportDetails() {
    if (serviceArea.trim().length < 2) {
      setError("Enter your main service area.");
      return;
    }

    if (!vehicleType) {
      setError("Choose the transport type you will use.");
      return;
    }

    if (
      ["motorcycle", "car", "van"].includes(vehicleType) &&
      vehicleRegistration.trim().length < 3
    ) {
      setError(
        "Enter the registration number of your vehicle.",
      );
      return;
    }

    setSavingProfile(true);
    setError("");

    try {
      await updateRunnerOnboarding({
        serviceArea: serviceArea.trim(),
        vehicleType,
        vehicleRegistration: vehicleRegistration.trim(),
      });

      await loadOnboarding();

      setError("");
      setTransportSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your transport details could not be saved.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadSelectedImage(
    requirement: RunnerDocumentRequirement,
    asset: ImagePicker.ImagePickerAsset,
  ) {
    if (asset.fileSize && asset.fileSize > MAX_UPLOAD_SIZE) {
      setError(
        "This image is larger than 10 MB. Choose a smaller image.",
      );
      return;
    }

    if (!asset.uri) {
      setError("The selected document could not be read.");
      return;
    }

    const selected: SelectedFile = {
      uri: asset.uri,
      name:
        asset.fileName ||
        `${requirement.key}-${Date.now()}.jpg`,
      mimeType: asset.mimeType || "image/jpeg",
    };

    setUploadingRequirement(requirement.key);
    setError("");

    try {
      await uploadRunnerDocument({
        requirementKey: requirement.key,
        file: selected,
      });

      await loadOnboarding();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Could not upload ${requirement.title}.`,
      );
    } finally {
      setUploadingRequirement("");
    }
  }

  async function takeDocumentPhoto(
    requirement: RunnerDocumentRequirement,
  ) {
    try {
      const permission =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        setError(
          "Allow camera access to take a document photo.",
        );
        return;
      }

      const result =
        await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.9,
        });

      if (!result.canceled && result.assets[0]) {
        await uploadSelectedImage(
          requirement,
          result.assets[0],
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The camera could not be opened.",
      );
    }
  }

  async function chooseDocumentPhoto(
    requirement: RunnerDocumentRequirement,
  ) {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError(
          "Allow photo library access to choose a document image.",
        );
        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.9,
        });

      if (!result.canceled && result.assets[0]) {
        await uploadSelectedImage(
          requirement,
          result.assets[0],
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your document image could not be selected.",
      );
    }
  }

  function chooseDocumentSource(
    requirement: RunnerDocumentRequirement,
  ) {
    if (uploadingRequirement) return;

    Alert.alert(
      requirement.title,
      "How would you like to provide this document?",
      [
        {
          text: "Take a photo",
          onPress: () => {
            void takeDocumentPhoto(requirement);
          },
        },
        {
          text: "Choose from gallery",
          onPress: () => {
            void chooseDocumentPhoto(requirement);
          },
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ],
    );
  }

  async function submitApplication() {
    if (!data) return;

    const missing = data.requirements
      .filter((requirement) => requirement.required)
      .filter((requirement) => {
        const uploaded = latestDocument(
          data.documents,
          requirement.key,
        );

        return !isDocumentSatisfied(uploaded);
      })
      .map((requirement) => requirement.title);

    if (missing.length > 0) {
      setMissingRequirements(missing);
      setError(
        "Some required documents are still missing or need replacement.",
      );
      return;
    }

    setSubmitting(true);
    setError("");
    setMissingRequirements([]);

    try {
      await submitRunnerOnboarding();
      await loadOnboarding();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your application could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View
        style={[
          styles.loadingScreen,
          { backgroundColor: colors.paper },
        ]}
      >
        <ActivityIndicator size="large" color={colors.blue} />
        <Text
          style={[
            styles.loadingText,
            { color: colors.textMuted },
          ]}
        >
          Loading your Runner application...
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: colors.paper },
        ]}
      >
        <View style={styles.loadErrorScreen}>
          <Ionicons
            name="cloud-offline-outline"
            size={38}
            color={colors.red}
          />

          <Text
            style={[
              styles.title,
              { color: colors.text, textAlign: "center" },
            ]}
          >
            Your application could not be loaded
          </Text>

          <Text
            style={[
              styles.subtitle,
              { color: colors.textMuted, textAlign: "center" },
            ]}
          >
            Check your connection and try again.
          </Text>

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.errorText, { color: colors.red }]}
            >
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => void refresh()}
            style={[
              styles.primaryButton,
              { backgroundColor: colors.blue },
            ]}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isPendingReview || statusOnly) {
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

        <ScrollView
          contentContainerStyle={styles.statusContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <Text
              style={[
                styles.brandName,
                { color: colors.navy },
              ]}
            >
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

          <View
            style={[
              styles.statusIcon,
              { backgroundColor: colors.warningSoft },
            ]}
          >
            <Ionicons
              name="time-outline"
              size={42}
              color={colors.warning}
            />
          </View>

          <Text
            style={[
              styles.eyebrow,
              { color: colors.warning },
            ]}
          >
            APPLICATION RECEIVED
          </Text>

          <Text
            style={[
              styles.title,
              { color: colors.text, textAlign: "center" },
            ]}
          >
            Your application is under review.
          </Text>

          <Text
            style={[
              styles.subtitle,
              { color: colors.textMuted, textAlign: "center" },
            ]}
          >
            Thank you for completing your SaMi Runner
            application. Our Operations team must review
            your information and documents before you
            can go online.
          </Text>

          <View
            style={[
              styles.statusCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: colors.text },
              ]}
            >
              Application details
            </Text>

            <View style={styles.statusRow}>
              <Text
                style={[
                  styles.statusLabel,
                  { color: colors.textMuted },
                ]}
              >
                Applicant
              </Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: colors.text },
                ]}
              >
                {data.runner.fullName || "Runner"}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Text
                style={[
                  styles.statusLabel,
                  { color: colors.textMuted },
                ]}
              >
                Email
              </Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: colors.text },
                ]}
              >
                {data.runner.email || "Not available"}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Text
                style={[
                  styles.statusLabel,
                  { color: colors.textMuted },
                ]}
              >
                Documents submitted
              </Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: colors.text },
                ]}
              >
                {data.documents.length}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Text
                style={[
                  styles.statusLabel,
                  { color: colors.textMuted },
                ]}
              >
                Service area
              </Text>
              <Text
                style={[
                  styles.statusValue,
                  { color: colors.text },
                ]}
              >
                {data.runner.serviceArea || "Not provided"}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.statusNotice,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <Ionicons
              name="notifications-outline"
              size={20}
              color={colors.blue}
            />

            <Text
              style={[
                styles.statusNoticeText,
                { color: colors.text },
              ]}
            >
              You can sign in again to check your
              application status. You will only access
              Runner errands after approval.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void refresh()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.blue },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="refresh-outline"
              size={18}
              color="#FFFFFF"
            />

            <Text style={styles.primaryButtonText}>
              Refresh application status
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              await saveRunnerSession("");
              router.replace("/(auth)/login");
            }}
            style={styles.secondaryButton}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                { color: colors.blue },
              ]}
            >
              Return to sign in
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

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
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={() => router.replace("/(auth)/login")}
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

          <View style={styles.progressHeader}>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.blue,
                    width: "66.66%",
                  },
                ]}
              />
            </View>

            <Text
              style={[
                styles.progressText,
                { color: colors.textMuted },
              ]}
            >
              STEP 2 OF 3 · ONBOARDING
            </Text>
          </View>

          <View style={styles.heading}>
            <Text
              style={[
                styles.eyebrow,
                { color: colors.blue },
              ]}
            >
              RUNNER VERIFICATION
            </Text>

            <Text
              style={[
                styles.title,
                { color: colors.text },
              ]}
            >
              Complete your application
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: colors.textMuted },
              ]}
            >
              Tell us where you operate, how you will
              carry out errands and upload the documents
              required for your selected tasks.
            </Text>
          </View>

          <View
            style={[
              styles.identityCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.identityTop}>
              <View
                style={[
                  styles.identityAvatar,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={22}
                  color={colors.blue}
                />
              </View>

              <View style={styles.identityCopy}>
                <Text
                  style={[
                    styles.identityName,
                    { color: colors.text },
                  ]}
                >
                  {data.runner.fullName || "Runner applicant"}
                </Text>

                <Text
                  style={[
                    styles.identityEmail,
                    { color: colors.textMuted },
                  ]}
                >
                  {data.runner.email}
                </Text>
              </View>

              <View
                style={[
                  styles.pendingBadge,
                  { backgroundColor: colors.warningSoft },
                ]}
              >
                <Text
                  style={[
                    styles.pendingBadgeText,
                    { color: colors.warning },
                  ]}
                >
                  NOT APPROVED
                </Text>
              </View>
            </View>

            <View style={styles.categoryList}>
              <Text
                style={[
                  styles.categoryLabel,
                  { color: colors.textMuted },
                ]}
              >
                TASKS YOU SELECTED
              </Text>

              <View style={styles.categoryChips}>
                {categories.map((category) => (
                  <View
                    key={category}
                    style={[
                      styles.categoryChip,
                      { backgroundColor: colors.blueSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        { color: colors.blue },
                      ]}
                    >
                      {category}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {isChangesRequired ? (
            <View
              style={[
                styles.rejectionNotice,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color={colors.red}
              />

              <View style={styles.noticeCopy}>
                <Text
                  style={[
                    styles.noticeTitle,
                    { color: colors.red },
                  ]}
                >
                  Your application needs attention
                </Text>

                <Text
                  style={[
                    styles.noticeText,
                    { color: colors.text },
                  ]}
                >
                  Some verification documents were
                  rejected. Review the feedback below,
                  upload corrected documents and submit
                  your application again.
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <View
                style={[
                  styles.sectionNumber,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Text
                  style={[
                    styles.sectionNumberText,
                    { color: colors.blue },
                  ]}
                >
                  01
                </Text>
              </View>

              <View style={styles.sectionHeadingCopy}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.text },
                  ]}
                >
                  Your operating details
                </Text>

                <Text
                  style={[
                    styles.sectionSubtitle,
                    { color: colors.textMuted },
                  ]}
                >
                  These details determine your verification
                  requirements.
                </Text>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.label,
                  { color: colors.text },
                ]}
              >
                Main service area
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
                  size={19}
                  color={colors.textMuted}
                />

                <TextInput
                  value={serviceArea}
                  onChangeText={(value) => {
                    setServiceArea(value);
                    setError("");
                  }}
                  placeholder="e.g. Nairobi West"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  returnKeyType="next"
                  maxLength={120}
                  style={[
                    styles.input,
                    { color: colors.text },
                  ]}
                  accessibilityLabel="Main service area"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.label,
                  { color: colors.text },
                ]}
              >
                How will you perform your errands?
              </Text>

              <View style={styles.vehicleGrid}>
                {VEHICLE_TYPES.map((vehicle) => {
                  const selected =
                    vehicleType === vehicle.value;

                  return (
                    <Pressable
                      key={vehicle.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => {
                        setVehicleType(vehicle.value);
                        setTransportSaved(false);
                        setError("");
                      }}
                      style={[
                        styles.vehicleOption,
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
                      <Ionicons
                        name={vehicle.icon}
                        size={19}
                        color={
                          selected ? colors.blue : colors.textMuted
                        }
                      />

                      <Text
                        style={[
                          styles.vehicleOptionText,
                          {
                            color: selected
                              ? colors.blue
                              : colors.text,
                          },
                        ]}
                      >
                        {vehicle.label}
                      </Text>

                      {selected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={17}
                          color={colors.blue}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {["motorcycle", "car", "van"].includes(vehicleType) ? (
              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    styles.label,
                    { color: colors.text },
                  ]}
                >
                  Vehicle registration number
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
                    size={19}
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
                    placeholder="e.g. KXX 123A"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    returnKeyType="done"
                    maxLength={30}
                    style={[
                      styles.input,
                      { color: colors.text },
                    ]}
                    accessibilityLabel="Vehicle registration number"
                  />
                </View>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={savingProfile}
              onPress={() => void saveTransportDetails()}
              style={({ pressed }) => [
                styles.outlineButton,
                {
                  borderColor: colors.blue,
                  backgroundColor: colors.surface,
                },
                savingProfile && styles.disabled,
                pressed && !savingProfile && styles.pressed,
              ]}
            >
              {savingProfile ? (
                <ActivityIndicator color={colors.blue} />
              ) : (
                <>
                  <Ionicons
                    name="save-outline"
                    size={17}
                    color={colors.blue}
                  />

                  <Text
                    style={[
                      styles.outlineButtonText,
                      { color: colors.blue },
                    ]}
                  >
                    Save operating details
                  </Text>
                </>
              )}
            </Pressable>

            {transportSaved ? (
              <View style={styles.savedIndicator}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={colors.success}
                />

                <Text
                  style={[
                    styles.savedText,
                    { color: colors.success },
                  ]}
                >
                  Operating details saved
                </Text>
              </View>
            ) : null}
          </View>

          {transportSaved ? (
            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <View
                  style={[
                    styles.sectionNumber,
                    { backgroundColor: colors.blueSoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.sectionNumberText,
                      { color: colors.blue },
                    ]}
                  >
                    02
                  </Text>
                </View>

                <View style={styles.sectionHeadingCopy}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text },
                    ]}
                  >
                    Verification documents
                  </Text>

                  <Text
                    style={[
                      styles.sectionSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    Requirements are based on your selected
                    task categories and transport type.
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.documentProgressCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.documentProgressTop}>
                  <Text
                    style={[
                      styles.documentProgressTitle,
                      { color: colors.text },
                    ]}
                  >
                    Required documents
                  </Text>

                  <Text
                    style={[
                      styles.documentProgressCount,
                      { color: colors.blue },
                    ]}
                  >
                    {completedRequiredCount}/{requiredCount}
                  </Text>
                </View>

                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.blue,
                        width:
                          requiredCount > 0
                            ? `${(completedRequiredCount / requiredCount) * 100}%`
                            : "0%",
                      },
                    ]}
                  />
                </View>

                <Text
                  style={[
                    styles.progressHint,
                    { color: colors.textMuted },
                  ]}
                >
                  A document marked as under review has
                  been received, but still needs Operations
                  approval.
                </Text>
              </View>

              {data.requirements.length === 0 ? (
                <View
                  style={[
                    styles.emptyRequirements,
                    { backgroundColor: colors.surface },
                  ]}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={27}
                    color={colors.textMuted}
                  />

                  <Text
                    style={[
                      styles.emptyTitle,
                      { color: colors.text },
                    ]}
                  >
                    No requirements are available
                  </Text>

                  <Text
                    style={[
                      styles.emptyDescription,
                      { color: colors.textMuted },
                    ]}
                  >
                    Please refresh your application or
                    contact SaMi support.
                  </Text>
                </View>
              ) : (
                data.requirements.map((requirement) => {
                  const document = latestDocument(
                    data.documents,
                    requirement.key,
                  );

                  const isUploading =
                    uploadingRequirement === requirement.key;

                  const documentApproved =
                    document?.reviewStatus === "approved";

                  const documentPending =
                    document?.reviewStatus === "pending";

                  const documentRejected =
                    document?.reviewStatus === "rejected";

                  const isSatisfied =
                    isDocumentSatisfied(document);

                  return (
                    <View
                      key={requirement.key}
                      style={[
                        styles.documentCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={styles.documentHeader}>
                        <View
                          style={[
                            styles.documentIcon,
                            {
                              backgroundColor: colors.blueSoft,
                            },
                          ]}
                        >
                          <Ionicons
                            name="document-text-outline"
                            size={21}
                            color={colors.blue}
                          />
                        </View>

                        <View style={styles.documentCopy}>
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
                              styles.documentInstructions,
                              { color: colors.textMuted },
                            ]}
                          >
                            {requirement.instructions ||
                              "Upload a clear and readable image of this document."}
                          </Text>

                          {requirement.categoryKey ? (
                            <Text
                              style={[
                                styles.documentCategory,
                                { color: colors.blue },
                              ]}
                            >
                              {CATEGORY_LABELS[
                                requirement.categoryKey
                              ] ||
                                requirement.categoryKey.replaceAll(
                                  "_",
                                  " ",
                                )}
                            </Text>
                          ) : null}
                        </View>

                        <View
                          style={[
                            styles.requirementBadge,
                            {
                              backgroundColor: requirement.required
                                ? colors.warningSoft
                                : colors.blueSoft,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.requirementBadgeText,
                              {
                                color: requirement.required
                                  ? colors.warning
                                  : colors.blue,
                              },
                            ]}
                          >
                            {requirement.required
                              ? "REQUIRED"
                              : "OPTIONAL"}
                          </Text>
                        </View>
                      </View>

                      {document ? (
                        <View
                          style={[
                            styles.documentStatus,
                            {
                              backgroundColor: documentApproved
                                ? colors.successSoft
                                : documentRejected
                                  ? colors.dangerSoft
                                  : colors.warningSoft,
                            },
                          ]}
                        >
                          <Ionicons
                            name={
                              documentApproved
                                ? "checkmark-circle"
                                : documentRejected
                                  ? "close-circle"
                                  : "time-outline"
                            }
                            size={16}
                            color={
                              documentApproved
                                ? colors.success
                                : documentRejected
                                  ? colors.red
                                  : colors.warning
                            }
                          />

                          <Text
                            style={[
                              styles.documentStatusText,
                              {
                                color: documentApproved
                                  ? colors.success
                                  : documentRejected
                                    ? colors.red
                                    : colors.warning,
                              },
                            ]}
                          >
                            {documentApproved
                              ? "Approved"
                              : documentRejected
                                ? "Rejected — replacement required"
                                : "Uploaded — awaiting review"}
                          </Text>
                        </View>
                      ) : null}

                      {documentRejected &&
                      document?.rejectionReason ? (
                        <Text
                          style={[
                            styles.rejectionReason,
                            { color: colors.red },
                          ]}
                        >
                          Operations feedback:{" "}
                          {document.rejectionReason}
                        </Text>
                      ) : null}

                      {!documentApproved && !documentPending ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={Boolean(uploadingRequirement)}
                          onPress={() =>
                            chooseDocumentSource(requirement)
                          }
                          style={({ pressed }) => [
                            styles.uploadButton,
                            { backgroundColor: colors.blue },
                            Boolean(uploadingRequirement) &&
                              styles.disabled,
                            pressed &&
                              !uploadingRequirement &&
                              styles.pressed,
                          ]}
                        >
                          {isUploading ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <>
                              <Ionicons
                                name={
                                  documentRejected
                                    ? "refresh-outline"
                                    : "cloud-upload-outline"
                                }
                                size={18}
                                color="#FFFFFF"
                              />

                              <Text
                                style={styles.uploadButtonText}
                              >
                                {documentRejected
                                  ? "Upload replacement"
                                  : "Add document photo"}
                              </Text>
                            </>
                          )}
                        </Pressable>
                      ) : null}

                      {documentPending ? (
                        <Text
                          style={[
                            styles.pendingHint,
                            { color: colors.textMuted },
                          ]}
                        >
                          This document has been received.
                          Wait for Operations to review it.
                        </Text>
                      ) : null}

                      {isSatisfied ? (
                        <View style={styles.savedIndicator}>
                          <Ionicons
                            name="checkmark-circle"
                            size={15}
                            color={
                              documentApproved
                                ? colors.success
                                : colors.warning
                            }
                          />

                          <Text
                            style={[
                              styles.savedText,
                              {
                                color: documentApproved
                                  ? colors.success
                                  : colors.warning,
                              },
                            ]}
                          >
                            {documentApproved
                              ? "Requirement approved"
                              : "Requirement received"}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            <View
              style={[
                styles.nextStepNotice,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={colors.blue}
              />

              <Text
                style={[
                  styles.nextStepNoticeText,
                  { color: colors.text },
                ]}
              >
                Save your operating details first. SaMi
                will then load the documents required
                for your chosen vehicle and task categories.
              </Text>
            </View>
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

          {missingRequirements.length > 0 ? (
            <View
              style={[
                styles.missingCard,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Text
                style={[
                  styles.noticeTitle,
                  { color: colors.red },
                ]}
              >
                Documents still required
              </Text>

              {missingRequirements.map((item) => (
                <Text
                  key={item}
                  style={[
                    styles.missingItem,
                    { color: colors.text },
                  ]}
                >
                  • {item}
                </Text>
              ))}
            </View>
          ) : null}

          {transportSaved && data.requirements.length > 0 ? (
            <View style={styles.submitSection}>
              <View
                style={[
                  styles.submitNotice,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={21}
                  color={colors.blue}
                />

                <Text
                  style={[
                    styles.submitNoticeText,
                    { color: colors.text },
                  ]}
                >
                  Submitting your application sends your
                  documents to SaMi Operations. Approval
                  is required before you can receive errands.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={
                  submitting ||
                  Boolean(uploadingRequirement) ||
                  !allRequiredDocumentsComplete
                }
                onPress={() => void submitApplication()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.blue },
                  (!allRequiredDocumentsComplete ||
                    submitting ||
                    Boolean(uploadingRequirement)) &&
                    styles.disabled,
                  pressed &&
                    allRequiredDocumentsComplete &&
                    !submitting &&
                    styles.pressed,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>
                      Submit application for review
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </Pressable>

              <Text
                style={[
                  styles.submitHint,
                  { color: colors.textMuted },
                ]}
              >
                {allRequiredDocumentsComplete
                  ? "All required documents have been received."
                  : `${requiredCount - completedRequiredCount} required document(s) still need attention.`}
              </Text>
            </View>
          ) : null}

          <Text
            style={[
              styles.footerNote,
              { color: colors.textMuted },
            ]}
          >
            Your account remains pending until SaMi
            Operations completes its review and approves
            your application.
          </Text>
        </ScrollView>
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

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 13,
  },

  loadingText: {
    fontSize: 12,
  },

  loadErrorScreen: {
    flex: 1,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 15,
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 21,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 23,
  },

  statusContent: {
    flexGrow: 1,
    padding: 23,
    paddingTop: 35,
    paddingBottom: 45,
    gap: 21,
    alignItems: "stretch",
  },

  header: {
    minHeight: 45,
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

  headerSpacer: {
    width: 42,
  },

  brand: {
    alignItems: "center",
    gap: 3,
  },

  brandName: {
    fontSize: 20,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },

  brandTagline: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 2.2,
  },

  progressHeader: {
    gap: 9,
  },

  progressTrack: {
    height: 5,
    borderRadius: 5,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 5,
  },

  progressText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  heading: {
    gap: 9,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  title: {
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.6,
  },

  subtitle: {
    fontSize: 12,
    lineHeight: 20,
  },

  identityCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 14,
  },

  identityTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  identityAvatar: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  identityCopy: {
    flex: 1,
    gap: 4,
  },

  identityName: {
    fontSize: 13,
    fontWeight: "900",
  },

  identityEmail: {
    fontSize: 10,
  },

  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },

  pendingBadgeText: {
    fontSize: 7,
    fontWeight: "900",
  },

  categoryList: {
    gap: 8,
  },

  categoryLabel: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  categoryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },

  categoryChip: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  categoryChipText: {
    fontSize: 9,
    fontWeight: "800",
  },

  section: {
    gap: 15,
  },

  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  sectionNumber: {
    height: 38,
    width: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionNumberText: {
    fontSize: 11,
    fontWeight: "900",
  },

  sectionHeadingCopy: {
    flex: 1,
    gap: 4,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
  },

  sectionSubtitle: {
    fontSize: 10,
    lineHeight: 16,
  },

  fieldGroup: {
    gap: 8,
  },

  label: {
    fontSize: 11,
    fontWeight: "800",
  },

  inputContainer: {
    minHeight: 53,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  input: {
    flex: 1,
    minHeight: 51,
    paddingVertical: 9,
    fontSize: 13,
  },

  vehicleGrid: {
    gap: 8,
  },

  vehicleOption: {
    minHeight: 47,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  vehicleOptionText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
  },

  outlineButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  outlineButtonText: {
    fontSize: 11,
    fontWeight: "900",
  },

  savedIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  savedText: {
    fontSize: 10,
    fontWeight: "800",
  },

  documentProgressCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    gap: 10,
  },

  documentProgressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  documentProgressTitle: {
    fontSize: 11,
    fontWeight: "900",
  },

  documentProgressCount: {
    fontSize: 12,
    fontWeight: "900",
  },

  progressHint: {
    fontSize: 9,
    lineHeight: 15,
  },

  documentCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    gap: 12,
  },

  documentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  documentIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  documentCopy: {
    flex: 1,
    gap: 5,
  },

  documentTitle: {
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 16,
  },

  documentInstructions: {
    fontSize: 9,
    lineHeight: 15,
  },

  documentCategory: {
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  requirementBadge: {
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },

  requirementBadgeText: {
    fontSize: 7,
    fontWeight: "900",
  },

  documentStatus: {
    borderRadius: 9,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  documentStatusText: {
    flex: 1,
    fontSize: 9,
    fontWeight: "800",
  },

  rejectionReason: {
    fontSize: 10,
    lineHeight: 16,
  },

  uploadButton: {
    minHeight: 43,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  uploadButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  pendingHint: {
    fontSize: 9,
    lineHeight: 15,
  },

  emptyRequirements: {
    minHeight: 125,
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  emptyTitle: {
    fontSize: 12,
    fontWeight: "900",
  },

  emptyDescription: {
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
  },

  nextStepNotice: {
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  nextStepNoticeText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 17,
  },

  rejectionNotice: {
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  noticeCopy: {
    flex: 1,
    gap: 5,
  },

  noticeTitle: {
    fontSize: 11,
    fontWeight: "900",
  },

  noticeText: {
    fontSize: 10,
    lineHeight: 16,
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
    fontSize: 10,
    lineHeight: 17,
  },

  missingCard: {
    borderRadius: 13,
    padding: 13,
    gap: 8,
  },

  missingItem: {
    fontSize: 10,
    lineHeight: 16,
  },

  submitSection: {
    gap: 13,
  },

  submitNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 13,
    borderRadius: 13,
    gap: 9,
  },

  submitNoticeText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 17,
  },

  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 14,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  submitHint: {
    fontSize: 9,
    textAlign: "center",
  },

  footerNote: {
    fontSize: 9,
    lineHeight: 15,
    textAlign: "center",
    paddingHorizontal: 8,
  },

  statusIcon: {
    alignSelf: "center",
    height: 83,
    width: 83,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },

  statusCard: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 15,
    gap: 15,
  },

  cardTitle: {
    fontSize: 13,
    fontWeight: "900",
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  statusLabel: {
    fontSize: 10,
  },

  statusValue: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "right",
  },

  statusNotice: {
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  statusNoticeText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 17,
  },

  secondaryButton: {
    minHeight: 45,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    fontSize: 11,
    fontWeight: "900",
  },

  disabled: {
    opacity: 0.45,
  },

  pressed: {
    opacity: 0.82,
  },
});
