
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

  // Register expo-image without creating duplicate plugin entries.
const expoImagePluginIndex = plugins.findIndex((plugin) =>
  Array.isArray(plugin)
    ? plugin[0] === "expo-image"
    : plugin === "expo-image",
);

if (expoImagePluginIndex === -1) {
  plugins.push("expo-image");
}

  // Google Maps is used only for the idle / online-waiting dashboard map.
  // Keep the key in EAS Environment Variables; do not hardcode it in source.
  // Supported Android key names: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  // EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY, GOOGLE_MAPS_ANDROID_API_KEY,
  // GOOGLE_MAPS_API_KEY, EXPO_PUBLIC_MAPS_API_KEY, or MAPS_API_KEY.
  const googleMapsAndroidApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_MAPS_API_KEY?.trim() ||
    process.env.MAPS_API_KEY?.trim() ||
    config.android?.config?.googleMaps?.apiKey?.trim();

  // iOS keeps react-native-maps default Apple Maps provider in this patch.
  // This optional key is stored for a later deliberate Google-on-iOS switch.
  const googleMapsIosApiKey =
    process.env.GOOGLE_MAPS_IOS_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY?.trim();

  const mapboxPlugin = "./plugins/withSamiMapboxNative";

  if (!plugins.includes(mapboxPlugin)) {
    plugins.push(mapboxPlugin);
  }

  // Replace an existing react-native-maps plugin entry rather than adding
  // duplicates when this script is re-run.
  const googleMapsPluginIndex = plugins.findIndex((plugin) =>
    Array.isArray(plugin)
      ? plugin[0] === "react-native-maps"
      : plugin === "react-native-maps",
  );

  const googleMapsPlugin: [string, Record<string, string>] = [
    "react-native-maps",
    {
      ...(googleMapsAndroidApiKey
        ? { androidGoogleMapsApiKey: googleMapsAndroidApiKey }
        : {}),
      ...(googleMapsIosApiKey
        ? { iosGoogleMapsApiKey: googleMapsIosApiKey }
        : {}),
    },
  ];

  if (googleMapsPluginIndex >= 0) {
    plugins[googleMapsPluginIndex] = googleMapsPlugin;
  } else {
    plugins.push(googleMapsPlugin);
  }

  if (process.env.EAS_BUILD_PROFILE && !googleMapsAndroidApiKey) {
    throw new Error(
      "SaMi Runner requires an Android Google Maps key for native EAS builds. Add the existing key to EAS as EXPO_PUBLIC_GOOGLE_MAPS_API_KEY, EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY, GOOGLE_MAPS_ANDROID_API_KEY, GOOGLE_MAPS_API_KEY, EXPO_PUBLIC_MAPS_API_KEY, or MAPS_API_KEY.",
    );
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

  // Preserve existing headers and add the requested channel when supplied.
  // Local production builds receive EXPO_UPDATE_CHANNEL from the shell.
  // EAS production builds receive it from the production profile.
  const requestHeaders: Record<string, string> = {
    ...(config.updates?.requestHeaders ?? {}),
  };

  if (configuredChannel) {
    requestHeaders["expo-channel-name"] = configuredChannel;
  }

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
