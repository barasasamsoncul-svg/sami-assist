
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSaMiTheme } from "@/theme";

export type FindingRunnerStatus =
  | "requested"
  | "quoted"
  | "assigned"
  | "accepted"
  | "in_progress"
  | "completion_submitted"
  | "completed"
  | "disputed"
  | "cancelled"
  | "declined";

type FindingRunnerStepProps = {
  publicCode: string;
  status: FindingRunnerStatus | string;

  categoryLabel?: string;
  areaLabel?: string;

  error?: string;
  refreshing?: boolean;
  cancelling?: boolean;
  loading?: boolean;

  runnerAvailable?: boolean;
  canCancel?: boolean;
  matchingMessage?: string;

  onRefresh?: () => void;
  onCancel?: () => void;
  onRunnerFound?: () => void;
};

type ProgressState = "complete" | "active" | "pending";

type ProgressItemProps = {
  title: string;
  description: string;
  state: ProgressState;
  last?: boolean;
  colors: ReturnType<typeof useSaMiTheme>["colors"];
};

function ProgressItem({
  title,
  description,
  state,
  last = false,
  colors,
}: ProgressItemProps) {
  const complete = state === "complete";
  const active = state === "active";

  const stateColor = complete
    ? colors.success
    : active
      ? colors.blue
      : colors.border;

  return (
    <View style={styles.progressItem}>
      <View style={styles.progressRail}>
        <View
          style={[
            styles.progressCircle,
            {
              backgroundColor: complete
                ? colors.success
                : active
                  ? colors.blueSoft
                  : colors.surface,
              borderColor: stateColor,
            },
          ]}
        >
          {complete ? (
            <Ionicons
              name="checkmark"
              size={15}
              color="#FFFFFF"
            />
          ) : active ? (
            <ActivityIndicator
              size="small"
              color={colors.blue}
            />
          ) : (
            <View
              style={[
                styles.pendingDot,
                { backgroundColor: colors.border },
              ]}
            />
          )}
        </View>

        {!last ? (
          <View
            style={[
              styles.progressLine,
              {
                backgroundColor: complete
                  ? colors.success
                  : colors.border,
              },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.progressText}>
        <Text
          style={[
            styles.progressTitle,
            {
              color:
                active || complete
                  ? colors.text
                  : colors.textMuted,
            },
          ]}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.progressDescription,
            { color: colors.textMuted },
          ]}
        >
          {description}
        </Text>

        {active ? (
          <View
            style={[
              styles.activeLabel,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <Text
              style={[
                styles.activeLabelText,
                { color: colors.blue },
              ]}
            >
              CURRENT STAGE
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function RunnerIllustration({
  colors,
}: {
  colors: ReturnType<typeof useSaMiTheme>["colors"];
}) {
  return (
    <View style={styles.illustrationArea}>
      <View
        style={[
          styles.illustrationCircle,
          { backgroundColor: colors.blueSoft },
        ]}
      >
        <View
          style={[
            styles.routeDash,
            styles.routeDashTop,
            { borderColor: colors.blue },
          ]}
        />

        <View
          style={[
            styles.routeDash,
            styles.routeDashBottom,
            { borderColor: colors.success },
          ]}
        />

        <View
          style={[
            styles.runnerBadge,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <Ionicons
            name="bicycle-outline"
            size={68}
            color={colors.navy}
          />
        </View>

        <View
          style={[
            styles.mapPin,
            { backgroundColor: colors.success },
          ]}
        >
          <Ionicons
            name="location"
            size={23}
            color="#FFFFFF"
          />
        </View>

        <View
          style={[
            styles.smallSpark,
            styles.sparkOne,
            { backgroundColor: colors.amber },
          ]}
        />

        <View
          style={[
            styles.smallSpark,
            styles.sparkTwo,
            { backgroundColor: colors.success },
          ]}
        />

        <View
          style={[
            styles.smallSpark,
            styles.sparkThree,
            { backgroundColor: colors.blue },
          ]}
        />
      </View>
    </View>
  );
}

export default function FindingRunnerStep({
  publicCode,
  status,
  categoryLabel = "Errand",
  areaLabel,
  error,
  refreshing = false,
  cancelling = false,
  loading = false,
  runnerAvailable = false,
  canCancel,
  matchingMessage,
  onRefresh,
  onCancel,
  onRunnerFound,
}: FindingRunnerStepProps) {
  const { colors, mode } = useSaMiTheme();

  const normalizedStatus = status.toLowerCase();

  const hasAssignment = [
    "assigned",
    "accepted",
    "in_progress",
    "completion_submitted",
    "completed",
  ].includes(normalizedStatus);

  const runnerAccepted = [
    "accepted",
    "in_progress",
    "completion_submitted",
    "completed",
  ].includes(normalizedStatus);

  const isCancelled =
    normalizedStatus === "cancelled" ||
    normalizedStatus === "declined";

  const isDisputed = normalizedStatus === "disputed";
  const isCompleted = normalizedStatus === "completed";

  const canCancelRequest =
    canCancel ??
    ["requested", "quoted"].includes(normalizedStatus);

  const canOpenAssignment =
    hasAssignment && Boolean(onRunnerFound);

  const statusLabel = isCompleted
    ? "Completed"
    : isDisputed
      ? "Needs attention"
      : isCancelled
        ? "Closed"
        : runnerAccepted
          ? "Accepted"
          : hasAssignment
            ? "Assigned"
            : normalizedStatus === "quoted"
              ? "Under review"
              : "Submitted";

  const heading = isCompleted
    ? "Your errand is complete"
    : isDisputed
      ? "Your errand needs attention"
      : isCancelled
        ? "Errand matching stopped"
        : runnerAccepted
          ? "Your runner has accepted"
          : hasAssignment
            ? "Your runner has been assigned"
            : "Your request has been received";

  const subtitle = isCompleted
    ? "This errand has reached its completed status."
    : isDisputed
      ? "There is an issue requiring attention. Check your errand details for the latest information."
      : isCancelled
        ? "This request is no longer being matched with runners."
        : runnerAccepted
          ? "Your assigned runner has accepted the errand. You can continue to the runner details and tracking."
          : hasAssignment
            ? runnerAvailable
              ? "SaMi has confirmed a runner assignment. You can now view the assignment details."
              : "SaMi has confirmed a runner assignment. The customer-visible runner details are still being prepared."
            : matchingMessage ||
              "Your request has been recorded. This screen will show updates when the runner-matching service reports progress.";

  const progressStates = useMemo(() => {
    const first: ProgressState = "complete";

    const second: ProgressState = hasAssignment
      ? "complete"
      : isCancelled || isDisputed
        ? "pending"
        : "active";

    const third: ProgressState = runnerAccepted
      ? "complete"
      : hasAssignment
        ? "active"
        : "pending";

    return { first, second, third };
  }, [hasAssignment, runnerAccepted, isCancelled, isDisputed]);

  const stylesForTheme = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.paper,
        },
        card: {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        title: {
          color: colors.text,
        },
        muted: {
          color: colors.textMuted,
        },
        badgeBackground: {
          backgroundColor: hasAssignment
            ? colors.successSoft
            : isCancelled || isDisputed
              ? colors.dangerSoft
              : colors.blueSoft,
        },
        badgeText: {
          color: hasAssignment
            ? colors.success
            : isCancelled || isDisputed
              ? colors.red
              : colors.blue,
        },
        primaryButton: {
          backgroundColor: colors.blue,
        },
        primaryButtonText: {
          color: mode === "dark" ? "#081321" : "#FFFFFF",
        },
        secondaryButton: {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        secondaryButtonText: {
          color: colors.navy,
        },
        error: {
          color: colors.red,
          backgroundColor: colors.dangerSoft,
        },
        cancelButton: {
          borderColor: colors.red,
          backgroundColor: colors.surface,
        },
      }),
    [
      colors,
      mode,
      hasAssignment,
      isCancelled,
      isDisputed,
    ],
  );

  if (loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          stylesForTheme.container,
        ]}
      >
        <ActivityIndicator
          size="large"
          color={colors.blue}
        />

        <Text style={[styles.loadingTitle, stylesForTheme.title]}>
          Loading your errand
        </Text>

        <Text style={[styles.loadingText, stylesForTheme.muted]}>
          Checking the latest request status.
        </Text>
      </View>
    );
  }

  if (isCancelled || isDisputed || isCompleted) {
    const terminalIcon = isCompleted
      ? "checkmark-circle"
      : isDisputed
        ? "alert-circle"
        : "close-circle";

    const terminalColor = isCompleted
      ? colors.success
      : isDisputed
        ? colors.warning
        : colors.red;

    return (
      <ScrollView
        style={[styles.container, stylesForTheme.container]}
        contentContainerStyle={styles.terminalContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.terminalCard, stylesForTheme.card]}>
          <View
            style={[
              styles.terminalIcon,
              { backgroundColor: isCompleted
                ? colors.successSoft
                : isDisputed
                  ? colors.warningSoft
                  : colors.dangerSoft },
            ]}
          >
            <Ionicons
              name={terminalIcon}
              size={43}
              color={terminalColor}
            />
          </View>

          <Text
            style={[
              styles.terminalTitle,
              stylesForTheme.title,
            ]}
          >
            {heading}
          </Text>

          <Text
            style={[
              styles.terminalDescription,
              stylesForTheme.muted,
            ]}
          >
            {subtitle}
          </Text>

          <View
            style={[
              styles.requestCodeBox,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <Text
              style={[
                styles.requestCodeLabel,
                stylesForTheme.muted,
              ]}
            >
              REQUEST
            </Text>

            <Text
              style={[
                styles.requestCodeValue,
                stylesForTheme.title,
              ]}
            >
              {publicCode}
            </Text>
          </View>

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[
                styles.error,
                stylesForTheme.error,
              ]}
            >
              {error}
            </Text>
          ) : null}

          {onRefresh ? (
            <Pressable
              accessibilityRole="button"
              disabled={refreshing}
              onPress={onRefresh}
              style={[
                styles.primaryButton,
                stylesForTheme.primaryButton,
                refreshing && styles.disabled,
              ]}
            >
              {refreshing ? (
                <ActivityIndicator
                  color={stylesForTheme.primaryButtonText.color}
                />
              ) : (
                <Text
                  style={[
                    styles.primaryButtonText,
                    stylesForTheme.primaryButtonText,
                  ]}
                >
                  Refresh status
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[
        styles.container,
        stylesForTheme.container,
      ]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.eyebrow,
              { color: colors.blue },
            ]}
          >
            SAMI ERRANDS
          </Text>

          <Text
            style={[
              styles.stepCount,
              stylesForTheme.muted,
            ]}
          >
            STEP 4 OF 7
          </Text>
        </View>

        {onRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh runner matching status"
            disabled={refreshing}
            onPress={onRefresh}
            style={[
              styles.refreshButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              refreshing && styles.disabled,
            ]}
          >
            {refreshing ? (
              <ActivityIndicator color={colors.blue} />
            ) : (
              <Ionicons
                name="refresh"
                size={19}
                color={colors.blue}
              />
            )}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.progressBar}>
        {Array.from({ length: 7 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.progressSegment,
              {
                backgroundColor:
                  index < 4 ? colors.blue : colors.border,
              },
            ]}
          />
        ))}
      </View>

      <RunnerIllustration colors={colors} />

      <View style={styles.heading}>
        <Text
          style={[
            styles.title,
            stylesForTheme.title,
          ]}
        >
          {heading}
        </Text>

        <Text
          style={[
            styles.subtitle,
            stylesForTheme.muted,
          ]}
        >
          {subtitle}
        </Text>
      </View>

      <View
        style={[
          styles.requestCard,
          stylesForTheme.card,
        ]}
      >
        <View style={styles.requestHeader}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.requestCode,
                stylesForTheme.muted,
              ]}
            >
              REQUEST {publicCode}
            </Text>

            <Text
              style={[
                styles.requestCategory,
                stylesForTheme.title,
              ]}
            >
              {categoryLabel}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              stylesForTheme.badgeBackground,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: hasAssignment
                    ? colors.success
                    : colors.blue,
                },
              ]}
            />

            <Text
              style={[
                styles.statusText,
                stylesForTheme.badgeText,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        {areaLabel ? (
          <View style={styles.areaRow}>
            <Ionicons
              name="location-outline"
              size={15}
              color={colors.textMuted}
            />

            <Text
              style={[
                styles.areaText,
                stylesForTheme.muted,
              ]}
            >
              {areaLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.progressCard,
          stylesForTheme.card,
        ]}
      >
        <Text
          style={[
            styles.progressHeading,
            stylesForTheme.title,
          ]}
        >
          Request progress
        </Text>

        <ProgressItem
          title="Request recorded"
          description="Your errand request has been saved."
          state={progressStates.first}
          colors={colors}
        />

        <ProgressItem
          title="Runner matching"
          description={
            hasAssignment
              ? "The matching service has confirmed a runner assignment."
              : "Waiting for the matching service to report progress."
          }
          state={progressStates.second}
          colors={colors}
        />

        <ProgressItem
          title="Runner confirmation"
          description={
            runnerAccepted
              ? "Your assigned runner has accepted the errand."
              : hasAssignment
                ? "The assigned runner's acceptance is being confirmed."
                : "This step begins after a runner is assigned."
          }
          state={progressStates.third}
          last
          colors={colors}
        />
      </View>

      {hasAssignment && !runnerAvailable ? (
        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.blueSoft },
          ]}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={21}
            color={colors.blue}
          />

          <Text
            style={[
              styles.infoText,
              { color: colors.text },
            ]}
          >
            The assignment is confirmed. Runner details will appear
            once the customer-facing profile has been securely
            received.
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text
          accessibilityRole="alert"
          style={[
            styles.error,
            stylesForTheme.error,
          ]}
        >
          {error}
        </Text>
      ) : null}

      {hasAssignment ? (
        <Pressable
          accessibilityRole="button"
          disabled={!canOpenAssignment}
          onPress={onRunnerFound}
          style={[
            styles.primaryButton,
            stylesForTheme.primaryButton,
            !canOpenAssignment && styles.disabled,
          ]}
        >
          <Text
            style={[
              styles.primaryButtonText,
              stylesForTheme.primaryButtonText,
            ]}
          >
            {runnerAvailable
              ? "View your runner"
              : "View assignment status"}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.waitingFooter}>
          <ActivityIndicator
            color={colors.blue}
            size="small"
          />

          <Text
            style={[
              styles.waitingText,
              stylesForTheme.muted,
            ]}
          >
            Waiting for a matching update...
          </Text>
        </View>
      )}

      {onCancel && canCancelRequest && !hasAssignment ? (
        <Pressable
          accessibilityRole="button"
          disabled={cancelling}
          onPress={onCancel}
          style={[
            styles.cancelButton,
            stylesForTheme.cancelButton,
            cancelling && styles.disabled,
          ]}
        >
          {cancelling ? (
            <ActivityIndicator color={colors.red} />
          ) : (
            <Text
              style={[
                styles.cancelText,
                { color: colors.red },
              ]}
            >
              Cancel errand
            </Text>
          )}
        </Pressable>
      ) : null}

      <Text
        style={[
          styles.footerNote,
          stylesForTheme.muted,
        ]}
      >
        You can refresh this screen to check for the latest
        server-confirmed status.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 35,
    gap: 15,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  stepCount: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBar: {
    flexDirection: "row",
    gap: 5,
  },
  progressSegment: {
    height: 4,
    borderRadius: 4,
    flex: 1,
  },
  illustrationArea: {
    height: 205,
    justifyContent: "center",
    alignItems: "center",
  },
  illustrationCircle: {
    width: 188,
    height: 188,
    borderRadius: 94,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  runnerBadge: {
    width: 122,
    height: 122,
    borderRadius: 61,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  mapPin: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    right: 12,
    bottom: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  routeDash: {
    position: "absolute",
    width: 42,
    height: 25,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 18,
  },
  routeDashTop: {
    top: 30,
    left: 10,
    transform: [{ rotate: "-25deg" }],
  },
  routeDashBottom: {
    right: 2,
    top: 43,
    transform: [{ rotate: "25deg" }],
  },
  smallSpark: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sparkOne: {
    right: 27,
    top: 17,
  },
  sparkTwo: {
    left: 22,
    bottom: 37,
  },
  sparkThree: {
    right: 10,
    bottom: 79,
  },
  heading: {
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 5,
  },
  title: {
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  requestCard: {
    borderRadius: 15,
    borderWidth: 1,
    padding: 15,
    gap: 11,
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  requestCode: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  requestCategory: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  areaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  areaText: {
    fontSize: 11,
  },
  progressCard: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 16,
    gap: 1,
  },
  progressHeading: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 15,
  },
  progressItem: {
    flexDirection: "row",
    minHeight: 68,
    gap: 12,
  },
  progressRail: {
    alignItems: "center",
    width: 25,
  },
  progressCircle: {
    height: 25,
    width: 25,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  progressLine: {
    width: 2,
    flex: 1,
    minHeight: 35,
  },
  progressText: {
    flex: 1,
    paddingBottom: 14,
    gap: 4,
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  progressDescription: {
    fontSize: 11,
    lineHeight: 17,
  },
  activeLabel: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginTop: 3,
  },
  activeLabelText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  infoCard: {
    borderRadius: 13,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 19,
  },
  error: {
    padding: 12,
    borderRadius: 11,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 51,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "900",
  },
  waitingFooter: {
    minHeight: 43,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
  },
  waitingText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cancelButton: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 12,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.5,
  },
  footerNote: {
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 10,
  },
  loadingTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginTop: 8,
  },
  loadingText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  terminalContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  terminalCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    gap: 15,
  },
  terminalIcon: {
    width: 75,
    height: 75,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  terminalTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  terminalDescription: {
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
  },
  requestCodeBox: {
    width: "100%",
    padding: 13,
    borderRadius: 12,
    alignItems: "center",
    gap: 5,
  },
  requestCodeLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  requestCodeValue: {
    fontSize: 14,
    fontWeight: "900",
  },
});
