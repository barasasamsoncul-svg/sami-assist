
import { requireNativeView } from "expo";
import * as React from "react";

import type { SaMiMapboxViewProps } from "./SaMiMapbox.types";

const NativeSaMiMapboxView: React.ComponentType<SaMiMapboxViewProps> =
  requireNativeView<SaMiMapboxViewProps>("SaMiMapbox");

export default function SaMiMapboxView(
  props: SaMiMapboxViewProps
) {
  return <NativeSaMiMapboxView {...props} />;
}
