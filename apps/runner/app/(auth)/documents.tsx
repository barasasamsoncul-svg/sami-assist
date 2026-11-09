import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  Platform,
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

import { getRunnerReviewFeedback } from "@/review";

import type {
  RunnerReviewFeedback,
  RunnerDocumentReview,
} from "@/review";

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

const BACK_SIZE = 44;

function latestDocument(
  documents: RunnerUploadedDocument[],
  requirementKey: string,
): RunnerUploadedDocument | undefined {
  return documents.find(
    (document) => document.requirementKey === requirementKey,
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

function isChangesRequested(
  document: RunnerUploadedDocument | undefined,
): boolean {
  const status = String(document?.reviewStatus ?? "");

  return (
    status === "rejected" ||
    status === "resubmission_required"
  );
}

function buildDocumentCards(
  requirements: RunnerDocumentRequirement[],
): DocumentCard[] {
  const nationalIdKeys = new Set([
    "identity_national_id_front",
    "identity_national_id_back",
  ]);

  const nationalIdRequirements = requirements.filter((item) =>
    nationalIdKeys.has(item.key),
  );

  const otherRequirements = requirements.filter(
    (item) => !nationalIdKeys.has(item.key),
  );

  const cards: DocumentCard[] = [];

  if (nationalIdRequirements.length > 0) {
    cards.push({
      key: "national_identity",
      title: "National ID",
      description:
        "Upload clear images of both the front and back sides of your National ID on one screen.",
      requirements: nationalIdRequirements,
      required: nationalIdRequirements.some((item) => item.required),
    });
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
  const changesRequested = entries.some(isChangesRequested);

  const allApproved =
    entries.length > 0 &&
    entries.every(
      (document) => document?.reviewStatus === "approved",
    );

  if (changesRequested) {
    return {
      status: "changes_requested",
      label: "Changes requested",
      completed,
      total: entries.length,
    };
  }

  if (entries.length > 0 && completed === entries.length) {
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

function formatReviewDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getDecisionLabel(
  decision: RunnerDocumentReview["decision"],
) {
  switch (decision) {
    case "approved":
      return "APPROVED";

    case "resubmission_required":
      return "RESUBMISSION REQUIRED";

    default:
      return "REJECTED";
  }
}

function getCurrentDocumentReview(
  feedback: RunnerReviewFeedback | null,
  document: RunnerUploadedDocument | undefined,
) {
  if (!feedback || !document) {
    return undefined;
  }

  return feedback.documentReviews.find(
    (review) => review.documentId === document.id,
  );
}

export default function RunnerDocumentsScreen() {
  const { colors } = useRunnerTheme();

  const [data, setData] = useState<RunnerOnboardingData | null>(null);

  const [feedback, setFeedback] =
    useState<RunnerReviewFeedback | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cards = useMemo(
    () => (data ? buildDocumentCards(data.requirements) : []),
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

    const required = data.requirements.filter((item) => item.required);

    const completed = required.filter((item) =>
      isSatisfied(latestDocument(data.documents, item.key)),
    ).length;

    return {
      required: required.length,
      completed,
      percentage:
        required.length > 0
          ? Math.round((completed / required.length) * 100)
          : 0,
    };
  }, [data]);

  const allRequiredDocumentsComplete =
    progress.required > 0 && progress.completed === progress.required;

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setFeedbackError("");
    setError("");

    try {
      const result = await getRunnerOnboarding();

      if (!mountedRef.current) return;

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

      if (!result.runner.serviceArea || !result.runner.vehicleType) {
        router.replace("/(auth)/transport");
        return;
      }

      setData(result);

      try {
        const reviewResult = await getRunnerReviewFeedback();

        if (!mountedRef.current) return;

        setFeedback(reviewResult);
      } catch (cause) {
        if (!mountedRef.current) return;
        setFeedback(null);
        setFeedbackError(
          cause instanceof Error
            ? cause.message
            : "Review feedback could not be loaded.",
        );
      }
    } catch (cause) {
      if (!mountedRef.current) return;
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Your document requirements could not be loaded.",
      );
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  // Scroll the validation error into view when it appears.
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [error]);

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

      <View style={styles.container}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to transport details"
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace("/(auth)/transport");
                }
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.6 : 1,
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
              <Text
                style={[styles.brandName, { color: colors.navy }]}
              >
                SaMi <Text style={{ color: colors.blue }}>Runner</Text>
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

          {/* Progress — step 3 of 3 */}
          <View style={styles.progressSection}>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Documents step"
              accessibilityValue={{ min: 1, max: 3, now: 3 }}
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
                STEP 3 OF 3 · DOCUMENTS
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
                name="document-text-outline"
                size={27}
                color={colors.blue}
              />
            </View>

            <Text style={[styles.eyebrow, { color: colors.blue }]}>
              RUNNER VERIFICATION
            </Text>

            <Text style={[styles.title, { color: colors.text }]}>
              Your documents
            </Text>

            <Text
              style={[styles.subtitle, { color: colors.textMuted }]}
            >
              Open each document below to upload the requested evidence.
              Requirements are based on your selected tasks and transport
              type.
            </Text>
          </View>

          {/* Body */}
          {loading ? (
            <View
              style={styles.loadingState}
              accessibilityRole="progressbar"
              accessibilityLabel="Loading your document checklist"
            >
              <ActivityIndicator size="large" color={colors.blue} />

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
                accessibilityLabel="Retry loading documents"
                hitSlop={10}
                onPress={() => void loadDocuments()}
                style={({ pressed }) => [
                  styles.retryButton,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <Text
                  style={[styles.retryText, { color: colors.blue }]}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : data ? (
            <>
              {/* Summary card */}
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
                      {progress.completed} of {progress.required}{" "}
                      requirements submitted
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
                  accessibilityRole="progressbar"
                  accessibilityLabel="Required document progress"
                  accessibilityValue={{
                    min: 0,
                    max: progress.required,
                    now: progress.completed,
                  }}
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

              {/* Checklist heading */}
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

              {/* Cards */}
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
                    size={32}
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
                    SaMi has not returned any document requirements for
                    this application. Contact support before continuing.
                  </Text>
                </View>
              ) : (
                <View style={styles.documentList}>
                  {cards.map((card) => {
                    const documentProgress = getDocumentProgress(
                      card,
                      data.documents,
                    );

                    const firstRequirement = card.requirements[0];
                    const icon = documentIcon(firstRequirement);
                    const badge = statusColors(
                      documentProgress.status,
                      colors,
                    );

                    const nationalId =
                      card.key === "national_identity";

                    const hasRejectedDocument =
                      documentProgress.status === "changes_requested";

                    const reviewItems = card.requirements
                      .map((requirement) => {
                        const document = latestDocument(
                          data.documents,
                          requirement.key,
                        );

                        return getCurrentDocumentReview(
                          feedback,
                          document,
                        );
                      })
                      .filter(
                        (
                          review,
                        ): review is RunnerDocumentReview =>
                          Boolean(review),
                      );

                    return (
                      <Pressable
                        key={card.key}
                        accessibilityRole="button"
                        accessibilityLabel={`${card.title}. ${
                          card.required ? "Required" : "Optional"
                        }. ${documentProgress.label}.`}
                        accessibilityHint="Opens this document's upload screen"
                        onPress={() => openDocument(card)}
                        style={({ pressed }) => [
                          styles.documentCard,
                          {
                            backgroundColor: colors.surface,
                            borderColor: hasRejectedDocument
                              ? colors.red
                              : colors.border,
                            opacity: pressed ? 0.85 : 1,
                            transform: [
                              { scale: pressed ? 0.995 : 1 },
                            ],
                          },
                          hasRejectedDocument &&
                            Platform.select({
                              ios: {
                                shadowColor: colors.red,
                                shadowOpacity: 0.1,
                                shadowRadius: 6,
                                shadowOffset: {
                                  width: 0,
                                  height: 3,
                                },
                              },
                              android: { elevation: 1 },
                              default: {},
                            }),
                        ]}
                      >
                        <View
                          style={[
                            styles.documentIcon,
                            {
                              backgroundColor: hasRejectedDocument
                                ? colors.dangerSoft
                                : colors.blueSoft,
                            },
                          ]}
                        >
                          <Ionicons
                            name={icon}
                            size={23}
                            color={
                              hasRejectedDocument
                                ? colors.red
                                : colors.blue
                            }
                          />
                        </View>

                        <View style={styles.documentCopy}>
                          <View style={styles.documentTitleRow}>
                            <Text
                              style={[
                                styles.documentTitle,
                                { color: colors.text },
                              ]}
                              numberOfLines={2}
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
                              { backgroundColor: badge.background },
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

                          {reviewItems.map((review) => {
                            const approved =
                              review.decision === "approved";

                            return (
                              <View
                                key={review.reviewId}
                                style={[
                                  styles.reviewFeedback,
                                  {
                                    backgroundColor: approved
                                      ? colors.blueSoft
                                      : colors.dangerSoft,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.reviewDecision,
                                    {
                                      color: approved
                                        ? colors.blue
                                        : colors.red,
                                    },
                                  ]}
                                >
                                  {getDecisionLabel(review.decision)}
                                </Text>

                                <Text
                                  style={[
                                    styles.reviewReason,
                                    { color: colors.text },
                                  ]}
                                >
                                  {review.reason ||
                                    (approved
                                      ? "This document has been approved."
                                      : "Please submit a replacement document.")}
                                </Text>

                                {!approved &&
                                review.fileRemovedFromStorage ? (
                                  <Text
                                    style={[
                                      styles.storageNotice,
                                      {
                                        color: colors.textMuted,
                                      },
                                    ]}
                                  >
                                    {review.deletionPending
                                      ? "The previous file is queued for storage cleanup."
                                      : "The previous file has been removed. Upload a replacement."}
                                  </Text>
                                ) : null}

                                <Text
                                  style={[
                                    styles.reviewDate,
                                    { color: colors.textMuted },
                                  ]}
                                >
                                  Reviewed{" "}
                                  {formatReviewDate(review.reviewedAt)}
                                </Text>
                              </View>
                            );
                          })}
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

              {/* Feedback error */}
              {feedbackError ? (
                <View
                  style={[
                    styles.feedbackError,
                    { backgroundColor: colors.blueSoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.feedbackErrorText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Review comments could not be refreshed. Refresh this
                    checklist to try again.
                  </Text>
                </View>
              ) : null}

              {/* Review note */}
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
                  Uploaded documents are checked before your Runner
                  application is approved. A successful upload does not
                  mean the document has already been verified.
                </Text>
              </View>
            </>
          ) : null}

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
              accessibilityLabel={
                allRequiredDocumentsComplete
                  ? "Review application"
                  : "Complete required documents"
              }
              accessibilityHint={
                allRequiredDocumentsComplete
                  ? "Opens the review and submit screen"
                  : "Upload every required document to enable this step"
              }
              accessibilityState={{
                disabled: !allRequiredDocumentsComplete,
              }}
              disabled={!allRequiredDocumentsComplete}
              onPress={continueToReview}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.blue },
                !allRequiredDocumentsComplete && styles.disabled,
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
              Optional supporting documents do not block your
              application.
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 22,
  },

  // Header
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

  // Progress
  progressSection: { gap: 10 },

  progressTrack: {
    height: 6,
    borderRadius: 6,
    overflow: "hidden",
  },

  progressFill: {
    width: "100%",
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

  // Intro
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

  // Summary card
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 13,
  },

  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  summaryCopy: { flex: 1, gap: 5 },

  summaryTitle: {
    fontSize: 13,
    fontWeight: "900",
  },

  summarySubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
  },

  percentage: {
    fontSize: 22,
    fontWeight: "900",
  },

  summaryTrack: {
    height: 8,
    borderRadius: 8,
    overflow: "hidden",
  },

  summaryFill: {
    height: "100%",
    borderRadius: 8,
  },

  // List heading
  listHeading: { gap: 5 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
  },

  sectionSubtitle: {
    fontSize: 12,
  },

  // Document list
  documentList: { gap: 11 },

  documentCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  documentIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  documentCopy: { flex: 1, gap: 8, minWidth: 0 },

  documentTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },

  documentTitle: {
    fontSize: 13.5,
    fontWeight: "900",
    flexShrink: 1,
    lineHeight: 18,
  },

  requiredMark: {
    fontSize: 11,
    fontWeight: "900",
  },

  optionalMark: {
    fontSize: 11,
    fontWeight: "700",
  },

  documentDescription: {
    fontSize: 11.5,
    lineHeight: 16,
  },

  sidesHint: {
    fontSize: 11,
    fontWeight: "800",
  },

  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusText: {
    fontSize: 11,
    fontWeight: "900",
  },

  // Review feedback
  reviewFeedback: {
    borderRadius: 12,
    padding: 11,
    gap: 7,
  },

  reviewDecision: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  reviewReason: {
    fontSize: 12,
    lineHeight: 18,
  },

  storageNotice: {
    fontSize: 11.5,
    lineHeight: 16,
  },

  reviewDate: {
    fontSize: 11,
    lineHeight: 15,
  },

  // Feedback error
  feedbackError: {
    borderRadius: 12,
    padding: 12,
  },

  feedbackErrorText: {
    fontSize: 12,
    lineHeight: 18,
  },

  // Review note
  reviewNote: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  reviewNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  // Loading
  loadingState: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  loadingText: {
    fontSize: 12.5,
  },

  // Load error
  loadError: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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

  // Empty state
  emptyState: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },

  emptyTitle: {
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },

  // Validation error
  errorContainer: {
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  // Bottom bar
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
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: "center",
    maxWidth: 340,
    alignSelf: "center",
  },

  disabled: { opacity: 0.45 },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});