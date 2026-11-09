
import type { ConfigContext, ExpoConfig } from "expo/config";

const RUNNER_EAS_PROJECT_ID = "8fcd647e-3514-4436-b1ce-c1b417f6c1d3";
const RUNNER_UPDATE_CHANNEL = "runner-production";

export default ({ config }: ConfigContext): ExpoConfig => {
  const configuredProjectId = process.env.EXPO_PROJECT_ID?.trim();

  if (
    configuredProjectId &&
    configuredProjectId !== RUNNER_EAS_PROJECT_ID
  ) {
    throw new Error("SaMi Runner cannot use a different Expo project ID.");
  }

  const configuredChannel = process.env.EXPO_UPDATE_CHANNEL?.trim();

  if (
    configuredChannel &&
    configuredChannel !== RUNNER_UPDATE_CHANNEL
  ) {
    throw new Error("SaMi Runner must use its runner-production update channel.");
  }

  // Google Maps key is supplied through the Runner EAS production environment.
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

  // Fail the native EAS build rather than produce another APK without the key.
  if (process.env.EAS_BUILD === "true" && !googleMapsApiKey) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is missing from the SaMi Runner EAS build environment."
    );
  }

  // Preserve existing plugins and avoid duplicate react-native-maps entries.
  const plugins: NonNullable<ExpoConfig["plugins"]> = (
    config.plugins ?? []
  ).filter((plugin) => {
    if (typeof plugin === "string") {
      return plugin !== "react-native-maps";
    }

    return plugin[0] !== "react-native-maps";
  });

  // Configure Google Maps for Android when the EAS key is available.
  if (googleMapsApiKey) {
    plugins.push([
      "react-native-maps",
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
      },
    ]);
  }

  return {
    ...config,
    name: "SaMi Runner",
    slug: "sami-runner",
    owner: config.owner ?? "sami-assist",
    plugins,
    runtimeVersion: {
      policy: "fingerprint",
    },
    updates: {
      ...config.updates,
      url: `https://u.expo.dev/${RUNNER_EAS_PROJECT_ID}`,
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
      requestHeaders: {
        ...config.updates?.requestHeaders,
        "expo-channel-name": RUNNER_UPDATE_CHANNEL,
      },
    },
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        projectId: RUNNER_EAS_PROJECT_ID,
      },
    },
  };
};
