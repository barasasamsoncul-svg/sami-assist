
import { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getRunnerOnboarding,
  type RunnerDocumentRequirement,
  type RunnerOnboardingData,
  type RunnerUploadedDocument,
} from "@/api";

import { useRunnerTheme } from "@/theme";

type DocumentCard = {
  key: string;
  title: string;
  description: string;
  requirements: RunnerDocumentRequirement[];
  required: boolean;
};

type DocumentProgress = {
  status:
    | "not_uploaded"
    | "partial"
    | "submitted"
    | "approved"
    | "changes_requested"
    | "optional";
  label: string;
  completed: number;
  total: number;
};

function latestDocument(
  documents: RunnerUploadedDocument[],
  requirementKey: string,
): RunnerUploadedDocument | undefined {
  return documents.find(
    (document) =>
      document.requirementKey === requirementKey,
  );
}

function isSatisfied(
  document: RunnerUploadedDocument | undefined,
): boolean {
  return (
    document?.reviewStatus === "pending" ||
    document?.reviewStatus === "approved"
  );
}

function buildDocumentCards(
  requirements: RunnerDocumentRequirement[],
): DocumentCard[] {
  const nationalIdKeys = new Set([
    "identity_national_id_front",
    "identity_national_id_back",
  ]);

  const nationalIdRequirements = requirements.filter(
    (item) => nationalIdKeys.has(item.key),
  );

  const otherRequirements = requirements.filter(
    (item) => !nationalIdKeys.has(item.key),
  );

  const cards: DocumentCard[] = [];

  if (nationalIdRequirements.length > 0) {
    const front = nationalIdRequirements.find(
      (item) => item.key === "identity_national_id_front",
    );

    const back = nationalIdRequirements.find(
      (item) => item.key === "identity_national_id_back",
    );

    cards.push({
      key: "national_identity",
      title: "National ID",
      description:
        "Upload clear images of both the front and back sides of your National ID on one screen.",
      requirements: nationalIdRequirements,
      required: nationalIdRequirements.some(
        (item) => item.required,
      ),
    });

    // Keep the expected two-sided identity flow visible
    // even if one side was accidentally omitted in the
    // configurable requirements catalogue. The document
    // detail page will report the missing requirement.
    void front;
    void back;
  }

  for (const requirement of otherRequirements) {
    cards.push({
      key: requirement.key,
      title: requirement.title,
      description:
        requirement.instructions ||
        "Upload the requested supporting document.",
      requirements: [requirement],
      required: requirement.required,
    });
  }

  return cards;
}

function getDocumentProgress(
  card: DocumentCard,
  documents: RunnerUploadedDocument[],
): DocumentProgress {
  const entries = card.requirements.map((requirement) =>
    latestDocument(documents, requirement.key),
  );

  const completed = entries.filter(isSatisfied).length;
  const rejected = entries.some(
    (document) =>
      document?.reviewStatus === "rejected",
  );

  const allApproved =
    entries.length > 0 &&
    entries.every(
      (document) =>
        document?.reviewStatus === "approved",
    );

  if (rejected) {
    return {
      status: "changes_requested",
      label: "Changes requested",
      completed,
      total: entries.length,
    };
  }

  if (
    entries.length > 0 &&
    completed === entries.length
  ) {
    return {
      status: allApproved ? "approved" : "submitted",
      label: allApproved ? "Approved" : "Submitted",
      completed,
      total: entries.length,
    };
  }

  if (completed > 0) {
    return {
      status: "partial",
      label: `${completed} of ${entries.length} uploaded`,
      completed,
      total: entries.length,
    };
  }

  if (!card.required) {
    return {
      status: "optional",
      label: "Optional",
      completed: 0,
      total: entries.length,
    };
  }

  return {
    status: "not_uploaded",
    label: "Required",
    completed: 0,
    total: entries.length,
  };
}

function documentIcon(
  requirement: RunnerDocumentRequirement,
): keyof typeof Ionicons.glyphMap {
  const key = requirement.key;
  const type = requirement.documentType;

  if (key.startsWith("identity_national_id")) {
    return "card-outline";
  }

  if (type === "profile_photo") {
    return "person-circle-outline";
  }

  if (type === "driving_licence") {
    return "id-card-outline";
  }

  if (type === "vehicle_registration") {
    return "car-outline";
  }

  if (type === "motor_vehicle_insurance") {
    return "shield-checkmark-outline";
  }

  if (type === "vehicle_authorisation") {
    return "document-lock-outline";
  }

  if (type === "food_handling_certificate") {
    return "restaurant-outline";
  }

  if (type === "pet_care_qualification") {
    return "paw-outline";
  }

  if (type === "professional_qualification") {
    return "ribbon-outline";
  }

  return "document-text-outline";
}

function statusColors(
  status: DocumentProgress["status"],
  colors: ReturnType<typeof useRunnerTheme>["colors"],
) {
  switch (status) {
    case "approved":
      return {
        background: colors.successSoft,
        foreground: colors.success,
      };

    case "submitted":
      return {
        background: colors.blueSoft,
        foreground: colors.blue,
      };

    case "changes_requested":
      return {
        background: colors.dangerSoft,
        foreground: colors.red,
      };

    case "optional":
      return {
        background: colors.warningSoft,
        foreground: colors.warning,
      };

    case "partial":
      return {
        background: colors.warningSoft,
        foreground: colors.warning,
      };

    default:
      return {
        background: colors.surface,
        foreground: colors.textMuted,
      };
  }
}

export default function RunnerDocumentsScreen() {
  const { colors } = useRunnerTheme();

  const [data, setData] =
    useState<RunnerOnboardingData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const cards = useMemo(
    () =>
      data
        ? buildDocumentCards(data.requirements)
        : [],
    [data],
  );

  const progress = useMemo(() => {
    if (!data) {
      return {
        required: 0,
        completed: 0,
        percentage: 0,
      };
    }

    const required = data.requirements.filter(
      (item) => item.required,
    );

    const completed = required.filter((item) =>
      isSatisfied(
        latestDocument(data.documents, item.key),
      ),
    ).length;

    return {
      required: required.length,
      completed,
      percentage:
        required.length > 0
          ? Math.round(
              (completed / required.length) * 100,
            )
          : 0,
    };
  }, [data]);

  const allRequiredDocumentsComplete =
    progress.required > 0 &&
    progress.completed === progress.required;

  async function loadDocuments() {
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

      if (
        !result.runner.selectedCategories ||
        result.runner.selectedCategories.length === 0
      ) {
        router.replace("/(auth)/tasks");
        return;
      }

      if (
        !result.runner.serviceArea ||
        !result.runner.vehicleType
      ) {
        router.replace("/(auth)/transport");
        return;
      }

      setData(result);
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Your document requirements could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  function openDocument(card: DocumentCard) {
    router.push({
      pathname: "/(auth)/document/[key]",
      params: {
        key: card.key,
      },
    });
  }

  function continueToReview() {
    if (!allRequiredDocumentsComplete) {
      setError(
        "Upload every required document before reviewing your application.",
      );
      return;
    }

    router.push("/(auth)/review");
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

      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to transport details"
              onPress={() =>
                router.replace("/(auth)/transport")
              }
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
                  {
                    width: "100%",
                    backgroundColor: colors.blue,
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
              STEP 3 OF 3 · DOCUMENTS
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
                name="documents-outline"
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
              RUNNER VERIFICATION
            </Text>

            <Text
              style={[
                styles.title,
                { color: colors.text },
              ]}
            >
              Your documents
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: colors.textMuted },
              ]}
            >
              Open each document below to upload the
              requested evidence. Requirements are based
              on your selected tasks and transport type.
            </Text>
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
                Loading your document checklist...
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
                size={21}
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
                onPress={() => void loadDocuments()}
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
          ) : data ? (
            <>
              <View
                style={[
                  styles.summaryCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.summaryHeader}>
                  <View style={styles.summaryCopy}>
                    <Text
                      style={[
                        styles.summaryTitle,
                        { color: colors.text },
                      ]}
                    >
                      Required document progress
                    </Text>

                    <Text
                      style={[
                        styles.summarySubtitle,
                        { color: colors.textMuted },
                      ]}
                    >
                      {progress.completed} of{" "}
                      {progress.required} requirements submitted
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.percentage,
                      { color: colors.blue },
                    ]}
                  >
                    {progress.percentage}%
                  </Text>
                </View>

                <View
                  style={[
                    styles.summaryTrack,
                    { backgroundColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.summaryFill,
                      {
                        width: `${progress.percentage}%`,
                        backgroundColor: colors.blue,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.listHeading}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.text },
                  ]}
                >
                  Verification checklist
                </Text>

                <Text
                  style={[
                    styles.sectionSubtitle,
                    { color: colors.textMuted },
                  ]}
                >
                  Tap a document to open its upload page.
                </Text>
              </View>

              {cards.length === 0 ? (
                <View
                  style={[
                    styles.emptyState,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={30}
                    color={colors.textMuted}
                  />

                  <Text
                    style={[
                      styles.emptyTitle,
                      { color: colors.text },
                    ]}
                  >
                    No documents are configured
                  </Text>

                  <Text
                    style={[
                      styles.emptyText,
                      { color: colors.textMuted },
                    ]}
                  >
                    SaMi has not returned any document
                    requirements for this application.
                    Contact support before continuing.
                  </Text>
                </View>
              ) : (
                <View style={styles.documentList}>
                  {cards.map((card) => {
                    const documentProgress =
                      getDocumentProgress(
                        card,
                        data.documents,
                      );

                    const firstRequirement =
                      card.requirements[0];

                    const icon = documentIcon(
                      firstRequirement,
                    );

                    const badge = statusColors(
                      documentProgress.status,
                      colors,
                    );

                    const nationalId =
                      card.key === "national_identity";

                    const hasRejectedDocument =
                      documentProgress.status ===
                      "changes_requested";

                    return (
                      <Pressable
                        key={card.key}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${card.title}`}
                        onPress={() => openDocument(card)}
                        style={({ pressed }) => [
                          styles.documentCard,
                          {
                            backgroundColor: colors.surface,
                            borderColor: hasRejectedDocument
                              ? colors.red
                              : colors.border,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.documentIcon,
                            {
                              backgroundColor: colors.blueSoft,
                            },
                          ]}
                        >
                          <Ionicons
                            name={icon}
                            size={23}
                            color={colors.blue}
                          />
                        </View>

                        <View style={styles.documentCopy}>
                          <View style={styles.documentTitleRow}>
                            <Text
                              style={[
                                styles.documentTitle,
                                { color: colors.text },
                              ]}
                            >
                              {card.title}
                            </Text>

                            {card.required ? (
                              <Text
                                style={[
                                  styles.requiredMark,
                                  { color: colors.red },
                                ]}
                              >
                                Required
                              </Text>
                            ) : (
                              <Text
                                style={[
                                  styles.optionalMark,
                                  { color: colors.textMuted },
                                ]}
                              >
                                Optional
                              </Text>
                            )}
                          </View>

                          <Text
                            style={[
                              styles.documentDescription,
                              { color: colors.textMuted },
                            ]}
                            numberOfLines={3}
                          >
                            {card.description}
                          </Text>

                          {nationalId ? (
                            <Text
                              style={[
                                styles.sidesHint,
                                { color: colors.textMuted },
                              ]}
                            >
                              Front and back · one submission
                            </Text>
                          ) : null}

                          <View
                            style={[
                              styles.statusBadge,
                              {
                                backgroundColor: badge.background,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusText,
                                { color: badge.foreground },
                              ]}
                            >
                              {documentProgress.label}
                            </Text>
                          </View>
                        </View>

                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View
                style={[
                  styles.reviewNote,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={19}
                  color={colors.blue}
                />

                <Text
                  style={[
                    styles.reviewNoteText,
                    { color: colors.text },
                  ]}
                >
                  Uploaded documents are checked before
                  your Runner application is approved.
                  A successful upload does not mean the
                  document has already been verified.
                </Text>
              </View>
            </>
          ) : null}

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

        {!loading && !loadError && data ? (
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
              disabled={!allRequiredDocumentsComplete}
              onPress={continueToReview}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.blue },
                !allRequiredDocumentsComplete &&
                  styles.disabled,
                pressed &&
                  allRequiredDocumentsComplete &&
                  styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {allRequiredDocumentsComplete
                  ? "Review application"
                  : "Complete required documents"}
              </Text>

              <Ionicons
                name="arrow-forward"
                size={19}
                color="#FFFFFF"
              />
            </Pressable>

            <Text
              style={[
                styles.bottomHint,
                { color: colors.textMuted },
              ]}
            >
              Optional supporting documents do not block
              your application.
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  container: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 22,
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
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.7,
  },

  subtitle: {
    fontSize: 13,
    lineHeight: 21,
  },

  summaryCard: {
    borderRadius: 15,
    borderWidth: 1,
    padding: 15,
    gap: 13,
  },

  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  summaryCopy: {
    flex: 1,
    gap: 5,
  },

  summaryTitle: {
    fontSize: 12,
    fontWeight: "900",
  },

  summarySubtitle: {
    fontSize: 10,
  },

  percentage: {
    fontSize: 20,
    fontWeight: "900",
  },

  summaryTrack: {
    height: 7,
    borderRadius: 7,
    overflow: "hidden",
  },

  summaryFill: {
    height: "100%",
    borderRadius: 7,
  },

  listHeading: {
    gap: 5,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
  },

  sectionSubtitle: {
    fontSize: 11,
  },

  documentList: {
    gap: 11,
  },

  documentCard: {
    borderRadius: 15,
    borderWidth: 1,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  documentIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  documentCopy: {
    flex: 1,
    gap: 7,
  },

  documentTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
  },

  documentTitle: {
    fontSize: 12,
    fontWeight: "900",
    flexShrink: 1,
  },

  requiredMark: {
    fontSize: 9,
    fontWeight: "900",
  },

  optionalMark: {
    fontSize: 9,
    fontWeight: "700",
  },

  documentDescription: {
    fontSize: 10,
    lineHeight: 16,
  },

  sidesHint: {
    fontSize: 9,
    fontWeight: "800",
  },

  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  statusText: {
    fontSize: 9,
    fontWeight: "900",
  },

  reviewNote: {
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  reviewNoteText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 17,
  },

  loadingState: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  loadingText: {
    fontSize: 11,
  },

  loadError: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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

  emptyState: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 22,
    alignItems: "center",
    gap: 10,
  },

  emptyTitle: {
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyText: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
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
    fontSize: 13,
    fontWeight: "900",
  },

  bottomHint: {
    fontSize: 9,
    lineHeight: 14,
    textAlign: "center",
  },

  disabled: {
    opacity: 0.45,
  },

  pressed: {
    opacity: 0.82,
  },
});
