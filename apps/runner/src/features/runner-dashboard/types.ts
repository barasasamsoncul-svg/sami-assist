import type { RunnerJob } from "@/api";

export type JobsState = {
  offers: RunnerJob[];
  active: RunnerJob[];
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type ActiveRouteTarget = Coordinates & {
  label: string;
  stage: "pickup" | "delivery";
};

export type MapLocation = Coordinates & {
  bearing: number | null;
  speedMetersPerSecond: number | null;
  horizontalAccuracyMeters: number | null;
  enhanced: boolean;
};

export type NavigationMode = "idle" | "free_drive" | "active_guidance";

export const DEFAULT_COORDINATES: Coordinates = {
  latitude: -1.2921,
  longitude: 36.8219,
};
