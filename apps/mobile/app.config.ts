import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  // CI and development builds can be installed before an EAS project exists.
  // EAS Update is enabled after the project config supplies updates.url,
  // or when EXPO_UPDATE_URL is supplied by the build environment.
  const updateUrl = process.env.EXPO_UPDATE_URL?.trim() || config.updates?.url;
  const updates = updateUrl
    ? {
        ...config.updates,
        url: updateUrl,
        enabled: true,
      }
    : {
        ...config.updates,
        enabled: false,
      };

  return {
    ...config,
    updates,
    runtimeVersion: config.runtimeVersion ?? { policy: "fingerprint" },
  };
};
