import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
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
  submitRunnerOnboarding,
  type RunnerDocumentRequirement,
  type RunnerOnboardingData,
  type RunnerUploadedDocument,
} from "@/api";

import { getRunnerReviewFeedback } from "@/review";
import type {
  RunnerDocumentReview,
  RunnerReviewFeedback,
} from "@/review";

import { useRunnerTheme } from "@/theme";

const WORDMARK = require("../../assets/sami-wordmark.png");

type DocumentCard = {
  key: string;
  title: string;
  requirements: RunnerDocumentRequirement[];
};

type DocumentProgress = {
  status: "required" | "partial" | "completed" | "approved" | "resubmit";
  label: string;
  completed: number;
  total: number;
};

type RunnerSummary = RunnerOnboardingData["runner"];

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

function isResubmissionRequired(
  document: RunnerUploadedDocument | undefined,
): boolean {
  return (
    document?.reviewStatus === "rejected" ||
    document?.reviewStatus === "resubmission_required"
  );
}

function buildDocumentCards(
  requirements: RunnerDocumentRequirement[],
): DocumentCard[] {
  const mandatory = requirements.filter((item) => item.required);
  const nationalIdKeys = new Set([
    "identity_national_id_front",
    "identity_national_id_back",
  ]);

  const nationalId = mandatory.filter((item) =>
    nationalIdKeys.has(item.key),
  );
  const others = mandatory.filter((item) => !nationalIdKeys.has(item.key));

  const cards: DocumentCard[] = [];

  if (nationalId.length > 0) {
    cards.push({
      key: "national_identity",
      title: "National ID",
      requirements: nationalId,
    });
  }

  for (const requirement of others) {
    cards.push({
      key: requirement.key,
      title: requirement.title,
      requirements: [requirement],
    });
  }

  return cards;
}

function getDocumentProgress(
  card: DocumentCard,
  documents: RunnerUploadedDocument[],
): DocumentProgress {
  const current = card.requirements.map((requirement) =>
    latestDocument(documents, requirement.key),
  );

  const rejected = current.some(isResubmissionRequired);
  const completed = current.filter(isSatisfied).length;
  const allApproved =
    current.length > 0 &&
    current.every((document) => document?.reviewStatus === "approved");

  if (rejected) {
    return {
      status: "resubmit",
      label: "Resubmit",
      completed,
      total: current.length,
    };
  }

  if (current.length > 0 && completed === current.length) {
    return {
      status: allApproved ? "approved" : "completed",
      label: allApproved ? "Approved" : "Completed",
      completed,
      total: current.length,
    };
  }

  if (completed > 0) {
    return {
      status: "partial",
      label: `${completed} of ${current.length} uploaded`,
      completed,
      total: current.length,
    };
  }

  return {
    status: "required",
    label: "Required",
    completed: 0,
    total: current.length,
  };
}

function documentIcon(
  requirement: RunnerDocumentRequirement,
): keyof typeof Ionicons.glyphMap {
  const key = requirement.key;
  const type = requirement.documentType;

  if (key.startsWith("identity_national_id")) return "card-outline";
  if (type === "profile_photo") return "person-circle-outline";
  if (type === "driving_licence") return "id-card-outline";
  if (type === "vehicle_registration") return "car-outline";
  if (type === "motor_vehicle_insurance") return "shield-checkmark-outline";
  if (type === "vehicle_authorisation") return "document-lock-outline";
  if (type === "police_clearance" || key.includes("good_conduct")) {
    return "shield-checkmark-outline";
  }
  if (type === "kra_pin" || key.includes("kra_pin")) return "document-text-outline";
  if (type === "food_handling_certificate") return "restaurant-outline";
  if (type === "pet_care_qualification") return "paw-outline";
  if (type === "professional_qualification") return "ribbon-outline";

  return "document-text-outline";
}

function statusColor(
  status: DocumentProgress["status"],
  colors: ReturnType<typeof useRunnerTheme>["colors"],
): string {
  switch (status) {
    case "approved":
      return colors.success;
    case "completed":
      return colors.blue;
    case "resubmit":
      return colors.red;
    case "partial":
      return colors.warning;
    default:
      return colors.textMuted;
  }
}

function serviceLabel(categoryKeys: string[]): string {
  const labels = categoryKeys.map((key) => {
    if (key === "pickup_deliver") return "Pick Up & Deliver";
    if (key === "shop_deliver") return "Shop & Deliver";
    return key.replace(/_/g, " ");
  });

  return labels.length > 0 ? labels.join(" · ") : "Not selected";
}

function vehicleLabel(value: string | null | undefined): string {
  switch (value?.trim().toLowerCase()) {
    case "bike":
    case "bicycle":
      return "Bicycle";
    case "motorbike":
    case "motorcycle":
      return "Motorbike";
    case "vehicle":
    case "car":
      return "Vehicle";
    case "van":
      return "Van";
    default:
      return value?.trim() || "Not selected";
  }
}

function firstName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "there";
}

function getLatestReviewForCard(
  card: DocumentCard,
  documents: RunnerUploadedDocument[],
  feedback: RunnerReviewFeedback | null,
): RunnerDocumentReview | undefined {
  if (!feedback) return undefined;

  for (const requirement of card.requirements) {
    const document = latestDocument(documents, requirement.key);
    if (!document || !isResubmissionRequired(document)) continue;

    const review = feedback.documentReviews.find(
      (item) => item.documentId === document.id,
    );

    if (review) return review;
  }

  return undefined;
}

function hasUnresolvedDocumentReview(
  data: RunnerOnboardingData,
  feedback: RunnerReviewFeedback,
): boolean {
  return feedback.documentReviews.some((review) => {
    if (
      review.decision !== "rejected" &&
      review.decision !== "resubmission_required"
    ) {
      return false;
    }

    if (!review.requirementKey) return true;

    const current = latestDocument(
      data.documents,
      review.requirementKey,
    );

    // A replacement upload creates a new document record. The older
    // rejection remains in review history but is no longer outstanding.
    return !current || current.id === review.documentId || isResubmissionRequired(current);
  });
}

function allRequiredDocumentsSatisfied(data: RunnerOnboardingData): boolean {
  const required = data.requirements.filter((item) => item.required);

  return (
    required.length > 0 &&
    required.every((requirement) =>
      isSatisfied(latestDocument(data.documents, requirement.key)),
    )
  );
}

function shouldAutoSubmit(
  data: RunnerOnboardingData,
  feedback: RunnerReviewFeedback | null,
): boolean {
  if (!allRequiredDocumentsSatisfied(data)) return false;

  const status = data.runner.verificationStatus;
  const isAwaitingReview =
    data.onboardingStatus === "pending_review" || status === "submitted";
  const isApproved =
    data.onboardingStatus === "approved" || status === "approved";
  const isRestricted = ["suspended", "closed"].includes(
    data.runner.accountStatus,
  );

  if (isAwaitingReview || isApproved || isRestricted) return false;

  const isInitialSetup = data.onboardingStatus === "incomplete";
  const isResubmission =
    data.onboardingStatus === "changes_required" || status === "rejected";

  if (!isInitialSetup && !isResubmission) return false;

  if (isResubmission) {
    // Do not resubmit until the Runner has replaced every document that
    // Operations explicitly returned. A general application rejection
    // is kept visible for the Operations feedback workflow to resolve.
    if (!feedback || feedback.applicationReview?.decision === "rejected") {
      return false;
    }

    if (hasUnresolvedDocumentReview(data, feedback)) return false;
  }

  return true;
}

export default function RunnerDocumentsScreen() {
  const {
    colors,
    mode,
    showOverlay,
  } = useRunnerTheme();

  const isDark = mode === "dark";
  const supportingText = isDark ? "#C1CCDA" : "#526176";
  const brandColor = isDark ? "#F5F7FB" : "#000535";
  const actionBlue = colors.blueAction;

  const [data, setData] = useState<RunnerOnboardingData | null>(null);
  const [feedback, setFeedback] = useState<RunnerReviewFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSetup, setExpandedSetup] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [autoSubmitError, setAutoSubmitError] = useState("");

  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const attemptedSubmissionRef = useRef("");

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
      return { completed: 0, total: 0, remaining: 0 };
    }

    const completed = cards.filter((card) => {
      const state = getDocumentProgress(card, data.documents).status;
      return state === "completed" || state === "approved";
    }).length;

    return {
      completed,
      total: cards.length,
      remaining: Math.max(0, cards.length - completed),
    };
  }, [cards, data]);

  const loadDocuments = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;

    if (!hasLoadedOnceRef.current) setLoading(true);
    setLoadError("");
    setFeedbackError("");
    setAutoSubmitError("");

    try {
      const result = await getRunnerOnboarding();

      if (
        !result?.ok ||
        !result.runner ||
        !Array.isArray(result.requirements) ||
        !Array.isArray(result.documents)
      ) {
        throw new Error(
          "The server returned an incomplete document checklist. Please try again.",
        );
      }

      if (!mountedRef.current) return;

      // Approval is handled in this active onboarding session.
      // Never send the Runner to a separate application-review screen.
      if (
        result.runner.verificationStatus === "approved" &&
        !["suspended", "closed"].includes(result.runner.accountStatus)
      ) {
        router.replace("/(app)");
        return;
      }

      let reviewResult: RunnerReviewFeedback | null = null;

      try {
        reviewResult = await getRunnerReviewFeedback();
      } catch (cause) {
        if (!mountedRef.current) return;
        setFeedbackError(
          cause instanceof Error
            ? cause.message
            : "Operations review feedback could not be loaded.",
        );
      }

      if (!mountedRef.current) return;

      setData(result);
      setFeedback(reviewResult);
      hasLoadedOnceRef.current = true;

      if (shouldAutoSubmit(result, reviewResult)) {
        const signature = result.requirements
          .filter((item) => item.required)
          .map((item) => {
            const document = latestDocument(result.documents, item.key);
            return `${item.key}:${document?.id ?? "missing"}`;
          })
          .sort()
          .join("|");

        if (
          signature &&
          attemptedSubmissionRef.current !== signature &&
          !submitInFlightRef.current
        ) {
          attemptedSubmissionRef.current = signature;
          submitInFlightRef.current = true;

          try {
            const submission = await submitRunnerOnboarding();

            if (!submission?.ok) {
              throw new Error(
                submission?.message ||
                  "Your documents were uploaded, but the application could not be sent for review.",
              );
            }

            const refreshed = await getRunnerOnboarding();
            if (!mountedRef.current) return;

            if (
              refreshed.runner.verificationStatus === "approved" &&
              !["suspended", "closed"].includes(
                refreshed.runner.accountStatus,
              )
            ) {
              router.replace("/(app)");
              return;
            }

            setData(refreshed);
          } catch (cause) {
            attemptedSubmissionRef.current = "";
            if (mountedRef.current) {
              setAutoSubmitError(
                cause instanceof Error
                  ? cause.message
                  : "Your application could not be sent for review. Please try again.",
              );

              showOverlay({
                type: "error",
                title: "Application not submitted",
                message:
                  cause instanceof Error
                    ? cause.message
                    : "Your documents are saved, but the application could not be sent for review.",
                primaryAction: { label: "Got it" },
              });
            }
          } finally {
            submitInFlightRef.current = false;
          }
        }
      }
    } catch (cause) {
      if (!mountedRef.current) return;

      const message =
        cause instanceof Error
          ? cause.message
          : "Your document requirements could not be loaded.";

      setLoadError(message);
      showOverlay({
        type: "error",
        title: "Documents unavailable",
        message,
        primaryAction: { label: "Close" },
      });
    } finally {
      loadInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [showOverlay]);

  useFocusEffect(
    useCallback(() => {
      void loadDocuments();
    }, [loadDocuments]),
  );

  const runner = data?.runner as RunnerSummary | undefined;
  const categories = runner?.selectedCategories ?? [];
  const serviceArea = runner?.serviceArea?.trim() || "Not provided";
  const currentVehicle = vehicleLabel(runner?.vehicleType);
  const model = runner?.vehicleModel?.trim();
  const registration = runner?.vehicleRegistration?.trim();

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
    data && ["suspended", "closed"].includes(data.runner.accountStatus),
  );

  const isSessionExpired = /session has expired|sign in to continue|no valid runner session/i.test(
    loadError,
  );

  const canUpload = Boolean(
    data &&
      !isApproved &&
      !isPendingReview &&
      !isRestricted &&
      !isSessionExpired,
  );

  // While Admin reviews the submitted application, keep the Runner on
  // this checklist and refresh its state in the same active session.
  // Approval immediately routes to the dashboard; a returned document
  // appears as Resubmit on this same screen.
  useEffect(() => {
    if (!isPendingReview || isApproved || isRestricted || isSessionExpired) {
      return;
    }

    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        void loadDocuments();
      }
    }, 10000);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void loadDocuments();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [
    isPendingReview,
    isApproved,
    isRestricted,
    isSessionExpired,
    loadDocuments,
  ]);

  const firstIncompleteKey = useMemo(() => {
    if (!data) return "";

    const next = cards.find((card) => {
      const status = getDocumentProgress(card, data.documents).status;
      return status === "required" || status === "partial";
    });

    return next?.key ?? "";
  }, [cards, data]);

  function showHelp() {
    showOverlay({
      type: "info",
      title: "SaMi Runner Help",
      message:
        "Upload each required document using its row. Documents marked Completed have been received and are awaiting verification. If SaMi Operations returns a document, the row will show Resubmit with the reason. Your service and vehicle selection cannot be changed from this screen.",
      primaryAction: { label: "Got it" },
    });
  }

  function openDocument(card: DocumentCard) {
    if (!canUpload) return;

    const status = getDocumentProgress(card, data!.documents).status;
    if (status === "completed" || status === "approved") return;

    router.push({
      pathname: "/(auth)/document/[key]",
      params: { key: card.key },
    });
  }

  const hasResubmissions = Boolean(
    cards.some(
      (card) =>
        getDocumentProgress(card, data?.documents ?? []).status === "resubmit",
    ),
  );

  const applicationReviewRejected =
    feedback?.applicationReview?.decision === "rejected";

  const titleInstruction = isApproved
    ? "Your Runner account has been approved."
    : isPendingReview
      ? "Your documents are with SaMi Operations for review."
      : hasResubmissions || applicationReviewRejected
        ? "Some information needs your attention. Resubmit the requested documents below."
        : progress.remaining > 0
          ? `Complete ${progress.remaining} more ${progress.remaining === 1 ? "step" : "steps"} to start earning.`
          : "Your documents have been received. SaMi Operations will review them.";

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
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* SaMi wordmark and global Help overlay */}
          <View style={styles.header}>
            <Image
              source={WORDMARK}
              resizeMode="contain"
              style={styles.wordmark}
              accessibilityLabel="SaMi"
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="SaMi Runner Help"
              onPress={showHelp}
              style={({ pressed }) => [
                styles.helpButton,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
            >
              <Ionicons
                name="help-circle-outline"
                size={17}
                color={actionBlue}
              />
              <Text style={[styles.helpText, { color: colors.text }]}>
                Help
              </Text>
            </Pressable>
          </View>

          {/* Read-only earning setup */}
          <View style={styles.signingUpBlock}>
            <Text style={[styles.eyebrow, { color: supportingText }]}>
              SIGNING UP FOR
            </Text>

            <View
              style={[
                styles.setupSummary,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show selected service and vehicle details"
                accessibilityState={{ expanded: expandedSetup }}
                onPress={() => setExpandedSetup((value) => !value)}
                style={({ pressed }) => [
                  styles.setupSummaryTrigger,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={styles.setupSummaryText}>
                  <Text
                    style={[styles.setupPrimary, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {serviceArea} · {serviceLabel(categories)}
                  </Text>
                  <Text
                    style={[styles.setupSecondary, { color: supportingText }]}
                    numberOfLines={1}
                  >
                    {currentVehicle}
                    {model ? ` · ${model}` : ""}
                    {registration ? ` · ${registration}` : ""}
                  </Text>
                </View>

                <Ionicons
                  name={expandedSetup ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={colors.text}
                />
              </Pressable>

              {expandedSetup ? (
                <View
                  style={[
                    styles.setupDetails,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <View style={styles.setupDetailRow}>
                    <Text style={[styles.setupDetailLabel, { color: supportingText }]}>
                      Service area
                    </Text>
                    <Text style={[styles.setupDetailValue, { color: colors.text }]}>
                      {serviceArea}
                    </Text>
                  </View>
                  <View style={styles.setupDetailRow}>
                    <Text style={[styles.setupDetailLabel, { color: supportingText }]}>
                      Service
                    </Text>
                    <Text style={[styles.setupDetailValue, { color: colors.text }]}>
                      {serviceLabel(categories)}
                    </Text>
                  </View>
                  <View style={styles.setupDetailRow}>
                    <Text style={[styles.setupDetailLabel, { color: supportingText }]}>
                      Vehicle
                    </Text>
                    <Text style={[styles.setupDetailValue, { color: colors.text }]}>
                      {currentVehicle}
                    </Text>
                  </View>
                  {model ? (
                    <View style={styles.setupDetailRow}>
                      <Text style={[styles.setupDetailLabel, { color: supportingText }]}>
                        Model
                      </Text>
                      <Text style={[styles.setupDetailValue, { color: colors.text }]}>
                        {model}
                      </Text>
                    </View>
                  ) : null}
                  {registration ? (
                    <View style={styles.setupDetailRow}>
                      <Text style={[styles.setupDetailLabel, { color: supportingText }]}>
                        Registration
                      </Text>
                      <Text style={[styles.setupDetailValue, { color: colors.text }]}>
                        {registration}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[styles.readOnlyHint, { color: supportingText }]}>
                    These details are read-only during onboarding.
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Welcome and onboarding progress */}
          <View style={styles.intro}>
            <Text style={[styles.title, { color: colors.text }]}>
              Welcome, {firstName(runner?.fullName)}
            </Text>
            <Text style={[styles.subtitle, { color: supportingText }]}>
              {loading ? "Loading your document checklist…" : titleInstruction}
            </Text>

            {data && cards.length > 0 ? (
              <View
                style={styles.progressSegments}
                accessibilityRole="progressbar"
                accessibilityLabel={`${progress.completed} of ${progress.total} document steps completed`}
                accessibilityValue={{
                  min: 0,
                  max: progress.total,
                  now: progress.completed,
                }}
              >
                {cards.map((card) => {
                  const status = getDocumentProgress(card, data.documents).status;
                  const filled = status === "completed" || status === "approved";
                  return (
                    <View
                      key={card.key}
                      style={[
                        styles.progressSegment,
                        {
                          backgroundColor: filled
                            ? actionBlue
                            : colors.border,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Individual document rows */}
          {loading && !hasLoadedOnceRef.current ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={actionBlue} />
              <Text style={[styles.loadingText, { color: supportingText }]}>
                Loading required documents…
              </Text>
            </View>
          ) : loadError && !data ? (
            <View style={styles.loadError}>
              <Text style={[styles.errorText, { color: colors.red }]}>
                {loadError}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadDocuments()}
                style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.retryText, { color: actionBlue }]}>Try again</Text>
              </Pressable>
            </View>
          ) : data ? (
            <View style={[styles.documentList, { borderTopColor: colors.border }]}>
              {cards.map((card, index) => {
                const progressState = getDocumentProgress(card, data.documents);
                const review = getLatestReviewForCard(card, data.documents, feedback);
                const statusTextColor = statusColor(progressState.status, colors);
                const isFirstIncomplete = firstIncompleteKey === card.key;
                const canOpen =
                  canUpload &&
                  progressState.status !== "completed" &&
                  progressState.status !== "approved";
                const hint =
                  progressState.status === "resubmit"
                    ? review?.reason || "SaMi Operations requested a replacement. Tap to upload a new document."
                    : progressState.status === "required" && isFirstIncomplete
                      ? "Recommended next step"
                      : progressState.status === "partial"
                        ? "Complete the remaining side"
                        : progressState.status === "completed"
                          ? ""
                          : progressState.status === "approved"
                            ? ""
                            : "Required";

                return (
                  <Pressable
                    key={card.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${card.title}. ${progressState.label}`}
                    accessibilityHint={
                      canOpen
                        ? progressState.status === "resubmit"
                          ? "Opens the existing upload screen to submit a replacement"
                          : "Opens the existing document upload screen"
                        : "This document cannot be changed at this time"
                    }
                    accessibilityState={{ disabled: !canOpen }}
                    disabled={!canOpen}
                    onPress={() => openDocument(card)}
                    style={({ pressed }) => [
                      styles.documentRow,
                      {
                        borderBottomColor: colors.border,
                        opacity: pressed && canOpen ? 0.72 : 1,
                      },
                    ]}
                  >
                    <View style={styles.documentIconWrap}>
                      <Ionicons
                        name={documentIcon(card.requirements[0])}
                        size={20}
                        color={
                          progressState.status === "resubmit"
                            ? colors.red
                            : actionBlue
                        }
                      />
                    </View>

                    <View style={styles.documentCopy}>
                      <Text
                        style={[styles.documentTitle, { color: colors.text }]}
                        numberOfLines={2}
                      >
                        {card.title}
                      </Text>
                      <Text
                        style={[
                          styles.documentHint,
                          { color: statusTextColor },
                        ]}
                        numberOfLines={3}
                      >
                        {hint || progressState.label}
                      </Text>
                    </View>

                    <View style={styles.documentRight}>
                      <Text
                        style={[styles.documentStatus, { color: statusTextColor }]}
                      >
                        {progressState.label}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={19}
                        color={colors.textMuted}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {feedbackError ? (
            <Text style={[styles.feedbackHint, { color: supportingText }]}>
              Operations review comments could not be refreshed. Document upload status is still shown above.
            </Text>
          ) : null}

          {autoSubmitError ? (
            <Text style={[styles.feedbackHint, { color: colors.red }]}>
              {autoSubmitError}
            </Text>
          ) : null}

          {applicationReviewRejected && feedback?.applicationReview ? (
            <View style={[styles.applicationFeedback, { borderColor: colors.red }]}>
              <Text style={[styles.applicationFeedbackTitle, { color: colors.red }]}>
                Application returned
              </Text>
              <Text style={[styles.applicationFeedbackText, { color: colors.text }]}>
                {feedback.applicationReview.reason ||
                  "SaMi Operations has returned your application for correction."}
              </Text>
            </View>
          ) : null}

          {isPendingReview ? (
            <Text style={[styles.footerNote, { color: supportingText }]}>
              Your documents have been received. SaMi Operations is reviewing your application.
            </Text>
          ) : isApproved ? (
            <Text style={[styles.footerNote, { color: colors.success }]}>
              Your Runner account is approved.
            </Text>
          ) : null}
        </ScrollView>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  header: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 27,
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
  signingUpBlock: {
    gap: 8,
    marginBottom: 30,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  setupSummary: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  setupSummaryTrigger: {
    minHeight: 54,
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  setupSummaryText: {
    flex: 1,
    gap: 3,
  },
  setupPrimary: {
    fontSize: 12.5,
    fontWeight: "800",
  },
  setupSecondary: {
    fontSize: 11,
    lineHeight: 15,
  },
  setupDetails: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  setupDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  setupDetailLabel: {
    fontSize: 11,
  },
  setupDetailValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "700",
  },
  readOnlyHint: {
    fontSize: 10,
    marginTop: 3,
  },
  intro: {
    gap: 13,
    marginBottom: 26,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  progressSegments: {
    flexDirection: "row",
    gap: 7,
    marginTop: 5,
  },
  progressSegment: {
    flex: 1,
    height: 7,
    borderRadius: 2,
  },
  documentList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  documentRow: {
    minHeight: 74,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  documentIconWrap: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  documentCopy: {
    flex: 1,
    gap: 4,
  },
  documentTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  documentHint: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  documentRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 4,
    maxWidth: 90,
  },
  documentStatus: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
    textAlign: "right",
  },
  loadingState: {
    minHeight: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
  },
  loadError: {
    paddingVertical: 18,
    gap: 12,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 12,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "800",
  },
  feedbackHint: {
    marginTop: 14,
    fontSize: 11,
    lineHeight: 16,
  },
  applicationFeedback: {
    marginTop: 18,
    borderLeftWidth: 3,
    paddingLeft: 11,
    gap: 5,
  },
  applicationFeedbackTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  applicationFeedbackText: {
    fontSize: 12,
    lineHeight: 18,
  },
  footerNote: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 11.5,
    lineHeight: 17,
  },
});