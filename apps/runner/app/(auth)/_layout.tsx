
import { Stack } from "expo-router";
import { useRunnerTheme } from "@/theme";

export default function RunnerAuthLayout() {
  const { colors, mode } = useRunnerTheme();

  const isDark = mode === "dark";

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

        // Follow the user's explicit in-app appearance setting.
        statusBarStyle: isDark ? "light" : "dark",

        // Allow normal back gestures.
        gestureEnabled: true,
        gestureDirection: "horizontal",
      }}
    />
  );
}
