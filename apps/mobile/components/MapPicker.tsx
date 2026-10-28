import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { colors } from "@/theme";

export type MapPoint = { lat: number; lng: number };
type Props = {
  selecting: "pickup" | "destination";
  pickup: MapPoint | null;
  destination: MapPoint | null;
  provider?: MapPoint | null;
  route: MapPoint[];
  readOnly?: boolean;
  height?: number;
  onPoint?: (slot: "pickup" | "destination", point: MapPoint) => void;
};

const NAIROBI = { latitude: -1.286389, longitude: 36.817223 };
const asCoordinate = (point: MapPoint) => ({ latitude: point.lat, longitude: point.lng });

export default function MapPicker({
  selecting,
  pickup,
  destination,
  provider,
  route,
  readOnly = false,
  height = 290,
  onPoint,
}: Props) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);

  const initialRegion = useMemo<Region>(() => {
    const first = pickup || destination || provider;
    const center = first ? asCoordinate(first) : NAIROBI;
    return {
      ...center,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035,
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    const points = route.length > 1
      ? route
      : [pickup, destination, provider].filter((point): point is MapPoint => Boolean(point));

    if (points.length > 1) {
      map.current.fitToCoordinates(points.map(asCoordinate), {
        edgePadding: { top: 44, right: 42, bottom: 44, left: 42 },
        animated: true,
      });
      return;
    }

    const point = points[0];
    if (point) {
      map.current.animateToRegion({
        ...asCoordinate(point),
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      }, 260);
    }
  }, [ready, pickup, destination, provider, route]);

  function placePin(point: MapPoint) {
    if (readOnly || !onPoint) return;
    onPoint(selecting, point);
  }

  const providerMap = Platform.OS === "android" ? PROVIDER_GOOGLE : undefined;
  const hint = readOnly
    ? "Map position is shown only while location sharing is active."
    : selecting === "pickup"
      ? "Tap the map to place your pickup pin."
      : "Tap the map to place your drop-off pin.";

  return (
    <View style={styles.container}>
      <View style={styles.mapWrap}>
        <MapView
          ref={map}
          provider={providerMap}
          style={[styles.map, { height }]}
          initialRegion={initialRegion}
          mapType="standard"
          onMapReady={() => setReady(true)}
          onPress={(event) => placePin({
            lat: event.nativeEvent.coordinate.latitude,
            lng: event.nativeEvent.coordinate.longitude,
          })}
          loadingEnabled
          loadingBackgroundColor="#F5F7FB"
          loadingIndicatorColor={colors.blue}
          moveOnMarkerPress={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsCompass
          showsMyLocationButton={false}
          showsUserLocation={false}
        >
          {pickup ? (
            <Marker
              coordinate={asCoordinate(pickup)}
              title="Pickup point"
              description="Where your errand begins"
              pinColor={colors.blue}
              tracksViewChanges={false}
            />
          ) : null}
          {destination ? (
            <Marker
              coordinate={asCoordinate(destination)}
              title="Drop-off point"
              description="Where your errand ends"
              pinColor={colors.amber}
              tracksViewChanges={false}
            />
          ) : null}
          {provider ? (
            <Marker
              coordinate={asCoordinate(provider)}
              title="Errand provider"
              description="Shared live position"
              pinColor={colors.green}
              tracksViewChanges={false}
            />
          ) : null}
          {route.length > 1 ? (
            <Polyline
              coordinates={route.map(asCoordinate)}
              strokeColor={colors.blue}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
        </MapView>

        {!readOnly ? (
          <View pointerEvents="none" style={styles.pinHint}>
            <View style={[styles.pinDot, { backgroundColor: selecting === "pickup" ? colors.blue : colors.amber }]} />
            <Text style={styles.pinHintText}>{selecting === "pickup" ? "PICKUP PIN" : "DROP-OFF PIN"}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.captionRow}>
        <View style={styles.mapGlyph}>
          <Text style={styles.mapGlyphText}>⌖</Text>
        </View>
        <Text style={styles.caption}>{hint} Powered by {Platform.OS === "ios" ? "Apple Maps" : "Google Maps"}.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  mapWrap: { position: "relative" },
  map: { width: "100%", backgroundColor: "#F5F7FB" },
  pinHint: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 30,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#E2E8F3",
  },
  pinDot: { width: 8, height: 8, borderRadius: 4 },
  pinHintText: { color: colors.navy, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  captionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mapGlyph: {
    width: 25,
    height: 25,
    borderRadius: 9,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  mapGlyphText: { color: colors.blue, fontSize: 17, fontWeight: "900" },
  caption: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 15 },
});
