import { Stack } from "expo-router";
import { useRunnerTheme } from "@/theme";

export default function RunnerAuthLayout() {
  const { colors } = useRunnerTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,

        // Consistent, unobtrusive screen transitions.
        animation: "fade",
        animationDuration: 220,

        // Prevent colour flashes when navigating between screens.
        contentStyle: {
          backgroundColor: colors.paper,
        },

        // Allow normal back gestures.
        gestureEnabled: true,
        gestureDirection: "horizontal",
      }}
    />
  );
}