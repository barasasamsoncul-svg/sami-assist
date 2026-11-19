import type { StyleProp, ViewStyle } from "react-native";

export type SaMiMapCameraMode =
  | "free"
  | "follow"
  | "navigation";

export type SaMiPuckBearing =
  | "course"
  | "heading";

export type SaMiRouteProfile =
  | "driving-traffic"
  | "cycling";

export type SaMiRouteStatus =
  | "idle"
  | "waiting_for_location"
  | "requesting"
  | "active"
  | "error";

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

/**
 * Progress and current maneuver information emitted by
 * SaMiRouteGuidanceController through the native onRouteChanged event.
 */
export type SaMiRouteChangedEvent = {
  status: SaMiRouteStatus;
  destinationLabel?: string;
  message?: string | null;

  distanceRemainingMeters?: number;
  durationRemainingSeconds?: number;
  fractionTraveled?: number;

  nextInstruction?: string | null;
  secondaryInstruction?: string | null;
  stepDistanceRemainingMeters?: number | null;
  stepDurationRemainingSeconds?: number | null;
  stepFractionTraveled?: number | null;

  routeProgressState?: string | null;
};

/**
 * Spoken maneuver text emitted by SaMiVoiceGuidanceController.
 * ssmlAnnouncement may be null when Mapbox provides no SSML version.
 */
export type SaMiVoiceInstructionChangedEvent = {
  instruction: string;
  ssmlAnnouncement?: string | null;
  muted: boolean;
  timestamp: number;
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

  hasRouteDestination?: boolean;
  routeDestinationLatitude?: number;
  routeDestinationLongitude?: number;
  routeDestinationLabel?: string;
  routeProfile?: SaMiRouteProfile;

  /** True mutes speech while preserving visual maneuver instructions. */
  voiceGuidanceMuted?: boolean;

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

  onRouteChanged?: (event: {
    nativeEvent: SaMiRouteChangedEvent;
  }) => void;

  onVoiceInstructionChanged?: (event: {
    nativeEvent: SaMiVoiceInstructionChangedEvent;
  }) => void;
};
