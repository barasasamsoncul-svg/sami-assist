import { View } from "react-native";
import { SaMiRunnerDashboardChrome } from "@/components/RunnerDashboardChrome";
import { styles } from "./styles";
import { useRunnerDashboard } from "./useRunnerDashboard";
import { RunnerDashboardMapLayer } from "./components/RunnerDashboardMapLayer";
import { RunnerDashboardWorkspace } from "./components/RunnerDashboardWorkspace";

export default function RunnerDashboardView() {
  const dashboard = useRunnerDashboard();
  const {
    colors,
    insets,
    authorized,
    isOnline,
    onlineLabel,
    canChangeAvailability,
    availabilityBusy,
    currentLocationName,
    runner,
    locationQualityLabel,
    workspaceExpanded,
    setWorkspaceExpanded,
    toggleAvailability,
    jobs,
    activeJob,
    activeRouteTarget,
    error,
    mapError,
  } = dashboard;

  // The workspace is not a launch/loading screen. Keep the map and dashboard
  // chrome visible immediately while the account request is resolving.
  // It appears only after a Runner record is available or loading has ended.
  const showWorkspace = Boolean(runner) || !dashboard.loading;

  // Map failures during slow or unavailable connectivity are non-blocking.
  // Keep the diagnostic state internal; do not turn it into a user-facing
  // dashboard notice or overlay.
  const workspaceDashboard = {
    ...dashboard,
    mapError: "",
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <RunnerDashboardMapLayer dashboard={dashboard} />

      {showWorkspace ? (
        <RunnerDashboardWorkspace dashboard={workspaceDashboard} />
      ) : null}

      {authorized ? (
        <SaMiRunnerDashboardChrome
          topInset={insets.top}
          bottomInset={insets.bottom}
          isOnline={isOnline}
          statusLabel={onlineLabel}
          authorized={Boolean(authorized)}
          canChangeAvailability={canChangeAvailability}
          availabilityBusy={availabilityBusy}
          locationLabel={
            currentLocationName ||
            runner?.serviceArea ||
            locationQualityLabel
          }
          expanded={workspaceExpanded}
          onExpandedChange={setWorkspaceExpanded}
          onToggleAvailability={() => void toggleAvailability()}
          onOpenSection={dashboard.openDashboardSection}
          offersCount={jobs.offers.length}
          activeErrand={Boolean(activeJob)}
          hasActiveRoute={Boolean(activeRouteTarget)}
          error={error}
          mapError={undefined}
        />
      ) : null}
    </View>
  );
}
