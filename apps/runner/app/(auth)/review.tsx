
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

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

type ReviewDocumentRow = {
  key: string;
  title: string;
  detail: string;
  status: "complete" | "missing" | "rejected";
  required: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  groceries: "Groceries",
  food_delivery: "Food & Delivery",
  pickup_delivery: "Pick Up & Drop Off",
  bill_payments: "Bills & Payments",
  laundry_cleaning: "Laundry & Dry Cleaning",
  documents_admin: "Documents & Government",
  clothing_retail: "Clothing & Returns",
  shopping_gifts: "Shopping & Gifts",
  home_services: "Home Services",
  pharmacy_health: "Pharmacy & Health",
  pet_care: "Pet Care",
  personal_errand: "Personal Assistance",
  queue_appointments: "Queues & Appointments",
  business_support: "Business Errands",
  shopping: "Shopping & Essentials",
  other: "Custom Errand",
};

const NATIONAL_ID_FRONT_KEY = "identity_national_id_front";
const NATIONAL_ID_BACK_KEY = "identity_national_id_back";

const VEHICLE_LABELS: Record<string, string> = {
  motorcycle: "Motorcycle",
  bicycle: "Bicycle",
  car: "Car",
  van: "Van",
  other: "Other transport",
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

function getDocumentState(
  document: RunnerUploadedDocument | undefined,
): ReviewDocumentRow["status"] {
  if (isDocumentSatisfied(document)) return "complete";
  if (document?.reviewStatus === "rejected") return "rejected";
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
  const required = requirements.filter((item) => item.required);

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

    rows.push({
      key: "national_identity",
      title: "National ID",
      detail: `Front: ${getDocumentStateLabel(frontState)} · Back: ${getDocumentStateLabel(backState)}`,
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

    const document = getLatestDocument(
      documents,
      requirement.key,
    );

    rows.push({
      key: requirement.key,
      title: requirement.title,
      detail:
        document?.reviewStatus === "rejected"
          ? document.rejectionReason || "Please upload this document again."
          : getDocumentStateLabel(getDocumentState(document)),
      status: getDocumentState(document),
      required: true,
    });
  }

  return rows;
}

function SectionHeading({
  title,
  action,
  onAction,
  colors,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {title}
      </Text>

      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
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
      <Text style={[styles.detailValue, { color: colors.text }]}>
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

  return (
    <View style={[styles.statusPill, { backgroundColor: background }]}>
      <Text style={[styles.statusPillText, { color: foreground }]}>
        {getDocumentStateLabel(status)}
      </Text>
    </View>
  );
}

export default function RunnerApplicationReviewScreen() {
  const router = useRouter();
  const { colors } = useRunnerTheme();

  const [data, setData] = useState<RunnerOnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReview = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getRunnerOnboarding();
      setData(result);

      if (result.onboardingStatus === "approved") {
        router.replace("/(app)");
      } else if (result.onboardingStatus === "pending_review") {
        router.replace("/(app)/profile-setup?mode=status");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your application details could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void loadReview();
    }, [loadReview]),
  );

  const runner = data?.runner;

  const categories = useMemo(
    () =>
      (runner?.selectedCategories ?? []).map(
        (key) => CATEGORY_LABELS[key] ?? key,
      ),
    [runner?.selectedCategories],
  );

  const documentRows = useMemo(
    () =>
      data
        ? buildDocumentRows(data.requirements, data.documents)
        : [],
    [data],
  );

  const optionalDocumentCount = useMemo(
    () =>
      data?.requirements.filter((item) => !item.required).length ?? 0,
    [data],
  );

  const requiredDocumentsComplete =
    documentRows.length > 0 &&
    documentRows.every((item) => item.status === "complete");

  const hasCategories = categories.length > 0;

  const vehicleType = runner?.vehicleType ?? "";
  const serviceArea = runner?.serviceArea?.trim() ?? "";
  const needsRegistration = ["motorcycle", "car", "van"].includes(
    vehicleType,
  );

  const transportComplete =
    serviceArea.length >= 2 &&
    Boolean(vehicleType) &&
    (!needsRegistration ||
      Boolean(runner?.vehicleRegistration?.trim()));

  const canSubmit =
    Boolean(data) &&
    hasCategories &&
    transportComplete &&
    requiredDocumentsComplete &&
    !loading &&
    !submitting &&
    data?.onboardingStatus !== "pending_review" &&
    data?.onboardingStatus !== "approved";

  const submitApplication = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      await submitRunnerOnboarding();

      router.replace("/(app)/profile-setup?mode=status");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your application could not be submitted. Please try again.",
      );

      // Refresh the server's view of the application.
      await loadReview();
    } finally {
      setSubmitting(false);
    }
  };

  const completedCount = documentRows.filter(
    (item) => item.status === "complete",
  ).length;

  const missingCount = documentRows.length - completedCount;

  if (loading && !data) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.paper }]}
        edges={["top", "bottom"]}
      >
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.blue} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
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
          <Text style={[styles.title, { color: colors.text }]}>
            Review unavailable
          </Text>

          <Text style={[styles.bodyText, { color: colors.textMuted }]}>
            {error || "Your onboarding information could not be loaded."}
          </Text>

          <Pressable
            onPress={() => void loadReview()}
            style={[styles.primaryButton, { backgroundColor: colors.blue }]}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace("/(auth)/documents")}
            style={styles.backLink}
          >
            <Text style={[styles.backLinkText, { color: colors.blue }]}>
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
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace("/(auth)/documents")}
          style={styles.backLink}
        >
          <Text style={[styles.backLinkText, { color: colors.blue }]}>
            ‹  Documents
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingBlock}>
          <Text style={[styles.eyebrow, { color: colors.blue }]}>
            FINAL STEP
          </Text>

          <Text style={[styles.title, { color: colors.text }]}>
            Review your application
          </Text>

          <Text style={[styles.bodyText, { color: colors.textMuted }]}>
            Check your details before sending your Runner application to
            SaMi Operations for verification.
          </Text>
        </View>

        <View
          style={[
            styles.progressCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: colors.text }]}>
              Required documents
            </Text>

            <Text style={[styles.progressCount, { color: colors.text }]}>
              {completedCount}/{documentRows.length}
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

          <Text style={[styles.progressDescription, { color: colors.textMuted }]}>
            {missingCount === 0
              ? "All required documents have been submitted."
              : `${missingCount} required document item${missingCount === 1 ? "" : "s"} still need attention.`}
          </Text>
        </View>

        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <SectionHeading
            title="Personal details"
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

        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <SectionHeading
            title="Tasks you selected"
            action="Edit"
            onAction={() => router.push("/(auth)/tasks")}
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
                    style={[styles.categoryChipText, { color: colors.blue }]}
                  >
                    {category}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.bodyText, { color: colors.red }]}>
              No task categories have been selected.
            </Text>
          )}
        </View>

        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <SectionHeading
            title="Transport and service area"
            action="Edit"
            onAction={() => router.push("/(auth)/transport")}
            colors={colors}
          />

          <DetailRow
            label="Main service area"
            value={runner?.serviceArea || "Not provided"}
            colors={colors}
          />

          <DetailRow
            label="Transport"
            value={(VEHICLE_LABELS[vehicleType] ?? vehicleType) || "Not selected"}
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
            <Text style={[styles.inlineWarning, { color: colors.red }]}>
              Complete your transport details before submitting.
            </Text>
          ) : null}
        </View>

        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <SectionHeading
            title="Required documents"
            action="View checklist"
            onAction={() => router.push("/(auth)/documents")}
            colors={colors}
          />

          {documentRows.length > 0 ? (
            <View style={styles.documentList}>
              {documentRows.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() =>
                    router.push({
                      pathname: "/(auth)/document/[key]",
                      params: { key: item.key },
                    })
                  }
                  style={[
                    styles.documentRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <View style={styles.documentInformation}>
                    <Text
                      style={[styles.documentTitle, { color: colors.text }]}
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
                    >
                      {item.detail}
                    </Text>
                  </View>

                  <DocumentStatus status={item.status} colors={colors} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={[styles.bodyText, { color: colors.red }]}>
              The server did not return any required document requirements.
              Please return to the checklist and refresh it.
            </Text>
          )}

          {optionalDocumentCount > 0 ? (
            <Text style={[styles.optionalText, { color: colors.textMuted }]}>
              There are also {optionalDocumentCount} optional document
              requirement{optionalDocumentCount === 1 ? "" : "s"} for your
              selected tasks and transport.
            </Text>
          ) : null}
        </View>

        <View
          style={[
            styles.reviewNotice,
            { backgroundColor: colors.blueSoft },
          ]}
        >
          <Text style={[styles.noticeTitle, { color: colors.text }]}>
            What happens next?
          </Text>

          <Text style={[styles.noticeText, { color: colors.textMuted }]}>
            After you submit, SaMi Operations will review your application
            and documents. Runner errand access remains unavailable until
            your application is approved.
          </Text>
        </View>

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

        {!canSubmit ? (
          <View
            style={[
              styles.blockedCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.blockedTitle, { color: colors.text }]}>
              Application not ready
            </Text>

            <Text style={[styles.bodyText, { color: colors.textMuted }]}>
              {[
                !hasCategories ? "Select at least one task category." : null,
                !transportComplete ? "Complete your transport details." : null,
                !requiredDocumentsComplete
                  ? "Submit every required document."
                  : null,
              ]
                .filter(Boolean)
                .join("\n")}
            </Text>

            <Pressable
              onPress={() => router.push("/(auth)/documents")}
              style={[
                styles.secondaryAction,
                { borderColor: colors.border },
              ]}
            >
              <Text style={[styles.secondaryActionText, { color: colors.blue }]}>
                Review documents
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          disabled={!canSubmit}
          onPress={() => void submitApplication()}
          style={[
            styles.primaryButton,
            {
              backgroundColor: canSubmit ? colors.blue : colors.muted,
            },
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

        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          By submitting, you confirm that the details and documents provided
          are accurate and belong to you.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 7,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 17,
    paddingBottom: 38,
    gap: 16,
  },
  headingBlock: {
    gap: 9,
    marginBottom: 3,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 20,
  },
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
    fontSize: 14,
    fontWeight: "800",
  },
  progressCount: {
    fontSize: 14,
    fontWeight: "800",
  },
  progressTrack: {
    height: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 8,
  },
  progressDescription: {
    fontSize: 12,
    lineHeight: 18,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 13,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  editText: {
    fontSize: 12,
    fontWeight: "800",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  detailLabel: {
    flex: 1,
    fontSize: 12,
  },
  detailValue: {
    flex: 1.5,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  documentList: {
    gap: 0,
  },
  documentRow: {
    minHeight: 66,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  documentInformation: {
    flex: 1,
    gap: 5,
  },
  documentTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  documentDetail: {
    fontSize: 11,
    lineHeight: 16,
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  optionalText: {
    fontSize: 11,
    lineHeight: 17,
    marginTop: 2,
  },
  inlineWarning: {
    fontSize: 12,
    fontWeight: "700",
  },
  reviewNotice: {
    borderRadius: 14,
    padding: 15,
    gap: 7,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 19,
  },
  errorCard: {
    borderRadius: 12,
    padding: 13,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  blockedCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  blockedTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryAction: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 2,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  backLink: {
    alignSelf: "flex-start",
    paddingVertical: 9,
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: "700",
  },
  footerText: {
    fontSize: 10,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },
  loadingText: {
    fontSize: 13,
  },
});
