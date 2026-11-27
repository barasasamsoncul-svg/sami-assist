import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
} from "@/theme";
import type { RunnerDocumentFile, RunnerVehicleType } from "@/api";
import {
  getRunnerVehicles,
  submitRunnerVehicleChange,
  type RunnerVehicleRequirement,
} from "@/vehicle-api";

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const SUPPORTED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

type SelectedVehicleFile = RunnerDocumentFile & {
  size?: number | null;
};

type FileMap = Record<string, SelectedVehicleFile | undefined>;
type ExpiryMap = Record<string, string | undefined>;

function firstParam(value?: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeVehicleType(value: string): RunnerVehicleType | null {
  switch (value.trim().toLowerCase()) {
    case "bike":
    case "bicycle":
      return "bike";
    case "motorbike":
    case "motorcycle":
      return "motorbike";
    case "vehicle":
    case "car":
      return "vehicle";
    default:
      return null;
  }
}

function formatExpiryInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function todayInNairobi(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function expiryInputToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return iso >= todayInNairobi() ? iso : null;
}

function vehicleTypeLabel(value: RunnerVehicleType): string {
  switch (value) {
    case "bike": return "Bike";
    case "motorbike": return "Motorbike";
    case "vehicle": return "Vehicle";
  }
}

export default function RunnerVehicleDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, showOverlay } = useRunnerTheme();
  const params = useLocalSearchParams<{
    vehicleType?: string | string[];
    vehicleModel?: string | string[];
    vehicleRegistration?: string | string[];
  }>();

  const vehicleType = normalizeVehicleType(firstParam(params.vehicleType));
  const vehicleModel = firstParam(params.vehicleModel).trim();
  const vehicleRegistration = firstParam(params.vehicleRegistration).trim().toUpperCase();

  const [requirements, setRequirements] = useState<RunnerVehicleRequirement[]>([]);
  const [files, setFiles] = useState<FileMap>({});
  const [expiryDates, setExpiryDates] = useState<ExpiryMap>({});
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const pickerLockRef = useRef(false);

  const loadRequirements = useCallback(async () => {
    if (!vehicleType) {
      setPageError("The selected vehicle type is missing. Return to Add Vehicle and choose it again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setPageError("");

    try {
      const data = await getRunnerVehicles();
      if (!data.replacementEligibility.canSubmit) {
        throw new Error(
          data.replacementEligibility.blockReason ||
          "A vehicle replacement cannot be submitted right now.",
        );
      }

      const matchingRequirements = data.replacementRequirements
        .filter((item) => item.vehicleType === vehicleType)
        .sort((a, b) => a.displayOrder - b.displayOrder);

      if (
        vehicleType !== "bike" &&
        !matchingRequirements.some((item) => item.required)
      ) {
        throw new Error(
          "The mandatory documents for this vehicle type are not configured. Please contact SaMi Support before submitting a replacement.",
        );
      }

      setRequirements(matchingRequirements);
    } catch (cause) {
      setRequirements([]);
      setPageError(
        cause instanceof Error
          ? cause.message
          : "Vehicle document requirements could not be loaded. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [vehicleType]);

  useFocusEffect(
    useCallback(() => {
      void loadRequirements();
    }, [loadRequirements]),
  );

  const selectedCount = useMemo(
    () => requirements.filter((item) => Boolean(files[item.key])).length,
    [files, requirements],
  );

  const requiredCount = useMemo(
    () => requirements.filter((item) => item.required).length,
    [requirements],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(app)/settings/vehicles" as never);
  }, []);

  const chooseDocument = useCallback(async (requirement: RunnerVehicleRequirement) => {
    if (pickerLockRef.current || submitting) return;
    pickerLockRef.current = true;
    setPickingKey(requirement.key);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_DOCUMENT_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (!asset) return;
      if (typeof asset.size === "number" && asset.size > MAX_DOCUMENT_SIZE) {
        showOverlay({
          type: "warning",
          title: "File is too large",
          message: "Each vehicle document must be 10 MB or smaller. Choose a smaller file.",
        });
        return;
      }

      setFiles((current) => ({
        ...current,
        [requirement.key]: {
          uri: asset.uri,
          name: asset.name?.trim() || `${requirement.key}-document`,
          mimeType: asset.mimeType,
          size: asset.size,
        },
      }));
    } catch (cause) {
      showOverlay({
        type: "error",
        title: "Document could not be selected",
        message: cause instanceof Error
          ? cause.message
          : "Choose the document again and retry.",
      });
    } finally {
      pickerLockRef.current = false;
      setPickingKey(null);
    }
  }, [showOverlay, submitting]);

  const removeDocument = useCallback((key: string) => {
    setFiles((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setExpiryDates((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!vehicleType || submitLockRef.current || submitting) return;

    const missingFiles = requirements.filter(
      (item) => item.required && !files[item.key],
    );
    if (missingFiles.length > 0) {
      showOverlay({
        type: "warning",
        title: "Required documents missing",
        message: `Upload all required documents before submitting. Still missing: ${missingFiles.map((item) => item.title).join(", ")}.`,
      });
      return;
    }

    const selectedRequirements = requirements.filter((item) => files[item.key]);
    const invalidExpiry = selectedRequirements.find((item) => {
      if (!item.requiresExpiry) return false;
      return !expiryInputToIso(expiryDates[item.key] ?? "");
    });

    if (invalidExpiry) {
      showOverlay({
        type: "warning",
        title: "Document expiry required",
        message: `Enter a valid expiry date for ${invalidExpiry.title}. Use DD/MM/YYYY and make sure the date is today or later.`,
      });
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);

    try {
      await submitRunnerVehicleChange({
        vehicleType,
        vehicleModel: vehicleType === "bike" ? null : vehicleModel,
        vehicleRegistration: vehicleType === "bike" ? null : vehicleRegistration,
        documents: selectedRequirements.map((item) => ({
          requirementKey: item.key,
          file: {
            uri: files[item.key]!.uri,
            name: files[item.key]!.name,
            mimeType: files[item.key]!.mimeType,
          },
          validUntil: item.requiresExpiry
            ? expiryInputToIso(expiryDates[item.key] ?? "")
            : null,
        })),
      });

      router.replace("/(app)/settings/vehicles" as never);
      showOverlay({
        type: "success",
        title: "Vehicle submitted for review",
        message: "SaMi Operations will review the vehicle details and documents. Your current approved vehicle remains active until the replacement is approved.",
        primaryAction: { label: "Done" },
      });
    } catch (cause) {
      showOverlay({
        type: "error",
        title: "Vehicle submission failed",
        message: cause instanceof Error
          ? cause.message
          : "Your vehicle replacement could not be submitted. Check your connection and try again.",
        primaryAction: { label: "Close" },
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [
    vehicleType,
    vehicleModel,
    vehicleRegistration,
    requirements,
    files,
    expiryDates,
    submitting,
    showOverlay,
  ]);

  const vehicleLabel = vehicleType ? vehicleTypeLabel(vehicleType) : "Vehicle";

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
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
              paddingBottom: insets.bottom + runnerSpacing.xxxl,
            },
          ]}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={goBack}
              style={({ pressed }) => [
                styles.backButton,
                { opacity: pressed ? 0.76 : 1 },
              ]}
            >
              <Ionicons name="arrow-back" size={21} color="#FFFFFF" />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>Vehicle documents</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Upload the documents for your {vehicleLabel.toLowerCase()} replacement.
              </Text>
            </View>
          </View>

          <View style={[styles.notice, { backgroundColor: colors.infoSoft, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={20} color={colors.info} />
            <Text style={[styles.noticeText, { color: colors.text }]}>
              Your current approved vehicle stays active while SaMi Operations reviews this submission. Upload clear PDF or image copies. Maximum file size is 10 MB each.
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.blue} />
              <Text style={[styles.helperText, { color: colors.textMuted }]}>Loading your vehicle document checklist…</Text>
            </View>
          ) : pageError ? (
            <View style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="alert-circle-outline" size={27} color={colors.red} />
              <Text style={[styles.errorText, { color: colors.text }]}>{pageError}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadRequirements()}
                style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.brand, opacity: pressed ? 0.82 : 1 }]}
              >
                <Text style={[styles.retryButtonText, { color: colors.onBrand }]}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.checklistHeading}>
                <View style={styles.headingCopy}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Document checklist</Text>
                  <Text style={[styles.helperText, { color: colors.textMuted }]}>
                    {requiredCount} required · {selectedCount} selected
                  </Text>
                </View>
                <View style={[styles.countPill, { backgroundColor: colors.blueSoft }]}>
                  <Text style={[styles.countText, { color: colors.blue }]}>{selectedCount}/{requirements.length}</Text>
                </View>
              </View>

              {requirements.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="checkmark-circle-outline" size={25} color={colors.success} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No vehicle-specific documents required</Text>
                  <Text style={[styles.helperText, { color: colors.textMuted }]}>You can submit this bicycle replacement without an additional vehicle document.</Text>
                </View>
              ) : requirements.map((requirement) => {
                const file = files[requirement.key];
                const isPicking = pickingKey === requirement.key;
                return (
                  <View
                    key={requirement.key}
                    style={[styles.documentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={styles.documentTop}>
                      <View style={[styles.documentIcon, { backgroundColor: colors.blueSoft }]}>
                        <Ionicons name="document-text-outline" size={21} color={colors.blue} />
                      </View>
                      <View style={styles.documentCopy}>
                        <Text style={[styles.documentTitle, { color: colors.text }]}>{requirement.title}</Text>
                        <View style={styles.metadataRow}>
                          <Text style={[styles.requirementTag, { color: requirement.required ? colors.warning : colors.textMuted }]}>
                            {requirement.required ? "REQUIRED" : "OPTIONAL"}
                          </Text>
                          {requirement.requiresExpiry ? (
                            <Text style={[styles.expiryTag, { color: colors.textMuted }]}>EXPIRY DATE REQUIRED</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>

                    {requirement.instructions ? (
                      <Text style={[styles.instructions, { color: colors.textMuted }]}>{requirement.instructions}</Text>
                    ) : null}

                    {file ? (
                      <View style={[styles.selectedFile, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}>
                        <Ionicons name="checkmark-circle" size={19} color={colors.success} />
                        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={2}>{file.name}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${requirement.title}`}
                          disabled={submitting}
                          onPress={() => removeDocument(requirement.key)}
                          hitSlop={8}
                        >
                          <Ionicons name="close-circle-outline" size={21} color={colors.iconMuted} />
                        </Pressable>
                      </View>
                    ) : null}

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${file ? "Change" : "Choose"} ${requirement.title} file`}
                      disabled={submitting || isPicking}
                      onPress={() => void chooseDocument(requirement)}
                      style={({ pressed }) => [
                        styles.chooseButton,
                        {
                          borderColor: colors.borderStrong,
                          backgroundColor: colors.surface,
                          opacity: pressed || isPicking ? 0.68 : 1,
                        },
                      ]}
                    >
                      {isPicking ? (
                        <ActivityIndicator size="small" color={colors.blue} />
                      ) : (
                        <Ionicons name="cloud-upload-outline" size={18} color={colors.blue} />
                      )}
                      <Text style={[styles.chooseButtonText, { color: colors.blue }]}>
                        {isPicking ? "Opening files…" : file ? "Change document" : "Choose document"}
                      </Text>
                    </Pressable>

                    {requirement.requiresExpiry ? (
                      <View style={styles.expiryGroup}>
                        <Text style={[styles.expiryLabel, { color: colors.textMuted }]}>Expiry date (DD/MM/YYYY)</Text>
                        <TextInput
                          value={expiryDates[requirement.key] ?? ""}
                          onChangeText={(value) => setExpiryDates((current) => ({
                            ...current,
                            [requirement.key]: formatExpiryInput(value),
                          }))}
                          placeholder="DD/MM/YYYY"
                          placeholderTextColor={colors.textDisabled}
                          keyboardType="number-pad"
                          maxLength={10}
                          editable={!submitting}
                          style={[styles.expiryInput, {
                            backgroundColor: colors.surfaceSunken,
                            borderColor: colors.border,
                            color: colors.text,
                          }]}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting }}
                disabled={submitting}
                onPress={() => void handleSubmit()}
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: colors.brand, opacity: pressed || submitting ? 0.82 : 1 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <>
                    <Text style={[styles.submitButtonText, { color: colors.onBrand }]}>Submit vehicle for review</Text>
                    <Ionicons name="arrow-forward" size={20} color={colors.onBrand} />
                  </>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  keyboardContainer: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: runnerSpacing.lg,
    gap: runnerSpacing.lg,
  },
  header: { flexDirection: "row", alignItems: "center", gap: runnerSpacing.md },
  backButton: {
    width: runnerTouchTargets.minimum,
    height: runnerTouchTargets.minimum,
    borderRadius: runnerRadii.md,
    backgroundColor: "#00061D",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, gap: runnerSpacing.xxs },
  title: { fontSize: runnerTypography.title, fontWeight: runnerTypography.fontWeight.bold },
  subtitle: { fontSize: runnerTypography.bodySmall, lineHeight: 21 },
  notice: {
    borderWidth: 1,
    borderRadius: runnerRadii.lg,
    padding: runnerSpacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: runnerSpacing.sm,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  loadingState: { flex: 1, minHeight: 220, alignItems: "center", justifyContent: "center", gap: runnerSpacing.md },
  helperText: { fontSize: 12, lineHeight: 18 },
  errorCard: { borderWidth: 1, borderRadius: runnerRadii.lg, padding: runnerSpacing.lg, alignItems: "center", gap: runnerSpacing.md },
  errorText: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  retryButton: { minHeight: runnerTouchTargets.minimum, borderRadius: runnerRadii.md, paddingHorizontal: runnerSpacing.lg, alignItems: "center", justifyContent: "center" },
  retryButtonText: { fontSize: 13, fontWeight: "800" },
  checklistHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: runnerSpacing.xs },
  headingCopy: { gap: 3 },
  sectionTitle: { fontSize: runnerTypography.subtitle, fontWeight: runnerTypography.fontWeight.bold },
  countPill: { minWidth: 52, borderRadius: runnerRadii.pill, paddingHorizontal: 11, paddingVertical: 7, alignItems: "center" },
  countText: { fontSize: 12, fontWeight: "900" },
  emptyCard: { borderWidth: 1, borderRadius: runnerRadii.lg, padding: runnerSpacing.lg, alignItems: "center", gap: runnerSpacing.sm },
  emptyTitle: { fontSize: 14, fontWeight: "800", textAlign: "center" },
  documentCard: { borderWidth: 1, borderRadius: runnerRadii.lg, padding: runnerSpacing.md, gap: runnerSpacing.sm },
  documentTop: { flexDirection: "row", alignItems: "center", gap: runnerSpacing.sm },
  documentIcon: { width: 42, height: 42, borderRadius: runnerRadii.md, alignItems: "center", justifyContent: "center" },
  documentCopy: { flex: 1, gap: 4 },
  documentTitle: { fontSize: 14, fontWeight: "800", lineHeight: 19 },
  metadataRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  requirementTag: { fontSize: 9.5, fontWeight: "900", letterSpacing: 0.7 },
  expiryTag: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  instructions: { fontSize: 11.5, lineHeight: 17 },
  selectedFile: { borderWidth: 1, borderRadius: runnerRadii.md, padding: runnerSpacing.sm, flexDirection: "row", alignItems: "center", gap: runnerSpacing.xs },
  fileName: { flex: 1, fontSize: 11.5, lineHeight: 16, fontWeight: "600" },
  chooseButton: { minHeight: 44, borderWidth: 1, borderStyle: "dashed", borderRadius: runnerRadii.md, paddingHorizontal: runnerSpacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: runnerSpacing.xs },
  chooseButtonText: { fontSize: 12, fontWeight: "800" },
  expiryGroup: { gap: runnerSpacing.xs },
  expiryLabel: { fontSize: 11.5, fontWeight: "700" },
  expiryInput: { minHeight: 48, borderWidth: 1, borderRadius: runnerRadii.md, paddingHorizontal: runnerSpacing.md, fontSize: 15, letterSpacing: 1, fontWeight: "700" },
  submitButton: { minHeight: runnerTouchTargets.primary, borderRadius: runnerRadii.lg, paddingHorizontal: runnerSpacing.lg, marginTop: runnerSpacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: runnerSpacing.sm },
  submitButtonText: { fontSize: 14, fontWeight: "900" },
});
