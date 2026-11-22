import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";

import { SaMiMapboxView, type SaMiMapDiagnosticEvent } from "../modules/sami-mapbox/src";

const DAY_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
const NIGHT_STYLE = "mapbox://styles/mapbox/navigation-night-v1";

type SearchParams = {
  style?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function SaMiMapboxLabScreen() {
  const params = useLocalSearchParams<SearchParams>();
  const requestedStyle = firstParam(params.style);
  const renderSurface = "texture" as const;
  const initialStyle = requestedStyle === "night" ? NIGHT_STYLE : DAY_STYLE;
  const [mapStyleURL, setMapStyleURL] = useState(initialStyle);
  const [status, setStatus] = useState("WAITING FOR NATIVE MAPBOX");
  const [errorMessage, setErrorMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState<SaMiMapDiagnosticEvent[]>([]);

  const accessToken = useMemo(
    () => process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "",
    [],
  );

  const addDiagnostic = (event: {
    nativeEvent: SaMiMapDiagnosticEvent;
  }) => {
    const next = event.nativeEvent;
    setDiagnostics((current) => [...current.slice(-7), next]);
  };

  return (
    <View style={styles.root}>
    <StatusBar barStyle="light-content" />

      <SaMiMapboxView
        style={StyleSheet.absoluteFill}
        accessToken={accessToken}
        mapStyleURL={mapStyleURL}
        initialLatitude={-1.2921}
        initialLongitude={36.8219}
        initialZoom={14.5}
        initialBearing={0}
        renderSurface={renderSurface}
        showUserLocation={false}
        navigationActive={false}
        screenActive
        onMapReady={(event) => {
          const ready = event.nativeEvent;
          setStatus(
            ready.firstFrameRendered
              ? `RENDERED · ${ready.width}×${ready.height}`
              : "MAP READY EVENT RECEIVED",
          );
          setErrorMessage("");
        }}
        onMapError={(event) => {
          setStatus("MAP ERROR");
          setErrorMessage(event.nativeEvent.message);
        }}
        onMapDiagnostic={addDiagnostic}
      />

      <View style={styles.headerPanel} pointerEvents="box-none">
        <Text style={styles.title}>SaMi Maps · Native verification</Text>
        <Text style={styles.subtitle}>No dashboard, GPS, earnings or navigation session</Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: status.startsWith("RENDERED") ? "#29C47A" : errorMessage ? "#E65B67" : "#E8B34E" },
            ]}
          />
          <Text style={styles.statusText}>{status}</Text>
        </View>
        <Text style={styles.metaText}>
          Surface: {renderSurface.toUpperCase()} · Style: {mapStyleURL === DAY_STYLE ? "DAY" : "NIGHT"}
        </Text>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setStatus("LOADING STYLE");
            setMapStyleURL((current) => current === DAY_STYLE ? NIGHT_STYLE : DAY_STYLE);
          }}
          style={styles.controlButton}
        >
          <Text style={styles.controlText}>Switch map style</Text>
        </Pressable>
      </View>

      <View style={styles.diagnosticsPanel}>
        <Text style={styles.diagnosticsTitle}>Native diagnostics</Text>
        <ScrollView style={styles.diagnosticsScroll}>
          {diagnostics.length === 0 ? (
            <Text style={styles.diagnosticLine}>Waiting for native renderer events…</Text>
          ) : diagnostics.map((item, index) => (
            <Text key={`${item.timestamp}-${index}`} style={styles.diagnosticLine}>
              {new Date(item.timestamp).toLocaleTimeString()} [{item.level}] {item.code}: {item.message}
            </Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000535",
  },
  headerPanel: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "rgba(0, 5, 35, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(160, 185, 225, 0.25)",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  subtitle: {
    color: "#B8C6DF",
    fontSize: 10,
    marginTop: 3,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
    gap: 7,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  metaText: {
    color: "#AAB9D2",
    fontSize: 9,
    marginTop: 5,
  },
  errorText: {
    color: "#FF9DA5",
    fontSize: 10,
    marginTop: 6,
  },
  controls: {
    position: "absolute",
    right: 12,
    bottom: 190,
    gap: 8,
  },
  controlButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(160, 185, 225, 0.35)",
    backgroundColor: "rgba(0, 5, 35, 0.92)",
  },
  controlText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  diagnosticsPanel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: 158,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(160, 185, 225, 0.25)",
    backgroundColor: "rgba(0, 5, 35, 0.90)",
  },
  diagnosticsTitle: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 6,
  },
  diagnosticsScroll: {
    maxHeight: 120,
  },
  diagnosticLine: {
    color: "#C8D5E8",
    fontSize: 9,
    lineHeight: 14,
    marginBottom: 2,
  },
});
