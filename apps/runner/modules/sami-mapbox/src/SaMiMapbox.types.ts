
import type { StyleProp, ViewStyle } from "react-native";

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
};
