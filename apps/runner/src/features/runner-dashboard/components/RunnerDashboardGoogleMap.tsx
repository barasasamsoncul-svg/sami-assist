import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type Region,
} from "react-native-maps";

import type { Coordinates, MapLocation } from "../types";

type Props = {
  location: MapLocation | null;
  fallbackCoordinates: Coordinates;
  cameraFollowing: boolean;
  recenterRequestId: number;
  screenActive: boolean;
  isOnline: boolean;
  isDark: boolean;
  onCameraFollowInterrupted: () => void;
  onMapReady: () => void;
};

const INITIAL_DELTA = 0.014;
const MIN_CAMERA_UPDATE_INTERVAL_MS = 850;
const MIN_CAMERA_MOVE_METERS = 6;

const LIGHT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#EAF0F6" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#526174" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#F5F8FC" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#CBD5E1" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#E7EDF4" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#E3EBE7" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#DEE8E2" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#64748B" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#D7E0EA" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#D4DFEA" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#C3D0DE" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#C8DCEB" }] },
];

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#111D2D" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#C7D2E0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#111D2D" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#34445A" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#172538" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#172B2B" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1A2C35" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#9BAFC2" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#26374B" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#34465B" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#344A63" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#41566F" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#102B40" }] },
];

function normalizeBearing(value: number) {
  return ((value % 360) + 360) % 360;
}

function shortestBearingDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

function distanceMeters(first: Coordinates, second: Coordinates) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function lookAheadCenter(
  origin: Coordinates,
  bearingDegrees: number,
  distance: number,
): Coordinates {
  if (distance <= 0) return origin;

  const earthRadius = 6371000;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitude1 = (origin.latitude * Math.PI) / 180;
  const longitude1 = (origin.longitude * Math.PI) / 180;
  const angularDistance = distance / earthRadius;

  const latitude2 = Math.asin(
    Math.sin(latitude1) * Math.cos(angularDistance) +
      Math.cos(latitude1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const longitude2 =
    longitude1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude1),
      Math.cos(angularDistance) - Math.sin(latitude1) * Math.sin(latitude2),
    );

  return {
    latitude: (latitude2 * 180) / Math.PI,
    longitude: (((longitude2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

function zoomForSpeed(speedMetersPerSecond: number) {
  if (speedMetersPerSecond >= 18) return 15.15;
  if (speedMetersPerSecond >= 11) return 15.65;
  if (speedMetersPerSecond >= 5) return 16.1;
  return 16.55;
}

export function RunnerDashboardGoogleMap({
  location,
  fallbackCoordinates,
  cameraFollowing,
  recenterRequestId,
  screenActive,
  isOnline,
  isDark,
  onCameraFollowInterrupted,
  onMapReady,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const lastRecenterRequestIdRef = useRef(recenterRequestId);
  const lastCameraUpdateAtRef = useRef(0);
  const lastCameraCenterRef = useRef<Coordinates | null>(null);
  const lastCameraZoomRef = useRef(16.55);
  const lastCameraBearingRef = useRef<number | null>(null);
  const mapReadyRef = useRef(false);

  const pulseProgress = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const hasLocation = Boolean(location);

  const initialRegion: Region = {
    latitude: fallbackCoordinates.latitude,
    longitude: fallbackCoordinates.longitude,
    latitudeDelta: INITIAL_DELTA,
    longitudeDelta: INITIAL_DELTA,
  };

  useEffect(() => {
    if (!isOnline || !hasLocation) {
      pulseLoopRef.current?.stop();
      pulseProgress.stopAnimation();
      pulseProgress.setValue(0);
      return;
    }

    pulseProgress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulseProgress, {
        toValue: 1,
        duration: 1900,
        useNativeDriver: true,
      }),
    );
    pulseLoopRef.current = loop;
    loop.start();

    return () => {
      loop.stop();
      if (pulseLoopRef.current === loop) {
        pulseLoopRef.current = null;
      }
    };
  }, [isOnline, hasLocation, pulseProgress]);

  const pulseScale = pulseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 2.7],
    extrapolate: "clamp",
  });
  const pulseOpacity = pulseProgress.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0.55, 0.42, 0],
    extrapolate: "clamp",
  });

  useEffect(() => {
    const explicitRecenter =
      lastRecenterRequestIdRef.current !== recenterRequestId;
    lastRecenterRequestIdRef.current = recenterRequestId;

    if (!screenActive || !location || !mapReadyRef.current) return;
    if (!cameraFollowing && !explicitRecenter) return;

    const speed = Math.max(0, location.speedMetersPerSecond ?? 0);
    const accuracy = location.horizontalAccuracyMeters;
    const hasReliableCourse =
      location.bearing !== null &&
      Number.isFinite(location.bearing) &&
      speed >= 2.2 &&
      (accuracy === null || accuracy <= 35);

    let bearing = lastCameraBearingRef.current ?? 0;
    if (hasReliableCourse) {
      const nextBearing = normalizeBearing(location.bearing as number);
      bearing = lastCameraBearingRef.current === null
        ? nextBearing
        : normalizeBearing(
            lastCameraBearingRef.current +
              shortestBearingDelta(lastCameraBearingRef.current, nextBearing) * 0.38,
          );
      lastCameraBearingRef.current = bearing;
    }

    const lookAheadMeters = hasReliableCourse
      ? Math.min(70, Math.max(18, speed * 3.2))
      : 0;
    const center = lookAheadCenter(location, bearing, lookAheadMeters);
    const zoom = zoomForSpeed(speed);
    const now = Date.now();
    const elapsed = now - lastCameraUpdateAtRef.current;
    const previousCenter = lastCameraCenterRef.current;
    const movedMeters = previousCenter
      ? distanceMeters(previousCenter, center)
      : Number.POSITIVE_INFINITY;
    const zoomChanged = Math.abs(lastCameraZoomRef.current - zoom) >= 0.25;

    if (!explicitRecenter && elapsed < MIN_CAMERA_UPDATE_INTERVAL_MS) return;
    if (!explicitRecenter && movedMeters < MIN_CAMERA_MOVE_METERS && !zoomChanged) return;

    mapRef.current?.animateCamera(
      {
        center,
        zoom,
        heading: bearing,
        pitch: 0,
      },
      { duration: explicitRecenter ? 450 : 800 },
    );

    lastCameraUpdateAtRef.current = now;
    lastCameraCenterRef.current = center;
    lastCameraZoomRef.current = zoom;
  }, [
    location?.latitude,
    location?.longitude,
    location?.bearing,
    location?.speedMetersPerSecond,
    location?.horizontalAccuracyMeters,
    fallbackCoordinates.latitude,
    fallbackCoordinates.longitude,
    cameraFollowing,
    recenterRequestId,
    screenActive,
  ]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      mapType="standard"
      customMapStyle={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
      initialRegion={initialRegion}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      showsScale={false}
      showsTraffic={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      rotateEnabled
      scrollEnabled
      zoomEnabled
      onMapReady={() => {
        mapReadyRef.current = true;
        onMapReady();
      }}
      onPanDrag={onCameraFollowInterrupted}
    >
      {location ? (
        <Marker
          coordinate={{
            latitude: location.latitude,
            longitude: location.longitude,
          }}
          rotation={location.bearing ?? 0}
          flat
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={isOnline}
        >
          <View style={markerStyles.markerContainer}>
            {isOnline ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  markerStyles.pulseRing,
                  {
                    opacity: pulseOpacity,
                    transform: [{ scale: pulseScale }],
                  },
                ]}
              />
            ) : null}
            <View style={markerStyles.outer}>
              <View style={markerStyles.arrow} />
            </View>
          </View>
        </Marker>
      ) : null}
    </MapView>
  );
}

const markerStyles = StyleSheet.create({
  markerContainer: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#2477D4",
    backgroundColor: "rgba(36,119,212,0.12)",
  },
  outer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#000535",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 16,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#000535",
    transform: [{ translateY: -1 }],
  },
});
