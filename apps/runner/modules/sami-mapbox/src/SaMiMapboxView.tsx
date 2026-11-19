import React, { memo } from "react";
import { requireNativeView } from "expo";

import type {
  SaMiMapboxViewProps,
} from "./SaMiMapbox.types";

const NativeSaMiMapboxView =
  requireNativeView<SaMiMapboxViewProps>("SaMiMapbox");

function SaMiMapboxView(props: SaMiMapboxViewProps) {
  return (
    <NativeSaMiMapboxView
      {...props}
      style={props.style}
      accessToken={props.accessToken}
      mapStyleURL={props.mapStyleURL}
      initialLatitude={props.initialLatitude ?? -1.2921}
      initialLongitude={props.initialLongitude ?? 36.8219}
      initialZoom={props.initialZoom ?? 14}
      initialBearing={props.initialBearing ?? 0}
      initialPitch={props.initialPitch ?? 0}
      showUserLocation={props.showUserLocation ?? true}
      showCompass={props.showCompass ?? true}
      showScaleBar={props.showScaleBar ?? false}
      navigationActive={props.navigationActive ?? false}
      cameraMode={props.cameraMode ?? "free"}
      puckBearing={props.puckBearing ?? "course"}
      locationPulsingEnabled={
        props.locationPulsingEnabled ?? false
      }
      hasRouteDestination={
        props.hasRouteDestination ?? false
      }
      routeDestinationLatitude={
        props.routeDestinationLatitude ?? 0
      }
      routeDestinationLongitude={
        props.routeDestinationLongitude ?? 0
      }
      routeDestinationLabel={
        props.routeDestinationLabel ?? ""
      }
      routeProfile={
        props.routeProfile ?? "driving-traffic"
      }
      voiceGuidanceMuted={
        props.voiceGuidanceMuted ?? false
      }
      onMapReady={props.onMapReady}
      onMapError={props.onMapError}
      onCameraChanged={props.onCameraChanged}
      onMapTap={props.onMapTap}
      onLocationChanged={props.onLocationChanged}
      onNavigationStatusChanged={
        props.onNavigationStatusChanged
      }
      onRouteChanged={props.onRouteChanged}
      onVoiceInstructionChanged={
        props.onVoiceInstructionChanged
      }
    />
  );
}

export default memo(SaMiMapboxView);
