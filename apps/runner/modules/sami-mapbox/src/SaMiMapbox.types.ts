import type { StyleProp, ViewStyle } from "react-native";

export type SaMiMapRenderSurface = "surface" | "texture";

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
 * Stage 1 implements native map rendering, 2D camera gestures, style changes,
 * first-frame readiness and rendering diagnostics. Location and navigation
 * props remain in the public type temporarily so the existing dashboard
 * continues to type-check while those independent layers are rebuilt later.
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

  /** @deprecated Dashboard visibility does not control the native MapView lifecycle. */
  screenActive?: boolean;

  /** @deprecated Location will be implemented as a separate SaMi Maps layer. */
  showUserLocation?: boolean;
  /** @deprecated Location UI will be implemented after the base renderer is verified. */
  showCompass?: boolean;
  /** @deprecated Map controls will be implemented after the base renderer is verified. */
  showScaleBar?: boolean;
  /** @deprecated Navigation will be implemented as a separate SaMi Maps layer. */
  navigationActive?: boolean;
  /** @deprecated Navigation will be implemented as a separate SaMi Maps layer. */
  cameraMode?: SaMiMapCameraMode;
  /** @deprecated Location will be implemented as a separate SaMi Maps layer. */
  puckBearing?: SaMiPuckBearing;
  /** @deprecated Location will be implemented as a separate SaMi Maps layer. */
  locationPulsingEnabled?: boolean;
  /** @deprecated Route guidance will be implemented as a separate SaMi Maps layer. */
  hasRouteDestination?: boolean;
  /** @deprecated Route guidance will be implemented as a separate SaMi Maps layer. */
  routeDestinationLatitude?: number;
  /** @deprecated Route guidance will be implemented as a separate SaMi Maps layer. */
  routeDestinationLongitude?: number;
  /** @deprecated Route guidance will be implemented as a separate SaMi Maps layer. */
  routeDestinationLabel?: string;
  /** @deprecated Route guidance will be implemented as a separate SaMi Maps layer. */
  routeProfile?: SaMiRouteProfile;
  /** @deprecated Voice guidance will be implemented as a separate SaMi Maps layer. */
  voiceGuidanceMuted?: boolean;

  onMapReady?: (event: { nativeEvent: SaMiMapReadyEvent }) => void;
  onMapError?: (event: { nativeEvent: SaMiMapErrorEvent }) => void;
  onMapDiagnostic?: (event: { nativeEvent: SaMiMapDiagnosticEvent }) => void;
  onCameraChanged?: (event: { nativeEvent: SaMiCameraEvent }) => void;
  onMapTap?: (event: { nativeEvent: SaMiMapTapEvent }) => void;

  /** @deprecated Emitted after the location layer is implemented. */
  onLocationChanged?: (event: { nativeEvent: SaMiMapLocationEvent }) => void;
  /** @deprecated Emitted after the navigation layer is implemented. */
  onNavigationStatusChanged?: (event: {
    nativeEvent: SaMiNavigationStatusEvent;
  }) => void;
  /** @deprecated Emitted after route guidance is implemented. */
  onRouteChanged?: (event: { nativeEvent: SaMiRouteChangedEvent }) => void;
  /** @deprecated Emitted after voice guidance is implemented. */
  onVoiceInstructionChanged?: (event: {
    nativeEvent: SaMiVoiceInstructionChangedEvent;
  }) => void;
};
