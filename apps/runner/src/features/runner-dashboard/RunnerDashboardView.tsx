import { StatusBar, View } from "react-native";
import { SaMiRunnerDashboardChrome } from "@/components/RunnerDashboardChrome";
import { styles } from "./styles";
import { useRunnerDashboard } from "./useRunnerDashboard";
import { RunnerDashboardMapLayer } from "./components/RunnerDashboardMapLayer";
import { RunnerDashboardWorkspace } from "./components/RunnerDashboardWorkspace";

export default function RunnerDashboardView() {
  const dashboard = useRunnerDashboard();
  const {
    insets, authorized, isOnline, onlineLabel, canChangeAvailability,
    availabilityBusy, currentLocationName, runner, locationQualityLabel,
    workspaceExpanded, setWorkspaceExpanded, toggleAvailability, jobs,
    activeJob, activeRouteTarget, error, mapError, openDashboardSection,
  } = dashboard;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <RunnerDashboardMapLayer dashboard={dashboard} />
      <RunnerDashboardWorkspace dashboard={dashboard} />
      {authorized ? (
        <SaMiRunnerDashboardChrome
          topInset={insets.top}
          bottomInset={insets.bottom}
          isOnline={isOnline}
          statusLabel={onlineLabel}
          authorized={Boolean(authorized)}
          canChangeAvailability={canChangeAvailability}
          availabilityBusy={availabilityBusy}
          locationLabel={currentLocationName || runner?.serviceArea || locationQualityLabel}
          expanded={workspaceExpanded}
          onExpandedChange={setWorkspaceExpanded}
          onToggleAvailability={() => void toggleAvailability()}
          onOpenSection={openDashboardSection}
          offersCount={jobs.offers.length}
          activeErrand={Boolean(activeJob)}
          hasActiveRoute={Boolean(activeRouteTarget)}
          error={error}
          mapError={mapError}
        />
      ) : null}
    </View>
  );
}
