import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  StatusBar,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  getRunnerOnboarding,
  submitRunnerOnboarding,
} from "@/api";
import type {
  RunnerDocumentRequirement,
  RunnerOnboardingData,
  RunnerUploadedDocument,
} from "@/api";
import { useRunnerTheme } from "@/theme";

type ThemeColors = ReturnType<typeof useRunnerTheme>["colors"];
type IoniconName = keyof typeof Ionicons.glyphMap;

type ReviewDocumentRow = {
  key: string;
  title: string;
  detail: string;
  status: "complete" | "missing" | "rejected";
  required: boolean;
};

const BACK_SIZE = 44;

const CATEGORY_LABELS: Record<string, string> = {
  pickup_deliver: "Pick Up & Deliver",
  shop_deliver: "Shop & Deliver",
};

const SUPPORTED_SERVICE_KEYS = new Set(Object.keys(CATEGORY_LABELS));
const SUPPORTED_VEHICLE_TYPES = new Set([
  "bike",
  "motorbike",
  "vehicle",
  // Legacy values are accepted only for compatibility with existing records.
  "bicycle",
  "motorcycle",
  "car",
  "van",
  "other",
]);

const NATIONAL_ID_FRONT_KEY = "identity_national_id_front";
const NATIONAL_ID_BACK_KEY = "identity_national_id_back";

const VEHICLE_LABELS: Record<string, string> = {
  bike: "Bike",
  motorbike: "Motorbike",
  vehicle: "Vehicle",
  // Legacy database values remain readable while stored records are migrated.
  bicycle: "Bike",
  motorcycle: "Motorbike",
  car: "Vehicle",
  van: "Vehicle",
  other: "Vehicle",
};

function getLatestDocument(
  documents: RunnerUploadedDocument[],
  requirementKey: string,
) {
  // The onboarding API returns documents newest first.
  return documents.find(
    (document) => document.requirementKey === requirementKey,
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

function isDocumentChangesRequested(
  document: RunnerUploadedDocument | undefined,
) {
  return (
    document?.reviewStatus === "rejected" ||
    document?.reviewStatus === "resubmission_required"
  );
}

function getDocumentState(
  document: RunnerUploadedDocument | undefined,
): ReviewDocumentRow["status"] {
  if (isDocumentSatisfied(document)) return "complete";
  if (isDocumentChangesRequested(document)) return "rejected";
  return "missing";
}

function getDocumentStateLabel(
  status: ReviewDocumentRow["status"],
) {
  switch (status) {
    case "complete":
      return "Submitted";
    case "rejected":
      return "Needs replacement";
    default:
      return "Not uploaded";
  }
}

function buildDocumentRows(
  requirements: RunnerDocumentRequirement[],
  documents: RunnerUploadedDocument[],
): ReviewDocumentRow[] {
  const required = requirements.filter((item) => item.required === true);

  const frontRequirement = required.find(
    (item) => item.key === NATIONAL_ID_FRONT_KEY,
  );
  const backRequirement = required.find(
    (item) => item.key === NATIONAL_ID_BACK_KEY,
  );

  const rows: ReviewDocumentRow[] = [];

  if (frontRequirement || backRequirement) {
    const frontDocument = getLatestDocument(
      documents,
      NATIONAL_ID_FRONT_KEY,
    );
    const backDocument = getLatestDocument(
      documents,
      NATIONAL_ID_BACK_KEY,
    );

    const frontState = getDocumentState(frontDocument);
    const backState = getDocumentState(backDocument);

    const groupStatus =
      frontState === "complete" && backState === "complete"
        ? "complete"
        : frontState === "rejected" || backState === "rejected"
          ? "rejected"
          : "missing";

    const frontDetail =
      frontState === "rejected"
        ? frontDocument?.rejectionReason || "Replacement required"
        : getDocumentStateLabel(frontState);

    const backDetail =
      backState === "rejected"
        ? backDocument?.rejectionReason || "Replacement required"
        : getDocumentStateLabel(backState);

    rows.push({
      key: "national_identity",
      title: "National ID",
      detail: `Front: ${frontDetail} · Back: ${backDetail}`,
      status: groupStatus,
      required: true,
    });
  }

  for (const requirement of required) {
    if (
      requirement.key === NATIONAL_ID_FRONT_KEY ||
      requirement.key === NATIONAL_ID_BACK_KEY
    ) {
      continue;
    }

    const document = getLatestDocument(documents, requirement.key);
    const documentState = getDocumentState(document);

    rows.push({
      key: requirement.key,
      title: requirement.title,
      detail:
        documentState === "rejected"
          ? document?.rejectionReason ||
            "Please upload this document again."
          : getDocumentStateLabel(documentState),
      status: documentState,
      required: true,
    });
  }

  return rows;
}

function SectionHeading({
  title,
  icon,
  action,
  onAction,
  disabled,
  colors,
}: {
  title: string;
  icon?: IoniconName;
  action?: string;
  onAction?: () => void;
  disabled?: boolean;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingLeft}>
        {icon ? (
          <View
            style={[
              styles.sectionIconWrap,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <Ionicons name={icon} size={15} color={colors.blue} />
          </View>
        ) : null}

        <Text
          style={[styles.sectionTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          disabled={disabled}
          hitSlop={8}
          onPress={onAction}
          style={({ pressed }) => ({
            opacity: pressed ? 0.55 : disabled ? 0.5 : 1,
            paddingVertical: 4,
            paddingHorizontal: 4,
          })}
        >
          <Text style={[styles.editText, { color: colors.blue }]}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function DetailRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
        {label}
      </Text>
      <Text
        style={[styles.detailValue, { color: colors.text }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function DocumentStatus({
  status,
  colors,
}: {
  status: ReviewDocumentRow["status"];
  colors: ThemeColors;
}) {
  const background =
    status === "complete"
      ? colors.successSoft
      : status === "rejected"
        ? colors.dangerSoft
        : colors.paper;

  const foreground =
    status === "complete"
      ? colors.success
      : status === "rejected"
        ? colors.red
        : colors.textMuted;

  const icon: IoniconName =
    status === "complete"
      ? "checkmark-circle"
      : status === "rejected"
        ? "alert-circle"
        : "ellipse-outline";

  return (
    <View
      accessibilityLabel={getDocumentStateLabel(status)}
      style={[styles.statusPill, { backgroundColor: background }]}
    >
      <Ionicons name={icon} size={12} color={foreground} />
      <Text style={[styles.statusPillText, { color: foreground }]}>
        {getDocumentStateLabel(status)}
      </Text>
    </View>
  );
}

export default function RunnerApplicationReviewScreen() {
  const router = useRouter();
  const { colors, mode } = useRunnerTheme();

  const isDark = mode === "dark";
  const supportingText = isDark ? "#C1CCDA" : "#526176";
  const brandColor = isDark ? "#F5F7FB" : "#000535";
  const actionBlue = isDark ? "#8AB8F8" : "#1F5EAB";
  const buttonBlue = isDark ? "#1D5DAD" : "#174F9F";

  const [data, setData] = useState<RunnerOnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionComplete, setSubmissionComplete] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Use normal navigation rather than forcing a destination or clearing
  // the history stack. Fall back only when this screen has no back history.
  const goToDocuments = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/documents");
    }
  }, [router]);

  const loadReview = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;

    // Keep previously loaded details visible during a background refresh.
    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await getRunnerOnboarding();

      if (!mountedRef.current) return;

      setData(result);
      hasLoadedOnceRef.current = true;
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Your application details could not be loaded.",
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
      void loadReview();
    }, [loadReview]),
  );

  // Scroll the error banner into view whenever an error appears.
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [error]);

  const runner = data?.runner;

  const categories = useMemo(
    () =>
      (runner?.selectedCategories ?? [])
        .filter((key) => SUPPORTED_SERVICE_KEYS.has(key))
        .map((key) => CATEGORY_LABELS[key]),
    [runner?.selectedCategories],
  );

  const documentRows = useMemo(
    () =>
      data ? buildDocumentRows(data.requirements, data.documents) : [],
    [data],
  );

  const requiredDocumentsComplete =
    documentRows.length > 0 &&
    documentRows.every((item) => item.status === "complete");

  const hasCategories = categories.length > 0;

  const vehicleType = runner?.vehicleType ?? "";
  const serviceArea = runner?.serviceArea?.trim() ?? "";
  const needsRegistration = [
    "motorbike",
    "vehicle",
    // Legacy stored vehicle types retain the correct registration rule.
    "motorcycle",
    "car",
    "van",
    "other",
  ].includes(vehicleType);

  const transportComplete =
    serviceArea.length >= 2 &&
    SUPPORTED_VEHICLE_TYPES.has(vehicleType) &&
    (!needsRegistration || Boolean(runner?.vehicleRegistration?.trim()));

  const isApproved =
    data?.onboardingStatus === "approved" ||
    data?.runner.verificationStatus === "approved";

  const isPendingReview =
    data?.onboardingStatus === "pending_review" ||
    data?.runner.verificationStatus === "submitted";

  const isRestricted =
    data?.runner.accountStatus === "suspended" ||
    data?.runner.accountStatus === "closed";

  const canSubmit =
    Boolean(data) &&
    hasCategories &&
    transportComplete &&
    requiredDocumentsComplete &&
    !loading &&
    !submitting &&
    !submissionComplete &&
    !isPendingReview &&
    !isApproved &&
    !isRestricted;

  const submitApplication = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      await submitRunnerOnboarding();

      if (!mountedRef.current) return;

      // Submission is complete, but do not take control of navigation.
      // The Runner can choose when to open application status.
      setSubmissionComplete(true);

      try {
        const refreshed = await getRunnerOnboarding();
        if (mountedRef.current) {
          setData(refreshed);
        }
      } catch {
        // The submission itself succeeded. Keep the success state visible
        // even if the follow-up refresh temporarily fails.
      }
    } catch (cause) {
      if (!mountedRef.current) return;

      const message =
        cause instanceof Error
          ? cause.message
          : "Your application could not be submitted. Please try again.";

      // Refresh the server snapshot without clearing the submission error.
      try {
        const refreshed = await getRunnerOnboarding();
        if (mountedRef.current) {
          setData(refreshed);
        }
      } catch {
        // Keep the existing review data and show the original submit error.
      }

      if (mountedRef.current) {
        setError(message);
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const completedCount = documentRows.filter(
    (item) => item.status === "complete",
  ).length;
  const missingCount = documentRows.length - completedCount;
  const showSubmittedNotice = submissionComplete || isPendingReview;

  // The first missing thing determines where the "not ready" shortcut goes.
  const blockedShortcut: { label: string; route: string } | null =
    !hasCategories
      ? { label: "Review services", route: "/(auth)/tasks" }
      : !transportComplete
        ? { label: "Review transport", route: "/(auth)/transport" }
        : !requiredDocumentsComplete
          ? { label: "Review documents", route: "/(auth)/documents" }
          : null;

  const blockedMessage = !hasCategories
    ? "Select at least one service."
    : !transportComplete
      ? "Complete your service area and transport details."
      : !requiredDocumentsComplete
        ? documentRows.length === 0
          ? "The server did not return required document requirements. Please refresh the documents checklist."
          : "Submit every required document. Documents marked rejected or needing replacement must be re-uploaded."
        : "";

  if (loading && !data) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.paper }]}
        edges={["top", "bottom"]}
      >
        <View
          style={styles.center}
          accessibilityRole="progressbar"
          accessibilityLabel="Preparing your application review"
        >
          <ActivityIndicator size="large" color={actionBlue} />
          <Text
            style={[styles.loadingText, { color: supportingText }]}
          >
            Preparing your application review…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.paper }]}
        edges={["top", "bottom"]}
      >
        <View style={styles.center}>
          <View
            style={[
              styles.errorIconWrap,
              { backgroundColor: colors.dangerSoft },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={26}
              color={colors.red}
            />
          </View>

          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Review unavailable
          </Text>

          <Text
            style={[styles.bodyText, { color: supportingText }]}
            numberOfLines={4}
          >
            {error ||
              "Your onboarding information could not be loaded."}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => void loadReview()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: buttonBlue },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to documents"
            disabled={submitting}
            hitSlop={8}
            onPress={goToDocuments}
            style={({ pressed }) => [
              styles.secondaryLink,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[styles.secondaryLinkText, { color: actionBlue }]}
            >
              Back to documents
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
      edges={["top", "bottom"]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.paper}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={goToDocuments}
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

        {/* Progress */}
        <View style={styles.progressSection}>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.progressFillFull,
                { backgroundColor: buttonBlue },
              ]}
            />
          </View>

          <View style={styles.progressMeta}>
            <Text
              style={[
                styles.progressLabel,
                { color: supportingText },
              ]}
            >
              {isApproved
                ? "APPLICATION APPROVED"
                : isPendingReview || submissionComplete
                  ? "APPLICATION SUBMITTED"
                  : "FINAL STEP · REVIEW & SUBMIT"}
            </Text>

            <View style={styles.progressDots}>
              <View
                style={[
                  styles.stepDotDone,
                  { backgroundColor: buttonBlue },
                ]}
              />
              <View
                style={[
                  styles.stepDotDone,
                  { backgroundColor: buttonBlue },
                ]}
              />
              <View
                style={[
                  styles.stepDotDone,
                  { backgroundColor: buttonBlue },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Heading */}
        <View style={styles.headingBlock}>
          <Text style={[styles.eyebrow, { color: actionBlue }]}>
            {isApproved
              ? "APPROVED APPLICATION"
              : isPendingReview || submissionComplete
                ? "APPLICATION SUBMITTED"
                : "FINAL STEP"}
          </Text>

          <Text style={[styles.title, { color: colors.text }]}>
            Review your application
          </Text>

          <Text
            style={[styles.bodyText, { color: supportingText }]}
          >
            Check your details before sending your Runner application to
            SaMi Operations for verification.
          </Text>
        </View>

        {/* Document progress card */}
        {documentRows.length > 0 ? (
          <View
            style={[
              styles.progressCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.progressHeader}>
              <Text
                style={[styles.progressTitle, { color: colors.text }]}
              >
                Required documents
              </Text>
              <Text
                style={[styles.progressCount, { color: colors.text }]}
              >
                {completedCount}/{documentRows.length}
              </Text>
            </View>

            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Required documents"
              accessibilityValue={{
                min: 0,
                max: documentRows.length,
                now: completedCount,
              }}
              style={[
                styles.progressCardTrack,
                { backgroundColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.progressCardFill,
                  {
                    width: `${
                      documentRows.length
                        ? (completedCount / documentRows.length) * 100
                        : 0
                    }%`,
                    backgroundColor: colors.success,
                  },
                ]}
              />
            </View>

            <Text
              style={[
                styles.progressDescription,
                { color: supportingText },
              ]}
            >
              {missingCount === 0
                ? "All required documents have been submitted."
                : `${missingCount} required document item${missingCount === 1 ? "" : "s"} still need attention.`}
            </Text>
          </View>
        ) : null}

        {/* Personal details */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <SectionHeading
            title="Personal details"
            icon="person-circle-outline"
            colors={colors}
          />

          <DetailRow
            label="Full name"
            value={runner?.fullName || "Not provided"}
            colors={colors}
          />

          <DetailRow
            label="Email"
            value={runner?.email || "Not provided"}
            colors={colors}
          />
        </View>

        {/* Selected services */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <SectionHeading
            title="Services you selected"
            icon="layers-outline"
            action="Edit"
            onAction={() => router.push("/(auth)/tasks")}
            disabled={
              submitting || isPendingReview || isApproved || submissionComplete
            }
            colors={colors}
          />

          {categories.length > 0 ? (
            <View style={styles.chipContainer}>
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
                      { color: actionBlue },
                    ]}
                  >
                    {category}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.inlineError, { color: colors.red }]}>
              No services have been selected.
            </Text>
          )}
        </View>

        {/* Transport */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <SectionHeading
            title="Transport and service area"
            icon="navigate-outline"
            action="Edit"
            onAction={() => router.push("/(auth)/transport")}
            disabled={
              submitting || isPendingReview || isApproved || submissionComplete
            }
            colors={colors}
          />

          <DetailRow
            label="Main service area"
            value={runner?.serviceArea || "Not provided"}
            colors={colors}
          />

          <DetailRow
            label="Transport"
            value={
              (VEHICLE_LABELS[vehicleType] ?? vehicleType) ||
              "Not selected"
            }
            colors={colors}
          />

          {needsRegistration ? (
            <DetailRow
              label="Vehicle registration"
              value={runner?.vehicleRegistration || "Not provided"}
              colors={colors}
            />
          ) : null}

          {!transportComplete ? (
            <Text
              style={[styles.inlineWarning, { color: colors.red }]}
            >
              Complete your transport details before submitting.
            </Text>
          ) : null}
        </View>

        {/* Documents */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <SectionHeading
            title="Required documents"
            icon="document-text-outline"
            action="View checklist"
            onAction={() => router.push("/(auth)/documents")}
            disabled={submitting}
            colors={colors}
          />

          {documentRows.length > 0 ? (
            <View style={styles.documentList}>
              {documentRows.map((item, index) => (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.detail}. ${getDocumentStateLabel(item.status)}`}
                  accessibilityHint="Opens this document's upload screen"
                  disabled={submitting}
                  onPress={() =>
                    router.push({
                      pathname: "/(auth)/document/[key]",
                      params: { key: item.key },
                    })
                  }
                  style={({ pressed }) => [
                    styles.documentRow,
                    {
                      borderBottomColor:
                        index === documentRows.length - 1
                          ? "transparent"
                          : colors.border,
                      opacity: pressed ? 0.75 : submitting ? 0.5 : 1,
                    },
                  ]}
                >
                  <View style={styles.documentInformation}>
                    <Text
                      style={[
                        styles.documentTitle,
                        { color: colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[
                        styles.documentDetail,
                        {
                          color:
                            item.status === "rejected"
                              ? colors.red
                              : colors.textMuted,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {item.detail}
                    </Text>
                  </View>

                  <View style={styles.documentRight}>
                    <DocumentStatus
                      status={item.status}
                      colors={colors}
                    />
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={supportingText}
                    />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={[styles.inlineError, { color: colors.red }]}>
              The server did not return any required document
              requirements. Please return to the checklist and refresh
              it.
            </Text>
          )}

        </View>

        {/* What happens next */}
        <View
          style={[
            styles.reviewNotice,
            { backgroundColor: colors.blueSoft },
          ]}
        >
          <Text style={[styles.noticeTitle, { color: colors.text }]}>
            What happens next?
          </Text>
          <Text
            style={[styles.noticeText, { color: supportingText }]}
          >
            After you submit, SaMi Operations will review your application
            and documents. Runner service access remains unavailable until
            your application is approved.
          </Text>
        </View>

        {/* Error banner */}
        {error ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[
              styles.errorCard,
              { backgroundColor: colors.dangerSoft },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={18}
              color={colors.red}
            />
            <Text style={[styles.errorText, { color: colors.red }]}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Blocked card */}
        {!canSubmit &&
        !isPendingReview &&
        !isApproved &&
        !isRestricted &&
        !submissionComplete &&
        blockedShortcut ? (
          <View
            style={[
              styles.blockedCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[styles.blockedTitle, { color: colors.text }]}
            >
              Application not ready
            </Text>

            <Text
              style={[styles.bodyText, { color: supportingText }]}
            >
              {blockedMessage}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={blockedShortcut.label}
              disabled={submitting}
              onPress={() =>
                router.push(blockedShortcut.route as never)
              }
              style={({ pressed }) => [
                styles.secondaryAction,
                {
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : submitting ? 0.5 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.secondaryActionText,
                  { color: actionBlue },
                ]}
              >
                {blockedShortcut.label}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Restricted account notice */}
        {isRestricted ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.successCard,
              { backgroundColor: colors.dangerSoft },
            ]}
          >
            <Ionicons
              name="lock-closed-outline"
              size={21}
              color={colors.red}
            />
            <View style={styles.successCopy}>
              <Text style={[styles.successTitle, { color: colors.text }]}>
                Application actions are restricted
              </Text>
              <Text style={[styles.successBody, { color: supportingText }]}>
                This Runner account cannot submit or change its application at the moment. Contact SaMi Operations for assistance.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Submission success and status actions */}
        {showSubmittedNotice ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.successCard,
              { backgroundColor: colors.successSoft },
            ]}
          >
            <Ionicons
              name={isApproved ? "checkmark-circle" : "time-outline"}
              size={21}
              color={colors.success}
            />
            <View style={styles.successCopy}>
              <Text style={[styles.successTitle, { color: colors.text }]}>
                {isApproved
                  ? "Your Runner account is approved"
                  : "Your application has been submitted"}
              </Text>
              <Text style={[styles.successBody, { color: supportingText }]}>
                {isApproved
                  ? "Your application has been approved. Open the Runner dashboard whenever you are ready."
                  : "Your application is with SaMi Operations for verification. You can leave this screen and return whenever you need to."}
              </Text>
            </View>
          </View>
        ) : null}

        {isRestricted ? null : isApproved ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(app)")}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: buttonBlue },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Open Runner dashboard</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </Pressable>
        ) : isPendingReview || submissionComplete ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push("/(app)/profile-setup?mode=status")
            }
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: buttonBlue },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>View application status</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Submit application"
            accessibilityHint="Sends your application to SaMi Operations for review"
            accessibilityState={{ busy: submitting, disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={() => void submitApplication()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: buttonBlue },
              !canSubmit && styles.primaryButtonDisabled,
              pressed && canSubmit && styles.pressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                Submit application
              </Text>
            )}
          </Pressable>
        )}

        <Text
          style={[styles.footerText, { color: supportingText }]}
        >
          By submitting, you confirm that the details and documents
          provided are accurate and belong to you.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },

  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
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

  progressFillFull: {
    width: "100%",
    height: "100%",
    borderRadius: 6,
  },

  progressMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  progressLabel: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  progressDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  stepDotDone: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Heading
  headingBlock: { gap: 9, marginBottom: 2 },

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

  bodyText: {
    fontSize: 13.5,
    lineHeight: 20,
  },

  // Document progress card
  progressCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 11,
  },

  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  progressTitle: {
    fontSize: 14.5,
    fontWeight: "900",
  },

  progressCount: {
    fontSize: 14.5,
    fontWeight: "900",
  },

  progressCardTrack: {
    height: 8,
    borderRadius: 8,
    overflow: "hidden",
  },

  progressCardFill: {
    height: "100%",
    borderRadius: 8,
  },

  progressDescription: {
    fontSize: 12.5,
    lineHeight: 18,
  },

  // Section cards
  sectionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },

  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  sectionHeadingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },

  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionTitle: {
    fontSize: 15.5,
    fontWeight: "900",
    flexShrink: 1,
  },

  editText: {
    fontSize: 13,
    fontWeight: "900",
  },

  // Detail rows
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },

  detailLabel: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  detailValue: {
    flex: 1.5,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "right",
  },

  // Chips
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  categoryChip: {
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },

  categoryChipText: {
    fontSize: 11.5,
    fontWeight: "800",
  },

  // Documents list
  documentList: { gap: 0 },

  documentRow: {
    minHeight: 70,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  documentInformation: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },

  documentTitle: {
    fontSize: 13.5,
    fontWeight: "800",
  },

  documentDetail: {
    fontSize: 11.5,
    lineHeight: 16,
  },

  documentRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statusPill: {
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
  },

  inlineWarning: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },

  inlineError: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },

  // Review notice
  reviewNotice: {
    borderRadius: 14,
    padding: 15,
    gap: 7,
  },

  noticeTitle: {
    fontSize: 14.5,
    fontWeight: "900",
  },

  noticeText: {
    fontSize: 12.5,
    lineHeight: 19,
  },

  // Error
  errorCard: {
    borderRadius: 12,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  // Blocked
  blockedCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 15,
    gap: 11,
  },

  blockedTitle: {
    fontSize: 14.5,
    fontWeight: "900",
  },

  secondaryAction: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  secondaryActionText: {
    fontSize: 13,
    fontWeight: "800",
  },

  // Buttons
  primaryButton: {
    minHeight: 58,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 2,
    flexDirection: "row",
    gap: 9,
  },

  primaryButtonDisabled: {
    opacity: 0.45,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  secondaryLink: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },

  secondaryLinkText: {
    fontSize: 14,
    fontWeight: "800",
  },

  footerText: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: "center",
    paddingHorizontal: 8,
  },

  successCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  successCopy: {
    flex: 1,
    gap: 5,
  },

  successTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },

  successBody: {
    fontSize: 12,
    lineHeight: 18,
  },

  // Center (loading + no data)
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },

  loadingText: {
    fontSize: 13,
    lineHeight: 20,
  },

  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  errorTitle: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
    textAlign: "center",
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});