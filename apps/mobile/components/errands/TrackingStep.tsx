
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Map as SaMiMap,
  Camera,
  GeoJSONSource,
  Layer,
  Marker,
} from "@maplibre/maplibre-react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSaMiTheme } from "@/theme";

import type {
  ErrandRunnerProfile,
  RunnerProgressItem,
} from "@/components/errands/RunnerFoundStep";

export type TrackingCoordinate = {
  latitude: number;
  longitude: number;
};

export type TrackingLocation = {
  label: string;
  coordinate: TrackingCoordinate | null;
};

export type TrackingStepProps = {
  publicCode?: string;
  status: string;

  runner: ErrandRunnerProfile | null;
  runnerLocation?: TrackingCoordinate | null;

  pickup?: TrackingLocation | null;
  destination?: TrackingLocation | null;

  routeCoordinates?: TrackingCoordinate[];

  categoryLabel?: string;
  activityTitle?: string;
  activityMessage?: string;

  etaMinutes?: number | null;
  estimatedArrivalTime?: string | null;
  lastUpdatedLabel?: string | null;

  progress?: RunnerProgressItem[];

  mapStyleUrl?: string;

  canMessage?: boolean;
  canCall?: boolean;

  loading?: boolean;
  error?: string;

  onBack?: () => void;
  onRefresh?: () => void;
  onMessage?: () => void;
  onCall?: () => void;
};

type RouteFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: Record<string, never>;
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
  }>;
};

const COMMUNICATION_STATUSES = new Set([
  "assigned",
  "accepted",
  "in_progress",
]);

const DEFAULT_MAP_STYLE =
  process.env.EXPO_PUBLIC_SAMI_MAP_STYLE_URL?.trim() || "";

function isValidCoordinate(
  value: TrackingCoordinate | null | undefined,
): value is TrackingCoordinate {
  return Boolean(
    value &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude) &&
      value.latitude >= -90 &&
      value.latitude <= 90 &&
      value.longitude >= -180 &&
      value.longitude <= 180,
  );
}

function getMapViewState(points: TrackingCoordinate[]) {
  if (points.length === 0) {
    return null;
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);

  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  const span = Math.max(
    maxLatitude - minLatitude,
    maxLongitude - minLongitude,
  );

  const zoom =
    span > 1
      ? 8
      : span > 0.4
        ? 9
        : span > 0.15
          ? 11
          : span > 0.05
            ? 12
            : span > 0.015
              ? 14
              : 15;

  return {
    center: [
      (minLongitude + maxLongitude) / 2,
      (minLatitude + maxLatitude) / 2,
    ] as [number, number],
    zoom,
  };
}

function formatEta(minutes?: number | null): string | null {
  if (
    minutes === null ||
    minutes === undefined ||
    !Number.isFinite(minutes) ||
    minutes < 0
  ) {
    return null;
  }

  const rounded = Math.ceil(minutes);

  if (rounded <= 1) {
    return "Arriving now";
  }

  return `~${rounded} min`;
}

function getActivityFallback(status: string) {
  switch (status) {
    case "assigned":
      return {
        title: "Your runner has been assigned",
        description: "Your errand is ready to begin.",
      };

    case "accepted":
      return {
        title: "Your runner has accepted",
        description: "Your runner is preparing to start.",
      };

    case "in_progress":
      return {
        title: "Your errand is in progress",
        description: "Progress updates will appear here.",
      };

    case "completion_submitted":
      return {
        title: "Completion submitted",
        description: "Your runner has submitted an update.",
      };

    default:
      return {
        title: "Errand tracking",
        description: "The latest errand updates will appear here.",
      };
  }
}

function RunnerMapMarker({
  runner,
}: {
  runner: ErrandRunnerProfile | null;
}) {
  const { colors: palette } = useSaMiTheme();

  const photoUrl =
    typeof runner?.photoUrl === "string" &&
    runner.photoUrl.trim()
      ? runner.photoUrl.trim()
      : null;

  return (
    <View
      style={[
        styles.runnerMapMarker,
        {
          backgroundColor: palette.blue,
          borderColor: palette.surface,
        },
      ]}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.runnerMapAvatar}
          resizeMode="cover"
        />
      ) : (
        <Ionicons
          name="person"
          size={17}
          color="#FFFFFF"
        />
      )}
    </View>
  );
}

function PickupMapMarker() {
  const { colors: palette } = useSaMiTheme();

  return (
    <View
      style={[
        styles.pickupMarker,
        {
          backgroundColor: palette.surface,
          borderColor: palette.blue,
        },
      ]}
    >
      <Ionicons
        name="location"
        size={14}
        color={palette.blue}
      />
    </View>
  );
}

function DestinationMapMarker() {
  const { colors: palette } = useSaMiTheme();

  return (
    <View
      style={[
        styles.destinationMarker,
        {
          backgroundColor: palette.success,
          borderColor: palette.surface,
        },
      ]}
    >
      <Ionicons
        name="flag"
        size={15}
        color="#FFFFFF"
      />
    </View>
  );
}

function TrackingMap({
  runner,
  runnerLocation,
  pickup,
  destination,
  routeCoordinates,
  mapStyleUrl,
  etaLabel,
  activityTitle,
  activityMessage,
  lastUpdatedLabel,
}: {
  runner: ErrandRunnerProfile | null;
  runnerLocation: TrackingCoordinate | null;
  pickup: TrackingLocation | null;
  destination: TrackingLocation | null;
  routeCoordinates: TrackingCoordinate[];
  mapStyleUrl: string;
  etaLabel: string | null;
  activityTitle: string;
  activityMessage: string;
  lastUpdatedLabel: string | null;
}) {
  const { colors: palette } = useSaMiTheme();
  const [mapError, setMapError] = useState(false);

  const validRunnerLocation =
    runner && isValidCoordinate(runnerLocation)
      ? runnerLocation
      : null;

  const validPickup =
    pickup && isValidCoordinate(pickup.coordinate)
      ? pickup.coordinate
      : null;

  const validDestination =
    destination && isValidCoordinate(destination.coordinate)
      ? destination.coordinate
      : null;

  const validRoute = useMemo(
    () =>
      routeCoordinates.filter((point) =>
        isValidCoordinate(point),
      ),
    [routeCoordinates],
  );

  const mapPoints = useMemo(() => {
    const points: TrackingCoordinate[] = [];

    if (validRunnerLocation) {
      points.push(validRunnerLocation);
    }

    if (validPickup) {
      points.push(validPickup);
    }

    if (validDestination) {
      points.push(validDestination);
    }

    points.push(...validRoute);

    return points;
  }, [
    validRunnerLocation,
    validPickup,
    validDestination,
    validRoute,
  ]);

  const initialViewState = useMemo(
    () => getMapViewState(mapPoints),
    [mapPoints],
  );

  const cameraKey = useMemo(
    () =>
      mapPoints
        .map(
          (point) =>
            `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`,
        )
        .join("|"),
    [mapPoints],
  );

  const routeData = useMemo<RouteFeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features:
        validRoute.length >= 2
          ? [
              {
                type: "Feature",
                id: "sami-errand-route",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: validRoute.map(
                    (point) =>
                      [
                        point.longitude,
                        point.latitude,
                      ] as [number, number],
                  ),
                },
              },
            ]
          : [],
    }),
    [validRoute],
  );

  const canRenderMap =
    Boolean(mapStyleUrl) &&
    Boolean(initialViewState) &&
    !mapError;

  return (
    <View
      style={[
        styles.mapFrame,
        { backgroundColor: palette.mapBackground },
      ]}
    >
      {canRenderMap && initialViewState ? (
        <SaMiMap
          style={styles.map}
          mapStyle={mapStyleUrl}
          attribution
          logo
          compass={false}
          scaleBar={false}
          dragPan
          touchZoom
          touchRotate={false}
          touchPitch={false}
          onDidFailLoadingMap={() => setMapError(true)}
        >
          <Camera
            key={cameraKey}
            initialViewState={{
              center: initialViewState.center,
              zoom: initialViewState.zoom,
            }}
          />

          {routeData.features.length > 0 ? (
            <GeoJSONSource
              id="sami-errand-route-source"
              data={routeData}
            >
              <Layer
                id="sami-errand-route-line"
                type="line"
                source="sami-errand-route-source"
                layout={{
                  "line-cap": "round",
                  "line-join": "round",
                }}
                paint={{
                  "line-color": palette.blue,
                  "line-width": 4,
                  "line-opacity": 0.95,
                }}
              />
            </GeoJSONSource>
          ) : null}

          {validPickup ? (
            <Marker
              id="sami-pickup-marker"
              lngLat={[
                validPickup.longitude,
                validPickup.latitude,
              ]}
              anchor="center"
            >
              <PickupMapMarker />
            </Marker>
          ) : null}

          {validDestination ? (
            <Marker
              id="sami-destination-marker"
              lngLat={[
                validDestination.longitude,
                validDestination.latitude,
              ]}
              anchor="center"
            >
              <DestinationMapMarker />
            </Marker>
          ) : null}

          {validRunnerLocation ? (
            <Marker
              id="sami-runner-marker"
              lngLat={[
                validRunnerLocation.longitude,
                validRunnerLocation.latitude,
              ]}
              anchor="center"
            >
              <RunnerMapMarker runner={runner} />
            </Marker>
          ) : null}
        </SaMiMap>
      ) : (
        <View
          style={[
            styles.mapUnavailable,
            { backgroundColor: palette.mapBackground },
          ]}
        >
          <View
            style={[
              styles.mapUnavailableIcon,
              { backgroundColor: palette.surface },
            ]}
          >
            <Ionicons
              name="map-outline"
              size={27}
              color={palette.blue}
            />
          </View>

          <Text
            style={[
              styles.mapUnavailableTitle,
              { color: palette.text },
            ]}
          >
            {mapError
              ? "Map could not be loaded"
              : !mapStyleUrl
                ? "SaMi map is not configured yet"
                : "Location is not available yet"}
          </Text>

          <Text
            style={[
              styles.mapUnavailableDescription,
              { color: palette.textMuted },
            ]}
          >
            {mapError
              ? "The map style or tile service could not be reached."
              : !mapStyleUrl
                ? "The SaMi map style and map data source must be configured before the live map can load."
                : "The map will show the errand route when location coordinates are supplied."}
          </Text>
        </View>
      )}

      <View
        style={[
          styles.mapTopLabel,
          { backgroundColor: palette.surface },
        ]}
      >
        <View
          style={[
            styles.liveDot,
            { backgroundColor: palette.success },
          ]}
        />

        <Text
          style={[
            styles.mapTopLabelText,
            { color: palette.text },
          ]}
        >
          LIVE TRACKING
        </Text>
      </View>

      <View
        style={[
          styles.mapLegend,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: palette.blue },
            ]}
          />

          <Text
            style={[
              styles.legendText,
              { color: palette.textMuted },
            ]}
          >
            Runner
          </Text>
        </View>

        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: palette.success },
            ]}
          />

          <Text
            style={[
              styles.legendText,
              { color: palette.textMuted },
            ]}
          >
            Destination
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.activityCard,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={styles.activityIdentity}>
          {runner?.photoUrl ? (
            <Image
              source={{ uri: runner.photoUrl }}
              style={[
                styles.activityAvatar,
                { backgroundColor: palette.blueSoft },
              ]}
            />
          ) : (
            <View
              style={[
                styles.activityAvatarFallback,
                { backgroundColor: palette.blueSoft },
              ]}
            >
              <Ionicons
                name="person"
                size={19}
                color={palette.blue}
              />
            </View>
          )}

          <View style={styles.activityTextContent}>
            <Text
              numberOfLines={1}
              style={[
                styles.activityTitle,
                { color: palette.text },
              ]}
            >
              {activityTitle}
            </Text>

            <Text
              numberOfLines={2}
              style={[
                styles.activityDescription,
                { color: palette.textMuted },
              ]}
            >
              {activityMessage ||
                (destination?.label
                  ? `Destination: ${destination.label}`
                  : "The latest errand update will appear here.")}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.etaDivider,
            { backgroundColor: palette.border },
          ]}
        />

        <View style={styles.etaRow}>
          <View style={styles.etaIcon}>
            <Ionicons
              name="time-outline"
              size={17}
              color={palette.blue}
            />
          </View>

          <View style={styles.etaTextContent}>
            <Text
              style={[
                styles.etaCaption,
                { color: palette.textMuted },
              ]}
            >
              ESTIMATED ARRIVAL
            </Text>

            <Text
              style={[
                styles.etaValue,
                { color: palette.text },
              ]}
            >
              {etaLabel || "Not available"}
            </Text>
          </View>

          {lastUpdatedLabel ? (
            <Text
              style={[
                styles.lastUpdated,
                { color: palette.textMuted },
              ]}
            >
              {lastUpdatedLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function TrackingTimeline({
  progress,
}: {
  progress: RunnerProgressItem[];
}) {
  const { colors: palette } = useSaMiTheme();

  if (progress.length === 0) {
    return (
      <View
        style={[
          styles.emptyTimeline,
          { backgroundColor: palette.surface },
        ]}
      >
        <Ionicons
          name="time-outline"
          size={21}
          color={palette.muted}
        />

        <Text
          style={[
            styles.emptyTimelineText,
            { color: palette.textMuted },
          ]}
        >
          Progress updates will appear here when they are received.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.timeline}>
      {progress.map((item, index) => {
        const completed = item.state === "completed";
        const current = item.state === "current";
        const last = index === progress.length - 1;

        const markerColor = completed
          ? palette.success
          : current
            ? palette.blue
            : palette.border;

        return (
          <View
            key={`${item.id}-${index}`}
            style={styles.timelineItem}
          >
            <View style={styles.timelineRail}>
              <View
                style={[
                  styles.timelineMarker,
                  {
                    borderColor: markerColor,
                    backgroundColor: completed
                      ? palette.success
                      : current
                        ? palette.blueSoft
                        : palette.surface,
                  },
                ]}
              >
                {completed ? (
                  <Ionicons
                    name="checkmark"
                    size={12}
                    color="#FFFFFF"
                  />
                ) : current ? (
                  <View
                    style={[
                      styles.timelineCurrentDot,
                      { backgroundColor: palette.blue },
                    ]}
                  />
                ) : null}
              </View>

              {!last ? (
                <View
                  style={[
                    styles.timelineLine,
                    {
                      backgroundColor: completed
                        ? palette.success
                        : palette.border,
                    },
                  ]}
                />
              ) : null}
            </View>

            <View style={styles.timelineContent}>
              <Text
                style={[
                  styles.timelineTitle,
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

              {item.time ? (
                <Text
                  style={[
                    styles.timelineTime,
                    { color: palette.textMuted },
                  ]}
                >
                  {item.time}
                </Text>
              ) : null}

              {current ? (
                <View
                  style={[
                    styles.timelineCurrentBadge,
                    { backgroundColor: palette.blueSoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.timelineCurrentText,
                      { color: palette.blue },
                    ]}
                  >
                    CURRENT
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

export default function TrackingStep({
  publicCode,
  status,
  runner,
  runnerLocation = null,
  pickup = null,
  destination = null,
  routeCoordinates = [],
  categoryLabel = "Your errand",
  activityTitle,
  activityMessage,
  etaMinutes = null,
  estimatedArrivalTime,
  lastUpdatedLabel,
  progress = [],
  mapStyleUrl,
  canMessage = false,
  canCall = false,
  loading = false,
  error,
  onBack,
  onRefresh,
  onMessage,
  onCall,
}: TrackingStepProps) {
  const { colors: palette } = useSaMiTheme();

  const mapStyle =
    mapStyleUrl?.trim() || DEFAULT_MAP_STYLE;

  const hasRunner = Boolean(
    runner?.id?.trim() && runner?.fullName?.trim(),
  );

  const activeStatus =
    COMMUNICATION_STATUSES.has(status);

  const showMessage =
    hasRunner &&
    activeStatus &&
    canMessage &&
    typeof onMessage === "function";

  const showCall =
    hasRunner &&
    activeStatus &&
    canCall &&
    typeof onCall === "function";

  const fallback = getActivityFallback(status);

  const resolvedActivityTitle =
    activityTitle?.trim() || fallback.title;

  const resolvedActivityMessage =
    activityMessage?.trim() || fallback.description;

  const eta = formatEta(etaMinutes);

  const etaLabel =
    estimatedArrivalTime?.trim() && eta
      ? `${eta} · ${estimatedArrivalTime.trim()}`
      : eta || estimatedArrivalTime?.trim() || null;

  return (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: palette.paper },
      ]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={[
              styles.headerButton,
              { backgroundColor: palette.surface },
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={21}
              color={palette.text}
            />
          </Pressable>
        ) : (
          <View style={styles.headerButtonSpacer} />
        )}

        <View style={styles.headerCenter}>
          <Text
            style={[
              styles.headerTitle,
              { color: palette.text },
            ]}
          >
            Live Tracking
          </Text>

          {publicCode?.trim() ? (
            <Text
              style={[
                styles.referenceText,
                { color: palette.textMuted },
              ]}
            >
              {publicCode.trim()}
            </Text>
          ) : null}
        </View>

        {onRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh tracking"
            disabled={loading}
            onPress={onRefresh}
            style={[
              styles.headerButton,
              { backgroundColor: palette.surface },
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
        ) : (
          <View style={styles.headerButtonSpacer} />
        )}
      </View>

      <View style={styles.stepHeader}>
        <Text
          style={[
            styles.stepLabel,
            { color: palette.textMuted },
          ]}
        >
          STEP 6 OF 7
        </Text>

        <Text
          style={[
            styles.categoryLabel,
            { color: palette.blue },
          ]}
        >
          {categoryLabel}
        </Text>
      </View>

      <TrackingMap
        runner={runner}
        runnerLocation={runnerLocation}
        pickup={pickup}
        destination={destination}
        routeCoordinates={routeCoordinates}
        mapStyleUrl={mapStyle}
        etaLabel={etaLabel}
        activityTitle={
          hasRunner
            ? resolvedActivityTitle
            : "Waiting for runner location"
        }
        activityMessage={
          hasRunner
            ? resolvedActivityMessage
            : "Runner information and location have not been supplied yet."
        }
        lastUpdatedLabel={lastUpdatedLabel || null}
      />

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

      <View
        style={[
          styles.timelineCard,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={styles.timelineHeader}>
          <View>
            <Text
              style={[
                styles.timelineHeading,
                { color: palette.text },
              ]}
            >
              Errand updates
            </Text>

            <Text
              style={[
                styles.timelineSubtitle,
                { color: palette.textMuted },
              ]}
            >
              Follow each stage of your errand
            </Text>
          </View>

          <Ionicons
            name="time-outline"
            size={19}
            color={palette.blue}
          />
        </View>

        <TrackingTimeline progress={progress} />
      </View>

      {(showMessage || showCall) ? (
        <View style={styles.communicationActions}>
          {showMessage ? (
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

          {showCall ? (
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

      <View style={styles.footer}>
        <Ionicons
          name="shield-checkmark-outline"
          size={14}
          color={palette.textMuted}
        />

        <Text
          style={[
            styles.footerText,
            { color: palette.textMuted },
          ]}
        >
          Your errand updates stay within SaMi.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 17,
    paddingTop: 9,
    paddingBottom: 34,
    gap: 15,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    gap: 10,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonSpacer: {
    width: 38,
    height: 38,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  referenceText: {
    fontSize: 9,
    fontWeight: "700",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: "800",
  },
  mapFrame: {
    height: 370,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  map: {
    flex: 1,
  },
  mapUnavailable: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
    gap: 10,
  },
  mapUnavailableIcon: {
    height: 53,
    width: 53,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  mapUnavailableTitle: {
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  mapUnavailableDescription: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    maxWidth: 250,
  },
  mapTopLabel: {
    position: "absolute",
    top: 13,
    left: 12,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    elevation: 3,
  },
  liveDot: {
    height: 7,
    width: 7,
    borderRadius: 4,
  },
  mapTopLabelText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  mapLegend: {
    position: "absolute",
    right: 10,
    top: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 7,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    height: 7,
    width: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 8,
    fontWeight: "700",
  },
  runnerMapMarker: {
    height: 35,
    width: 35,
    borderRadius: 18,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  runnerMapAvatar: {
    width: "100%",
    height: "100%",
  },
  pickupMarker: {
    height: 27,
    width: 27,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  destinationMarker: {
    height: 33,
    width: 33,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  activityCard: {
    position: "absolute",
    bottom: 11,
    left: 10,
    right: 10,
    borderRadius: 15,
    borderWidth: 1,
    padding: 12,
    elevation: 5,
    gap: 10,
  },
  activityIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activityAvatar: {
    height: 39,
    width: 39,
    borderRadius: 20,
  },
  activityAvatarFallback: {
    height: 39,
    width: 39,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  activityTextContent: {
    flex: 1,
    gap: 4,
  },
  activityTitle: {
    fontSize: 11,
    fontWeight: "900",
  },
  activityDescription: {
    fontSize: 9,
    lineHeight: 14,
  },
  etaDivider: {
    height: StyleSheet.hairlineWidth,
  },
  etaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  etaIcon: {
    height: 30,
    width: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  etaTextContent: {
    flex: 1,
    gap: 2,
  },
  etaCaption: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  etaValue: {
    fontSize: 13,
    fontWeight: "900",
  },
  lastUpdated: {
    maxWidth: 100,
    textAlign: "right",
    fontSize: 8,
  },
  timelineCard: {
    borderRadius: 15,
    borderWidth: 1,
    padding: 15,
  },
  timelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 17,
  },
  timelineHeading: {
    fontSize: 14,
    fontWeight: "900",
  },
  timelineSubtitle: {
    fontSize: 10,
    marginTop: 4,
  },
  timeline: {
    gap: 0,
  },
  timelineItem: {
    minHeight: 56,
    flexDirection: "row",
    gap: 11,
  },
  timelineRail: {
    width: 23,
    alignItems: "center",
  },
  timelineMarker: {
    height: 22,
    width: 22,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  timelineCurrentDot: {
    height: 7,
    width: 7,
    borderRadius: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 33,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 12,
    gap: 4,
  },
  timelineTitle: {
    fontSize: 11,
    fontWeight: "800",
  },
  timelineTime: {
    fontSize: 9,
  },
  timelineCurrentBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 2,
  },
  timelineCurrentText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  emptyTimeline: {
    borderRadius: 11,
    padding: 13,
    minHeight: 65,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  emptyTimelineText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 16,
  },
  error: {
    borderRadius: 11,
    padding: 12,
    fontSize: 11,
    lineHeight: 17,
  },
  communicationActions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 47,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 9,
    lineHeight: 15,
  },
  disabled: {
    opacity: 0.5,
  },
});
