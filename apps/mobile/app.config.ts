import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId =
    process.env.EXPO_PROJECT_ID?.trim() || config.extra?.eas?.projectId;
  // Keep the restricted key in the EAS production environment; never commit it.
  // Google Maps embeds this key in the APK, so its Android package/certificate restrictions are required.
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const android = googleMapsApiKey
    ? {
        ...config.android,
        config: {
          ...config.android?.config,
          googleMaps: {
            ...config.android?.config?.googleMaps,
            apiKey: googleMapsApiKey,
          },
        },
      }
    : config.android;
  const updateUrl =
    process.env.EXPO_UPDATE_URL?.trim() ||
    config.updates?.url ||
    (projectId ? `https://u.expo.dev/${projectId}` : undefined);
  const updateChannel =
    process.env.EXPO_UPDATE_CHANNEL?.trim() ||
    config.updates?.requestHeaders?.["expo-channel-name"] ||
    "production";

  const plugins = (config.plugins ?? []).map((plugin) => {
    const entry = Array.isArray(plugin) ? plugin : [plugin, {}];
    if (entry[0] !== "react-native-maps") return plugin;
    return [
      "react-native-maps",
      {
        ...(Array.isArray(entry) && typeof entry[1] === "object" ? entry[1] : {}),
        ...(googleMapsApiKey ? { androidGoogleMapsApiKey: googleMapsApiKey } : {}),
      },
    ] as const;
  });

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
    android,
    plugins,
    name: config.name ?? "SaMi",
    slug: config.slug ?? "sami-mobile",
    extra,
    updates,
    runtimeVersion: config.runtimeVersion ?? { policy: "fingerprint" },
  };
};
