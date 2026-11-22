import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SaMiMapboxView } from "../../../../modules/sami-mapbox/src";
import { styles } from "../styles";
import { IconButton } from "./RunnerDashboardPrimitives";
import type { useRunnerDashboard } from "../useRunnerDashboard";
import { DEFAULT_COORDINATES, type NavigationMode } from "../types";

type Props = { dashboard: ReturnType<typeof useRunnerDashboard> };

export function RunnerDashboardMapLayer({ dashboard }: Props) {
  const {
    colors, insets, authorized, activeRouteTarget, routePanelStatusText,
    routeState, routeInstruction, routeSecondaryInstruction, voiceGuidanceMuted,
    setVoiceGuidanceMuted, nextManeuverDistance, routeRemainingDistance,
    routeRemainingTime, location, locationQualityLabel, locationAccuracyLabel,
    workspaceExpanded, locationBusy, setCameraFollowing, locateMe,
    mapScreenActive, mapStyleURL, navigationActive, cameraFollowing,
    mapRecenterRequestId, displayCoordinates, isOnline, runner,
    setMapReady, setMapError, setNavigationMode, setRouteState, setVoiceInstruction,
    routeProfile,
  } = dashboard;

  return (
    <>
      {/* MAPBOX CANVAS */}

      <SaMiMapboxView
          style={StyleSheet.absoluteFill}
          accessToken={
            process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? ""
          }
          mapStyleURL={mapStyleURL}
          initialLatitude={DEFAULT_COORDINATES.latitude}
          initialLongitude={DEFAULT_COORDINATES.longitude}
          initialZoom={15.5}
          initialBearing={0}
          showUserLocation={Boolean(location)}
          hasUserLocation={Boolean(location)}
          userLatitude={location?.latitude ?? displayCoordinates.latitude}
          userLongitude={location?.longitude ?? displayCoordinates.longitude}
          userBearing={location?.bearing ?? 0}
          hasUserBearing={location?.bearing != null}
          recenterRequestId={mapRecenterRequestId}
          showCompass
          showScaleBar={false}
          screenActive={mapScreenActive}
          navigationActive={Boolean(navigationActive)}
          cameraMode={
            activeRouteTarget
              ? "navigation"
              : navigationActive || cameraFollowing
                ? "follow"
                : "free"
          }
          puckBearing="course"
          locationPulsingEnabled={Boolean(isOnline && authorized)}
          hasRouteDestination={Boolean(
            authorized && activeRouteTarget,
          )}
          routeDestinationLatitude={
            activeRouteTarget?.latitude ?? 0
          }
          routeDestinationLongitude={
            activeRouteTarget?.longitude ?? 0
          }
          routeDestinationLabel={
            activeRouteTarget?.label ?? ""
          }
          routeProfile={routeProfile}
          voiceGuidanceMuted={voiceGuidanceMuted}
          onMapReady={() => {
            setMapReady(true);
            setMapError("");
          }}
          onMapError={(event) => {
            setMapError(event.nativeEvent.message);
          }}
          onNavigationStatusChanged={(event) => {
            setNavigationMode(
              event.nativeEvent.mode as NavigationMode,
            );
          }}
          onRouteChanged={(event) => {
            setRouteState(event.nativeEvent);
          }}
          onVoiceInstructionChanged={(event) => {
            setVoiceInstruction(event.nativeEvent);
          }}
      />

      {/* TURN-BY-TURN MANEUVER CARD */}

      {authorized && activeRouteTarget ? (
        <View
          style={[
            styles.maneuverCard,
            {
              top: insets.top + 77,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.maneuverMainRow}>
            <View
              style={[
                styles.maneuverIcon,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <Ionicons
                name="navigate"
                size={25}
                color={colors.blue}
              />
            </View>

            <View style={styles.maneuverCopy}>
              <Text
                style={[
                  styles.maneuverEyebrow,
                  { color: colors.textMuted },
                ]}
              >
                {routePanelStatusText}
              </Text>

              <Text
                style={[
                  styles.maneuverInstruction,
                  { color: colors.text },
                ]}
                numberOfLines={2}
              >
                {routeState.status === "active"
                  ? routeInstruction
                  : routeState.status === "error"
                    ? routeState.message ||
                      "Route could not be calculated"
                    : routeState.status === "requesting"
                      ? "Finding the best route..."
                      : "Waiting for your GPS position..."}
              </Text>

              {routeState.status === "active" &&
              routeSecondaryInstruction ? (
                <Text
                  style={[
                    styles.maneuverSecondary,
                    { color: colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {routeSecondaryInstruction}
                </Text>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{
                checked: !voiceGuidanceMuted,
              }}
              accessibilityLabel={
                voiceGuidanceMuted
                  ? "Unmute voice navigation"
                  : "Mute voice navigation"
              }
              onPress={() => {
                setVoiceGuidanceMuted((current) => !current);
              }}
              style={({ pressed }) => [
                styles.voiceToggle,
                {
                  backgroundColor: voiceGuidanceMuted
                    ? colors.paper
                    : colors.blueSoft,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons
                name={
                  voiceGuidanceMuted
                    ? "volume-mute-outline"
                    : "volume-high-outline"
                }
                size={21}
                color={
                  voiceGuidanceMuted
                    ? colors.textMuted
                    : colors.blue
                }
              />
            </Pressable>
          </View>

          {routeState.status === "active" ? (
            <View
              style={[
                styles.maneuverMetrics,
                { borderTopColor: colors.border },
              ]}
            >
              <View style={styles.maneuverMetric}>
                <Text
                  style={[
                    styles.maneuverMetricLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  NEXT TURN
                </Text>

                <Text
                  style={[
                    styles.maneuverMetricValue,
                    { color: colors.text },
                  ]}
                >
                  {nextManeuverDistance
                    ? `In ${nextManeuverDistance}`
                    : "Following route"}
                </Text>
              </View>

              <View style={styles.maneuverMetric}>
                <Text
                  style={[
                    styles.maneuverMetricLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  REMAINING
                </Text>

                <Text
                  style={[
                    styles.maneuverMetricValue,
                    { color: colors.text },
                  ]}
                >
                  {routeRemainingDistance ?? "Calculating"}
                </Text>
              </View>

              <View style={styles.maneuverMetric}>
                <Text
                  style={[
                    styles.maneuverMetricLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  ETA
                </Text>

                <Text
                  style={[
                    styles.maneuverMetricValue,
                    { color: colors.text },
                  ]}
                >
                  {routeRemainingTime ?? "Calculating"}
                </Text>
              </View>
            </View>
          ) : null}

          {voiceGuidanceMuted ? (
            <Text
              style={[
                styles.mutedGuidanceText,
                { color: colors.textMuted },
              ]}
            >
              Voice guidance is muted. Visual directions remain active.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* MAP CONTROLS */}

      <View
        style={[
          styles.mapControls,
          {
            right: 16,
            bottom: insets.bottom + (workspaceExpanded ? 410 : 134),
            display: workspaceExpanded ? "none" : "flex",
          },
        ]}
      >
        <IconButton
          icon="locate"
          label="Center map on my location"
          onPress={() => {
            setCameraFollowing(true);
            void locateMe();
          }}
          busy={locationBusy}
          color={colors.navy}
          backgroundColor={colors.surface}
          borderColor={colors.border}
        />
      </View>

      {/* LOCATION QUALITY */}

      <View
        style={[
          styles.locationIndicator,
          {
            top: insets.top + (activeRouteTarget ? 218 : 72),
            backgroundColor: colors.surface,
            borderColor: colors.border,
            display: "none",
          },
        ]}
      >
        <View
          style={[
            styles.locationIndicatorDot,
            {
              backgroundColor: location?.enhanced
                ? colors.success
                : location
                  ? colors.blue
                  : colors.warning,
            },
          ]}
        />

        <View style={styles.locationIndicatorCopy}>
          <Text
            style={[
              styles.locationIndicatorTitle,
              { color: colors.text },
            ]}
          >
            {locationQualityLabel}
          </Text>

          <Text
            style={[
              styles.locationIndicatorSubtitle,
              { color: colors.textMuted },
            ]}
          >
            {locationAccuracyLabel}
          </Text>
        </View>
      </View>


    </>
  );
}
