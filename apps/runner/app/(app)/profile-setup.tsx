import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  clearRunnerSession,
  getRunnerOnboarding,
} from "@/api";
import type { RunnerOnboardingData } from "@/api";
import { getRunnerReviewFeedback } from "@/review";
import type {
  RunnerReviewFeedback,
  RunnerDocumentReview,
} from "@/review";
import { useRunnerTheme } from "@/theme";

type ThemeColors = ReturnType<typeof useRunnerTheme>["colors"];
type IoniconName = keyof typeof Ionicons.glyphMap;

const BACK_SIZE = 44;
const MAX_REVIEWS_SHOWN = 10;

const RUNNER_SERVICE_KEYS = ["pickup_deliver", "shop_deliver"] as const;
const RUNNER_VEHICLE_TYPES = ["bike", "motorbike", "vehicle"] as const;

function isSupportedServiceKey(value: string) {
  return RUNNER_SERVICE_KEYS.includes(
    value as (typeof RUNNER_SERVICE_KEYS)[number],
  );
}

function isSupportedVehicleType(value: string) {
  return (
    RUNNER_VEHICLE_TYPES.includes(
      value as (typeof RUNNER_VEHICLE_TYPES)[number],
    ) || ["bicycle", "motorcycle", "car", "van", "other"].includes(value)
  );
}

function vehicleRequiresRegistration(value: string) {
  return ["motorbike", "vehicle", "motorcycle", "car", "van", "other"].includes(
    value,
  );
}

function getResumeRoute(data: RunnerOnboardingData) {
  const runner = data.runner;
  const selectedServices = (runner.selectedCategories ?? []).filter(
    isSupportedServiceKey,
  );

  if (selectedServices.length === 0) {
    return "/(auth)/tasks" as const;
  }

  const vehicleType = runner.vehicleType ?? "";
  const serviceArea = runner.serviceArea?.trim() ?? "";
  const requiresRegistration = vehicleRequiresRegistration(vehicleType);

  const transportComplete =
    serviceArea.length >= 2 &&
    isSupportedVehicleType(vehicleType) &&
    (!requiresRegistration || Boolean(runner.vehicleRegistration?.trim()));

  if (!transportComplete) {
    return "/(auth)/transport" as const;
  }

  const requiredDocuments = data.requirements.filter(
    (item) => item.required === true,
  );

  if (requiredDocuments.length === 0) {
    return "/(auth)/documents" as const;
  }

  const missingDocument = requiredDocuments.some((requirement) => {
    const document = data.documents.find(
      (item) => item.requirementKey === requirement.key,
    );

    return (
      document?.reviewStatus !== "pending" &&
      document?.reviewStatus !== "approved"
    );
  });

  if (missingDocument) {
    return "/(auth)/documents" as const;
  }

  return "/(auth)/review" as const;
}

function hasOutstandingReviewAction(
  data: RunnerOnboardingData,
  feedback: RunnerReviewFeedback | null,
) {
  if (!feedback || data.runner.verificationStatus === "submitted") {
    return false;
  }

  if (feedback.applicationReview?.decision === "rejected") {
    return true;
  }

  return feedback.documentReviews.some((review) => {
    if (
      review.decision !== "rejected" &&
      review.decision !== "resubmission_required"
    ) {
      return false;
    }

    if (!review.requirementKey) {
      return true;
    }

    const currentDocument = data.documents.find(
      (document) => document.requirementKey === review.requirementKey,
    );

    if (!currentDocument) {
      return true;
    }

    const currentStatus = String(currentDocument.reviewStatus);

    return currentStatus !== "pending" && currentStatus !== "approved";
  });
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getDocumentDecisionLabel(
  decision: RunnerDocumentReview["decision"],
) {
  if (decision === "approved") return "APPROVED";
  if (decision === "resubmission_required") return "RESUBMISSION REQUIRED";
  return "REJECTED";
}

function StatusInfoRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
        {label}
      </Text>
      <Text
        style={[styles.infoValue, { color: colors.text }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function ReviewReasonCard({
  feedback,
  colors,
}: {
  feedback: RunnerReviewFeedback | null;
  colors: ThemeColors;
}) {
  if (!feedback) return null;

  const applicationReview = feedback.applicationReview;
  const applicationApproved = applicationReview?.decision === "approved";
  const applicationDecisionColor = applicationApproved
    ? colors.success
    : colors.red;
  const applicationDecisionBackground = applicationApproved
    ? colors.successSoft
    : colors.dangerSoft;
  const allDocumentReviews = feedback.documentReviews;
  const documentReviews = allDocumentReviews.slice(0, MAX_REVIEWS_SHOWN);
  const capped = allDocumentReviews.length > MAX_REVIEWS_SHOWN;

  if (!applicationReview && documentReviews.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.reviewCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.reviewCardHeading}>
        <View
          style={[
            styles.reviewCardIcon,
            { backgroundColor: colors.dangerSoft },
          ]}
        >
          <Ionicons
            name="chatbox-ellipses-outline"
            size={18}
            color={colors.red}
          />
        </View>

        <Text style={[styles.cardTitle, { color: colors.text }]}>
          Operations review feedback
        </Text>
      </View>

      <Text style={[styles.reviewIntro, { color: colors.textMuted }]}>
        Review decisions and instructions from SaMi Operations appear
        here.
      </Text>

      {applicationReview ? (
        <View
          style={[
            styles.applicationReview,
            { backgroundColor: applicationDecisionBackground },
          ]}
        >
          <View style={styles.reviewHeadingRow}>
            <Text
              style={[styles.reviewItemTitle, { color: colors.text }]}
            >
              Application decision
            </Text>

            <Text
              style={[styles.reviewDecision, { color: applicationDecisionColor }]}
            >
              {applicationApproved ? "APPROVED" : "REJECTED"}
            </Text>
          </View>

          <Text style={[styles.reviewReason, { color: colors.text }]}>
            {applicationReview.reason ||
              (applicationApproved
                ? "Your Runner application has been approved."
                : "Your application requires changes before it can be submitted again.")}
          </Text>

          <Text
            style={[styles.reviewDate, { color: colors.textMuted }]}
          >
            Reviewed {formatReviewDate(applicationReview.reviewedAt)}
          </Text>
        </View>
      ) : null}

      {documentReviews.length > 0 ? (
        <View style={styles.documentReviewList}>
          <Text
            style={[styles.reviewSectionTitle, { color: colors.text }]}
          >
            Document decisions
          </Text>

          {documentReviews.map((review) => {
            const approved = review.decision === "approved";

            return (
              <View
                key={review.reviewId}
                style={[
                  styles.documentReviewItem,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.paper,
                  },
                ]}
              >
                <View style={styles.reviewHeadingRow}>
                  <Text
                    style={[
                      styles.reviewItemTitle,
                      { color: colors.text },
                    ]}
                    numberOfLines={2}
                  >
                    {review.requirementTitle || "Verification document"}
                  </Text>

                  <View
                    style={[
                      styles.reviewDecisionPill,
                      {
                        backgroundColor: approved
                          ? colors.blueSoft
                          : colors.dangerSoft,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        approved
                          ? "checkmark-circle"
                          : "alert-circle"
                      }
                      size={12}
                      color={approved ? colors.blue : colors.red}
                    />
                    <Text
                      style={[
                        styles.reviewDecision,
                        {
                          color: approved ? colors.blue : colors.red,
                        },
                      ]}
                    >
                      {getDocumentDecisionLabel(review.decision)}
                    </Text>
                  </View>
                </View>

                {review.reason ? (
                  <Text
                    style={[
                      styles.reviewReason,
                      { color: colors.text },
                    ]}
                  >
                    {review.reason}
                  </Text>
                ) : (
                  <Text
                    style={[
                      styles.reviewReason,
                      { color: colors.textMuted },
                    ]}
                  >
                    {approved
                      ? "This document has been approved."
                      : "Please review this document and submit a replacement."}
                  </Text>
                )}

                <Text
                  style={[
                    styles.reviewDate,
                    { color: colors.textMuted },
                  ]}
                >
                  Reviewed {formatReviewDate(review.reviewedAt)}
                </Text>

                {!approved && review.fileRemovedFromStorage ? (
                  <Text
                    style={[
                      styles.storageNotice,
                      { color: colors.textMuted },
                    ]}
                  >
                    {review.deletionPending
                      ? "The previous file is queued for storage cleanup."
                      : "The previous file has been removed from storage. Submit a new file to replace it."}
                  </Text>
                ) : null}
              </View>
            );
          })}

          {capped ? (
            <Text
              style={[
                styles.truncationNotice,
                { color: colors.textMuted },
              ]}
            >
              Showing {MAX_REVIEWS_SHOWN} of {allDocumentReviews.length}{" "}
              document reviews.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function RunnerApplicationStatusScreen() {
  const router = useRouter();
  const { colors } = useRunnerTheme();

  const [data, setData] = useState<RunnerOnboardingData | null>(null);
  const [feedback, setFeedback] = useState<RunnerReviewFeedback | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadStatus = useCallback(
    async (refresh = false) => {
      if (loadInFlightRef.current) return;
      loadInFlightRef.current = true;

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      setFeedbackError(null);

      try {
        const result = await getRunnerOnboarding();

        if (!mountedRef.current) return;

        const runner = result.runner;

        let reviewResult: RunnerReviewFeedback | null = null;

        try {
          reviewResult = await getRunnerReviewFeedback();

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

        if (
          runner.verificationStatus === "approved" &&
          runner.accountStatus !== "suspended" &&
          runner.accountStatus !== "closed"
        ) {
          router.replace("/(app)");
          return;
        }

        if (
          runner.accountStatus === "suspended" ||
          runner.accountStatus === "closed"
        ) {
          setData(result);
          return;
        }

        const outstandingReviewAction = hasOutstandingReviewAction(
          result,
          reviewResult,
        );

        if (
          result.onboardingStatus !== "pending_review" &&
          runner.verificationStatus !== "submitted" &&
          !outstandingReviewAction
        ) {
          router.replace(getResumeRoute(result));
          return;
        }

        setData(result);
      } catch (cause) {
        if (!mountedRef.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Your application status could not be loaded.",
        );
      } finally {
        loadInFlightRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
    }, [loadStatus]),
  );

  // Auto-scroll to error when it appears.
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [error]);

  async function signOut() {
    if (signingOut || refreshing) return;

    setSigningOut(true);
    setError(null);

    try {
      await clearRunnerSession();
      router.dismissAll();

      router.replace({
        pathname: "/",
        params: { signedOut: "1" },
      });
    } catch {
      if (mountedRef.current) {
        setError("Could not sign out. Please try again.");
        setSigningOut(false);
      }
    }
  }

  function continueApplication() {
    if (!data) return;
    router.replace(getResumeRoute(data));
  }

  const restricted =
    data?.runner.accountStatus === "suspended" ||
    data?.runner.accountStatus === "closed";

  const outstandingReviewAction =
    data && feedback ? hasOutstandingReviewAction(data, feedback) : false;

  const requiredDocumentKeys = new Set(
    (data?.requirements ?? [])
      .filter((requirement) => requirement.required === true)
      .map((requirement) => requirement.key),
  );

  const submittedDocuments = data
    ? Array.from(requiredDocumentKeys).filter((requirementKey) => {
        const document = data.documents.find(
          (item) => item.requirementKey === requirementKey,
        );

        return (
          document?.reviewStatus === "pending" ||
          document?.reviewStatus === "approved"
        );
      }).length
    : 0;

  const selectedServiceCount = (data?.runner.selectedCategories ?? []).filter(
    isSupportedServiceKey,
  ).length;

  const isDarkPaper = colors.paper === "#080F1D";

  if (loading && !data) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.paper }]}
        edges={["top", "bottom"]}
      >
        <StatusBar
          backgroundColor={colors.paper}
          barStyle={isDarkPaper ? "light-content" : "dark-content"}
        />

        <View
          style={styles.center}
          accessibilityRole="progressbar"
          accessibilityLabel="Checking your application status"
        >
          <ActivityIndicator size="large" color={colors.blue} />

          <Text
            style={[styles.loadingText, { color: colors.textMuted }]}
          >
            Checking your application status…
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
        <StatusBar
          backgroundColor={colors.paper}
          barStyle={isDarkPaper ? "light-content" : "dark-content"}
        />

        <View style={styles.center}>
          <View
            style={[
              styles.centerIconWrap,
              { backgroundColor: colors.dangerSoft },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={26}
              color={colors.red}
            />
          </View>

          <Text style={[styles.centerTitle, { color: colors.text }]}>
            Status unavailable
          </Text>

          <Text
            style={[styles.centerBody, { color: colors.textMuted }]}
            numberOfLines={4}
          >
            {error || "Your application status could not be loaded."}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => void loadStatus(true)}
            disabled={refreshing || signingOut}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.blue },
              (refreshing || signingOut) && styles.disabled,
              pressed && !refreshing && !signingOut && styles.pressed,
            ]}
          >
            {refreshing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Try again</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() => void signOut()}
            disabled={signingOut || refreshing}
            hitSlop={10}
            style={({ pressed }) => [
              styles.signOutButton,
              {
                opacity: pressed
                  ? 0.55
                  : signingOut || refreshing
                    ? 0.5
                    : 1,
              },
            ]}
          >
            {signingOut ? (
              <ActivityIndicator color={colors.blue} size="small" />
            ) : (
              <Text
                style={[styles.signOutText, { color: colors.blue }]}
              >
                Sign out
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const statusTitle = restricted
    ? "Account restricted"
    : outstandingReviewAction
      ? "Changes requested"
      : "Application under review";

  const statusMessage = restricted
    ? "Your Runner account is currently not available. Contact SaMi Operations for assistance."
    : outstandingReviewAction
      ? "SaMi Operations has reviewed your application. Read the feedback below and update the requested information or documents."
      : "Your application has been submitted successfully. SaMi Operations is reviewing your details and documents.";

  const badgeLabel = restricted
    ? data.runner.accountStatus === "suspended"
      ? "SUSPENDED"
      : "CLOSED"
    : outstandingReviewAction
      ? "ACTION REQUIRED"
      : "PENDING OPERATIONS REVIEW";

  const warning = restricted || outstandingReviewAction;

  const statusIcon: IoniconName = restricted
    ? data.runner.accountStatus === "closed"
      ? "lock-closed"
      : "ban"
    : outstandingReviewAction
      ? "alert-circle"
      : "time";

  const statusIconColor = warning ? colors.red : colors.warning;
  const statusIconBg = warning ? colors.dangerSoft : colors.warningSoft;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
      edges={["top", "bottom"]}
    >
      <StatusBar
        backgroundColor={colors.paper}
        barStyle={isDarkPaper ? "light-content" : "dark-content"}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View style={styles.brand}>
          <Text style={[styles.brandName, { color: colors.navy }]}>
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

        {/* Status icon */}
        <View
          style={[styles.statusIcon, { backgroundColor: statusIconBg }]}
        >
          <Ionicons
            name={statusIcon}
            size={38}
            color={statusIconColor}
          />
        </View>

        <Text style={[styles.eyebrow, { color: colors.blue }]}>
          RUNNER APPLICATION
        </Text>

        <Text style={[styles.title, { color: colors.text }]}>
          {statusTitle}
        </Text>

        <Text style={[styles.bodyText, { color: colors.textMuted }]}>
          {statusMessage}
        </Text>

        {/* Status badge */}
        <View
          style={[styles.statusBadge, { backgroundColor: statusIconBg }]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: statusIconColor },
            ]}
          />

          <Text
            style={[
              styles.statusBadgeText,
              { color: statusIconColor },
            ]}
          >
            {badgeLabel}
          </Text>
        </View>

        {/* Details card */}
        <View
          style={[
            styles.detailsCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.detailsHeading}>
            <View
              style={[
                styles.detailsHeadingIcon,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <Ionicons
                name="person-circle-outline"
                size={16}
                color={colors.blue}
              />
            </View>

            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Application details
            </Text>
          </View>

          <StatusInfoRow
            label="Full name"
            value={data.runner.fullName || "Not available"}
            colors={colors}
          />

          <StatusInfoRow
            label="Email"
            value={data.runner.email || "Not available"}
            colors={colors}
          />

          <StatusInfoRow
            label="Service area"
            value={data.runner.serviceArea || "Not provided"}
            colors={colors}
          />

          <StatusInfoRow
            label="Documents submitted"
            value={String(submittedDocuments)}
            colors={colors}
          />

          <StatusInfoRow
            label="Services selected"
            value={String(selectedServiceCount)}
            colors={colors}
          />
        </View>

        {/* Review feedback */}
        {outstandingReviewAction ? (
          <ReviewReasonCard feedback={feedback} colors={colors} />
        ) : null}

        {/* What happens next */}
        {!restricted && !outstandingReviewAction ? (
          <View
            style={[
              styles.noticeCard,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <View style={styles.noticeHeading}>
              <Ionicons
                name="hourglass-outline"
                size={18}
                color={colors.blue}
              />
              <Text
                style={[styles.noticeTitle, { color: colors.text }]}
              >
                What happens next?
              </Text>
            </View>

            <Text
              style={[styles.noticeText, { color: colors.textMuted }]}
            >
              Operations will review your application. Once approved,
              you will be able to access the Runner workspace and
              receive eligible errands.
            </Text>
          </View>
        ) : null}

        {/* Feedback error */}
        {feedbackError ? (
          <View
            style={[
              styles.feedbackErrorCard,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.blue}
            />
            <Text
              style={[
                styles.feedbackErrorText,
                { color: colors.textMuted },
              ]}
            >
              Review feedback could not be refreshed. Use the refresh
              button to try again.
            </Text>
          </View>
        ) : null}

        {/* Error */}
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

        {/* Continue application */}
        {!restricted && outstandingReviewAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue application"
            accessibilityHint="Opens the next step that needs your attention"
            disabled={refreshing || signingOut}
            onPress={continueApplication}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.blue },
              (refreshing || signingOut) && styles.disabled,
              pressed && !refreshing && !signingOut && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              Continue application
            </Text>
            <Ionicons
              name="arrow-forward"
              size={19}
              color="#FFFFFF"
            />
          </Pressable>
        ) : null}

        {/* Refresh */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh application status"
          accessibilityState={{ busy: refreshing, disabled: signingOut }}
          disabled={refreshing || signingOut}
          onPress={() => void loadStatus(true)}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: outstandingReviewAction
                ? colors.surface
                : colors.blue,
              borderWidth: outstandingReviewAction ? 1 : 0,
              borderColor: colors.border,
            },
            (refreshing || signingOut) && styles.disabled,
            pressed && !refreshing && !signingOut && styles.pressed,
          ]}
        >
          {refreshing ? (
            <ActivityIndicator
              size="small"
              color={outstandingReviewAction ? colors.blue : "#FFFFFF"}
            />
          ) : (
            <>
              <Ionicons
                name="refresh-outline"
                size={18}
                color={outstandingReviewAction ? colors.blue : "#FFFFFF"}
              />
              <Text
                style={[
                  styles.primaryButtonText,
                  outstandingReviewAction && { color: colors.blue },
                ]}
              >
                Refresh application status
              </Text>
            </>
          )}
        </Pressable>

        {/* Sign out */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          disabled={signingOut || refreshing}
          onPress={() => void signOut()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.signOutButton,
            {
              opacity: pressed
                ? 0.55
                : signingOut || refreshing
                  ? 0.5
                  : 1,
            },
          ]}
        >
          {signingOut ? (
            <ActivityIndicator color={colors.blue} size="small" />
          ) : (
            <Text style={[styles.signOutText, { color: colors.blue }]}>
              Sign out
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },

  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    alignItems: "stretch",
    gap: 16,
  },

  // Brand
  brand: {
    alignItems: "center",
    gap: 4,
    marginBottom: 16,
  },

  brandName: {
    fontSize: 25,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.8,
  },

  brandTagline: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2.5,
  },

  // Status icon
  statusIcon: {
    alignSelf: "center",
    width: 78,
    height: 78,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 1 },
      default: {},
    }),
  },

  // Eyebrow / title / body
  eyebrow: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 4,
  },

  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.6,
  },

  bodyText: {
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: "center",
  },

  // Status badge
  statusBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 30,
    paddingHorizontal: 15,
    paddingVertical: 9,
    marginVertical: 2,
    maxWidth: "100%",
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  statusBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    flexShrink: 1,
  },

  // Details card
  detailsCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginTop: 4,
  },

  detailsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  detailsHeadingIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  cardTitle: {
    fontSize: 15.5,
    fontWeight: "900",
    flexShrink: 1,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  infoLabel: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  infoValue: {
    flex: 1.5,
    textAlign: "right",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },

  // Review card
  reviewCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 13,
  },

  reviewCardHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  reviewCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  reviewIntro: {
    fontSize: 12.5,
    lineHeight: 18,
  },

  applicationReview: {
    borderRadius: 12,
    padding: 13,
    gap: 9,
  },

  reviewHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },

  reviewItemTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },

  reviewDecision: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  reviewDecisionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  reviewReason: {
    fontSize: 12.5,
    lineHeight: 19,
  },

  reviewDate: {
    fontSize: 11,
    lineHeight: 15,
  },

  documentReviewList: {
    gap: 10,
  },

  reviewSectionTitle: {
    fontSize: 13.5,
    fontWeight: "900",
    marginTop: 2,
  },

  documentReviewItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },

  storageNotice: {
    fontSize: 11.5,
    lineHeight: 16,
  },

  truncationNotice: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 2,
  },

  // Notice card
  noticeCard: {
    borderRadius: 14,
    padding: 15,
    gap: 8,
  },

  noticeHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  noticeTitle: {
    fontSize: 14.5,
    fontWeight: "900",
    flexShrink: 1,
  },

  noticeText: {
    fontSize: 12.5,
    lineHeight: 19,
  },

  // Feedback error
  feedbackErrorCard: {
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  feedbackErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  // Error
  errorCard: {
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

  // Primary button
  primaryButton: {
    minHeight: 58,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 4,
    flexDirection: "row",
    gap: 9,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  // Sign out
  signOutButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  signOutText: {
    fontSize: 13.5,
    fontWeight: "800",
  },

  // Center states
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },

  centerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  centerTitle: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
    textAlign: "center",
  },

  centerBody: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
  },

  loadingText: {
    fontSize: 13,
    lineHeight: 20,
  },

  disabled: { opacity: 0.45 },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});