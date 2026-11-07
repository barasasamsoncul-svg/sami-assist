
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

  return {
    ...config,
    name: "SaMi Runner",
    slug: "sami-runner",
    owner: config.owner ?? "sami-assist",
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
