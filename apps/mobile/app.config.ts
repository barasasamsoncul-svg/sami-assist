import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId =
    process.env.EXPO_PROJECT_ID?.trim() || config.extra?.eas?.projectId;
  const updateUrl =
    process.env.EXPO_UPDATE_URL?.trim() ||
    config.updates?.url ||
    (projectId ? `https://u.expo.dev/${projectId}` : undefined);
  const updateChannel =
    process.env.EXPO_UPDATE_CHANNEL?.trim() ||
    config.updates?.requestHeaders?.["expo-channel-name"] ||
    "production";

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
    updates,
    runtimeVersion: config.runtimeVersion ?? { policy: "fingerprint" },
  };
};
