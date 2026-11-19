import type { ConfigContext, ExpoConfig } from "expo/config";

const RUNNER_EAS_PROJECT_ID = "8fcd647e-3514-4436-b1ce-c1b417f6c1d3";
const RUNNER_PRODUCTION_CHANNEL = "runner-production";
const RUNNER_BUNDLE_BACKGROUND = "#000535";

export default ({ config }: ConfigContext): ExpoConfig => {
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

  const plugins: NonNullable<ExpoConfig["plugins"]> = [
    ...(config.plugins ?? []),
  ];

  const mapboxPlugin = "./plugins/withSamiMapboxNative";

  if (!plugins.includes(mapboxPlugin)) {
    plugins.push(mapboxPlugin);
  }

  const android = {
    ...config.android,
    softwareKeyboardLayoutMode: "resize" as const,
  };

  const ios = {
    ...config.ios,
    deploymentTarget: config.ios?.deploymentTarget ?? "16.4",
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

  const requestHeaders = {
    ...config.updates?.requestHeaders,
  };

  delete requestHeaders["expo-channel-name"];

  return {
    ...config,
    name: "SaMi Runner",
    slug: "sami-runner",
    owner: config.owner ?? "sami-assist",
    plugins,
    android,
    ios,
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