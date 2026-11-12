
import type { ConfigContext, ExpoConfig } from "expo/config";

const RUNNER_EAS_PROJECT_ID = "8fcd647e-3514-4436-b1ce-c1b417f6c1d3";
const RUNNER_PRODUCTION_CHANNEL = "runner-production";
const RUNNER_BUNDLE_BACKGROUND = "#000535";

export default ({ config }: ConfigContext): ExpoConfig => {
  // ---------------------------------------------------------
  // 1. Validate SaMi Runner Expo project identity
  // ---------------------------------------------------------

  const configuredProjectId = process.env.EXPO_PROJECT_ID?.trim();
  const easBuildProjectId = process.env.EAS_BUILD_PROJECT_ID?.trim();

  if (
    configuredProjectId &&
    configuredProjectId !== RUNNER_EAS_PROJECT_ID
  ) {
    throw new Error(
      "SaMi Runner cannot use a different Expo project ID."
    );
  }

  if (
    easBuildProjectId &&
    easBuildProjectId !== RUNNER_EAS_PROJECT_ID
  ) {
    throw new Error(
      "SaMi Runner EAS build is running under an unexpected Expo project."
    );
  }

  // ---------------------------------------------------------
  // 2. Validate production update channel
  // ---------------------------------------------------------

  const buildProfile = process.env.EAS_BUILD_PROFILE?.trim();
  const configuredChannel = process.env.EXPO_UPDATE_CHANNEL?.trim();

  if (
    buildProfile === "production" &&
    configuredChannel &&
    configuredChannel !== RUNNER_PRODUCTION_CHANNEL
  ) {
    throw new Error(
      "SaMi Runner production builds must use runner-production."
    );
  }

  // ---------------------------------------------------------
  // 3. Google Maps native configuration
  // ---------------------------------------------------------

  const googleMapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY?.trim();

  const isAndroidEasBuild =
    process.env.EAS_BUILD === "true" &&
    process.env.EAS_BUILD_PLATFORM === "android";

  if (isAndroidEasBuild && !googleMapsApiKey) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is missing from the SaMi Runner Android EAS build environment."
    );
  }

  // ---------------------------------------------------------
  // 4. Preserve existing plugins and prevent duplicate maps
  // ---------------------------------------------------------

  const plugins: NonNullable<ExpoConfig["plugins"]> = (
    config.plugins ?? []
  ).filter((plugin) => {
    if (typeof plugin === "string") {
      return plugin !== "react-native-maps";
    }

    return plugin[0] !== "react-native-maps";
  });

  // Configure Google Maps only when the key is available.
  // MapLibre and all other existing plugins remain untouched.
  if (googleMapsApiKey) {
    plugins.push([
      "react-native-maps",
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
      },
    ]);
  }

  // ---------------------------------------------------------
  // 5. Protect Android keyboard and status-bar configuration
  // ---------------------------------------------------------

  const android = {
    ...config.android,
    softwareKeyboardLayoutMode: "resize" as const,
  };

  const androidStatusBar = {
    ...config.androidStatusBar,
    backgroundColor:
      config.androidStatusBar?.backgroundColor ??
      RUNNER_BUNDLE_BACKGROUND,
    barStyle:
      config.androidStatusBar?.barStyle ?? "light-content",
    translucent: false,
  };

  // ---------------------------------------------------------
  // 6. Prevent a hardcoded production channel header
  // ---------------------------------------------------------

  const requestHeaders = {
    ...config.updates?.requestHeaders,
  };

  // EAS build profiles control their own update channels.
  // Never force runner-production on preview or development builds.
  delete requestHeaders["expo-channel-name"];

  // ---------------------------------------------------------
  // 7. Final Expo configuration
  // ---------------------------------------------------------

  return {
    ...config,

    name: "SaMi Runner",
    slug: "sami-runner",
    owner: config.owner ?? "sami-assist",

    plugins,

    android,
    androidStatusBar,

    runtimeVersion: {
      policy: "fingerprint",
    },

    updates: {
      ...config.updates,
      url: `https://u.expo.dev/${RUNNER_EAS_PROJECT_ID}`,
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
      requestHeaders,
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
