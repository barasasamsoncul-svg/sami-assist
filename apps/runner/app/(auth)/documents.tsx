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
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { router, Stack, useFocusEffect } from "expo-router";
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

import {
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
} from "@/theme";

const WORDMARK = require("../../assets/sami-wordmark.png");

/**
 * Detect an expired, revoked or invalid Runner session.
 */
function isRunnerSessionExpired(cause: unknown): boolean {
  const message =
    cause instanceof Error
      ? cause.message
      : String(cause ?? "");

  return /HTTP 401|session has expired|sign in again|sign in to continue|no valid runner session|unauthorized/i.test(
    message,
  );
}

/**
 * Session expiry and explicit logout use the same navigation path.
 * The root launch route plays the launch animation before opening Login.
 */
function returnToLaunchForLogin(): void {
  router.dismissAll();

  router.replace({
    pathname: "/",
    params: { signedOut: "1" },
  });
}

type DocumentCard = {
  key: string;
  title: string;
  requirements: RunnerDocumentRequirement[];
};

type DocumentProgress = {
  status:
    | "required"
    | "partial"
    | "completed"
    | "pending_review"
    | "approved"
    | "resubmit";
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

  const others = mandatory.filter(
    (item) => !nationalIdKeys.has(item.key),
  );

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
    current.every(
      (document) => document?.reviewStatus === "approved",
    );

  const allSatisfied =
    current.length > 0 &&
    current.every(isSatisfied);

  if (rejected) {
    return {
      status: "resubmit",
      label: "Resubmit",
      completed,
      total: current.length,
    };
  }

  if (allApproved) {
    return {
      status: "approved",
      label: "Approved",
      completed,
      total: current.length,
    };
  }

  if (allSatisfied) {
    return {
      status: "pending_review",
      label: "Under review",
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

  if (key.startsWith("identity_national_id")) {
    return "card-outline";
  }

  if (type === "profile_photo") return "person-circle-outline";
  if (type === "driving_licence") return "id-card-outline";
  if (type === "vehicle_registration") return "car-outline";

  if (type === "motor_vehicle_insurance") {
    return "shield-checkmark-outline";
  }

  if (type === "vehicle_authorisation") {
    return "document-lock-outline";
  }

  if (
    type === "police_clearance" ||
    key.includes("good_conduct")
  ) {
    return "shield-checkmark-outline";
  }

  if (type === "kra_pin" || key.includes("kra_pin")) {
    return "document-text-outline";
  }

  if (type === "food_handling_certificate") {
    return "restaurant-outline";
  }

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

    case "pending_review":
      return colors.warning;

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

  return labels.length > 0
    ? labels.join(" · ")
    : "Not selected";
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
    const document = latestDocument(
      documents,
      requirement.key,
    );

    if (!document || !isResubmissionRequired(document)) {
      continue;
    }

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

    // A replacement upload creates a new document record.
    // Older rejection history is no longer outstanding.
    return (
      !current ||
      current.id === review.documentId ||
      isResubmissionRequired(current)
    );
  });
}

function allRequiredDocumentsSatisfied(
  data: RunnerOnboardingData,
): boolean {
  const required = data.requirements.filter(
    (item) => item.required,
  );

  return (
    required.length > 0 &&
    required.every((requirement) =>
      isSatisfied(
        latestDocument(data.documents, requirement.key),
      ),
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
    data.complianceStatus === "pending_review" ||
    data.onboardingStatus === "pending_review" ||
    status === "submitted";

  const isApproved = data.nextStep === "dashboard";
  const isRestricted = data.nextStep === "restricted";

  if (isAwaitingReview || isApproved || isRestricted) {
    return false;
  }

  const isInitialSetup =
    data.onboardingStatus === "incomplete";

  const isResubmission =
    data.onboardingStatus === "changes_required" ||
    status === "rejected";

  if (!isInitialSetup && !isResubmission) return false;

  if (isResubmission) {
    if (
      !feedback ||
      feedback.applicationReview?.decision === "rejected"
    ) {
      return false;
    }

    if (hasUnresolvedDocumentReview(data, feedback)) {
      return false;
    }
  }

  return true;
}

export default function RunnerDocumentsScreen() {
 const {
  colors,
  showOverlay,
} = useRunnerTheme();

const supportingText = colors.textMuted;
const actionBlue = colors.blue;

  const [data, setData] =
    useState<RunnerOnboardingData | null>(null);

  const [feedback, setFeedback] =
    useState<RunnerReviewFeedback | null>(null);

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
      return {
        completed: 0,
        total: 0,
        remaining: 0,
      };
    }

    const completed = cards.filter((card) => {
      const state = getDocumentProgress(
        card,
        data.documents,
      ).status;

      return (
        state === "completed" ||
        state === "pending_review" ||
        state === "approved"
      );
    }).length;

    return {
      completed,
      total: cards.length,
      remaining: Math.max(0, cards.length - completed),
    };
  }, [cards, data]);

  /* =========================================================
     LOAD SERVER-OWNED ONBOARDING AND COMPLIANCE STATE
  ========================================================= */

  const loadDocuments = useCallback(async () => {
    if (loadInFlightRef.current) return;

    loadInFlightRef.current = true;

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }

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

      // Tasks must be completed before the document checklist.
      if (result.nextStep === "tasks") {
        router.replace("/(auth)/tasks");
        return;
      }

      // Approval is determined by the compliance resolver,
      // not by verification_status alone.
      if (result.nextStep === "dashboard") {
        router.replace("/(app)");
        return;
      }

      let reviewResult: RunnerReviewFeedback | null = null;

      try {
        reviewResult = await getRunnerReviewFeedback();
      } catch (cause) {
        if (!mountedRef.current) return;

        // A review-feedback 401 is a session failure too.
        // Throw it into the outer catch so it uses the same
        // launch-animation-to-login path.
        if (isRunnerSessionExpired(cause)) {
          throw cause;
        }

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
            const document = latestDocument(
              result.documents,
              item.key,
            );

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

            if (refreshed.nextStep === "dashboard") {
              router.replace("/(app)");
              return;
            }

            if (refreshed.nextStep === "tasks") {
              router.replace("/(auth)/tasks");
              return;
            }

            setData(refreshed);
          } catch (cause) {
            attemptedSubmissionRef.current = "";

            // Automatic submission and the follow-up onboarding
            // refresh are protected requests. A 401 must use the
            // central session-expiry navigation, not an error overlay.
            if (isRunnerSessionExpired(cause)) {
              throw cause;
            }

            if (mountedRef.current) {
              const message =
                cause instanceof Error
                  ? cause.message
                  : "Your application could not be sent for review. Please try again.";

              setAutoSubmitError(message);

              showOverlay({
                type: "error",
                title: "Application not submitted",
                message:
                  cause instanceof Error
                    ? cause.message
                    : "Your documents are saved, but the application could not be sent for review.",
                primaryAction: {
                  label: "Got it",
                },
              });
            }
          } finally {
            submitInFlightRef.current = false;
          }
        }
      }
    } catch (cause) {
      if (!mountedRef.current) return;

      // Do not show the generic Documents error for an expired session.
      // Return through the root launch screen and open Login afterwards.
      if (isRunnerSessionExpired(cause)) {
        returnToLaunchForLogin();
        return;
      }

      const message =
        cause instanceof Error
          ? cause.message
          : "Your document requirements could not be loaded.";

      setLoadError(message);

      showOverlay({
        type: "error",
        title: "Documents unavailable",
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
  }, [showOverlay]);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void loadDocuments();
    }, [loadDocuments]),
  );

  /* =========================================================
     DOCUMENTS SCREEN BACK BEHAVIOUR

     Android Back exits the app without clearing the session.
     Opening an individual document removes this listener while
     that detail screen is focused, so Back returns here.
  ========================================================= */

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          BackHandler.exitApp();
          return true;
        },
      );

      return () => subscription.remove();
    }, []),
  );

  /* =========================================================
     RUNNER AND COMPLIANCE STATE
  ========================================================= */

  const runner = data?.runner as RunnerSummary | undefined;

  const categories = runner?.selectedCategories ?? [];
  const serviceArea =
    runner?.serviceArea?.trim() || "Not provided";

  const currentVehicle = vehicleLabel(runner?.vehicleType);
  const model = runner?.vehicleModel?.trim();
  const registration = runner?.vehicleRegistration?.trim();

  // The compliance resolver is authoritative.
  const isApproved = data?.nextStep === "dashboard";

  const isPendingReview = Boolean(
    data &&
      (
        data.complianceStatus === "pending_review" ||
        data.runner.verificationStatus === "submitted"
      ) &&
      data.nextStep === "documents",
  );

  const isRestricted = data?.nextStep === "restricted";

  const isSessionExpired =
    /HTTP 401|session has expired|sign in to continue|sign in again|no valid runner session|unauthorized/i.test(
      loadError,
    );

  // Pending documents can be opened for replacement.
  // Approved documents remain read-only.
  const canUpload = Boolean(
    data &&
      data.nextStep === "documents" &&
      !isApproved &&
      !isRestricted &&
      !isSessionExpired &&
      !loadError,
  );

  // Runners can revise their service and transport selections
  // from Documents, including while Operations is reviewing.
  // The backend will restart compliance when a saved choice changes.
  const canChangeSetup = Boolean(
    data &&
      data.nextStep === "documents" &&
      !isRestricted &&
      !isSessionExpired &&
      !loadError,
  );

  function changeSetup() {
    if (!canChangeSetup || !data) return;

    router.push({
      pathname: "/(auth)/tasks",
      params: {
        edit: "true",
      },
    });
  }

  /* =========================================================
     REFRESH WHILE OPERATIONS REVIEWS THE APPLICATION

     The checklist stays open and refreshes its state.
     A replacement document should appear as the newest version.
  ========================================================= */

  useEffect(() => {
    if (
      !isPendingReview ||
      isApproved ||
      isRestricted ||
      isSessionExpired
    ) {
      return;
    }

    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        void loadDocuments();
      }
    }, 10000);

    const subscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          void loadDocuments();
        }
      },
    );

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
      const status = getDocumentProgress(
        card,
        data.documents,
      ).status;

      return (
        status === "required" ||
        status === "partial" ||
        status === "resubmit"
      );
    });

    return next?.key ?? "";
  }, [cards, data]);

  function showHelp() {
    showOverlay({
      type: "info",
      title: "SaMi Runner Help",
      message:
        "Upload each required document using its row. Documents marked Under review have been received by SaMi Operations. You can replace a file if you uploaded the wrong document. You can also change your selected service or vehicle. Changing these choices may update your document checklist and restart the application review.",
      primaryAction: {
        label: "Got it",
      },
    });
  }

  function openDocument(card: DocumentCard) {
    if (!canUpload || !data) return;

    const status = getDocumentProgress(
      card,
      data.documents,
    ).status;

    // Approved documents are never replaceable.
    if (status === "approved") return;

    router.push({
      pathname: "/(auth)/document/[key]",
      params: {
        key: card.key,
      },
    });
  }

  const hasResubmissions = Boolean(
    cards.some(
      (card) =>
        getDocumentProgress(
          card,
          data?.documents ?? [],
        ).status === "resubmit",
    ),
  );

  const applicationReviewRejected =
    feedback?.applicationReview?.decision === "rejected";

  const titleInstruction = isRestricted
    ? "Your account is restricted. Contact SaMi Operations for assistance."
    : isApproved
      ? "Your Runner account has been approved."
      : isPendingReview
        ? "Your documents are with SaMi Operations. You can replace a file or change your service and vehicle choices."
        : hasResubmissions || applicationReviewRejected
          ? "Some information needs your attention. Resubmit the requested documents below."
          : progress.remaining > 0
            ? `Complete ${progress.remaining} more ${progress.remaining === 1 ? "step" : "steps"} to start earning.`
            : "Your documents have been received. SaMi Operations will review them.";

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

          {/* Editable earning setup summary */}
          <View style={styles.signingUpBlock}>
            <Text
              style={[
                styles.eyebrow,
                { color: supportingText },
              ]}
            >
              YOUR EARNING SETUP
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
                accessibilityState={{
                  expanded: expandedSetup,
                }}
                onPress={() =>
                  setExpandedSetup((value) => !value)
                }
                style={({ pressed }) => [
                  styles.setupSummaryTrigger,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={styles.setupSummaryText}>
                  <Text
                    style={[
                      styles.setupPrimary,
                      { color: colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {serviceArea} · {serviceLabel(categories)}
                  </Text>

                  <Text
                    style={[
                      styles.setupSecondary,
                      { color: supportingText },
                    ]}
                    numberOfLines={1}
                  >
                    {currentVehicle}
                    {model ? ` · ${model}` : ""}
                    {registration ? ` · ${registration}` : ""}
                  </Text>
                </View>

                <Ionicons
                  name={
                    expandedSetup
                      ? "chevron-up"
                      : "chevron-down"
                  }
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
                    <Text
                      style={[
                        styles.setupDetailLabel,
                        { color: supportingText },
                      ]}
                    >
                      Service area
                    </Text>

                    <Text
                      style={[
                        styles.setupDetailValue,
                        { color: colors.text },
                      ]}
                    >
                      {serviceArea}
                    </Text>
                  </View>

                  <View style={styles.setupDetailRow}>
                    <Text
                      style={[
                        styles.setupDetailLabel,
                        { color: supportingText },
                      ]}
                    >
                      Service
                    </Text>

                    <Text
                      style={[
                        styles.setupDetailValue,
                        { color: colors.text },
                      ]}
                    >
                      {serviceLabel(categories)}
                    </Text>
                  </View>

                  <View style={styles.setupDetailRow}>
                    <Text
                      style={[
                        styles.setupDetailLabel,
                        { color: supportingText },
                      ]}
                    >
                      Vehicle
                    </Text>

                    <Text
                      style={[
                        styles.setupDetailValue,
                        { color: colors.text },
                      ]}
                    >
                      {currentVehicle}
                    </Text>
                  </View>

                  {model ? (
                    <View style={styles.setupDetailRow}>
                      <Text
                        style={[
                          styles.setupDetailLabel,
                          { color: supportingText },
                        ]}
                      >
                        Model
                      </Text>

                      <Text
                        style={[
                          styles.setupDetailValue,
                          { color: colors.text },
                        ]}
                      >
                        {model}
                      </Text>
                    </View>
                  ) : null}

                  {registration ? (
                    <View style={styles.setupDetailRow}>
                      <Text
                        style={[
                          styles.setupDetailLabel,
                          { color: supportingText },
                        ]}
                      >
                        Registration
                      </Text>

                      <Text
                        style={[
                          styles.setupDetailValue,
                          { color: colors.text },
                        ]}
                      >
                        {registration}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            {canChangeSetup ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change selected service or vehicle"
                onPress={changeSetup}
                style={({ pressed }) => [
                  styles.changeSetupButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.changeSetupIcon,
                    { backgroundColor: colors.blueSoft },
                  ]}
                >
                  <Ionicons
                    name="options-outline"
                    size={18}
                    color={actionBlue}
                  />
                </View>

                <View style={styles.changeSetupCopy}>
                  <Text
                    style={[
                      styles.changeSetupTitle,
                      { color: actionBlue },
                    ]}
                  >
                    Change service or vehicle
                  </Text>

                  <Text
                    style={[
                      styles.changeSetupHint,
                      { color: supportingText },
                    ]}
                  >
                    Update your earning option and transport details
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={19}
                  color={colors.textMuted}
                />
              </Pressable>
            ) : null}

            {canChangeSetup && isPendingReview ? (
              <Text
                style={[
                  styles.changeSetupWarning,
                  { color: supportingText },
                ]}
              >
                Changing these choices will restart your application
                review and may require additional documents.
              </Text>
            ) : null}
          </View>

          {/* Welcome and onboarding progress */}
          <View style={styles.intro}>
            <Text
              style={[
                styles.title,
                { color: colors.text },
              ]}
            >
              Welcome, {firstName(runner?.fullName)}
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: supportingText },
              ]}
            >
              {loading
                ? "Loading your document checklist…"
                : titleInstruction}
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
                  const status = getDocumentProgress(
                    card,
                    data.documents,
                  ).status;

                  const filled =
                    status === "completed" ||
                    status === "pending_review" ||
                    status === "approved";

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
              <ActivityIndicator
                size="small"
                color={actionBlue}
              />

              <Text
                style={[
                  styles.loadingText,
                  { color: supportingText },
                ]}
              >
                Loading required documents…
              </Text>
            </View>
          ) : loadError && !data ? (
            <View style={styles.loadError}>
              <Text
                style={[
                  styles.errorText,
                  { color: colors.red },
                ]}
              >
                {loadError}
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => void loadDocuments()}
                style={({ pressed }) => [
                  styles.retryButton,
                  {
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.retryText,
                    { color: actionBlue },
                  ]}
                >
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : data ? (
            <View
              style={[
                styles.documentList,
                { borderTopColor: colors.border },
              ]}
            >
              {cards.map((card) => {
                const progressState = getDocumentProgress(
                  card,
                  data.documents,
                );

                const review = getLatestReviewForCard(
                  card,
                  data.documents,
                  feedback,
                );

                const statusTextColor = statusColor(
                  progressState.status,
                  colors,
                );

                const isFirstIncomplete =
                  firstIncompleteKey === card.key;

                const canOpen =
                  canUpload &&
                  progressState.status !== "approved";

                const hint =
                  progressState.status === "resubmit"
                    ? review?.reason ||
                      "SaMi Operations requested a replacement. Tap to upload a new document."
                    : progressState.status === "pending_review"
                      ? "Received by SaMi. You can replace this file if needed."
                      : progressState.status === "required" &&
                          isFirstIncomplete
                        ? "Recommended next step"
                        : progressState.status === "partial"
                          ? "Complete the remaining side"
                          : progressState.status === "completed"
                            ? "Received"
                            : progressState.status === "approved"
                              ? "Verified by SaMi Operations"
                              : "Required";

                return (
                  <Pressable
                    key={card.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${card.title}. ${progressState.label}`}
                    accessibilityHint={
                      canOpen
                        ? "Opens the document screen to upload or replace this document"
                        : "This document cannot be changed at this time"
                    }
                    accessibilityState={{
                      disabled: !canOpen,
                    }}
                    disabled={!canOpen}
                    onPress={() => openDocument(card)}
                    style={({ pressed }) => [
                      styles.documentRow,
                      {
                        borderBottomColor: colors.border,
                        opacity:
                          pressed && canOpen ? 0.72 : 1,
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
                            : progressState.status === "approved"
                              ? colors.success
                              : actionBlue
                        }
                      />
                    </View>

                    <View style={styles.documentCopy}>
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
                          styles.documentHint,
                          { color: statusTextColor },
                        ]}
                        numberOfLines={3}
                      >
                        {hint}
                      </Text>
                    </View>

                    <View style={styles.documentRight}>
                      <Text
                        style={[
                          styles.documentStatus,
                          { color: statusTextColor },
                        ]}
                      >
                        {progressState.label}
                      </Text>

                      {canOpen ? (
                        <Ionicons
                          name="chevron-forward"
                          size={19}
                          color={colors.textMuted}
                        />
                      ) : (
                        <Ionicons
                          name={
                            progressState.status === "approved"
                              ? "checkmark-circle"
                              : "lock-closed-outline"
                          }
                          size={17}
                          color={
                            progressState.status === "approved"
                              ? colors.success
                              : colors.textMuted
                          }
                        />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {feedbackError ? (
            <Text
              style={[
                styles.feedbackHint,
                { color: supportingText },
              ]}
            >
              Operations review comments could not be refreshed.
              Document upload status is still shown above.
            </Text>
          ) : null}

          {autoSubmitError ? (
            <Text
              style={[
                styles.feedbackHint,
                { color: colors.red },
              ]}
            >
              {autoSubmitError}
            </Text>
          ) : null}

          {applicationReviewRejected && feedback?.applicationReview ? (
            <View
              style={[
                styles.applicationFeedback,
                { borderColor: colors.red },
              ]}
            >
              <Text
                style={[
                  styles.applicationFeedbackTitle,
                  { color: colors.red },
                ]}
              >
                Application returned
              </Text>

              <Text
                style={[
                  styles.applicationFeedbackText,
                  { color: colors.text },
                ]}
              >
                {feedback.applicationReview.reason ||
                  "SaMi Operations has returned your application for correction."}
              </Text>
            </View>
          ) : null}

          {isPendingReview ? (
            <View
              style={[
                styles.reviewNotice,
                { backgroundColor: colors.warningSoft },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={19}
                color={colors.warning}
              />

              <Text
                style={[
                  styles.reviewNoticeText,
                  { color: colors.text },
                ]}
              >
                Your application is under review. You may replace a
                document if you uploaded the wrong file, or change
                your service and vehicle choices. Changing those
                choices will restart the review process.
              </Text>
            </View>
          ) : isApproved ? (
            <Text
              style={[
                styles.footerNote,
                { color: colors.success },
              ]}
            >
              Your Runner account is approved.
            </Text>
          ) : isRestricted ? (
            <View
              style={[
                styles.reviewNotice,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={19}
                color={colors.red}
              />

              <Text
                style={[
                  styles.reviewNoticeText,
                  { color: colors.text },
                ]}
              >
                This account is restricted. Document changes are
                unavailable. Contact SaMi Operations for assistance.
              </Text>
            </View>
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
    paddingHorizontal: runnerSpacing.lg,
    paddingTop: runnerSpacing.md,
    paddingBottom: runnerSpacing.xxxl,
  },

  header: {
    minHeight: runnerTouchTargets.minimum,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: runnerSpacing.xl,
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

  signingUpBlock: {
    gap: runnerSpacing.sm,
    marginBottom: runnerSpacing.xl,
  },

  eyebrow: {
    fontSize: runnerTypography.caption,
    fontWeight: "800",
    letterSpacing: 0.9,
  },

  setupSummary: {
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    overflow: "hidden",
  },

  setupSummaryTrigger: {
    minHeight: runnerTouchTargets.comfortable,
    paddingHorizontal: runnerSpacing.md,
    paddingVertical: runnerSpacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.sm,
  },

  setupSummaryText: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  setupPrimary: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "800",
    lineHeight: 21,
  },

  setupSecondary: {
    fontSize: runnerTypography.caption,
    lineHeight: 19,
  },

  setupDetails: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: runnerSpacing.md,
    paddingTop: runnerSpacing.md,
    paddingBottom: runnerSpacing.md,
    gap: runnerSpacing.sm,
  },

  setupDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: runnerSpacing.md,
  },

  setupDetailLabel: {
    fontSize: runnerTypography.caption,
  },

  setupDetailValue: {
    flex: 1,
    textAlign: "right",
    fontSize: runnerTypography.caption,
    fontWeight: "700",
  },

  changeSetupButton: {
    minHeight: runnerTouchTargets.comfortable,
    borderWidth: 1,
    borderRadius: runnerRadii.md,
    paddingHorizontal: runnerSpacing.md,
    paddingVertical: runnerSpacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
  },

  changeSetupIcon: {
    width: 42,
    height: 42,
    borderRadius: runnerRadii.sm,
    alignItems: "center",
    justifyContent: "center",
  },

  changeSetupCopy: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  changeSetupTitle: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "800",
  },

  changeSetupHint: {
    fontSize: runnerTypography.caption,
    lineHeight: 19,
  },

  changeSetupWarning: {
    fontSize: runnerTypography.caption,
    lineHeight: 20,
    marginTop: runnerSpacing.xxs,
  },

  intro: {
    gap: runnerSpacing.md,
    marginBottom: runnerSpacing.xl,
  },

  title: {
    fontSize: runnerTypography.heading,
    lineHeight: 35,
    fontWeight: "800",
    letterSpacing: -0.5,
  },

  subtitle: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 23,
  },

  progressSegments: {
    flexDirection: "row",
    gap: runnerSpacing.xs,
    marginTop: runnerSpacing.xs,
  },

  progressSegment: {
    flex: 1,
    height: 8,
    borderRadius: runnerRadii.pill,
  },

  documentList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  documentRow: {
    minHeight: 84,
    paddingVertical: runnerSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  documentIconWrap: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
  },

  documentCopy: {
    flex: 1,
    gap: runnerSpacing.xs,
  },

  documentTitle: {
    fontSize: runnerTypography.body,
    lineHeight: 23,
    fontWeight: "700",
  },

  documentHint: {
    fontSize: runnerTypography.caption,
    lineHeight: 20,
  },

  documentRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: runnerSpacing.xs,
    maxWidth: 120,
  },

  documentStatus: {
    fontSize: runnerTypography.caption,
    lineHeight: 19,
    fontWeight: "800",
    textAlign: "right",
  },

  loadingState: {
    minHeight: 120,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.md,
  },

  loadingText: {
    fontSize: runnerTypography.bodySmall,
  },

  loadError: {
    paddingVertical: runnerSpacing.lg,
    gap: runnerSpacing.md,
  },

  errorText: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 23,
  },

  retryButton: {
    alignSelf: "flex-start",
    minHeight: runnerTouchTargets.minimum,
    justifyContent: "center",
    paddingVertical: runnerSpacing.sm,
    paddingRight: runnerSpacing.md,
  },

  retryText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "800",
  },

  feedbackHint: {
    marginTop: runnerSpacing.md,
    fontSize: runnerTypography.caption,
    lineHeight: 20,
  },

  applicationFeedback: {
    marginTop: runnerSpacing.lg,
    borderLeftWidth: 3,
    paddingLeft: runnerSpacing.md,
    gap: runnerSpacing.sm,
  },

  applicationFeedbackTitle: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "800",
  },

  applicationFeedbackText: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 22,
  },

  reviewNotice: {
    marginTop: runnerSpacing.xl,
    borderRadius: runnerRadii.lg,
    padding: runnerSpacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: runnerSpacing.md,
  },

  reviewNoticeText: {
    flex: 1,
    fontSize: runnerTypography.bodySmall,
    lineHeight: 23,
    fontWeight: "600",
  },

  footerNote: {
    marginTop: runnerSpacing.xl,
    textAlign: "center",
    fontSize: runnerTypography.bodySmall,
    lineHeight: 22,
  },
});