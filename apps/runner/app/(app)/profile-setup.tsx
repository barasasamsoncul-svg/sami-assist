import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import {
  clearRunnerSession,
  getRunnerOnboarding,
} from "@/api";
import type { RunnerOnboardingData } from "@/api";
import {
  getRunnerReviewFeedback,
} from "@/review";
import type {
  RunnerReviewFeedback,
  RunnerDocumentReview,
} from "@/review";
import { useRunnerTheme } from "@/theme";

type ThemeColors = ReturnType<typeof useRunnerTheme>["colors"];

function getResumeRoute(data: RunnerOnboardingData) {
  const runner = data.runner;

  if (!runner.selectedCategories?.length) {
    return "/(auth)/tasks" as const;
  }

  const vehicleType = runner.vehicleType ?? "";
  const serviceArea = runner.serviceArea?.trim() ?? "";

  const requiresRegistration = [
    "motorcycle",
    "car",
    "van",
  ].includes(vehicleType);

  const transportComplete =
    serviceArea.length >= 2 &&
    Boolean(vehicleType) &&
    (!requiresRegistration ||
      Boolean(runner.vehicleRegistration?.trim()));

  if (!transportComplete) {
    return "/(auth)/transport" as const;
  }

  const requiredDocuments = data.requirements.filter(
    (item) => item.required,
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
      (document) =>
        document.requirementKey === review.requirementKey,
    );

    if (!currentDocument) {
      return true;
    }

    const currentStatus = String(currentDocument.reviewStatus);

    return (
      currentStatus !== "pending" &&
      currentStatus !== "approved"
    );
  });
}

function formatReviewDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getDocumentDecisionLabel(
  decision: RunnerDocumentReview["decision"],
) {
  if (decision === "approved") {
    return "APPROVED";
  }

  if (decision === "resubmission_required") {
    return "RESUBMISSION REQUIRED";
  }

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

      <Text style={[styles.infoValue, { color: colors.text }]}>
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
  if (!feedback) {
    return null;
  }

  const applicationReview = feedback.applicationReview;
  const documentReviews = feedback.documentReviews.slice(0, 10);

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
      <Text style={[styles.cardTitle, { color: colors.text }]}>
        Operations review feedback
      </Text>

      <Text style={[styles.reviewIntro, { color: colors.textMuted }]}>
        Review decisions and instructions from SaMi Operations appear here.
      </Text>

      {applicationReview ? (
        <View
          style={[
            styles.applicationReview,
            { backgroundColor: colors.dangerSoft },
          ]}
        >
          <View style={styles.reviewHeadingRow}>
            <Text style={[styles.reviewItemTitle, { color: colors.text }]}>
              Application decision
            </Text>

            <Text style={[styles.reviewDecision, { color: colors.red }]}>
              REJECTED
            </Text>
          </View>

          <Text style={[styles.reviewReason, { color: colors.text }]}>
            {applicationReview.reason ||
              "Your application requires changes before it can be submitted again."}
          </Text>

          <Text style={[styles.reviewDate, { color: colors.textMuted }]}>
            Reviewed {formatReviewDate(applicationReview.reviewedAt)}
          </Text>
        </View>
      ) : null}

      {documentReviews.length > 0 ? (
        <View style={styles.documentReviewList}>
          <Text style={[styles.reviewSectionTitle, { color: colors.text }]}>
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
                  >
                    {review.requirementTitle || "Verification document"}
                  </Text>

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
                    {getDocumentDecisionLabel(review.decision)}
                  </Text>
                </View>

                {review.reason ? (
                  <Text
                    style={[styles.reviewReason, { color: colors.text }]}
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

                <Text style={[styles.reviewDate, { color: colors.textMuted }]}>
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
        </View>
      ) : null}
    </View>
  );
}

export default function RunnerApplicationStatusScreen() {
  const router = useRouter();
  const { colors } = useRunnerTheme();

  const [data, setData] = useState<RunnerOnboardingData | null>(null);
  const [feedback, setFeedback] = useState<RunnerReviewFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadStatus = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      setFeedbackError(null);

      try {
        const result = await getRunnerOnboarding();
        const runner = result.runner;

        let reviewResult: RunnerReviewFeedback | null = null;

        try {
          reviewResult = await getRunnerReviewFeedback();
          setFeedback(reviewResult);
        } catch (cause) {
          setFeedback(null);
          setFeedbackError(
            cause instanceof Error
              ? cause.message
              : "Review feedback could not be loaded.",
          );
        }

        if (
          runner.accountStatus === "active" &&
          runner.verificationStatus === "approved"
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
        setError(
          cause instanceof Error
            ? cause.message
            : "Your application status could not be loaded.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
    }, [loadStatus]),
  );

  async function signOut() {
    if (signingOut || refreshing) {
      return;
    }

    setSigningOut(true);
    setError(null);

    try {
      await clearRunnerSession();
      router.dismissAll();

      router.replace({
        pathname: "/",
        params: {
          signedOut: "1",
        },
      });
    } catch {
      setError("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  function continueApplication() {
    if (!data) {
      return;
    }

    router.replace(getResumeRoute(data));
  }

  const restricted =
    data?.runner.accountStatus === "suspended" ||
    data?.runner.accountStatus === "closed";

  const outstandingReviewAction =
    data && feedback
      ? hasOutstandingReviewAction(data, feedback)
      : false;

  const submittedDocuments =
    data?.documents.filter(
      (item) =>
        item.reviewStatus === "pending" ||
        item.reviewStatus === "approved",
    ).length ?? 0;

  if (loading && !data) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.paper }]}
        edges={["top", "bottom"]}
      >
        <StatusBar
          backgroundColor={colors.paper}
          barStyle={
            colors.paper === "#080F1D"
              ? "light-content"
              : "dark-content"
          }
        />

        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.blue} />

          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
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
          barStyle={
            colors.paper === "#080F1D"
              ? "light-content"
              : "dark-content"
          }
        />

        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.text }]}>
            Status unavailable
          </Text>

          <Text style={[styles.bodyText, { color: colors.textMuted }]}>
            {error || "Your application status could not be loaded."}
          </Text>

          <Pressable
            onPress={() => void loadStatus(true)}
            disabled={refreshing || signingOut}
            style={[
              styles.primaryButton,
              { backgroundColor: colors.blue },
            ]}
          >
            {refreshing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                Try again
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => void signOut()}
            disabled={signingOut || refreshing}
            style={styles.signOutButton}
          >
            {signingOut ? (
              <ActivityIndicator color={colors.blue} />
            ) : (
              <Text style={[styles.signOutText, { color: colors.blue }]}>
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

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
      edges={["top", "bottom"]}
    >
      <StatusBar
        backgroundColor={colors.paper}
        barStyle={
          colors.paper === "#080F1D"
            ? "light-content"
            : "dark-content"
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <Text style={[styles.brandName, { color: colors.navy }]}>
            SaMi <Text style={{ color: colors.blue }}>Runner</Text>
          </Text>

          <Text style={[styles.brandTagline, { color: colors.textMuted }]}>
            CONSIDER IT DONE
          </Text>
        </View>

        <View
          style={[
            styles.statusIcon,
            {
              backgroundColor:
                restricted || outstandingReviewAction
                  ? colors.dangerSoft
                  : colors.warningSoft,
            },
          ]}
        >
          <Text
            style={[
              styles.statusIconText,
              {
                color:
                  restricted || outstandingReviewAction
                    ? colors.red
                    : colors.warning,
              },
            ]}
          >
            {restricted || outstandingReviewAction ? "!" : "…"}
          </Text>
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

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                restricted || outstandingReviewAction
                  ? colors.dangerSoft
                  : colors.warningSoft,
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  restricted || outstandingReviewAction
                    ? colors.red
                    : colors.warning,
              },
            ]}
          />

          <Text
            style={[
              styles.statusBadgeText,
              {
                color:
                  restricted || outstandingReviewAction
                    ? colors.red
                    : colors.warning,
              },
            ]}
          >
            {badgeLabel}
          </Text>
        </View>

        <View
          style={[
            styles.detailsCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Application details
          </Text>

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
            label="Tasks selected"
            value={String(data.runner.selectedCategories.length)}
            colors={colors}
          />
        </View>

        {outstandingReviewAction ? (
          <ReviewReasonCard feedback={feedback} colors={colors} />
        ) : null}

        {!restricted && !outstandingReviewAction ? (
          <View
            style={[
              styles.noticeCard,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <Text style={[styles.noticeTitle, { color: colors.text }]}>
              What happens next?
            </Text>

            <Text style={[styles.noticeText, { color: colors.textMuted }]}>
              Operations will review your application. Once approved, you
              will be able to access the Runner workspace and receive
              eligible errands.
            </Text>
          </View>
        ) : null}

        {feedbackError ? (
          <View
            style={[
              styles.feedbackErrorCard,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <Text style={[styles.feedbackErrorText, { color: colors.textMuted }]}>
              Review feedback could not be refreshed. Use the refresh button
              to try again.
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={[
              styles.errorCard,
              { backgroundColor: colors.dangerSoft },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.red }]}>
              {error}
            </Text>
          </View>
        ) : null}

        {!restricted && outstandingReviewAction ? (
          <Pressable
            onPress={continueApplication}
            disabled={refreshing || signingOut}
            style={[
              styles.primaryButton,
              { backgroundColor: colors.blue },
              (refreshing || signingOut) && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              Continue application
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => void loadStatus(true)}
          disabled={refreshing || signingOut}
          style={[
            styles.primaryButton,
            { backgroundColor: outstandingReviewAction ? colors.surface : colors.blue },
            outstandingReviewAction && {
              borderWidth: 1,
              borderColor: colors.border,
            },
            (refreshing || signingOut) && styles.disabled,
          ]}
        >
          {refreshing ? (
            <ActivityIndicator color={outstandingReviewAction ? colors.blue : "#FFFFFF"} />
          ) : (
            <Text
              style={[
                styles.primaryButtonText,
                outstandingReviewAction && { color: colors.blue },
              ]}
            >
              Refresh application status
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => void signOut()}
          disabled={signingOut || refreshing}
          style={styles.signOutButton}
        >
          {signingOut ? (
            <ActivityIndicator color={colors.blue} />
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
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 23,
    paddingTop: 28,
    paddingBottom: 36,
    alignItems: "stretch",
    gap: 17,
  },
  brand: {
    alignItems: "center",
    gap: 4,
    marginBottom: 18,
  },
  brandName: {
    fontSize: 25,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.8,
  },
  brandTagline: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2.5,
  },
  statusIcon: {
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  statusIconText: {
    fontSize: 37,
    fontWeight: "900",
  },
  eyebrow: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 5,
  },
  title: {
    fontSize: 27,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
  },
  statusBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  detailsCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 15,
    marginTop: 5,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  infoLabel: {
    flex: 1,
    fontSize: 11,
  },
  infoValue: {
    flex: 1.5,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
  },
  reviewCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 13,
  },
  reviewIntro: {
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: "900",
  },
  reviewDecision: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "right",
  },
  reviewReason: {
    fontSize: 12,
    lineHeight: 19,
  },
  reviewDate: {
    fontSize: 10,
    lineHeight: 15,
  },
  documentReviewList: {
    gap: 10,
  },
  reviewSectionTitle: {
    fontSize: 12,
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
    fontSize: 10,
    lineHeight: 16,
  },
  noticeCard: {
    borderRadius: 14,
    padding: 15,
    gap: 7,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 19,
  },
  feedbackErrorCard: {
    borderRadius: 12,
    padding: 12,
  },
  feedbackErrorText: {
    fontSize: 11,
    lineHeight: 17,
  },
  errorCard: {
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 5,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  signOutButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: {
    fontSize: 12,
    fontWeight: "800",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 15,
  },
  loadingText: {
    fontSize: 13,
  },
  disabled: {
    opacity: 0.6,
  },
});