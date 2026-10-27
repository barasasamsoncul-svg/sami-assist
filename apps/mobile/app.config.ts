import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  // The project ID is supplied by CI so local builds remain possible before
  // the SaMi app is linked to its Expo project.
  const projectId =
    process.env.EXPO_PROJECT_ID?.trim() || config.extra?.eas?.projectId;
  const updateUrl =
    process.env.EXPO_UPDATE_URL?.trim() ||
    config.updates?.url ||
    (projectId ? `https://u.expo.dev/${projectId}` : undefined);
  const requestedAndroidVersionCode = Number.parseInt(process.env.EXPO_ANDROID_VERSION_CODE ?? "", 10);
  const androidVersionCode =
    Number.isSafeInteger(requestedAndroidVersionCode) && requestedAndroidVersionCode > 0
      ? requestedAndroidVersionCode
      : config.android?.versionCode;
  const updateChannel =
    process.env.EXPO_UPDATE_CHANNEL?.trim() ||
    config.updates?.requestHeaders?.["expo-channel-name"] ||
    "preview";

  // This repository's Android APK is generated directly with Expo Prebuild
  // and Gradle rather than EAS Build, so embed the channel request header here.
  // EAS Update can replace compatible JS/UI bundles on launch; native changes
  // (launcher icon, permissions, native modules) still require a new binary.
  const requestHeaders = {
    ...config.updates?.requestHeaders,
    "expo-channel-name": updateChannel,
  };
  const updates = updateUrl
    ? {
        ...config.updates,
        url: updateUrl,
        enabled: true,
        checkAutomatically: "ON_LOAD" as const,
        fallbackToCacheTimeout: 0,
        requestHeaders,
      }
    : {
        ...config.updates,
        enabled: false,
        requestHeaders,
      };

  const extra = projectId
    ? {
        ...config.extra,
        eas: {
          ...config.extra?.eas,
          projectId,
        },
      }
    : config.extra;

  return {
    ...config,
    name: config.name ?? "SaMi",
    slug: config.slug ?? "sami-mobile",
    extra,
    android: {
      ...config.android,
      ...(androidVersionCode ? { versionCode: androidVersionCode } : {}),
    },
    updates,
    runtimeVersion: config.runtimeVersion ?? { policy: "fingerprint" },
  };
};
