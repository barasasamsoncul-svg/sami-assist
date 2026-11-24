import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles";
import { PrimaryButton, RoutePoint, SectionHeading } from "./RunnerDashboardPrimitives";
import { activeStatusLabel, money, titleCase } from "../utils";
import type { useRunnerDashboard } from "../useRunnerDashboard";

type Props = { dashboard: ReturnType<typeof useRunnerDashboard> };

export function RunnerDashboardWorkspace({ dashboard }: Props) {
  const {
    colors, insets, authorized, activeJob, workspaceExpanded, setWorkspaceExpanded,
    refreshing, loadDashboard, runner, dashboardState, greetingName, jobs,
    loading, error, setError, mapError, setMapError, mapReady, navigationMode,
    restricted, goToApplicationStatus, routeCoordinatesMissing, activeRouteTarget,
    jobBusyId, advanceJob, routeState, canAcceptOffers, acceptJob, canChangeAvailability,
    availabilityBusy, isOnline, location, routeRemainingDistance, routeRemainingTime,
    toggleAvailability, goToProfile, signingOut, signOut,
  } = dashboard;
  return (
    <>
      {/* BOTTOM WORKSPACE */}

      {(!authorized || Boolean(activeJob)) ? (
      <View
        style={[
          styles.bottomWorkspace,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 14),
            height: workspaceExpanded ? "82%" : "36%",
            maxHeight: workspaceExpanded ? "84%" : "42%",
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            workspaceExpanded
              ? "Collapse runner workspace"
              : "Expand runner workspace"
          }
          accessibilityHint="Show more or less of your runner workspace."
          accessibilityState={{ expanded: workspaceExpanded }}
          onPress={() => setWorkspaceExpanded((current) => !current)}
          style={({ pressed }) => [
            styles.sheetToggle,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View
            style={[
              styles.sheetHandle,
              { backgroundColor: colors.borderStrong },
            ]}
          />

          <Ionicons
            style={styles.sheetToggleIcon}
            name={workspaceExpanded ? "chevron-down" : "chevron-up"}
            size={17}
            color={colors.textMuted}
          />
        </Pressable>

        <ScrollView
          style={styles.sheetScrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadDashboard(true)}
              tintColor={colors.blue}
            />
          }
        >
          {/* ACCOUNT HEADER */}

          <View style={styles.workspaceHeader}>
            <View style={styles.workspaceGreeting}>
              <Text
                style={[
                  styles.workspaceEyebrow,
                  { color: colors.textMuted },
                ]}
              >
                {runner?.serviceArea
                  ? runner.serviceArea.toUpperCase()
                  : "RUNNER WORKSPACE"}
              </Text>

              <Text
                style={[
                  styles.workspaceTitle,
                  { color: colors.text },
                ]}
              >
                Hello, {greetingName}
              </Text>

              <Text
                style={[
                  styles.workspaceSubtitle,
                  { color: colors.textMuted },
                ]}
              >
                {dashboardState === "searching"
                  ? "You're online. Waiting for an errand."
                  : dashboardState === "active"
                    ? "Your active errand is ready."
                    : dashboardState === "completion"
                      ? "Your submitted errand is awaiting Admin confirmation."
                      : dashboardState === "offers"
                        ? "New errands are available."
                        : dashboardState === "offline"
                          ? "Go online when you're ready to work."
                          : "Your Runner workspace."}
              </Text>
            </View>

            <View
              style={[
                styles.mapReadyBadge,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <Ionicons
                name="navigate"
                size={17}
                color={colors.blue}
              />
            </View>
          </View>

          {/* LOADING */}

          {dashboardState === "loading" ? (
            <View
              style={[
                styles.stateCard,
                { borderColor: colors.border },
              ]}
            >
              <ActivityIndicator
                size="large"
                color={colors.blue}
              />

              <Text
                style={[
                  styles.stateTitle,
                  { color: colors.text },
                ]}
              >
                Preparing your workspace
              </Text>

              <Text
                style={[
                  styles.stateDescription,
                  { color: colors.textMuted },
                ]}
              >
                Checking your account and assigned errands.
              </Text>
            </View>
          ) : null}

          {/* DASHBOARD ERROR */}

          {dashboardState === "error" ? (
            <View
              style={[
                styles.stateCard,
                { borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.stateIcon,
                  { backgroundColor: colors.dangerSoft },
                ]}
              >
                <Ionicons
                  name="cloud-offline-outline"
                  size={23}
                  color={colors.red}
                />
              </View>

              <Text
                style={[
                  styles.stateTitle,
                  { color: colors.text },
                ]}
              >
                Dashboard unavailable
              </Text>

              <Text
                style={[
                  styles.stateDescription,
                  { color: colors.textMuted },
                ]}
              >
                {error || "Your Runner account could not be loaded."}
              </Text>

              <PrimaryButton
                label="Try again"
                icon="refresh"
                onPress={() => void loadDashboard(true)}
                backgroundColor={colors.blueAction}
              />
            </View>
          ) : null}

          {/* RESTRICTED */}

          {dashboardState === "restricted" ? (
            <View
              style={[
                styles.noticeCard,
                {
                  backgroundColor: colors.dangerSoft,
                  borderColor: colors.red,
                },
              ]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={24}
                color={colors.red}
              />

              <View style={styles.noticeCopy}>
                <Text
                  style={[
                    styles.noticeTitle,
                    { color: colors.red },
                  ]}
                >
                  Account restricted
                </Text>

                <Text
                  style={[
                    styles.noticeDescription,
                    { color: colors.text },
                  ]}
                >
                  Your Runner account is not currently allowed to
                  accept errands. Contact SaMi support for assistance.
                </Text>
              </View>
            </View>
          ) : null}

          {/* VERIFICATION GATE */}

          {dashboardState === "unverified" ? (
            <View
              style={[
                styles.stateCard,
                { borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.stateIcon,
                  { backgroundColor: colors.warningSoft },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={24}
                  color={colors.warning}
                />
              </View>

              <SectionHeading
                eyebrow="Account verification"
                title="You're not approved yet"
                subtitle="Your account must be approved before you can go online and receive errands."
                colors={colors}
              />

              <PrimaryButton
                label="View application status"
                icon="document-text-outline"
                onPress={goToApplicationStatus}
                backgroundColor={colors.blueAction}
              />
            </View>
          ) : null}

          {/* ACTIVE ERRAND */}

          {dashboardState === "active" && activeJob ? (
            <View
              style={[
                styles.jobCard,
                { borderColor: colors.border },
              ]}
            >
              <View style={styles.jobCardHeader}>
                <View style={styles.jobTypeCopy}>
                  <Text
                    style={[
                      styles.eyebrow,
                      { color: colors.textMuted },
                    ]}
                  >
                    ACTIVE ERRAND
                  </Text>

                  <Text
                    style={[
                      styles.jobCode,
                      { color: colors.text },
                    ]}
                  >
                    {activeJob.publicCode}
                  </Text>
                </View>

                <View
                  style={[
                    styles.jobStatus,
                    { backgroundColor: colors.blueSoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.jobStatusText,
                      { color: colors.blue },
                    ]}
                  >
                    {activeStatusLabel(activeJob.status)}
                  </Text>
                </View>
              </View>

              <Text
                style={[
                  styles.jobTitle,
                  { color: colors.text },
                ]}
              >
                {activeJob.title}
              </Text>

              <Text
                style={[
                  styles.jobDescription,
                  { color: colors.textMuted },
                ]}
              >
                {activeJob.description}
              </Text>

              <View
                style={[
                  styles.routeCard,
                  {
                    backgroundColor: colors.paper,
                    borderColor: colors.border,
                  },
                ]}
              >
                <RoutePoint
                  icon="radio-button-on"
                  label="PICKUP"
                  value={activeJob.pickupLabel}
                  colors={colors}
                />

                <RoutePoint
                  icon="location"
                  label="DELIVERY"
                  value={activeJob.destinationLabel}
                  colors={colors}
                  last
                />
              </View>

              {routeCoordinatesMissing ? (
                <View
                  style={[
                    styles.routeWarning,
                    {
                      backgroundColor: colors.warningSoft,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={17}
                    color={colors.warning}
                  />

                  <Text
                    style={[
                      styles.routeWarningText,
                      { color: colors.text },
                    ]}
                  >
                    Route guidance is unavailable because the active
                    errand does not have valid coordinates for this stage.
                  </Text>
                </View>
              ) : null}

              <View style={styles.jobMetrics}>
                <View style={styles.jobMetric}>
                  <Text
                    style={[
                      styles.jobMetricLabel,
                      { color: colors.textMuted },
                    ]}
                  >
                    YOUR PAYOUT
                  </Text>

                  <Text
                    style={[
                      styles.jobPayout,
                      { color: colors.success },
                    ]}
                  >
                    {money(
                      activeJob.runnerPayoutAmount,
                      activeJob.currency,
                    )}
                  </Text>
                </View>

                <View style={styles.jobMetricRight}>
                  <Text
                    style={[
                      styles.jobMetricLabel,
                      { color: colors.textMuted },
                    ]}
                  >
                    DISTANCE
                  </Text>

                  <Text
                    style={[
                      styles.jobDistance,
                      { color: colors.text },
                    ]}
                  >
                    {activeJob.distanceKm == null
                      ? "Not available"
                      : `${activeJob.distanceKm.toFixed(1)} km`}
                  </Text>
                </View>
              </View>

              {activeJob.status === "accepted" ? (
                <PrimaryButton
                  label="Start errand"
                  icon="play"
                  loading={jobBusyId === activeJob.id}
                  disabled={Boolean(jobBusyId)}
                  onPress={() => void advanceJob(activeJob)}
                  backgroundColor={colors.blueAction}
                />
              ) : null}

              {activeJob.status === "in_progress" ? (
                <PrimaryButton
                  label="Submit completion"
                  icon="checkmark-circle-outline"
                  loading={jobBusyId === activeJob.id}
                  disabled={Boolean(jobBusyId)}
                  onPress={() => void advanceJob(activeJob)}
                  backgroundColor={colors.success}
                />
              ) : null}
            </View>
          ) : null}

          {/* WAITING FOR CUSTOMER */}

          {dashboardState === "completion" && activeJob ? (
            <View
              style={[
                styles.stateCard,
                { borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.stateIcon,
                  { backgroundColor: colors.successSoft },
                ]}
              >
                <Ionicons
                  name="checkmark-done-circle-outline"
                  size={26}
                  color={colors.success}
                />
              </View>

              <SectionHeading
                eyebrow="Completion submitted"
                title="Waiting for Admin confirmation"
                subtitle="Your completion has been submitted. SaMi Admin will review and confirm it before this errand is fully closed."
                colors={colors}
              />

              <Text
                style={[
                  styles.completionCode,
                  { color: colors.text },
                ]}
              >
                {activeJob.publicCode}
              </Text>

              <PrimaryButton
                label="Refresh status"
                icon="refresh"
                onPress={() => void loadDashboard(true)}
                loading={refreshing}
                backgroundColor={colors.blueAction}
              />
            </View>
          ) : null}

          {/* ERRAND OFFERS */}

          {dashboardState === "offers" ? (
            <View style={styles.offerSection}>
              <SectionHeading
                eyebrow="Available work"
                title={`${jobs.offers.length} available ${
                  jobs.offers.length === 1 ? "errand" : "errands"
                }`}
                subtitle="Review the details before accepting an errand."
                colors={colors}
              />

              {jobs.offers.map((job) => (
                <View
                  key={job.id}
                  style={[
                    styles.offerCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  <View style={styles.offerHeader}>
                    <View style={styles.offerCodeCopy}>
                      <Text
                        style={[
                          styles.eyebrow,
                          { color: colors.textMuted },
                        ]}
                      >
                        {job.publicCode}
                      </Text>

                      <Text
                        style={[
                          styles.offerTitle,
                          { color: colors.text },
                        ]}
                      >
                        {job.title}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.offerPayout,
                        { color: colors.success },
                      ]}
                    >
                      {money(
                        job.runnerPayoutAmount,
                        job.currency,
                      )}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.offerDescription,
                      { color: colors.textMuted },
                    ]}
                    numberOfLines={3}
                  >
                    {job.description}
                  </Text>

                  <View
                    style={[
                      styles.routeCard,
                      {
                        backgroundColor: colors.paper,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <RoutePoint
                      icon="radio-button-on"
                      label="PICKUP"
                      value={job.pickupLabel}
                      colors={colors}
                    />

                    <RoutePoint
                      icon="location"
                      label="DELIVERY"
                      value={job.destinationLabel}
                      colors={colors}
                      last
                    />
                  </View>

                  <View style={styles.offerFooter}>
                    <View style={styles.distanceChip}>
                      <Ionicons
                        name="navigate-outline"
                        size={15}
                        color={colors.textMuted}
                      />

                      <Text
                        style={[
                          styles.distanceText,
                          { color: colors.textMuted },
                        ]}
                      >
                        {job.distanceKm == null
                          ? "Distance unavailable"
                          : `${job.distanceKm.toFixed(1)} km`}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.categoryText,
                        { color: colors.textMuted },
                      ]}
                    >
                      {job.category}
                    </Text>
                  </View>

                  <PrimaryButton
                    label="Accept errand"
                    icon="checkmark-circle-outline"
                    loading={jobBusyId === job.id}
                    disabled={!canAcceptOffers || Boolean(jobBusyId)}
                    onPress={() => void acceptJob(job)}
                    backgroundColor={colors.blueAction}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {/* ONLINE SEARCHING */}

          {dashboardState === "searching" ? (
            <View
              style={[
                styles.stateCard,
                { borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.searchingIcon,
                  { backgroundColor: colors.successSoft },
                ]}
              >
                <Ionicons
                  name="radio"
                  size={24}
                  color={colors.success}
                />
              </View>

              <SectionHeading
                eyebrow="Runner active"
                title="Looking for errands"
                subtitle="You're available. SaMi will show eligible errands here when they are assigned to you."
                colors={colors}
              />

              <View
                style={[
                  styles.searchingStatus,
                  { backgroundColor: colors.successSoft },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: colors.success },
                  ]}
                />

                <Text
                  style={[
                    styles.searchingStatusText,
                    { color: colors.success },
                  ]}
                >
                  YOU ARE ONLINE
                </Text>
              </View>
            </View>
          ) : null}

          {/* OFFLINE */}

          {dashboardState === "offline" ? (
            <View
              style={[
                styles.stateCard,
                { borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.stateIcon,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="power-outline"
                  size={25}
                  color={colors.blue}
                />
              </View>

              <SectionHeading
                eyebrow="Availability"
                title="Ready to start working?"
                subtitle="Go online to make yourself available for eligible errands."
                colors={colors}
              />

              <PrimaryButton
                label="Go online"
                icon="radio"
                loading={availabilityBusy}
                disabled={!canChangeAvailability}
                onPress={() => void toggleAvailability()}
                backgroundColor={colors.success}
              />
            </View>
          ) : null}

          {/* ERROR NOTICES */}

          {error ? (
            <View
              style={[
                styles.errorNotice,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={19}
                color={colors.red}
              />

              <Text
                style={[
                  styles.errorNoticeText,
                  { color: colors.red },
                ]}
              >
                {error}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
                onPress={() => setError("")}
                hitSlop={8}
              >
                <Ionicons
                  name="close"
                  size={19}
                  color={colors.red}
                />
              </Pressable>
            </View>
          ) : null}

          {/* MAP ERROR */}

          {mapError ? (
            <View
              style={[
                styles.errorNotice,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="map-outline"
                size={19}
                color={colors.red}
              />

              <Text
                style={[
                  styles.errorNoticeText,
                  { color: colors.red },
                ]}
              >
                Mapbox: {mapError}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss map error"
                onPress={() => setMapError("")}
                hitSlop={8}
              >
                <Ionicons
                  name="close"
                  size={19}
                  color={colors.red}
                />
              </Pressable>
            </View>
          ) : null}

          {/* MAP / LOCATION STATUS */}

          <View
            style={[
              styles.mapInformation,
              { borderColor: colors.border },
            ]}
          >
            <View style={styles.mapInformationRow}>
              <Ionicons
                name="map-outline"
                size={17}
                color={colors.blue}
              />

              <Text
                style={[
                  styles.mapInformationTitle,
                  { color: colors.text },
                ]}
              >
                SaMi Mapbox
              </Text>

              <View style={{ flex: 1 }} />

              <View
                style={[
                  styles.mapReadyStatus,
                  {
                    backgroundColor: mapReady
                      ? colors.successSoft
                      : colors.warningSoft,
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: mapReady
                        ? colors.success
                        : colors.warning,
                    },
                  ]}
                />

                <Text
                  style={[
                    styles.mapReadyStatusText,
                    {
                      color: mapReady
                        ? colors.success
                        : colors.warning,
                    },
                  ]}
                >
                  {mapReady ? "READY" : "CONNECTING"}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.mapInformationDescription,
                { color: colors.textMuted },
              ]}
            >
              {routeCoordinatesMissing
                ? "Route guidance is unavailable because the active errand's current destination has no valid coordinates."
                : activeRouteTarget && routeState.status === "active"
                  ? `Navigating to ${
                      activeRouteTarget.stage === "pickup"
                        ? "pickup"
                        : "delivery"
                    }${routeRemainingDistance
                      ? ` • ${routeRemainingDistance} remaining`
                      : ""}${
                      routeRemainingTime
                        ? ` • ${routeRemainingTime} ETA`
                        : ""
                    }.`
                  : activeRouteTarget &&
                      routeState.status === "requesting"
                    ? "Calculating your route to the active errand."
                    : activeRouteTarget &&
                        routeState.status === "waiting_for_location"
                      ? "Waiting for an accurate GPS position before calculating your route."
                      : activeRouteTarget &&
                          routeState.status === "error"
                        ? routeState.message ||
                          "Mapbox could not calculate the active route."
                        : navigationMode === "free_drive"
                          ? "Enhanced location matching is active."
                          : location?.enhanced
                            ? "Your latest position is map matched."
                            : "Live positioning quality depends on GPS signal and device conditions."}
            </Text>
          </View>

          {/* AVAILABILITY CONTROL */}

          {authorized &&
          dashboardState !== "completion" &&
          dashboardState !== "active" ? (
            <View
              style={[
                styles.availabilityFooter,
                { borderColor: colors.border },
              ]}
            >
              <View style={styles.availabilityCopy}>
                <Text
                  style={[
                    styles.availabilityTitle,
                    { color: colors.text },
                  ]}
                >
                  {isOnline ? "You're online" : "You're offline"}
                </Text>

                <Text
                  style={[
                    styles.availabilitySubtitle,
                    { color: colors.textMuted },
                  ]}
                >
                  {isOnline
                    ? "You can receive eligible errands."
                    : "You won't receive errand offers while offline."}
                </Text>
              </View>

              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: isOnline }}
                accessibilityLabel="Runner availability"
                disabled={!canChangeAvailability}
                onPress={() => void toggleAvailability()}
                style={({ pressed }) => [
                  styles.availabilitySwitch,
                  {
                    backgroundColor: isOnline
                      ? colors.success
                      : colors.borderStrong,
                    opacity: canChangeAvailability
                      ? pressed
                        ? 0.75
                        : 1
                      : 0.5,
                  },
                ]}
              >
                {availabilityBusy ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View
                    style={[
                      styles.availabilitySwitchKnob,
                      {
                        alignSelf: isOnline
                          ? "flex-end"
                          : "flex-start",
                      },
                    ]}
                  />
                )}
              </Pressable>
            </View>
          ) : null}

          {/* PROFILE AND SIGN OUT */}

          <View style={styles.accountFooter}>
            <Pressable
              accessibilityRole="button"
              onPress={goToProfile}
              style={[
                styles.accountAction,
                { borderColor: colors.border },
              ]}
            >
              <Ionicons
                name="person-circle-outline"
                size={20}
                color={colors.textMuted}
              />

              <Text
                style={[
                  styles.accountActionText,
                  { color: colors.text },
                ]}
              >
                Runner profile
              </Text>

              <Ionicons
                name="chevron-forward"
                size={17}
                color={colors.textMuted}
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={signingOut}
              onPress={signOut}
              style={styles.signOutAction}
            >
              {signingOut ? (
                <ActivityIndicator
                  size="small"
                  color={colors.red}
                />
              ) : (
                <Ionicons
                  name="log-out-outline"
                  size={18}
                  color={colors.red}
                />
              )}

              <Text
                style={[
                  styles.signOutText,
                  { color: colors.red },
                ]}
              >
                Sign out
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
      ) : null}

    </>
  );
}
