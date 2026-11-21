import React, { memo } from "react";
import { requireNativeView } from "expo";

import type { SaMiMapboxViewProps } from "./SaMiMapbox.types";

const NativeSaMiMapboxView =
  requireNativeView<SaMiMapboxViewProps>("SaMiMapbox");

function SaMiMapboxView(props: SaMiMapboxViewProps) {
  return (
    <NativeSaMiMapboxView
      {...props}
      style={props.style}
      accessToken={props.accessToken}
      mapStyleURL={
        props.mapStyleURL ?? "mapbox://styles/mapbox/navigation-day-v1"
      }
      initialLatitude={props.initialLatitude ?? -1.2921}
      initialLongitude={props.initialLongitude ?? 36.8219}
      initialZoom={props.initialZoom ?? 14.5}
      initialBearing={props.initialBearing ?? 0}
      renderSurface="surface"
      showUserLocation={props.showUserLocation ?? false}
      hasUserLocation={props.hasUserLocation ?? false}
      userLatitude={props.userLatitude ?? props.initialLatitude ?? -1.2921}
      userLongitude={props.userLongitude ?? props.initialLongitude ?? 36.8219}
      userBearing={props.userBearing ?? 0}
      hasUserBearing={props.hasUserBearing ?? false}
      locationPulsingEnabled={props.locationPulsingEnabled ?? false}
      cameraMode={props.cameraMode ?? "free"}
      recenterRequestId={props.recenterRequestId ?? 0}
    />
  );
}

export default memo(SaMiMapboxView);
