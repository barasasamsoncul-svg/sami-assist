import type { StyleProp, ViewStyle } from "react-native";

export type SaMiMapCameraMode =
  | "free"
  | "follow"
  | "navigation";

export type SaMiPuckBearing =
  | "course"
  | "heading";

export type SaMiMapReadyEvent = {
  ready: boolean;
};

export type SaMiMapErrorEvent = {
  message: string;
};

export type SaMiCameraEvent = {
  latitude: number;
  longitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
};

export type SaMiMapTapEvent = {
  latitude: number;
  longitude: number;
};

export type SaMiMapLocationEvent = {
  latitude: number;
  longitude: number;
  bearing: number | null;
  speedMetersPerSecond: number | null;
  horizontalAccuracyMeters: number | null;
  timestamp: number;
  enhanced: boolean;
};

export type SaMiNavigationStatusEvent = {
  active: boolean;
  mode: "free_drive" | "active_guidance" | "idle";
};

export type SaMiMapboxViewProps = {
  style?: StyleProp<ViewStyle>;

  accessToken: string;
  mapStyleURL?: string;

  initialLatitude?: number;
  initialLongitude?: number;
  initialZoom?: number;
  initialBearing?: number;
  initialPitch?: number;

  showUserLocation?: boolean;
  showCompass?: boolean;
  showScaleBar?: boolean;

  navigationActive?: boolean;
  cameraMode?: SaMiMapCameraMode;
  puckBearing?: SaMiPuckBearing;
  locationPulsingEnabled?: boolean;

  onMapReady?: (event: {
    nativeEvent: SaMiMapReadyEvent;
  }) => void;

  onMapError?: (event: {
    nativeEvent: SaMiMapErrorEvent;
  }) => void;

  onCameraChanged?: (event: {
    nativeEvent: SaMiCameraEvent;
  }) => void;

  onMapTap?: (event: {
    nativeEvent: SaMiMapTapEvent;
  }) => void;

  onLocationChanged?: (event: {
    nativeEvent: SaMiMapLocationEvent;
  }) => void;

  onNavigationStatusChanged?: (event: {
    nativeEvent: SaMiNavigationStatusEvent;
  }) => void;
};