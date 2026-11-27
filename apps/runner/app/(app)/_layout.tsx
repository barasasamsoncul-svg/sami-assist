import { Stack } from "expo-router";

import { useRunnerTheme } from "@/theme";

export default function RunnerAppLayout() {
  const { colors } = useRunnerTheme();

  return (
    <Stack
      activityEnabled
      screenOptions={{
        headerShown: false,

        // Preserve the map-first navigation transition.
        animation: "fade",
        animationDuration: 220,

        // Prevent background flashes between Runner screens.
        contentStyle: {
          backgroundColor: colors.paper,
        },
      }}
    >
      {/* Keep Home active beneath pushed Runner screens. */}
      <Stack.Screen
        name="index"
        activityEnabled={false}
      />
    </Stack>
  );
}