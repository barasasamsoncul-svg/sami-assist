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

import { router, useFocusEffect } from "expo-router";
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
    | "changes_requested";
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
  // Only server-designated mandatory documents belong in Runner onboarding.
  const mandatoryRequirements = requirements.filter(
    (item) => item.required,
  );

  const nationalIdKeys = new Set([
    "identity_national_id_front",
    "identity_national_id_back",
  ]);

  const nationalIdRequirements = mandatoryRequirements.filter((item) =>
    nationalIdKeys.has(item.key),
  );

  const otherRequirements = mandatoryRequirements.filter(
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
      required: true,
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
      required: true,
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
  supportingText: string,
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

    case "partial":
      return {
        background: colors.warningSoft,
        foreground: colors.warning,
      };

    default:
      return {
        background: colors.surface,
        foreground: supportingText,
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
  const { colors, mode } = useRunnerTheme();
  const isDark = mode === "dark";

  const supportingText = isDark ? "#C1CCDA" : "#526176";
  const brandColor = isDark ? "#F5F7FB" : "#000535";
  const actionBlue = isDark ? "#8AB8F8" : "#1F5EAB";
  const buttonBlue = isDark ? "#1D5DAD" : "#174F9F";

  const [data, setData] = useState<RunnerOnboardingData | null>(null);

  const [feedback, setFeedback] =
    useState<RunnerReviewFeedback | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const hasLoadedOnceRef = useRef(false);
  const loadInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

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
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }

    setLoadError("");
    setFeedbackError("");
    setError("");

    try {
      const result = await getRunnerOnboarding();

      if (
        !result?.ok ||
        !result.runner ||
        !Array.isArray(result.requirements) ||
        !Array.isArray(result.documents)
      ) {
        throw new Error(
          "The server returned an incomplete document checklist. Please retry.",
        );
      }

      if (!mountedRef.current) return;

      setData(result);
      hasLoadedOnceRef.current = true;

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
      loadInFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDocuments();
    }, [loadDocuments]),
  );

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

  const hasCategories = Boolean(
    data?.runner.selectedCategories?.length,
  );

  const hasTransportDetails = Boolean(
    data?.runner.serviceArea?.trim() && data?.runner.vehicleType,
  );

  const isApproved = Boolean(
    data &&
      (data.onboardingStatus === "approved" ||
        data.runner.verificationStatus === "approved"),
  );

  const isPendingReview = Boolean(
    data &&
      (data.onboardingStatus === "pending_review" ||
        data.runner.verificationStatus === "submitted"),
  );

  const isRestricted = Boolean(
    data &&
      ["suspended", "closed"].includes(data.runner.accountStatus),
  );

  const sessionExpired = /session has expired|sign in to continue|no valid runner session/i.test(
    `${loadError} ${feedbackError}`,
  );

  const canUploadDocuments = Boolean(
    data &&
      hasCategories &&
      hasTransportDetails &&
      !isApproved &&
      !isPendingReview &&
      !isRestricted &&
      !sessionExpired,
  );

  function openMissingPrerequisite() {
    if (!hasCategories) {
      router.push("/(auth)/tasks");
      return;
    }

    if (!hasTransportDetails) {
      router.push("/(auth)/transport");
    }
  }

  function continueToReview() {
    if (!canUploadDocuments) return;

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
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
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
              accessibilityLabel="Go back"
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace("/(auth)/tasks");
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
                style={[styles.brandName, { color: brandColor }]}
              >
                SaMi <Text style={{ color: actionBlue }}>Runner</Text>
              </Text>

              <Text
                style={[
                  styles.brandTagline,
                  { color: supportingText },
                ]}
              >
                CONSIDER IT DONE
              </Text>
            </View>

            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.pageContext}>
            <Ionicons name="shield-checkmark-outline" size={15} color={actionBlue} />
            <Text style={[styles.pageContextText, { color: supportingText }]}>
              RUNNER ACCOUNT · DOCUMENTS
            </Text>
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
                color={actionBlue}
              />
            </View>

            <Text style={[styles.eyebrow, { color: actionBlue }]}>
              RUNNER VERIFICATION
            </Text>

            <Text style={[styles.title, { color: colors.text }]}>
              Your documents
            </Text>

            <Text
              style={[styles.subtitle, { color: supportingText }]}
            >
              Open each required document below to upload the requested evidence.
              Requirements are based on your selected services and transport
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
              <ActivityIndicator size="large" color={actionBlue} />

              <Text
                style={[
                  styles.loadingText,
                  { color: supportingText },
                ]}
              >
                Loading your document checklist...
              </Text>
            </View>
          ) : loadError && !data ? (
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

              {sessionExpired ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign in again"
                  hitSlop={10}
                  onPress={() => router.replace("/(auth)/login")}
                  style={({ pressed }) => [
                    styles.retryButton,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={[styles.retryText, { color: actionBlue }]}>
                    Sign in
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading documents"
                  hitSlop={10}
                  onPress={() => void loadDocuments()}
                  style={({ pressed }) => [
                    styles.retryButton,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={[styles.retryText, { color: actionBlue }]}>
                    Retry
                  </Text>
                </Pressable>
              )}
            </View>
          ) : data ? (
            <>
              {loadError ? (
                <View
                  accessibilityRole="alert"
                  style={[styles.inlineRefreshError, { backgroundColor: colors.dangerSoft }]}
                >
                  <Ionicons name="alert-circle-outline" size={17} color={colors.red} />
                  <Text style={[styles.inlineRefreshErrorText, { color: colors.red }]}>
                    {sessionExpired
                      ? "Your Runner session has expired. Sign in again to continue uploading documents."
                      : "Your latest document status could not be refreshed. The information below may be out of date."}
                  </Text>
                  <Pressable
                    onPress={() =>
                      sessionExpired
                        ? router.replace("/(auth)/login")
                        : void loadDocuments()
                    }
                    hitSlop={8}
                  >
                    <Text style={[styles.retryText, { color: actionBlue }]}>
                      {sessionExpired ? "Sign in" : "Retry"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {sessionExpired ? (
                <View style={[styles.stateNotice, { backgroundColor: colors.dangerSoft, borderColor: colors.red }]}>
                  <Ionicons name="lock-closed-outline" size={21} color={colors.red} />
                  <View style={styles.stateNoticeCopy}>
                    <Text style={[styles.stateNoticeTitle, { color: colors.text }]}>Sign in to continue</Text>
                    <Text style={[styles.stateNoticeBody, { color: supportingText }]}>Your saved application data is still available, but your Runner session has expired. Sign in again to continue securely.</Text>
                    <Pressable onPress={() => router.replace("/(auth)/login")} hitSlop={8}>
                      <Text style={[styles.noticeAction, { color: actionBlue }]}>Sign in again</Text>
                    </Pressable>
                  </View>
                </View>
              ) : isApproved ? (
                <View style={[styles.stateNotice, { backgroundColor: colors.successSoft, borderColor: colors.success }]}>
                  <Ionicons name="checkmark-circle-outline" size={21} color={colors.success} />
                  <View style={styles.stateNoticeCopy}>
                    <Text style={[styles.stateNoticeTitle, { color: colors.text }]}>Runner account approved</Text>
                    <Text style={[styles.stateNoticeBody, { color: supportingText }]}>Your documents are available for reference. Uploading additional documents is closed for an approved application.</Text>
                  </View>
                </View>
              ) : isPendingReview ? (
                <View style={[styles.stateNotice, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
                  <Ionicons name="time-outline" size={21} color={colors.warning} />
                  <View style={styles.stateNoticeCopy}>
                    <Text style={[styles.stateNoticeTitle, { color: colors.text }]}>Application under review</Text>
                    <Text style={[styles.stateNoticeBody, { color: supportingText }]}>Your submitted documents are read-only while SaMi Operations reviews your application.</Text>
                    <Pressable onPress={() => router.push({ pathname: "/(app)/profile-setup", params: { mode: "status" } })} hitSlop={8}>
                      <Text style={[styles.noticeAction, { color: actionBlue }]}>View application status</Text>
                    </Pressable>
                  </View>
                </View>
              ) : isRestricted ? (
                <View style={[styles.stateNotice, { backgroundColor: colors.dangerSoft, borderColor: colors.red }]}>
                  <Ionicons name="lock-closed-outline" size={21} color={colors.red} />
                  <View style={styles.stateNoticeCopy}>
                    <Text style={[styles.stateNoticeTitle, { color: colors.text }]}>Account access restricted</Text>
                    <Text style={[styles.stateNoticeBody, { color: supportingText }]}>Document uploads are unavailable for this Runner account. Contact SaMi Operations for assistance.</Text>
                  </View>
                </View>
              ) : !hasCategories || !hasTransportDetails ? (
                <View style={[styles.stateNotice, { backgroundColor: colors.blueSoft, borderColor: colors.border }]}>
                  <Ionicons name="information-circle-outline" size={21} color={actionBlue} />
                  <View style={styles.stateNoticeCopy}>
                    <Text style={[styles.stateNoticeTitle, { color: colors.text }]}>Complete your setup first</Text>
                    <Text style={[styles.stateNoticeBody, { color: supportingText }]}>
                      {!hasCategories
                        ? "Choose at least one service before uploading documents. You can leave this screen and return later."
                        : "Add your service area and transport details before uploading documents. You can leave this screen and return later."}
                    </Text>
                    <Pressable onPress={openMissingPrerequisite} hitSlop={8}>
                      <Text style={[styles.noticeAction, { color: actionBlue }]}>
                        {!hasCategories ? "Choose services" : "Add transport details"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* Required document summary */}
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
                        { color: supportingText },
                      ]}
                    >
                      {progress.completed} of {progress.required}{" "}
                      requirements submitted
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.percentage,
                      { color: actionBlue },
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
                  Mandatory verification checklist
                </Text>

                <Text
                  style={[
                    styles.sectionSubtitle,
                    { color: supportingText },
                  ]}
                >
                  {canUploadDocuments
                    ? "Tap a required document to open its upload page."
                    : "Your document records remain visible here. Uploading is currently unavailable."}
                </Text>
              </View>

              {/* Required documents only */}
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
                    color={supportingText}
                  />

                  <Text
                    style={[
                      styles.emptyTitle,
                      { color: colors.text },
                    ]}
                  >
                    {!hasCategories
                      ? "Services not selected"
                      : !hasTransportDetails
                        ? "Transport details not complete"
                        : "No mandatory documents are configured"}
                  </Text>

                  <Text
                    style={[
                      styles.emptyText,
                      { color: supportingText },
                    ]}
                  >
                    {!hasCategories
                      ? "Choose your services first. Your mandatory document checklist will be available when you return."
                      : !hasTransportDetails
                        ? "Complete your transport details first. Your mandatory document checklist will be available when you return."
                        : "SaMi has not returned mandatory document requirements for this application. Contact SaMi Operations before continuing."}
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
                      supportingText,
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
                        accessibilityLabel={`${card.title}. Required. ${documentProgress.label}.`}
                        accessibilityHint={
                          canUploadDocuments
                            ? "Opens this document's upload screen"
                            : "Document details are read-only until the required onboarding steps are complete"
                        }
                        accessibilityState={{ disabled: !canUploadDocuments }}
                        disabled={!canUploadDocuments}
                        onPress={() => openDocument(card)}
                        style={({ pressed }) => [
                          styles.documentCard,
                          {
                            backgroundColor: colors.surface,
                            borderColor: hasRejectedDocument
                              ? colors.red
                              : colors.border,
                            opacity: !canUploadDocuments
                              ? 0.78
                              : pressed
                                ? 0.85
                                : 1,
                            transform: [
                              { scale: pressed && canUploadDocuments ? 0.995 : 1 },
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

                            <Text
                              style={[
                                styles.requiredMark,
                                { color: colors.red },
                              ]}
                            >
                              Required
                            </Text>
                          </View>

                          <Text
                            style={[
                              styles.documentDescription,
                              { color: supportingText },
                            ]}
                            numberOfLines={3}
                          >
                            {card.description}
                          </Text>

                          {nationalId ? (
                            <Text
                              style={[
                                styles.sidesHint,
                                { color: supportingText },
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
                                        color: supportingText,
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
                                    { color: supportingText },
                                  ]}
                                >
                                  Reviewed{" "}
                                  {formatReviewDate(review.reviewedAt)}
                                </Text>
                              </View>
                            );
                          })}
                        </View>

                        {canUploadDocuments ? (
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={supportingText}
                          />
                        ) : null}
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
                      { color: supportingText },
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
                  color={actionBlue}
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

        {/* Contextual action bar */}
        {!loading && data ? (
          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: colors.paper,
                borderTopColor: colors.border,
              },
            ]}
          >
            {sessionExpired ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign in again"
                onPress={() => router.replace("/(auth)/login")}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: buttonBlue }, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>Sign in again</Text>
                <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
              </Pressable>
            ) : isApproved ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace("/(app)")}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: buttonBlue }, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>Open Runner dashboard</Text>
                <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
              </Pressable>
            ) : isPendingReview ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/(app)/profile-setup", params: { mode: "status" } })}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: buttonBlue }, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>View application status</Text>
                <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
              </Pressable>
            ) : isRestricted ? null : !hasCategories || !hasTransportDetails ? (
              <Pressable
                accessibilityRole="button"
                onPress={openMissingPrerequisite}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: buttonBlue }, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>
                  {!hasCategories ? "Choose services" : "Add transport details"}
                </Text>
                <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  allRequiredDocumentsComplete
                    ? "Review application"
                    : "Complete required documents"
                }
                accessibilityHint="Opens the application review when all required documents have been submitted"
                accessibilityState={{ disabled: !allRequiredDocumentsComplete }}
                disabled={!allRequiredDocumentsComplete}
                onPress={continueToReview}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: buttonBlue },
                  !allRequiredDocumentsComplete && styles.disabled,
                  pressed && allRequiredDocumentsComplete && styles.pressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {allRequiredDocumentsComplete
                    ? "Review application"
                    : "Complete required documents"}
                </Text>
                <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
              </Pressable>
            )}

            {!isRestricted ? (
              <Text style={[styles.bottomHint, { color: supportingText }]}>
                {sessionExpired
                  ? "Your saved application data remains available. Sign in to resume securely."
                  : isApproved
                    ? "Your account is approved. You can return to this checklist at any time."
                    : isPendingReview
                      ? "Your submitted documents remain available to view during Operations review."
                      : !hasCategories || !hasTransportDetails
                        ? "Your progress is saved. You can return to this screen whenever you are ready."
                        : "Submit every required document before reviewing your application."}
              </Text>
            ) : null}
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

  // Page context
  pageContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
  },

  pageContextText: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  stateNotice: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },

  stateNoticeCopy: {
    flex: 1,
    gap: 6,
  },

  stateNoticeTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },

  stateNoticeBody: {
    fontSize: 12,
    lineHeight: 18,
  },

  noticeAction: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "900",
    paddingTop: 2,
  },

  inlineRefreshError: {
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  inlineRefreshErrorText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
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