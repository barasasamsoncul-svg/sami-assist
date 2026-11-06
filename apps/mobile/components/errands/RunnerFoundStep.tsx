
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSaMiTheme } from "@/theme";

export type ErrandRunnerProfile = {
  id: string;
  fullName: string;
  photoUrl?: string | null;
  ratingAverage?: number | null;
  ratingCount?: number;
  completedJobs?: number;
  verified?: boolean;
  backgroundChecked?: boolean;
  serviceArea?: string | null;
};

export type RunnerProgressState =
  | "completed"
  | "current"
  | "pending";

export type RunnerProgressItem = {
  id: string;
  label: string;
  time?: string | null;
  state: RunnerProgressState;
};

export type RunnerFoundStepProps = {
  publicCode: string;
  status: string;
  runner: ErrandRunnerProfile | null;

  categoryLabel?: string;
  activityMessage?: string;
  progress?: RunnerProgressItem[];

  canMessage?: boolean;
  canCall?: boolean;

  loading?: boolean;
  error?: string;

  onMessage?: () => void;
  onCall?: () => void;
  onRefresh?: () => void;
  onTracking?: () => void;

  /*
   * Kept temporarily for compatibility with existing callers.
   * Cancellation is deliberately not offered from this screen:
   * cancelling after assignment requires Runner-side coordination.
   */
  canCancel?: boolean;
  cancelling?: boolean;
  onCancel?: () => void;
};

const ACTIVE_STATUSES = new Set([
  "assigned",
  "accepted",
  "in_progress",
]);

function formatRating(value?: number | null): string | null {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 5
  ) {
    return null;
  }

  return value.toFixed(1);
}

function isUsableRunner(
  runner: ErrandRunnerProfile | null,
): runner is ErrandRunnerProfile {
  return Boolean(
    runner &&
      typeof runner.id === "string" &&
      runner.id.trim() &&
      typeof runner.fullName === "string" &&
      runner.fullName.trim(),
  );
}

function getStatusPresentation(status: string) {
  switch (status) {
    case "assigned":
      return {
        label: "Runner assigned",
        title: "Your runner has been found!",
        description:
          "Your runner has been assigned to this errand. You can view their profile and follow updates here.",
        icon: "checkmark-circle" as const,
      };

    case "accepted":
      return {
        label: "Runner accepted",
        title: "Your runner is ready!",
        description:
          "Your runner has accepted the errand. Follow the progress here as the work gets underway.",
        icon: "checkmark-circle" as const,
      };

    case "in_progress":
      return {
        label: "Errand in progress",
        title: "Your errand is underway",
        description:
          "Your runner has started working on your errand. Open the tracking screen to follow its progress.",
        icon: "walk" as const,
      };

    case "completion_submitted":
      return {
        label: "Completion submitted",
        title: "Your runner has submitted completion",
        description:
          "The runner has reported the errand as completed. The completion screen will handle the next customer action.",
        icon: "checkmark-done" as const,
      };

    default:
      return {
        label: "Runner details",
        title: "Your runner details",
        description:
          "The runner information for this errand is shown below.",
        icon: "person" as const,
      };
  }
}

function RunnerVerificationBadge({
  label,
  icon,
}: {
  label: string;
  icon: "shield-checkmark" | "checkmark-circle";
}) {
  const { colors: palette } = useSaMiTheme();

  return (
    <View
      style={[
        styles.verificationBadge,
        { backgroundColor: palette.successSoft },
      ]}
    >
      <Ionicons
        name={icon}
        size={13}
        color={palette.success}
      />

      <Text
        style={[
          styles.verificationText,
          { color: palette.success },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function RunnerProfileCard({
  runner,
}: {
  runner: ErrandRunnerProfile;
}) {
  const { colors: palette } = useSaMiTheme();

  const rating = formatRating(runner.ratingAverage);
  const completedJobs =
    typeof runner.completedJobs === "number" &&
    Number.isFinite(runner.completedJobs) &&
    runner.completedJobs >= 0
      ? Math.floor(runner.completedJobs)
      : null;

  const ratingCount =
    typeof runner.ratingCount === "number" &&
    Number.isFinite(runner.ratingCount) &&
    runner.ratingCount >= 0
      ? Math.floor(runner.ratingCount)
      : 0;

  const photoUrl =
    typeof runner.photoUrl === "string" &&
    runner.photoUrl.trim()
      ? runner.photoUrl.trim()
      : null;

  return (
    <View
      style={[
        styles.runnerCard,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <Text
        style={[
          styles.cardEyebrow,
          { color: palette.textMuted },
        ]}
      >
        YOUR RUNNER
      </Text>

      <View style={styles.runnerIdentity}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={[
              styles.avatar,
              { backgroundColor: palette.blueSoft },
            ]}
            resizeMode="cover"
            accessibilityLabel={`${runner.fullName}'s profile photo`}
          />
        ) : (
          <View
            style={[
              styles.avatarFallback,
              { backgroundColor: palette.blueSoft },
            ]}
          >
            <Ionicons
              name="person"
              size={32}
              color={palette.blue}
            />
          </View>
        )}

        <View style={styles.runnerInfo}>
          <Text
            style={[
              styles.runnerName,
              { color: palette.text },
            ]}
          >
            {runner.fullName.trim()}
          </Text>

          <View style={styles.ratingRow}>
            {rating !== null ? (
              <>
                <Ionicons
                  name="star"
                  size={14}
                  color={palette.amber}
                />

                <Text
                  style={[
                    styles.ratingText,
                    { color: palette.text },
                  ]}
                >
                  {rating}
                </Text>

                <Text
                  style={[
                    styles.ratingCount,
                    { color: palette.textMuted },
                  ]}
                >
                  ({ratingCount}{" "}
                  {ratingCount === 1 ? "rating" : "ratings"})
                </Text>
              </>
            ) : (
              <Text
                style={[
                  styles.newRunnerText,
                  { color: palette.textMuted },
                ]}
              >
                New runner
              </Text>
            )}
          </View>

          {runner.serviceArea?.trim() ? (
            <View style={styles.runnerAreaRow}>
              <Ionicons
                name="location-outline"
                size={12}
                color={palette.textMuted}
              />

              <Text
                style={[
                  styles.runnerArea,
                  { color: palette.textMuted },
                ]}
              >
                {runner.serviceArea.trim()}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.runnerStats,
          { borderTopColor: palette.border },
        ]}
      >
        <View style={styles.runnerStat}>
          <Text
            style={[
              styles.runnerStatValue,
              { color: palette.text },
            ]}
          >
            {completedJobs === null
              ? "—"
              : completedJobs.toLocaleString()}
          </Text>

          <Text
            style={[
              styles.runnerStatLabel,
              { color: palette.textMuted },
            ]}
          >
            Completed errands
          </Text>
        </View>

        <View
          style={[
            styles.runnerStatDivider,
            { backgroundColor: palette.border },
          ]}
        />

        <View style={styles.runnerStat}>
          <Text
            style={[
              styles.runnerStatValue,
              { color: palette.text },
            ]}
          >
            {ratingCount.toLocaleString()}
          </Text>

          <Text
            style={[
              styles.runnerStatLabel,
              { color: palette.textMuted },
            ]}
          >
            Ratings
          </Text>
        </View>
      </View>

      {(runner.verified || runner.backgroundChecked) ? (
        <View style={styles.badges}>
          {runner.verified ? (
            <RunnerVerificationBadge
              label="Verified"
              icon="checkmark-circle"
            />
          ) : null}

          {runner.backgroundChecked ? (
            <RunnerVerificationBadge
              label="Background checked"
              icon="shield-checkmark"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function RunnerProgress({
  items,
}: {
  items: RunnerProgressItem[];
}) {
  const { colors: palette } = useSaMiTheme();

  if (items.length === 0) {
    return (
      <View
        style={[
          styles.emptyProgress,
          { backgroundColor: palette.surface },
        ]}
      >
        <Ionicons
          name="time-outline"
          size={20}
          color={palette.muted}
        />

        <Text
          style={[
            styles.emptyProgressText,
            { color: palette.textMuted },
          ]}
        >
          Progress updates will appear here as they become available.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.progressContainer}>
      {items.map((item, index) => {
        const completed = item.state === "completed";
        const current = item.state === "current";
        const last = index === items.length - 1;

        const markerColor = completed
          ? palette.success
          : current
            ? palette.blue
            : palette.border;

        return (
          <View
            key={`${item.id}-${index}`}
            style={styles.progressItem}
          >
            <View style={styles.progressRail}>
              <View
                style={[
                  styles.progressMarker,
                  {
                    backgroundColor: completed
                      ? palette.success
                      : current
                        ? palette.blueSoft
                        : palette.surface,
                    borderColor: markerColor,
                  },
                ]}
              >
                {completed ? (
                  <Ionicons
                    name="checkmark"
                    size={13}
                    color="#FFFFFF"
                  />
                ) : current ? (
                  <View
                    style={[
                      styles.currentDot,
                      { backgroundColor: palette.blue },
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.pendingDot,
                      { backgroundColor: palette.border },
                    ]}
                  />
                )}
              </View>

              {!last ? (
                <View
                  style={[
                    styles.progressLine,
                    {
                      backgroundColor: completed
                        ? palette.success
                        : palette.border,
                    },
                  ]}
                />
              ) : null}
            </View>

            <View style={styles.progressContent}>
              <Text
                style={[
                  styles.progressLabel,
                  {
                    color:
                      completed || current
                        ? palette.text
                        : palette.textMuted,
                  },
                ]}
              >
                {item.label}
              </Text>

              {item.time?.trim() ? (
                <Text
                  style={[
                    styles.progressTime,
                    { color: palette.textMuted },
                  ]}
                >
                  {item.time.trim()}
                </Text>
              ) : null}

              {current ? (
                <View
                  style={[
                    styles.currentBadge,
                    { backgroundColor: palette.blueSoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.currentBadgeText,
                      { color: palette.blue },
                    ]}
                  >
                    CURRENT STAGE
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RunnerUnavailable({
  loading,
}: {
  loading: boolean;
}) {
  const { colors: palette } = useSaMiTheme();

  return (
    <View
      style={[
        styles.unavailableCard,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="large"
          color={palette.blue}
        />
      ) : (
        <View
          style={[
            styles.unavailableIcon,
            { backgroundColor: palette.blueSoft },
          ]}
        >
          <Ionicons
            name="person-outline"
            size={30}
            color={palette.blue}
          />
        </View>
      )}

      <Text
        style={[
          styles.unavailableTitle,
          { color: palette.text },
        ]}
      >
        {loading
          ? "Loading runner details"
          : "Runner details unavailable"}
      </Text>

      <Text
        style={[
          styles.unavailableDescription,
          { color: palette.textMuted },
        ]}
      >
        {loading
          ? "Your runner information is being retrieved."
          : "The runner profile has not been supplied for this errand yet. The details will appear here when they are available."}
      </Text>
    </View>
  );
}

function ErrandReference({
  publicCode,
}: {
  publicCode: string;
}) {
  const { colors: palette } = useSaMiTheme();

  const reference = publicCode.trim();

  if (!reference) {
    return null;
  }

  return (
    <View
      style={[
        styles.referenceCard,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.referenceLeft}>
        <Ionicons
          name="receipt-outline"
          size={16}
          color={palette.textMuted}
        />

        <Text
          style={[
            styles.referenceLabel,
            { color: palette.textMuted },
          ]}
        >
          ERRAND REFERENCE
        </Text>
      </View>

      <Text
        selectable
        style={[
          styles.referenceValue,
          { color: palette.text },
        ]}
      >
        {reference}
      </Text>
    </View>
  );
}

export default function RunnerFoundStep({
  publicCode,
  status,
  runner,
  categoryLabel = "Your errand",
  activityMessage,
  progress = [],
  canMessage = false,
  canCall = false,
  loading = false,
  error,
  onMessage,
  onCall,
  onRefresh,
  onTracking,
}: RunnerFoundStepProps) {
  const { colors: palette } = useSaMiTheme();

  const hasRunner = isUsableRunner(runner);
  const statusPresentation = getStatusPresentation(status);

  const communicationAvailable =
    ACTIVE_STATUSES.has(status) && hasRunner;

  const showMessageAction =
    communicationAvailable &&
    canMessage &&
    typeof onMessage === "function";

  const showCallAction =
    communicationAvailable &&
    canCall &&
    typeof onCall === "function";

  const showTrackingAction =
    hasRunner &&
    ACTIVE_STATUSES.has(status) &&
    typeof onTracking === "function";

  const cleanActivityMessage =
    typeof activityMessage === "string"
      ? activityMessage.trim()
      : "";

  return (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: palette.paper },
      ]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <View style={styles.headerText}>
          <Text
            style={[
              styles.eyebrow,
              { color: palette.blue },
            ]}
          >
            SAMI ERRANDS
          </Text>

          <Text
            style={[
              styles.stepCount,
              { color: palette.textMuted },
            ]}
          >
            STEP 5 OF 7 · RUNNER FOUND
          </Text>
        </View>

        {onRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh runner details"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            onPress={onRefresh}
            style={[
              styles.refreshButton,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
              loading && styles.disabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={palette.blue} />
            ) : (
              <Ionicons
                name="refresh"
                size={19}
                color={palette.blue}
              />
            )}
          </Pressable>
        ) : null}
      </View>

      <View
        style={styles.progressBar}
        accessibilityLabel="Step 5 of 7"
      >
        {Array.from({ length: 7 }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressSegment,
              {
                backgroundColor:
                  index < 5
                    ? palette.blue
                    : palette.border,
              },
            ]}
          />
        ))}
      </View>

      <ErrandReference publicCode={publicCode} />

      {hasRunner ? (
        <>
          <View style={styles.heading}>
            <View
              style={[
                styles.foundIcon,
                { backgroundColor: palette.successSoft },
              ]}
            >
              <Ionicons
                name={statusPresentation.icon}
                size={23}
                color={palette.success}
              />
            </View>

            <View
              style={[
                styles.statusPill,
                { backgroundColor: palette.successSoft },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: palette.success },
                ]}
              />

              <Text
                style={[
                  styles.statusPillText,
                  { color: palette.success },
                ]}
              >
                {statusPresentation.label}
              </Text>
            </View>

            <Text
              style={[
                styles.title,
                { color: palette.text },
              ]}
            >
              {statusPresentation.title}
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: palette.textMuted },
              ]}
            >
              {statusPresentation.description}
            </Text>
          </View>

          <RunnerProfileCard runner={runner} />

          {cleanActivityMessage ? (
            <View
              style={[
                styles.messageCard,
                { backgroundColor: palette.blueSoft },
              ]}
            >
              <View
                style={[
                  styles.messageIcon,
                  { backgroundColor: palette.surface },
                ]}
              >
                <Ionicons
                  name="chatbubble-ellipses"
                  size={19}
                  color={palette.blue}
                />
              </View>

              <View style={styles.messageContent}>
                <Text
                  style={[
                    styles.messageSender,
                    { color: palette.text },
                  ]}
                >
                  {runner.fullName.trim()}
                </Text>

                <Text
                  style={[
                    styles.messageText,
                    { color: palette.text },
                  ]}
                >
                  {cleanActivityMessage}
                </Text>
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.statusStrip,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.statusStripItem}>
              <Ionicons
                name="person"
                size={18}
                color={palette.success}
              />

              <Text
                style={[
                  styles.statusStripLabel,
                  { color: palette.textMuted },
                ]}
              >
                Runner
              </Text>
            </View>

            <View
              style={[
                styles.statusConnector,
                { backgroundColor: palette.border },
              ]}
            />

            <View style={styles.statusStripItem}>
              <Ionicons
                name="briefcase-outline"
                size={18}
                color={palette.blue}
              />

              <Text
                style={[
                  styles.statusStripLabel,
                  { color: palette.textMuted },
                ]}
                numberOfLines={1}
              >
                {categoryLabel}
              </Text>
            </View>

            <View
              style={[
                styles.statusConnector,
                { backgroundColor: palette.border },
              ]}
            />

            <View style={styles.statusStripItem}>
              <Ionicons
                name="checkmark-done"
                size={18}
                color={palette.muted}
              />

              <Text
                style={[
                  styles.statusStripLabel,
                  { color: palette.textMuted },
                ]}
              >
                Completion
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.progressCard,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.progressCardHeader}>
              <View>
                <Text
                  style={[
                    styles.progressHeading,
                    { color: palette.text },
                  ]}
                >
                  Errand progress
                </Text>

                <Text
                  style={[
                    styles.progressSubheading,
                    { color: palette.textMuted },
                  ]}
                >
                  Updates for this errand
                </Text>
              </View>

              <Ionicons
                name="list-outline"
                size={19}
                color={palette.blue}
              />
            </View>

            <RunnerProgress items={progress} />
          </View>

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[
                styles.error,
                {
                  color: palette.red,
                  backgroundColor: palette.dangerSoft,
                },
              ]}
            >
              {error}
            </Text>
          ) : null}

          {(showMessageAction || showCallAction) ? (
            <View style={styles.actions}>
              {showMessageAction ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onMessage}
                  style={[
                    styles.secondaryAction,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={17}
                    color={palette.text}
                  />

                  <Text
                    style={[
                      styles.secondaryActionText,
                      { color: palette.text },
                    ]}
                  >
                    Message
                  </Text>
                </Pressable>
              ) : null}

              {showCallAction ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onCall}
                  style={[
                    styles.secondaryAction,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="call-outline"
                    size={17}
                    color={palette.text}
                  />

                  <Text
                    style={[
                      styles.secondaryActionText,
                      { color: palette.text },
                    ]}
                  >
                    Call
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {showTrackingAction ? (
            <Pressable
              accessibilityRole="button"
              onPress={onTracking}
              style={[
                styles.primaryAction,
                { backgroundColor: palette.blue },
              ]}
            >
              <Text style={styles.primaryActionText}>
                View errand tracking
              </Text>

              <Ionicons
                name="arrow-forward"
                size={17}
                color="#FFFFFF"
              />
            </Pressable>
          ) : null}

          <Text
            style={[
              styles.footerNote,
              { color: palette.textMuted },
            ]}
          >
            Keep errand updates and communication within SaMi.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.heading}>
            <View
              style={[
                styles.foundIcon,
                { backgroundColor: palette.blueSoft },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={23}
                color={palette.blue}
              />
            </View>

            <Text
              style={[
                styles.title,
                { color: palette.text },
              ]}
            >
              Runner information
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: palette.textMuted },
              ]}
            >
              The runner profile has not been supplied for this errand yet.
            </Text>
          </View>

          <RunnerUnavailable loading={loading} />

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[
                styles.error,
                {
                  color: palette.red,
                  backgroundColor: palette.dangerSoft,
                },
              ]}
            >
              {error}
            </Text>
          ) : null}

          {onRefresh ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: loading }}
              disabled={loading}
              onPress={onRefresh}
              style={[
                styles.primaryAction,
                { backgroundColor: palette.blue },
                loading && styles.disabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryActionText}>
                    Refresh details
                  </Text>

                  <Ionicons
                    name="refresh"
                    size={17}
                    color="#FFFFFF"
                  />
                </>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 36,
    gap: 15,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerText: {
    flex: 1,
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
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 1,
  },
  progressBar: {
    flexDirection: "row",
    gap: 5,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 4,
  },
  referenceCard: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  referenceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  referenceLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  referenceValue: {
    fontSize: 11,
    fontWeight: "900",
  },
  heading: {
    alignItems: "center",
    gap: 9,
    paddingVertical: 7,
  },
  foundIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    paddingHorizontal: 7,
  },
  runnerCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  cardEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  runnerIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  avatar: {
    height: 70,
    width: 70,
    borderRadius: 35,
  },
  avatarFallback: {
    height: 70,
    width: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
  },
  runnerInfo: {
    flex: 1,
    gap: 6,
  },
  runnerName: {
    fontSize: 17,
    fontWeight: "900",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "900",
  },
  ratingCount: {
    fontSize: 10,
  },
  newRunnerText: {
    fontSize: 11,
    fontWeight: "700",
  },
  runnerAreaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  runnerArea: {
    flexShrink: 1,
    fontSize: 10,
  },
  runnerStats: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  runnerStat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  runnerStatValue: {
    fontSize: 16,
    fontWeight: "900",
  },
  runnerStatLabel: {
    fontSize: 9,
    fontWeight: "600",
  },
  runnerStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  verificationBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
    gap: 5,
  },
  verificationText: {
    fontSize: 10,
    fontWeight: "800",
  },
  messageCard: {
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  messageIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  messageContent: {
    flex: 1,
    gap: 4,
  },
  messageSender: {
    fontSize: 12,
    fontWeight: "900",
  },
  messageText: {
    fontSize: 12,
    lineHeight: 18,
  },
  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 9,
  },
  statusStripItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 6,
  },
  statusStripLabel: {
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
  },
  statusConnector: {
    height: 2,
    width: 14,
    marginBottom: 16,
  },
  progressCard: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 15,
  },
  progressCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  progressHeading: {
    fontSize: 14,
    fontWeight: "900",
  },
  progressSubheading: {
    fontSize: 10,
    marginTop: 4,
  },
  progressContainer: {
    gap: 0,
  },
  progressItem: {
    flexDirection: "row",
    gap: 11,
    minHeight: 57,
  },
  progressRail: {
    width: 24,
    alignItems: "center",
  },
  progressMarker: {
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    zIndex: 1,
  },
  currentDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  progressLine: {
    width: 2,
    flex: 1,
    minHeight: 33,
  },
  progressContent: {
    flex: 1,
    gap: 4,
    paddingBottom: 12,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  progressTime: {
    fontSize: 10,
  },
  currentBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 3,
  },
  currentBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  emptyProgress: {
    minHeight: 62,
    borderRadius: 10,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  emptyProgressText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
    gap: 8,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: "800",
  },
  primaryAction: {
    minHeight: 51,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 15,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  unavailableCard: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 25,
    alignItems: "center",
    gap: 11,
    marginTop: 8,
  },
  unavailableIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  unavailableTitle: {
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  unavailableDescription: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 19,
  },
  error: {
    borderRadius: 11,
    padding: 12,
    fontSize: 12,
    lineHeight: 18,
  },
  footerNote: {
    fontSize: 10,
    textAlign: "center",
    lineHeight: 16,
  },
  disabled: {
    opacity: 0.5,
  },
});
