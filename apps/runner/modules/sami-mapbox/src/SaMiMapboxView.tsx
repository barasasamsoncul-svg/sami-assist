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
      renderSurface={props.renderSurface ?? "surface"}
    />
  );
}

export default memo(SaMiMapboxView);
