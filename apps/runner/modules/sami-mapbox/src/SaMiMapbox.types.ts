import type { StyleProp, ViewStyle } from "react-native";

export type SaMiMapRenderSurface = "texture";

export type SaMiMapCameraMode = "free" | "follow" | "navigation";
export type SaMiPuckBearing = "course" | "heading";
export type SaMiRouteProfile = "driving-traffic" | "cycling";

export type SaMiMapReadyEvent = {
  ready: boolean;
  styleLoaded?: boolean;
  firstFrameRendered?: boolean;
  renderSurface?: SaMiMapRenderSurface;
  width?: number;
  height?: number;
  generation?: number;
};

export type SaMiMapErrorEvent = {
  message: string;
};

export type SaMiMapDiagnosticEvent = {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  timestamp: number;
  surface?: SaMiMapRenderSurface;
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

export type SaMiRouteStatus =
  | "idle"
  | "waiting_for_location"
  | "requesting"
  | "active"
  | "error";

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

export type SaMiVoiceInstructionChangedEvent = {
  instruction: string;
  ssmlAnnouncement?: string | null;
  muted: boolean;
  timestamp: number;
};

/**
 * Public SaMi Maps view contract.
 *
 * Stage 5 connects route guidance, maneuver progress and voice instructions
 * to the single SaMi Location stream. Camera presentation remains strictly 2D.
 */
export type SaMiMapboxViewProps = {
  style?: StyleProp<ViewStyle>;

  accessToken: string;
  mapStyleURL?: string;
  initialLatitude?: number;
  initialLongitude?: number;
  initialZoom?: number;
  initialBearing?: number;
  renderSurface?: SaMiMapRenderSurface;

  /** Dashboard focus gates follow-camera movement; it does not stop the location task. */
  screenActive?: boolean;

  /** Feed the live fix from SaMi Location into Mapbox's puck. */
  hasUserLocation?: boolean;
  userLatitude?: number;
  userLongitude?: number;
  userBearing?: number;
  userSpeedMetersPerSecond?: number;
  userHorizontalAccuracyMeters?: number;
  hasUserBearing?: boolean;
  recenterRequestId?: number;

  /** Enables the location puck when a valid SaMi Location fix is available. */
  showUserLocation?: boolean;
  /** @deprecated Location UI will be implemented after the base renderer is verified. */
  showCompass?: boolean;
  /** @deprecated Map controls will be implemented after the base renderer is verified. */
  showScaleBar?: boolean;
  /** Enables SaMi's Mapbox Navigation session; it consumes SaMi Location fixes only. */
  navigationActive?: boolean;
  /** Follow the injected SaMi Location fix when set to follow/navigation. */
  cameraMode?: SaMiMapCameraMode;
  /** Location puck orientation supplied by SaMi Location. */
  puckBearing?: SaMiPuckBearing;
  /** Enables the Mapbox puck pulse while the Runner is sharing location. */
  locationPulsingEnabled?: boolean;
  /** Current errand destination; null/false clears the active route. */
  hasRouteDestination?: boolean;
  routeDestinationLatitude?: number;
  routeDestinationLongitude?: number;
  routeDestinationLabel?: string;
  routeProfile?: SaMiRouteProfile;
  /** Mutes spoken instructions while preserving visual guidance. */
  voiceGuidanceMuted?: boolean;

  onMapReady?: (event: { nativeEvent: SaMiMapReadyEvent }) => void;
  onMapError?: (event: { nativeEvent: SaMiMapErrorEvent }) => void;
  onMapDiagnostic?: (event: { nativeEvent: SaMiMapDiagnosticEvent }) => void;
  onCameraChanged?: (event: { nativeEvent: SaMiCameraEvent }) => void;
  onMapTap?: (event: { nativeEvent: SaMiMapTapEvent }) => void;

  /** @deprecated Emitted after the location layer is implemented. */
  onLocationChanged?: (event: { nativeEvent: SaMiMapLocationEvent }) => void;
  onNavigationStatusChanged?: (event: {
    nativeEvent: SaMiNavigationStatusEvent;
  }) => void;
  onRouteChanged?: (event: { nativeEvent: SaMiRouteChangedEvent }) => void;
  onVoiceInstructionChanged?: (event: {
    nativeEvent: SaMiVoiceInstructionChangedEvent;
  }) => void;
};
